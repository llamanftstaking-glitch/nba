"""V3 endpoints: player intelligence, player props (incl. controlled manual entry), lineups, provider centre,
strategy performance. Registered on the authenticated router from api.py."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
from fastapi import Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from . import history as H
from . import ingestion
from . import modeling as M
from .api import ApiError, View, _date, api, cfg, team_ref, ticket_dict
from .db import (Game, InjurySnapshot, OddsSnapshot, PaperSettlement, PaperTicket, Player, PlayerBox,
                 Prediction, PredictionOutcome, ProviderCall, ResearchEvent, Team, session_scope, utcnow)
from .ledger import ALL_ENGINES, DISCLAIMER, summarize
from .lineups import LineupContext, current_lineup, lineup_status_map
from .research import MARKET_STAT, RISK_POLICY, STAT_LABEL, STAT_NAME, decimal_to_american
from .security import Principal, audit, client_ip, require_owner

del ticket_dict


def player_ref(p: Player, teams: dict) -> dict:
    return {"id": p.id, "name": p.name, "team_abbr": teams[p.team_id].abbr if p.team_id in teams else None,
            "position": p.position, "jersey": p.jersey, "headshot_url": p.headshot_url}


def _player(s, pid: int) -> Player:
    p = s.get(Player, pid)
    if p is None:
        raise ApiError(404, "not_found", "Player not found.")
    return p


def _stat(stat: str) -> str:
    if stat not in H.STATS:
        raise ApiError(422, "invalid_request", f"stat must be one of {H.STATS}")
    return stat


# ---------------------------------------------------------------- player intelligence
@api.get("/players/{player_id}/averages")
def player_averages(player_id: int):
    with session_scope() as s:
        _player(s, player_id)
        return {"definition": H.DEFINITION, "windows": H.windows(s, player_id, ingestion.today_et())}


@api.get("/players/{player_id}/game-logs")
def player_game_logs(player_id: int, season: str | None = None, venue: str | None = None, role: str | None = None,
                     opponent: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    with session_scope() as s:
        _player(s, player_id)
        teams = {t.id: t for t in s.scalars(select(Team))}
        opp = next((t.id for t in teams.values() if opponent and t.abbr == opponent.upper()), None)
        if opponent and opp is None:
            raise ApiError(404, "not_found", "Opponent team not found.")
        df = H.apply_filters(H.player_frame(s, player_id), venue, role, opp, season)
        items = []
        for r in df.iloc[::-1].iloc[offset:offset + limit].itertuples():
            items.append({"game_id": r.game_id, "date": r.date, "opp_abbr": teams[r.opp_team_id].abbr if r.opp_team_id in teams else None,
                          "is_home": bool(r.is_home), "starter": None if r.starter is None or pd.isna(r.starter) else bool(r.starter),
                          "result": r.result, "team_points": r.team_points, "opp_points": r.opp_points, "min": r.min,
                          **{k: int(getattr(r, k)) for k in ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "pra", "fga", "fta")},
                          "usage": None if r.usage is None or pd.isna(r.usage) else round(float(r.usage), 1)})
        missed = [{"date": m["date"], "opp_abbr": teams[m["opp_team_id"]].abbr if m["opp_team_id"] in teams else None,
                   "reason": m["reason"]} for m in H.missed_games(s, player_id)]
        return {"items": items, "total": int(len(df)), "missed": missed,
                "source": "Box scores: PBP Stats API. Starter flags and did-not-play records: ESPN box scores."}


@api.get("/players/{player_id}/threshold")
def player_threshold(player_id: int, stat: str, line: float = Query(ge=0, le=200), window: str = "L10",
                     venue: str | None = None, role: str | None = None):
    if window not in ("L3", "L5", "L10", "L15", "L20", "L30", "season", "prev_season", "all"):
        raise ApiError(422, "invalid_request", "unsupported window")
    with session_scope() as s:
        _player(s, player_id)
        abbr = {t.id: t.abbr for t in s.scalars(select(Team))}
        return H.threshold(s, player_id, _stat(stat), line, window, ingestion.today_et(), venue, role, abbr)


@api.get("/players/{player_id}/splits")
def player_splits(player_id: int):
    with session_scope() as s:
        p = _player(s, player_id)
        abbr = {t.id: t.abbr for t in s.scalars(select(Team))}
        today = ingestion.today_et()
        g = s.scalar(select(Game).where(Game.game_date >= today, Game.status == "scheduled",
                                        (Game.home_team_id == p.team_id) | (Game.away_team_id == p.team_id)).order_by(Game.game_date).limit(1))
        nxt = None if g is None else (g.away_team_id if g.home_team_id == p.team_id else g.home_team_id)
        return H.splits(s, player_id, today, abbr, nxt)


# ---------------------------------------------------------------- player props
OPERATIONAL_NOTE = "Model family validated; quotes require a prop odds provider or owner-entered markets."


def market_catalog(s) -> list[dict]:
    out = []
    for stat in M.PLAYER_STATS:
        mv = M.production_model(s, f"player_{stat}")
        out.append({"key": f"player_{stat}", "label": STAT_NAME[stat], "stat": stat, "operational": mv is not None,
                    "note": OPERATIONAL_NOTE if mv else "Model did not pass the promotion gate: research-only, cannot qualify."})
    for key, label in (("double_double", "Double-double"), ("triple_double", "Triple-double"), ("alt_lines", "Alternate lines"),
                       ("first_half", "First-half player markets"), ("first_quarter", "First-quarter player markets")):
        out.append({"key": key, "label": label, "stat": None, "operational": False,
                    "note": "Not supported: no model, data or settlement rules verified for this category."})
    return out


_PROP_CACHE: dict[tuple, list] = {}


def prop_rows(s, v: View, game_id: str | None = None, player_id: int | None = None) -> list[dict]:
    """Player-prop rows for a date. The result is reused until any underlying table changes (see data_stamp)."""
    from .api import data_stamp
    ck = (v.date, game_id, player_id, data_stamp(s))
    hit = _PROP_CACHE.get(ck)
    if hit is None:
        hit = _prop_rows(s, v, game_id, player_id)
        while len(_PROP_CACHE) >= 24:
            _PROP_CACHE.pop(next(iter(_PROP_CACHE)), None)
        _PROP_CACHE[ck] = hit
    return [dict(r) for r in hit]


def _prop_rows(s, v: View, game_id: str | None = None, player_id: int | None = None) -> list[dict]:
    games = [g for g in v.games if (game_id is None or g.id == game_id)]
    if not games:
        return []
    lus = lineup_status_map(s, [g.id for g in games])
    inj = {i.player_id: i for i in ingestion.latest_injuries(s) if i.player_id}
    sel_by = {}
    for x in v.selections():
        if x.subject_type == "player":
            sel_by.setdefault((x.game_id, x.subject_id, x.market), []).append(x)
    ready = {st: M.production_model(s, f"player_{st}") is not None for st in M.PLAYER_STATS}
    status = {st: (s.scalar(select(M.ModelVersion.status).where(M.ModelVersion.family == f"player_{st}")
                            .order_by(M.ModelVersion.id.desc()).limit(1)) or "missing") for st in M.PLAYER_STATS}
    rows = []
    for g in games:
        ek = s.scalar(select(Prediction.edition_key).where(Prediction.game_id == g.id).order_by(Prediction.id.desc()).limit(1))
        preds = {}
        if ek:
            q = select(Prediction).where(Prediction.game_id == g.id, Prediction.edition_key == ek, Prediction.subject_type == "player")
            if player_id:
                q = q.where(Prediction.subject_id == player_id)
            for p in s.scalars(q):
                preds[(p.subject_id, p.stat)] = p
        quotes: dict[tuple, dict] = {}
        ladders: dict[tuple, dict] = {}
        withdrawn = {int(x) for x in s.scalars(select(ResearchEvent.ref_id).where(ResearchEvent.kind == "manual_withdrawn"))}
        for q in s.scalars(select(OddsSnapshot).where(OddsSnapshot.game_id == g.id, OddsSnapshot.subject_type == "player")
                           .order_by(OddsSnapshot.id.desc())):
            if q.id in withdrawn or (player_id and q.subject_id != player_id):
                continue
            ladder = ladders.setdefault((q.subject_id, q.market), {})
            slot = ladder.setdefault((q.book, q.line), {"book": q.book, "origin": q.origin, "line": q.line, "at": q.ingested_at})
            if q.side not in slot:
                slot[q.side] = q.price_american
        for key, ladder in ladders.items():
            # Several thresholds can be listed for one player and stat: show the one priced closest to even,
            # preferring provider quotes over manual ones.
            def score(sl):
                pr = sl.get("over") if sl.get("over") is not None else sl.get("under")
                return (sl["origin"] != "provider", abs(abs(pr) - 100) if pr is not None else 10 ** 6)
            quotes[key] = {**min(ladder.values(), key=score), "n_thresholds": len(ladder)}
        pids = sorted({k[0] for k in preds} | {k[0] for k in quotes})
        if not pids:
            continue
        players = {p.id: p for p in s.scalars(select(Player).where(Player.id.in_(pids)))}
        hist = pd.DataFrame(s.execute(select(PlayerBox.player_id, PlayerBox.game_date, PlayerBox.season, *[getattr(PlayerBox, c) for c in M.BASE_STATS])
                                      .where(PlayerBox.player_id.in_(pids), PlayerBox.game_date < g.game_date)
                                      .order_by(PlayerBox.game_date)).all(),
                            columns=["player_id", "date", "season", *M.BASE_STATS])
        if not hist.empty:
            M.add_combo_stats(hist)
        by_p = {int(k): d for k, d in hist.groupby("player_id")} if not hist.empty else {}
        label = v.game_label(g)
        for pid in pids:
            pl = players.get(pid)
            if pl is None:
                continue
            tid = pl.team_id if pl.team_id in (g.home_team_id, g.away_team_id) else None
            anyp = next((p for (i, _), p in preds.items() if i == pid), None)
            tid = (anyp.features.get("team_id") if anyp else None) or tid
            opp = g.away_team_id if tid == g.home_team_id else g.home_team_id
            snap = lus.get((g.id, tid))
            role = None
            if snap is not None:
                role = next((("starter" if p["role"] == "starter" else "bench") for p in snap.players
                             if p["player_id"] == pid and p["role"] != "unavailable"), None)
            av = inj[pid].status if pid in inj else "available"
            d = by_p.get(pid, pd.DataFrame())
            avgs = H.quick_averages_all(d, list(M.PLAYER_STATS), g.game_date) if len(d) else {}
            for stat in M.PLAYER_STATS:
                market = f"player_{stat}"
                p, q = preds.get((pid, stat)), quotes.get((pid, market))
                if p is None and q is None:
                    continue
                avg = avgs.get(stat) or {"l5": None, "l10": None, "l20": None, "season_avg": None, "n_games": 0}
                ho = hn = None
                if q and q["line"] is not None and len(d):
                    last = d.tail(10)[stat]
                    ho, hn = int((last > q["line"]).sum()), int(len(last))
                sels = sel_by.get((g.id, pid, market), [])
                best = min(sels, key=lambda x: (x.rank_in_game or 99, -(x.prob or 0))) if sels else None
                rows.append({
                    "player_id": pid, "player_name": pl.name, "headshot_url": pl.headshot_url,
                    "team_abbr": v.teams[tid].abbr if tid in v.teams else None, "opp_abbr": v.teams[opp].abbr if opp in v.teams else None,
                    "game_id": g.id, "game_label": label, "market": market, "stat": stat,
                    "line": q["line"] if q else None, "over_price": q.get("over") if q else None,
                    "under_price": q.get("under") if q else None, "book": q["book"] if q else None,
                    "origin": q["origin"] if q else None, "quote_at": q["at"] if q else None, **avg,
                    "hist_over": ho, "hist_n": hn,
                    "proj_min": round(p.features.get("proj_min"), 1) if p and p.features.get("proj_min") else None,
                    "projection": round(p.mean, 1) if p else None, "p10": p.p10 if p else None, "p90": p.p90 if p else None,
                    "availability": av, "lineup_role": role, "lineup_status": snap.status if snap else "unknown",
                    "model_ready": ready[stat], "model_status": status[stat],
                    "selection": None if best is None else {"id": best.id, "side": best.side,
                                                            "classification": "invalidated" if best.id in v.inv_sel else best.classification,
                                                            "prob": best.prob, "prob_low": best.prob_low, "prob_high": best.prob_high},
                    "updated_at": (q["at"] if q else None) or (p.created_at if p else None)})
    rows.sort(key=lambda r: (r["line"] is None, r["game_id"], -(r["proj_min"] or 0), r["player_name"], M.PLAYER_STATS.index(r["stat"])))
    return rows


def _quote_status(rows) -> dict:
    n = sum(1 for r in rows if r["origin"] == "provider")
    m = sum(1 for r in rows if r["origin"] in ("owner_entered", "hypothetical"))
    from .api import _prop_source_message
    msg = _prop_source_message(n)
    return {"provider_configured": bool(cfg.odds_api_key) or cfg.kalshi_enabled, "message": msg, "provider_quoted": n, "manual": m}


@api.get("/player-props")
def player_props(date: str | None = None, game_id: str | None = None, team: str | None = None, market: str | None = None,
                 q: str | None = None, quoted: bool | None = None, lineup_status: str | None = None,
                 model_ready: bool | None = None, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    d = _date(date)
    with session_scope() as s:
        v = View(s, d)
        rows = prop_rows(s, v, game_id)
        qs = _quote_status(rows)
        if team:
            rows = [r for r in rows if r["team_abbr"] == team.upper()]
        if market:
            rows = [r for r in rows if r["market"] == market]
        if q:
            rows = [r for r in rows if q.lower()[:60] in r["player_name"].lower()]
        if quoted is not None:
            rows = [r for r in rows if (r["line"] is not None) == quoted]
        if lineup_status:
            rows = [r for r in rows if r["lineup_status"] == lineup_status]
        if model_ready is not None:
            rows = [r for r in rows if r["model_ready"] == model_ready]
        return {"date": d, "markets": market_catalog(s), "quote_status": {k: qs[k] for k in ("provider_configured", "message")},
                "items": rows[offset:offset + limit], "total": len(rows)}


@api.get("/games/{game_id}/player-props")
def game_player_props(game_id: str, market: str | None = None, limit: int = Query(200, ge=1, le=500), offset: int = Query(0, ge=0)):
    with session_scope() as s:
        g = s.get(Game, game_id)
        if g is None:
            raise ApiError(404, "not_found", "Game not found.")
        v = View(s, g.game_date)
        rows = prop_rows(s, v, game_id)
        qs = _quote_status(rows)
        if market:
            rows = [r for r in rows if r["market"] == market]
        return {"date": g.game_date, "markets": market_catalog(s), "quote_status": {k: qs[k] for k in ("provider_configured", "message")},
                "items": rows[offset:offset + limit], "total": len(rows)}


class ManualBody(BaseModel):
    game_id: str = Field(max_length=12)
    player_id: int
    market: str = Field(max_length=24)
    line: float = Field(ge=0, le=150)
    over_price: float | None = None
    under_price: float | None = None
    odds_format: str = Field(default="american", pattern="^(american|decimal)$")
    origin: str = Field(pattern="^(owner_entered|hypothetical)$")
    book: str | None = Field(default=None, max_length=32)
    observed_at: datetime | None = None
    source_ref: str | None = Field(default=None, max_length=300)
    note: str | None = Field(default=None, max_length=300)


def _to_american(v: float | None, fmt: str) -> int | None:
    if v is None:
        return None
    if fmt == "decimal":
        if not (1.01 <= v <= 101):
            raise ApiError(422, "invalid_request", "Decimal odds must be between 1.01 and 101.")
        return decimal_to_american(v)
    if v != int(v) or not (100 <= abs(v) <= 10000):
        raise ApiError(422, "invalid_request", "American odds must be a whole number of at least +100 or at most -100.")
    return int(v)


def _manual_entries(s, d=None) -> list[dict]:
    q = select(OddsSnapshot).where(OddsSnapshot.provider == "manual").order_by(OddsSnapshot.id)
    rows = list(s.scalars(q))
    withdrawn = {int(x) for x in s.scalars(select(ResearchEvent.ref_id).where(ResearchEvent.kind == "manual_withdrawn"))}
    teams = {t.id: t for t in s.scalars(select(Team))}
    groups: dict[tuple, dict] = {}
    for r in rows:
        g = s.get(Game, r.game_id)
        if g is None or (d is not None and g.game_date != d):
            continue
        pl = s.get(Player, r.subject_id)
        e = groups.setdefault((r.game_id, r.subject_id, r.market, r.line, r.ingested_at), {
            "id": r.id, "game_id": r.game_id, "game_label": f"{teams[g.away_team_id].abbr} @ {teams[g.home_team_id].abbr}",
            "player_id": r.subject_id, "player_name": pl.name if pl else str(r.subject_id), "market": r.market, "line": r.line,
            "over_price": None, "under_price": None, "book": r.book, "origin": r.origin, "observed_at": r.source_published_at,
            "source_ref": r.source_ref, "note": r.note, "created_by": r.created_by, "created_at": r.ingested_at,
            "withdrawn": False, "_ids": []})
        e[f"{r.side}_price"] = r.price_american
        e["_ids"].append(r.id)
        e["withdrawn"] = e["withdrawn"] or r.id in withdrawn
    return list(groups.values())


@api.get("/player-props/manual")
def manual_list(date: str | None = None):
    with session_scope() as s:
        return {"items": [{k: v for k, v in e.items() if k != "_ids"} for e in reversed(_manual_entries(s, _date(date)))]}


@api.post("/player-props/manual")
def manual_create(body: ManualBody, request: Request, p: Principal = Depends(require_owner)):
    if body.market not in MARKET_STAT:
        raise ApiError(422, "invalid_request", f"market must be one of {sorted(MARKET_STAT)}")
    if (body.line * 2) != int(body.line * 2):
        raise ApiError(422, "invalid_request", "Line must be a multiple of 0.5.")
    over, under = _to_american(body.over_price, body.odds_format), _to_american(body.under_price, body.odds_format)
    if body.origin == "owner_entered" and over is None and under is None:
        raise ApiError(422, "invalid_request", "An owner-entered market needs at least one price. Use 'hypothetical' for a threshold without a price.")
    if body.origin == "hypothetical":
        over = under = None  # a hypothetical threshold never carries a price
    now = utcnow()
    if body.observed_at and body.observed_at.astimezone(timezone.utc) > now + timedelta(minutes=5):
        raise ApiError(422, "invalid_request", "Observation time cannot be in the future.")
    with session_scope() as s:
        g = s.get(Game, body.game_id)
        if g is None:
            raise ApiError(404, "not_found", "Game not found.")
        if g.status != "scheduled" or (g.tipoff_utc and g.tipoff_utc <= now):
            raise ApiError(409, "not_allowed", "The game has started; pregame markets can no longer be entered.")
        pl = s.get(Player, body.player_id)
        if pl is None or pl.team_id not in (g.home_team_id, g.away_team_id):
            raise ApiError(422, "invalid_request", "Player is not on either team in this game.")
        book = (body.book or ("Owner entry" if body.origin == "owner_entered" else "Hypothetical")).strip()[:32]
        sides = [("over", over), ("under", under)] if body.origin == "hypothetical" else [(sd, pr) for sd, pr in (("over", over), ("under", under)) if pr is not None]
        ids = []
        for side, price in sides:
            row = OddsSnapshot(game_id=g.id, market=body.market, subject_type="player", subject_id=pl.id, side=side,
                               line=body.line, price_american=price, book=book, provider="manual", origin=body.origin,
                               source_published_at=body.observed_at, ingested_at=now, note=body.note,
                               source_ref=body.source_ref, created_by=p.email)
            s.add(row); s.flush(); ids.append(row.id)
        s.add(ResearchEvent(kind="manual_market_entered", ref_type="odds_snapshot", ref_id=str(ids[0]), game_date=g.game_date,
                            actor=p.email, detail={"ids": ids, "origin": body.origin, "market": body.market, "line": body.line,
                                                   "player_id": pl.id}))
        entry = next(e for e in _manual_entries(s, g.game_date) if ids[0] in e["_ids"])
    audit(p.email, "manual_market_entered", {"ids": ids, "origin": body.origin}, client_ip(request))
    return {"entry": {k: v for k, v in entry.items() if k != "_ids"}}


@api.post("/player-props/manual/{entry_id}/withdraw")
def manual_withdraw(entry_id: int, request: Request, p: Principal = Depends(require_owner)):
    with session_scope() as s:
        e = next((x for x in _manual_entries(s) if entry_id in x["_ids"]), None)
        if e is None:
            raise ApiError(404, "not_found", "Manual entry not found.")
        if not e["withdrawn"]:
            for i in e["_ids"]:  # the quote rows are kept; withdrawal is an appended audit event
                s.add(ResearchEvent(kind="manual_withdrawn", ref_type="odds_snapshot", ref_id=str(i), actor=p.email, detail={}))
    audit(p.email, "manual_market_withdrawn", {"entry_id": entry_id}, client_ip(request))
    return {"ok": True}


# ---------------------------------------------------------------- lineups
def _team_lineup(s, ctx, g: Game, team: Team) -> dict:
    lu = current_lineup(s, ctx, g, team)
    return {"team": team_ref(team), **{k: lu[k] for k in ("status", "source", "verified_at", "note", "starters", "bench", "unavailable")}}


@api.get("/lineups")
def lineups(date: str | None = None):
    d = _date(date)
    with session_scope() as s:
        teams = {t.id: t for t in s.scalars(select(Team))}
        games = list(s.scalars(select(Game).where(Game.game_date == d).order_by(Game.tipoff_utc, Game.id)))
        have = lineup_status_map(s, [g.id for g in games])
        missing = any((g.id, tid) not in have for g in games for tid in (g.home_team_id, g.away_team_id))
        ctx = LineupContext(s, d) if games and missing and d >= ingestion.today_et() else None  # only when nothing is stored
        return {"date": d, "games": [{
            "game": {"id": g.id, "label": f"{teams[g.away_team_id].abbr} @ {teams[g.home_team_id].abbr}", "tipoff_utc": g.tipoff_utc,
                     "status": g.status, "home": team_ref(teams[g.home_team_id]), "away": team_ref(teams[g.away_team_id])},
            "home": _team_lineup(s, ctx, g, teams[g.home_team_id]), "away": _team_lineup(s, ctx, g, teams[g.away_team_id])} for g in games]}


@api.get("/games/{game_id}/lineups")
def game_lineups(game_id: str):
    with session_scope() as s:
        g = s.get(Game, game_id)
        if g is None:
            raise ApiError(404, "not_found", "Game not found.")
        teams = {t.id: t for t in s.scalars(select(Team))}
        have = lineup_status_map(s, [g.id])
        ctx = LineupContext(s, g.game_date) if g.status == "scheduled" and len(have) < 2 else None
        return {"game_id": g.id, "home": _team_lineup(s, ctx, g, teams[g.home_team_id]),
                "away": _team_lineup(s, ctx, g, teams[g.away_team_id])}


@api.get("/games/{game_id}/lineup-history")
def lineup_history(game_id: str):
    from .db import LineupSnapshot
    with session_scope() as s:
        if s.get(Game, game_id) is None:
            raise ApiError(404, "not_found", "Game not found.")
        abbr = {t.id: t.abbr for t in s.scalars(select(Team))}
        return {"items": [{"at": x.ingested_at, "team_abbr": abbr.get(x.team_id), "status": x.status, "change": x.change, "source": x.source}
                          for x in s.scalars(select(LineupSnapshot).where(LineupSnapshot.game_id == game_id).order_by(LineupSnapshot.id.desc()))]}


# ---------------------------------------------------------------- providers, strategies
PROVIDER_META = {
    "kalshi": {"name": "Kalshi (public market data, read-only)",
               "categories": ["NBA event contracts: player points, rebounds, assists, threes, steals, blocks, PRA", "game winner, total, spread",
                              "bid/ask, last price, volume, open interest, contract rules"],
               "credential": "not_required",
               "limitations": ["Polled on a schedule (default every 5 minutes while games are upcoming) — not real-time; WebSocket streaming needs an authenticated account and is not used",
                               "Read-only by design: no order, portfolio or trading call exists in this application",
                               "Protected, escalator, double-double and steals+blocks contracts are tracked but not interpreted",
                               "Break-even prices include an estimated trading fee (0.07 x price x (1 - price)); the exact fee schedule per series was not verified",
                               "Price history exists only from the first observation by this system"],
               "setup": "No credential needed. Controlled by GIZER_KALSHI_ENABLED and GIZER_KALSHI_POLL_MINUTES."},
    "pbpstats": {"name": "PBP Stats API", "categories": ["completed games", "possessions", "player box scores"], "credential": "not_required",
                 "limitations": ["Regular season only is ingested", "Aggressively rate-limited (bursts return HTTP 503)",
                                 "No published commercial licence reviewed"],
                 "setup": "No credential needed. Enabled by default (GIZER_PBPSTATS_ENABLED)."},
    "espn": {"name": "ESPN public site API (unofficial)", "categories": ["schedule and tipoff times", "final scores", "game-level odds (book attributed)",
                                                                         "injury list", "confirmed starters (box score)", "did-not-play records",
                                                                         "player headshots, jersey, position"],
             "credential": "not_required",
             "limitations": ["Undocumented endpoint without a contract; may change or be withdrawn", "No projected lineups before tipoff",
                             "No player-prop markets", "Private research use only until licensing is reviewed"],
             "setup": "No credential needed. Enabled by default (GIZER_ESPN_ENABLED)."},
    "oddsapi": {"name": "The Odds API", "categories": ["player-prop quotes: points, rebounds, assists, threes, steals, blocks, turnovers, PRA, PR, PA, RA"],
                "credential": "key",
                "limitations": ["Requires an API key; paid plans beyond the free tier", "Adapter is contract-tested only — NOT verified against the live service",
                                "Hard monthly credit cap enforced in code (GIZER_ODDS_API_MONTHLY_QUOTA)"],
                "setup": "Owner approval required (possible cost). Set GIZER_ODDS_API_KEY in the server's .env and restart the api, worker and "
                         "scheduler containers. Keys are never entered or shown in this application."},
}


@api.get("/data-health/providers")
def providers_info():
    with session_scope() as s:
        out = []
        for p in ingestion.provider_status(s):
            meta = PROVIDER_META[p["provider"]]
            err = s.scalar(select(ProviderCall.error).where(ProviderCall.provider == p["provider"], ProviderCall.ok.is_(False))
                           .order_by(ProviderCall.id.desc()).limit(1))
            cred = meta["credential"] if meta["credential"] != "key" else ("present" if p["configured"] else "missing")
            out.append({"provider": p["provider"], "name": meta["name"], "categories": meta["categories"], "configured": p["configured"],
                        "credential": cred, "status": p["status"], "last_success_at": p["last_success_at"],
                        "last_error_at": p["last_error_at"], "last_error": err, "calls_this_month": p["calls_this_month"],
                        "quota_used": p["quota_used"], "quota_limit": p["quota_limit"], "monthly_cost_usd": p["monthly_cost_usd"],
                        "limitations": meta["limitations"], "setup": meta["setup"]})
        return {"items": out}


@api.get("/performance/strategies")
def strategies():
    with session_scope() as s:
        tickets = list(s.scalars(select(PaperTicket)))
        cur = {st.ticket_id: st for st in s.scalars(select(PaperSettlement).where(PaperSettlement.id.in_(
            select(func.max(PaperSettlement.id)).group_by(PaperSettlement.ticket_id))))}
        rows = [(t, cur.get(t.id)) for t in tickets]
        groups = []
        singles = [r for r in rows if r[0].kind == "single"]
        team_m = ("spread", "total", "moneyline")
        groups.append({"key": "single_player", "label": "Individual player market research", "kind": "market",
                       **summarize([r for r in singles if r[0].legs[0]["market"] in MARKET_STAT])})
        groups.append({"key": "single_team", "label": "Team market research", "kind": "market",
                       **summarize([r for r in singles if r[0].legs[0]["market"] in team_m])})
        for m in team_m:
            groups.append({"key": m, "label": f"Team {m}", "kind": "market", **summarize([r for r in singles if r[0].legs[0]["market"] == m])})
        for stat in M.PLAYER_STATS:
            groups.append({"key": f"player_{stat}", "label": f"{STAT_NAME[stat]} research", "kind": "market",
                           **summarize([r for r in singles if r[0].legs[0]["market"] == f"player_{stat}"])})
        names = {"DOUBLE": "Two", "TRIPLE": "Three", "QUAD": "Four", "FIVE": "Five", "SIX": "Six"}
        for e in ALL_ENGINES[1:]:
            groups.append({"key": e, "label": f"{names[e]}-leg paper combinations", "kind": "engine",
                           **summarize([r for r in rows if r[0].engine == e])})
        for k, lab in (("SGP", "Same-game research"), ("CROSS", "Cross-game research")):
            groups.append({"key": k, "label": lab, "kind": "structure", **summarize([r for r in rows if r[0].structure == k])})
        fc = s.execute(select(PredictionOutcome.stat, func.count(), func.avg(func.abs(PredictionOutcome.error)),
                              func.avg(func.cast(PredictionOutcome.in_80, __import__("sqlalchemy").Integer)))
                       .where(PredictionOutcome.actual.is_not(None)).group_by(PredictionOutcome.stat)).all()
        return {"groups": groups, "forecast": [{"stat": r[0], "n": int(r[1]), "mae": float(r[2]), "coverage_80": float(r[3])} for r in fc],
                "disclaimer": DISCLAIMER + " Categories are reported separately and are never pooled into one headline number."}


del InjurySnapshot, RISK_POLICY, STAT_LABEL
