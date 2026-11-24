"""Kalshi market intelligence — READ ONLY.

This module only reads public market data (series, events, markets). It contains no authentication, no
order, portfolio or trading call, and must never gain one (RESEARCH-CONSTITUTION, no real-money execution).

Responsibilities kept separate on purpose:
* Kalshi decides which contracts exist (the daily market universe) and what they cost.
* GIZER's own validated models decide the statistical forecast. A market price is never used as a model
  input here and never replaces a model probability.

Contract interpretation is conservative: a contract is normalised into a statistical comparison only when its
type and rule text support it ("records N+ points", "over N total points", "wins by over N", "<team> wins").
Protected, escalator, double-double and any other structure is stored with its original wording and marked
`unsupported` — it is shown, tracked and never priced as an ordinary binary threshold.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from .config import ET
from .db import Game, KalshiMarket, KalshiSnapshot, OddsSnapshot, Team, session_scope, utcnow
from .ingestion import match_player, today_et
from .providers import ABBR_TO_ID, BaseProvider, ProviderError

BOOK = "Kalshi"
FEE_RATE = 0.07  # Kalshi's published general trading-fee formula: 0.07 x price x (1 - price) per contract (approximation)

# series ticker -> (kind, canonical market). Only these are candidates for normalisation.
SERIES = {
    "KXNBAPTS": ("player", "player_pts"), "KXNBAREB": ("player", "player_reb"), "KXNBAAST": ("player", "player_ast"),
    "KXNBA3PT": ("player", "player_fg3m"), "KXNBASTL": ("player", "player_stl"), "KXNBABLK": ("player", "player_blk"),
    "KXNBAPRA": ("player", "player_pra"), "KXNBAPR": ("player", "player_pr"), "KXNBAPA": ("player", "player_pa"),
    "KXNBARA": ("player", "player_ra"),
    "KXNBAGAME": ("game", "moneyline"), "KXNBATOTAL": ("total", "total"), "KXNBASPREAD": ("spread", "spread"),
}
# Tracked and displayed with original wording, never normalised.
TRACKED_ONLY = {
    "KXNBAPTSPROT": "Protected contract: payout provisions differ from the standard contract.",
    "KXNBAREBPROT": "Protected contract: payout provisions differ from the standard contract.",
    "KXNBAASTPROT": "Protected contract: payout provisions differ from the standard contract.",
    "KXNBA3PTPROT": "Protected contract: payout provisions differ from the standard contract.",
    "KXNBAPRAPROT": "Protected contract: payout provisions differ from the standard contract.",
    "KXNBAESCALATORPTS": "Escalator contract: payout scales with the statistic; not a binary threshold.",
    "KXNBAESCALATOR3PT": "Escalator contract: payout scales with the statistic; not a binary threshold.",
    "KXNBA2D": "Double-double: no validated model or settlement mapping for this category.",
    "KXNBA3D": "Triple-double: no validated model or settlement mapping for this category.",
    "KXNBASTOCK": "Steals + blocks: no validated model for this combination.",
}
RULE_PATTERNS = {
    "player": re.compile(r"records (\d+)\+ ", re.I),
    "total": re.compile(r"over ([\d.]+) total points are scored", re.I),
    "spread": re.compile(r"wins by more than ([\d.]+) points", re.I),
    "game": re.compile(r"^If .+ wins the .+ game", re.I),
}
MONTHS = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}
TEAM_ALIASES = {"NY": "NYK", "GS": "GSW", "SA": "SAS", "NO": "NOP", "PHO": "PHX", "BRK": "BKN", "UTAH": "UTA", "WSH": "WAS"}


class KalshiProvider(BaseProvider):
    """Public market-data endpoints only. There is deliberately no method that sends an order."""
    name = "kalshi"
    base_url = "https://api.elections.kalshi.com/trade-api/v2"

    def open_markets(self, series: str) -> list[dict]:
        out, cursor = [], None
        for _ in range(20):
            params = {"series_ticker": series, "status": "open", "limit": 1000}
            if cursor:
                params["cursor"] = cursor
            data = self.get_json("/markets", params)
            if not isinstance(data, dict) or not isinstance(data.get("markets"), list):
                raise ProviderError(f"kalshi markets {series}: schema validation failed")
            out += data["markets"]
            cursor = data.get("cursor")
            if not cursor:
                break
        return out


def _f(v) -> float | None:
    try:
        return None if v in (None, "") else float(v)
    except (TypeError, ValueError):
        return None


def _team(code: str) -> int | None:
    return ABBR_TO_ID.get(TEAM_ALIASES.get(code, code))


def parse_event(event_ticker: str) -> dict | None:
    """'KXNBAPTS-26NOV24DALDEN' -> {date, away_team_id, home_team_id}. None when it cannot be parsed."""
    m = re.match(r"^[A-Z0-9]+-(\d{2})([A-Z]{3})(\d{2})([A-Z]{4,8})$", event_ticker or "")
    if not m or m.group(2) not in MONTHS:
        return None
    teams = m.group(4)
    for i in range(2, len(teams) - 1):
        a, h = _team(teams[:i]), _team(teams[i:])
        if a and h:
            try:
                return {"date": date(2000 + int(m.group(1)), MONTHS[m.group(2)], int(m.group(3))), "away_team_id": a, "home_team_id": h}
            except ValueError:
                return None
    return None


def interpret(m: dict) -> dict:
    """Pure function: classify one Kalshi market object. Never guesses: anything that does not match the
    expected type AND rule wording is `unsupported`."""
    ticker = m.get("ticker", "")
    series = ticker.split("-")[0]
    out = {"series": series, "kind": "other", "market": None, "stat": None, "threshold": None, "comparator": None,
           "interpretation": "unsupported", "note": None, "protected": series.endswith("PROT"),
           "team_code": None, "player_name": None}
    if series in TRACKED_ONLY:
        out["note"] = TRACKED_ONLY[series]
        out["kind"] = "player"
        out["player_name"] = (m.get("yes_sub_title") or "").split(":")[0].strip() or None
        return out
    if series not in SERIES:
        out["note"] = "Series is not in the supported list."
        return out
    kind, market = SERIES[series]
    out.update(kind=kind, market=market)
    rules = m.get("rules_primary") or ""
    if m.get("market_type") != "binary":
        out["note"] = f"Contract type '{m.get('market_type')}' is not a binary contract."
        return out
    fs = _f(m.get("floor_strike"))
    if kind == "game":
        if m.get("strike_type") != "structured" or not RULE_PATTERNS["game"].search(rules):
            out["note"] = "Game contract wording does not match the expected 'team wins' rule."
            return out
        out.update(team_code=ticker.rsplit("-", 1)[-1], comparator="wins", interpretation="normalized")
        return out
    if m.get("strike_type") != "greater" or fs is None:
        out["note"] = f"Strike type '{m.get('strike_type')}' is not a simple threshold."
        return out
    rm = RULE_PATTERNS[kind].search(rules)
    if not rm:
        out["note"] = "Rule text does not match the expected threshold wording; kept with original wording only."
        return out
    stated = float(rm.group(1))
    if kind == "player":
        if abs(stated - math.ceil(fs)) > 1e-9 or fs != math.floor(fs) + 0.5:
            out["note"] = f"Rule threshold {stated:g}+ does not agree with strike {fs:g}."
            return out
        out.update(stat=market.removeprefix("player_"), threshold=fs, comparator=f">= {stated:g}",
                   player_name=(m.get("yes_sub_title") or "").split(":")[0].strip() or None,
                   team_code=re.sub(r"[^A-Z].*$", "", ticker.split("-")[2])[:3] if len(ticker.split("-")) > 3 else None)
        if not out["player_name"]:
            out["note"] = "No player name on the contract."
            return out
    else:
        if abs(stated - fs) > 1e-9:
            out["note"] = f"Rule threshold {stated:g} does not agree with strike {fs:g}."
            return out
        out.update(threshold=fs, comparator=f"> {fs:g}")
        if kind == "spread":
            out["team_code"] = re.sub(r"[\d.]+$", "", ticker.rsplit("-", 1)[-1])
    out["interpretation"] = "normalized"
    return out


def breakeven_from_ask(ask: float) -> float:
    """Price paid per $1 contract plus the estimated trading fee = break-even probability for that side."""
    return min(0.999, ask + FEE_RATE * ask * (1 - ask))


def _american_from_prob(p: float) -> int:
    dec = 1 / p
    return int(round((dec - 1) * 100)) if dec >= 2 else int(round(-100 / (dec - 1)))


def _quote_rows(mk: KalshiMarket, snap: dict, game: Game) -> list[dict]:
    """Normalised (market, subject, side, line, break-even-as-price) rows for the research engine."""
    rows = []
    ya, na = snap["yes_ask"], snap["no_ask"]
    ok = lambda a: a is not None and 0.01 < a < 0.99  # noqa: E731  (an ask of 0 or 1 is not a real offer)
    if mk.kind == "player":
        if ok(ya):
            rows.append(("player", mk.player_id, "over", mk.threshold, ya))
        if ok(na):
            rows.append(("player", mk.player_id, "under", mk.threshold, na))
    elif mk.kind == "total":
        if ok(ya):
            rows.append(("game", None, "over", mk.threshold, ya))
        if ok(na):
            rows.append(("game", None, "under", mk.threshold, na))
    elif mk.kind in ("game", "spread") and mk.team_id in (game.home_team_id, game.away_team_id):
        side = "home" if mk.team_id == game.home_team_id else "away"
        other = "away" if side == "home" else "home"
        other_id = game.away_team_id if side == "home" else game.home_team_id
        if mk.kind == "game":
            if ok(ya):
                rows.append(("team", mk.team_id, side, None, ya))
        else:
            if ok(ya):
                rows.append(("team", mk.team_id, side, -mk.threshold, ya))
            if ok(na):
                rows.append(("team", other_id, other, mk.threshold, na))
    return [{"subject_type": st, "subject_id": sid, "side": side, "line": line,
             "price_american": _american_from_prob(breakeven_from_ask(ask))} for st, sid, side, line, ask in rows]


SNAP_FIELDS = ("yes_bid", "yes_ask", "no_bid", "no_ask", "last_price", "yes_bid_size", "yes_ask_size", "volume",
               "volume_24h", "open_interest", "status")


def snapshot_of(m: dict) -> dict:
    return {"yes_bid": _f(m.get("yes_bid_dollars")), "yes_ask": _f(m.get("yes_ask_dollars")),
            "no_bid": _f(m.get("no_bid_dollars")), "no_ask": _f(m.get("no_ask_dollars")),
            "last_price": _f(m.get("last_price_dollars")) or None,
            "yes_bid_size": _f(m.get("yes_bid_size_fp")), "yes_ask_size": _f(m.get("yes_ask_size_fp")),
            "volume": _f(m.get("volume_fp")), "volume_24h": _f(m.get("volume_24h_fp")),
            "open_interest": _f(m.get("open_interest_fp")), "status": m.get("status") or "unknown"}


def _ts(v) -> datetime | None:
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None
    except (ValueError, AttributeError):
        return None


def observe(provider: KalshiProvider | None = None, now: datetime | None = None, days_ahead: int = 1) -> dict:
    """Discover NBA contracts for today's and tomorrow's games and append price observations.

    * Market definitions are upserted (status/last_seen only); rules and wording are kept as first seen.
    * A snapshot row is appended only when something observable changed — the table is append-only.
    * Normalised contracts also append rows to `odds_snapshots` (book 'Kalshi') so the research engine sees them.
    * A failing series is recorded and skipped; nothing is substituted.
    """
    p = provider or KalshiProvider()
    now = now or utcnow()
    today = now.astimezone(ET).date() if now else today_et()
    out = {"series_ok": 0, "series_failed": [], "markets_seen": 0, "markets_new": 0, "snapshots": 0, "quotes_appended": 0,
           "normalized": 0, "unsupported": 0, "unmatched": 0}
    for series in [*SERIES, *TRACKED_ONLY]:
        try:
            markets = p.open_markets(series)
        except ProviderError as e:
            out["series_failed"].append({"series": series, "error": str(e)[:120]})
            continue
        out["series_ok"] += 1
        with session_scope() as s:
            teams = {t.id: t for t in s.scalars(select(Team))}
            games_cache: dict[tuple, Game | None] = {}
            for m in markets:
                ev = parse_event(m.get("event_ticker", ""))
                if ev is None or not (today <= ev["date"] <= today + timedelta(days=days_ahead)):
                    continue
                gk = (ev["date"], ev["home_team_id"], ev["away_team_id"])
                if gk not in games_cache:
                    games_cache[gk] = s.scalar(select(Game).where(Game.game_date == ev["date"], Game.home_team_id == ev["home_team_id"],
                                                                  Game.away_team_id == ev["away_team_id"]))
                game = games_cache[gk]
                if game is None:
                    continue  # no such game in our schedule: not ours to invent
                out["markets_seen"] += 1
                snap = snapshot_of(m)
                mk = s.get(KalshiMarket, m["ticker"])
                if mk is None:
                    it = interpret(m)
                    team_id = _team(it["team_code"]) if it["team_code"] else None
                    if team_id not in (game.home_team_id, game.away_team_id):
                        team_id = None
                    player_id = None
                    if it["player_name"]:
                        player_id = match_player(s, it["player_name"], [team_id] if team_id else [game.home_team_id, game.away_team_id])
                    interp, note = it["interpretation"], it["note"]
                    if interp == "normalized" and it["kind"] == "player" and player_id is None:
                        interp, note = "unmatched", f"Player '{it['player_name']}' could not be matched to a known player on these teams."
                    if interp == "normalized" and it["kind"] in ("game", "spread") and team_id is None:
                        interp, note = "unmatched", "Team code on the contract could not be matched to this game."
                    mk = KalshiMarket(
                        ticker=m["ticker"], event_ticker=m["event_ticker"], series=it["series"], game_id=game.id, kind=it["kind"],
                        market=it["market"] if interp == "normalized" else None, stat=it["stat"], player_id=player_id,
                        player_name=it["player_name"], team_id=team_id, threshold=it["threshold"], comparator=it["comparator"],
                        contract_type=m.get("market_type"), strike_type=m.get("strike_type"), interpretation=interp,
                        interpretation_note=note, protected=it["protected"], title=m.get("title") or "",
                        yes_sub_title=m.get("yes_sub_title"), rules_primary=m.get("rules_primary"),
                        rules_secondary=m.get("rules_secondary"), open_time=_ts(m.get("open_time")),
                        close_time=_ts(m.get("close_time")), status=snap["status"], first_seen_at=now, last_seen_at=now)
                    s.add(mk)
                    s.flush()
                    out["markets_new"] += 1
                else:
                    mk.status, mk.last_seen_at = snap["status"], now
                out[mk.interpretation] = out.get(mk.interpretation, 0) + 1
                last = s.scalar(select(KalshiSnapshot).where(KalshiSnapshot.ticker == mk.ticker).order_by(KalshiSnapshot.id.desc()).limit(1))
                if last is None or any(getattr(last, f) != snap[f] for f in SNAP_FIELDS):
                    s.add(KalshiSnapshot(ticker=mk.ticker, observed_at=now, **snap))
                    out["snapshots"] += 1
                if mk.interpretation != "normalized" or snap["status"] != "active":
                    continue
                if game.status != "scheduled" or (game.tipoff_utc and game.tipoff_utc <= now):
                    continue  # pregame quotes only
                for q in _quote_rows(mk, snap, game):
                    prev = s.scalar(select(OddsSnapshot).where(
                        OddsSnapshot.game_id == game.id, OddsSnapshot.market == mk.market, OddsSnapshot.side == q["side"],
                        OddsSnapshot.book == BOOK, OddsSnapshot.subject_id.is_not_distinct_from(q["subject_id"]),
                        OddsSnapshot.line.is_not_distinct_from(q["line"])).order_by(OddsSnapshot.id.desc()).limit(1))
                    if prev is not None and prev.price_american == q["price_american"]:
                        continue
                    s.add(OddsSnapshot(game_id=game.id, market=mk.market, subject_type=q["subject_type"], subject_id=q["subject_id"],
                                       side=q["side"], line=q["line"], price_american=q["price_american"], book=BOOK,
                                       provider="kalshi", origin="provider", source_published_at=None, ingested_at=now,
                                       note="break-even includes an estimated trading fee", source_ref=mk.ticker))
                    out["quotes_appended"] += 1
            del teams
    return out


# ---------------------------------------------------------------- movement (descriptive only)
WINDOWS = (("5m", 5), ("15m", 15), ("30m", 30), ("60m", 60), ("3h", 180))


def price_of(sn) -> float | None:
    """Reference price of an observation: bid/ask midpoint when both exist, else the last traded price."""
    yb, ya = (sn.yes_bid, sn.yes_ask) if not isinstance(sn, dict) else (sn["yes_bid"], sn["yes_ask"])
    last = sn.last_price if not isinstance(sn, dict) else sn["last_price"]
    if yb is not None and ya is not None and 0 < ya <= 1 and yb >= 0 and ya >= yb and not (yb == 0 and ya >= 0.99):
        return round((yb + ya) / 2, 4)
    return last


def movement(snaps: list[KalshiSnapshot], now: datetime) -> dict:
    """Observed movement from stored snapshots. 'First observed' is OUR first observation today, not an official open."""
    if not snaps:
        return {"current": None, "first_observed": None, "first_observed_at": None, "change_since_first": None, "high": None,
                "low": None, "spread": None, "windows": {k: None for k, _ in WINDOWS}, "observations": 0, "last_observed_at": None}
    day0 = now.astimezone(ET).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    today = [x for x in snaps if x.observed_at >= day0] or snaps
    cur = snaps[-1]
    pc = price_of(cur)
    prices = [p for p in (price_of(x) for x in today) if p is not None]
    first = next((x for x in today if price_of(x) is not None), None)
    pf = price_of(first) if first else None

    def at(minutes):  # price in force `minutes` ago = last observation at or before that instant
        cutoff = now - timedelta(minutes=minutes)
        prior = [x for x in snaps if x.observed_at <= cutoff]
        if not prior or pc is None:
            return None
        pp = price_of(prior[-1])
        return None if pp is None else round(pc - pp, 4)
    return {"current": pc, "first_observed": pf, "first_observed_at": first.observed_at if first else None,
            "change_since_first": None if pc is None or pf is None else round(pc - pf, 4),
            "high": max(prices) if prices else None, "low": min(prices) if prices else None,
            "spread": None if cur.yes_bid is None or cur.yes_ask is None else round(cur.yes_ask - cur.yes_bid, 4),
            "windows": {k: at(mn) for k, mn in WINDOWS}, "observations": len(today), "last_observed_at": cur.observed_at}


def snapshots_for(s, tickers: list[str]) -> dict[str, list[KalshiSnapshot]]:
    out: dict[str, list[KalshiSnapshot]] = {t: [] for t in tickers}
    if tickers:
        for x in s.scalars(select(KalshiSnapshot).where(KalshiSnapshot.ticker.in_(tickers)).order_by(KalshiSnapshot.id)):
            out[x.ticker].append(x)
    return out


def last_sync(s) -> datetime | None:
    from .db import ProviderCall
    return s.scalar(select(func.max(ProviderCall.called_at)).where(ProviderCall.provider == "kalshi", ProviderCall.ok.is_(True)))
