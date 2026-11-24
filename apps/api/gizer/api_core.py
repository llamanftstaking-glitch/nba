"""Core Intelligence endpoints: Kalshi market watch, minutes intelligence, availability change events."""
from __future__ import annotations

from datetime import timedelta

from fastapi import Query
from sqlalchemy import select

from . import history as H
from . import ingestion, kalshi
from . import modeling as M
from .api import ApiError, View, _date, api
from .db import Game, KalshiMarket, LineupSnapshot, Player, Prediction, ResearchEvent, Selection, Team, session_scope, utcnow
from .minutes import slate_minutes
from .research import QUALIFIED, STAT_NAME


def _market_row(mk: KalshiMarket, snaps, teams, games, now) -> dict:
    g = games.get(mk.game_id)
    mv = kalshi.movement(snaps, now)
    cur = snaps[-1] if snaps else None
    label = None if g is None else f"{teams[g.away_team_id].abbr} @ {teams[g.home_team_id].abbr}"
    return {"ticker": mk.ticker, "event_ticker": mk.event_ticker, "series": mk.series, "game_id": mk.game_id, "game_label": label,
            "kind": mk.kind, "market": mk.market, "stat": mk.stat, "stat_label": STAT_NAME.get(mk.stat) if mk.stat else None,
            "player_id": mk.player_id, "player_name": mk.player_name,
            "team_abbr": teams[mk.team_id].abbr if mk.team_id in teams else None,
            "title": mk.title, "threshold": mk.threshold, "comparator": mk.comparator, "contract_type": mk.contract_type,
            "interpretation": mk.interpretation, "interpretation_note": mk.interpretation_note, "protected": mk.protected,
            "status": mk.status, "open_time": mk.open_time, "close_time": mk.close_time,
            "yes_bid": cur.yes_bid if cur else None, "yes_ask": cur.yes_ask if cur else None,
            "no_bid": cur.no_bid if cur else None, "no_ask": cur.no_ask if cur else None,
            "last_price": cur.last_price if cur else None, "volume": cur.volume if cur else None,
            "open_interest": cur.open_interest if cur else None,
            "yes_ask_size": cur.yes_ask_size if cur else None, "yes_bid_size": cur.yes_bid_size if cur else None,
            "price": mv["current"], "first_observed": mv["first_observed"], "first_observed_at": mv["first_observed_at"],
            "change_since_first": mv["change_since_first"], "high": mv["high"], "low": mv["low"], "spread": mv["spread"],
            "windows": mv["windows"], "observations": mv["observations"], "last_observed_at": mv["last_observed_at"],
            "first_seen_at": mk.first_seen_at}


def _sync(s) -> dict:
    last = kalshi.last_sync(s)
    age = None if last is None else (utcnow() - last).total_seconds() / 60
    from .config import get_settings
    every = get_settings().kalshi_poll_minutes
    return {"last_sync_at": last, "age_minutes": None if age is None else round(age, 1), "poll_minutes": every,
            "stale": age is None or age > max(3 * every, 20),
            "note": f"Observations are polled about every {every} minutes while games are upcoming. This is not a real-time feed."}


@api.get("/kalshi/markets")
def kalshi_markets(date: str | None = None, game_id: str | None = None, kind: str | None = None, market: str | None = None,
                   interpretation: str | None = None, q: str | None = None, player_id: int | None = None,
                   sort: str = "volume", limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    d = _date(date)
    now = utcnow()
    with session_scope() as s:
        teams = {t.id: t for t in s.scalars(select(Team))}
        games = {g.id: g for g in s.scalars(select(Game).where(Game.game_date == d))}
        stmt = select(KalshiMarket).where(KalshiMarket.game_id.in_(list(games) or ["-"]))
        if game_id:
            stmt = stmt.where(KalshiMarket.game_id == game_id)
        if kind:
            stmt = stmt.where(KalshiMarket.kind == kind)
        if market:
            stmt = stmt.where(KalshiMarket.market == market)
        if interpretation:
            stmt = stmt.where(KalshiMarket.interpretation == interpretation)
        if player_id:
            stmt = stmt.where(KalshiMarket.player_id == player_id)
        mks = list(s.scalars(stmt))
        if q:
            ql = q.lower()[:60]
            mks = [m for m in mks if ql in (m.title or "").lower() or ql in (m.player_name or "").lower()]
        snaps = kalshi.snapshots_for(s, [m.ticker for m in mks])
        rows = [_market_row(m, snaps[m.ticker], teams, games, now) for m in mks]
        keyf = {"volume": lambda r: -(r["volume"] or 0), "movement": lambda r: -abs(r["change_since_first"] or 0),
                "player": lambda r: (r["player_name"] or "~", r["stat"] or "", r["threshold"] or 0),
                "spread": lambda r: (r["spread"] is None, r["spread"] or 0)}.get(sort)
        if keyf is None:
            raise ApiError(422, "invalid_request", "sort must be one of volume, movement, player, spread")
        rows.sort(key=keyf)
        counts = {"total": len(rows), "normalized": sum(r["interpretation"] == "normalized" for r in rows),
                  "unsupported": sum(r["interpretation"] == "unsupported" for r in rows),
                  "unmatched": sum(r["interpretation"] == "unmatched" for r in rows)}
        events = sorted({(r["game_id"], r["game_label"]) for r in rows if r["game_label"]})
        return {"date": d, "sync": _sync(s), "counts": counts, "events": [{"game_id": a, "label": b} for a, b in events],
                "items": rows[offset:offset + limit], "total": len(rows),
                "notes": ["'First observed' is this system's first observation today, not an official opening price.",
                          "Price is the bid/ask midpoint when both exist, otherwise the last traded price.",
                          "A price change is an observation. It does not show why the market moved and is not evidence of the outcome."]}


@api.get("/kalshi/markets/{ticker}")
def kalshi_market_detail(ticker: str):
    now = utcnow()
    with session_scope() as s:
        mk = s.get(KalshiMarket, ticker[:80])
        if mk is None:
            raise ApiError(404, "not_found", "Kalshi market not found.")
        teams = {t.id: t for t in s.scalars(select(Team))}
        g = s.get(Game, mk.game_id)
        snaps = kalshi.snapshots_for(s, [mk.ticker])[mk.ticker]
        row = _market_row(mk, snaps, teams, {g.id: g} if g else {}, now)
        series = [{"at": x.observed_at, "price": kalshi.price_of(x), "yes_bid": x.yes_bid, "yes_ask": x.yes_ask,
                   "last_price": x.last_price, "spread": None if x.yes_bid is None or x.yes_ask is None else round(x.yes_ask - x.yes_bid, 4),
                   "volume": x.volume, "open_interest": x.open_interest, "status": x.status} for x in snaps]
        timeline = []
        since = (snaps[0].observed_at if snaps else now) - timedelta(hours=12)
        team_ids = [mk.team_id] if mk.team_id else ([g.home_team_id, g.away_team_id] if g else [])
        for ev in s.scalars(select(ResearchEvent).where(ResearchEvent.kind == "availability_change", ResearchEvent.created_at >= since)
                            .order_by(ResearchEvent.id)):
            dd = ev.detail
            if dd.get("team_id") in team_ids or (g and dd.get("game_id") == g.id):
                timeline.append({"at": ev.created_at, "type": "availability", "own_player": dd.get("player_id") == mk.player_id and mk.player_id is not None,
                                 "text": f"{dd.get('player_name')}: {dd.get('previous_status') or 'not listed'} → {dd.get('current_status') or 'not listed'}",
                                 "source": dd.get("source"), "source_published_at": dd.get("source_published_at")})
        if g is not None:
            for ls in s.scalars(select(LineupSnapshot).where(LineupSnapshot.game_id == g.id).order_by(LineupSnapshot.id)):
                timeline.append({"at": ls.ingested_at, "type": "lineup", "own_player": False,
                                 "text": f"{teams[ls.team_id].abbr} lineup ({ls.status}): {ls.change}", "source": ls.source,
                                 "source_published_at": None})
        prev_status = None
        for x in snaps:
            if prev_status is not None and x.status != prev_status:
                timeline.append({"at": x.observed_at, "type": "market_status", "own_player": True,
                                 "text": f"Market status {prev_status} → {x.status}", "source": "kalshi", "source_published_at": None})
            prev_status = x.status
        timeline.sort(key=lambda e: e["at"])
        research = None
        history = None
        if mk.interpretation == "normalized" and mk.kind == "player" and mk.player_id and g is not None:
            pl = s.get(Player, mk.player_id)
            abbr = {t.id: t.abbr for t in teams.values()}
            history = {w: {k: v for k, v in H.threshold(s, mk.player_id, mk.stat, mk.threshold, w, g.game_date, team_abbr=abbr).items()
                           if k in ("n", "over", "under", "equal", "frequency_over", "average")} for w in ("L5", "L10", "L20", "season")}
            pred = s.scalar(select(Prediction).where(Prediction.game_id == g.id, Prediction.subject_id == mk.player_id,
                                                     Prediction.stat == mk.stat).order_by(Prediction.id.desc()).limit(1))
            mv = M.production_model(s, f"player_{mk.stat}")
            sels = list(s.scalars(select(Selection).where(Selection.game_id == g.id, Selection.subject_id == mk.player_id,
                                                          Selection.market == mk.market, Selection.line == mk.threshold,
                                                          Selection.book == kalshi.BOOK).order_by(Selection.id.desc()).limit(2)))
            research = {"player": {"id": pl.id, "name": pl.name, "headshot_url": pl.headshot_url, "position": pl.position} if pl else None,
                        "model_ready": mv is not None,
                        "projection": None if pred is None else {"mean": round(pred.mean, 1), "p10": pred.p10, "p90": pred.p90,
                                                                 "proj_min": pred.features.get("proj_min"), "created_at": pred.created_at},
                        "selections": [{"id": x.id, "side": x.side, "classification": x.classification, "prob": x.prob,
                                        "prob_low": x.prob_low, "prob_high": x.prob_high, "breakeven": x.breakeven,
                                        "rejection_reasons": x.rejection_reasons} for x in sels],
                        "note": "The model probability is independent of the market price. The price is never a model input."}
        return {"market": row, "rules": {"primary": mk.rules_primary, "secondary": mk.rules_secondary,
                                         "settlement_note": "Kalshi settles to a fair price, not a void, when a player is inactive or never "
                                                            "takes the court; GIZER paper settlement treats that case as void."},
                "series": series, "timeline": timeline, "history": history, "research": research, "sync": _sync(s),
                "notes": ["Events on the timeline are shown in the order they were recorded. An announcement close in time to a "
                          "price change is not shown to have caused it.",
                          "Historical counts versus this threshold are descriptive; they are not a probability."]}


@api.get("/minutes")
def minutes_table(date: str | None = None, team: str | None = None, q: str | None = None, classification: str | None = None,
                  sort: str = "proj_min", order: str = "desc", limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    d = _date(date)
    with session_scope() as s:
        data = slate_minutes(s, d)
        rows = data["items"]
        if team:
            rows = [r for r in rows if r["team_abbr"] == team.upper()]
        if q:
            rows = [r for r in rows if q.lower()[:60] in r["player_name"].lower()]
        if classification:
            rows = [r for r in rows if r["classification"] == classification]
        allowed = ("proj_min", "l3", "l5", "l10", "l20", "season_avg", "sd_l10", "player_name", "starts_l10")
        if sort not in allowed:
            raise ApiError(422, "invalid_request", f"sort must be one of {allowed}")
        rows.sort(key=lambda r: (r[sort] is None, r[sort] if sort == "player_name" else -(r[sort] or 0) if order != "asc" else (r[sort] or 0)))
        return {**{k: v for k, v in data.items() if k != "items"}, "items": rows[offset:offset + limit], "total": len(rows)}


@api.get("/players/{player_id}/minutes")
def player_minutes(player_id: int):
    with session_scope() as s:
        if s.get(Player, player_id) is None:
            raise ApiError(404, "not_found", "Player not found.")
        data = slate_minutes(s, ingestion.today_et(), player_id=player_id)
        return {**{k: v for k, v in data.items() if k != "items"}, "profile": data["items"][0] if data["items"] else None}


@api.get("/injuries/changes")
def injury_changes(date: str | None = None, material: bool | None = None, limit: int = Query(100, ge=1, le=300)):
    d = _date(date)
    with session_scope() as s:
        v = View(s, d)
        teams = v.teams
        day0 = utcnow() - timedelta(hours=36) if d == ingestion.today_et() else None
        stmt = select(ResearchEvent).where(ResearchEvent.kind == "availability_change").order_by(ResearchEvent.id.desc()).limit(600)
        if day0 is not None:
            stmt = stmt.where(ResearchEvent.created_at >= day0)
        else:
            stmt = stmt.where(ResearchEvent.game_date == d)
        sels = v.selections()
        heads = {p.id: p.headshot_url for p in s.scalars(select(Player).where(Player.headshot_url.is_not(None)))}
        items = []
        for ev in s.scalars(stmt):
            dd = ev.detail
            if material is not None and bool(dd.get("material")) != material:
                continue
            g = next((x for x in v.games if x.id == dd.get("game_id")), None)
            affected = [x for x in sels if (x.subject_type == "player" and x.subject_id == dd.get("player_id")) or
                        (dd.get("game_id") and x.game_id == dd.get("game_id") and x.team_id in (None, dd.get("team_id")))]
            lineup = [e.detail.get("change") for e in s.scalars(select(ResearchEvent).where(
                ResearchEvent.kind == "lineup_change", ResearchEvent.ref_id == (dd.get("game_id") or "-"),
                ResearchEvent.created_at >= ev.created_at - timedelta(minutes=5)).limit(3)) if e.detail.get("team") == (teams[dd["team_id"]].abbr if dd.get("team_id") in teams else None)]
            items.append({"at": ev.created_at, "player_id": dd.get("player_id"), "player_name": dd.get("player_name"),
                          "headshot_url": heads.get(dd.get("player_id")),
                          "team_abbr": teams[dd["team_id"]].abbr if dd.get("team_id") in teams else None,
                          "previous_status": dd.get("previous_status"), "current_status": dd.get("current_status"),
                          "previous_class": dd.get("previous_class"), "current_class": dd.get("current_class"),
                          "material": bool(dd.get("material")), "detail": dd.get("detail"), "game_id": dd.get("game_id"),
                          "game_label": v.game_label(g) if g else None, "source": dd.get("source"),
                          "source_published_at": dd.get("source_published_at"), "lineup_changes": lineup,
                          "records_to_reassess": len(affected),
                          "qualified_records_affected": sum(1 for x in affected if x.classification in QUALIFIED)})
            if len(items) >= limit:
                break
        return {"date": d, "items": items,
                "notes": ["A status change is recorded as published by the source. No medical inference is made.",
                          "Affected research records are re-evaluated by the next edition; earlier editions are preserved."]}
