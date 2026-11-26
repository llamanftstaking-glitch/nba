"""GIZER LIVE endpoints: scoreboard, game centre, box score, plays, rotations, momentum, stream, watchlist,
milestones and the paper research tracker. Everything is read from our own stored observations."""
from __future__ import annotations

import json
import time
from datetime import date as date_cls
from datetime import timedelta
from typing import Literal

from fastapi import Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from . import live as L
from .api import ApiError, _date, api
from .config import get_settings
from .db import (Game, JarvisBriefing, LiveFollow, LiveGame, LiveMilestone, LivePlay, LivePlayerBox, PaperSettlement,
                 PaperTicket, Player, Prediction, Team, session_scope, utcnow)
from .security import Principal, audit, client_ip, current_user, require_owner

cfg = get_settings()
POLL_NOTE = ("Scores are read from a public feed by our server about every {s} seconds while games are in progress. "
             "They are delayed observations, not a real-time feed.")
_streams = {"n": 0}


def _fresh(lg: LiveGame | None, now) -> dict:
    if lg is None:
        return {"observed_at": None, "provider_updated_at": None, "age_s": None, "stale": False, "feed": "not_started"}
    age = (now - lg.observed_at).total_seconds()
    stale = lg.status in L.IN_PLAY and age > cfg.live_stale_seconds
    return {"observed_at": lg.observed_at, "provider_updated_at": lg.provider_updated_at, "age_s": round(age),
            "stale": stale, "feed": "stale" if stale else "ok"}


def _game_row(g: Game, lg: LiveGame | None, teams: dict, now, followed: set) -> dict:
    status = lg.status if lg else ("final" if g.status == "final" else "postponed" if g.status == "postponed" else "scheduled")
    final_from_schedule = lg is None and g.status == "final"

    def side(tid, score, key):
        t = teams[tid]
        return {"team_id": tid, "abbr": t.abbr, "name": t.name, "score": score,
                "linescores": (lg.linescores or {}).get(key, []) if lg else []}
    return {"game_id": g.id, "label": f"{teams[g.away_team_id].abbr} @ {teams[g.home_team_id].abbr}", "game_date": g.game_date,
            "tipoff_utc": g.tipoff_utc, "venue": g.venue, "status": status, "status_label": L.STATUS_LABEL.get(status, status),
            "period": lg.period if lg else 0, "period_label": L.period_label(lg.period, status) if lg else "",
            "clock": lg.clock if lg else None,
            "home": side(g.home_team_id, lg.home_score if lg else (g.home_points if final_from_schedule else None), "home"),
            "away": side(g.away_team_id, lg.away_score if lg else (g.away_points if final_from_schedule else None), "away"),
            "version": lg.version if lg else 0, "followed": g.id in followed, **_fresh(lg, now)}


def _followed(s, owner: str, kind: str) -> set:
    return set(s.scalars(select(LiveFollow.ref_id).where(LiveFollow.owner == owner, LiveFollow.kind == kind)))


@api.get("/live/scoreboard")
def live_scoreboard(date: str | None = None, p: Principal = Depends(current_user)):
    d = _date(date) if date else L.today_et()
    now = utcnow()
    with session_scope() as s:
        teams = {t.id: t for t in s.scalars(select(Team))}
        games = list(s.scalars(select(Game).where(Game.game_date == d).order_by(Game.tipoff_utc, Game.id)))
        carried = []
        if not date:    # a late game still in progress after midnight ET stays on today's board until it ends
            late = list(s.scalars(select(LiveGame.game_id).where(LiveGame.game_date == d - timedelta(days=1), LiveGame.status.in_(L.IN_PLAY))))
            carried = list(s.scalars(select(Game).where(Game.id.in_(late or ["-"])).order_by(Game.tipoff_utc)))
            games = carried + games
        lgs = {x.game_id: x for x in s.scalars(select(LiveGame).where(LiveGame.game_id.in_([g.id for g in games] or ["-"])))}
        fg, ft = _followed(s, p.email, "game"), {int(x) for x in _followed(s, p.email, "team") if x.isdigit()}
        rows = [_game_row(g, lgs.get(g.id), teams, now, fg) for g in games]
        for r in rows:
            r["favorite_team"] = r["home"]["team_id"] in ft or r["away"]["team_id"] in ft
            r["carried_over"] = r["game_id"] in {g.id for g in carried}
        order = {"live": 0, "overtime": 0, "end_period": 0, "halftime": 1, "delayed": 2, "scheduled": 3, "final": 4}
        rows.sort(key=lambda r: (not (r["followed"] or r["favorite_team"]), order.get(r["status"], 5), str(r["tipoff_utc"])))
        return {"date": d, "prev": d - timedelta(days=1), "next": d + timedelta(days=1), "today": L.today_et(), "games": rows,
                "live_count": sum(r["status"] in L.IN_PLAY for r in rows), "server_time": now,
                "poll_note": POLL_NOTE.format(s=cfg.live_poll_seconds)}


@api.get("/live/games")
def live_games(date: str | None = None, p: Principal = Depends(current_user)):
    return live_scoreboard(date, p)


def _load(s, game_id: str):
    g = s.get(Game, game_id[:12])
    if g is None:
        raise ApiError(404, "not_found", "Game not found.")
    return g, s.get(LiveGame, g.id)


def _box_rows(s, g: Game, lg: LiveGame | None) -> list[dict]:
    rows = list(s.scalars(select(LivePlayerBox).where(LivePlayerBox.game_id == g.id)))
    pids = [b.player_id for b in rows if b.player_id]
    proj: dict[tuple, Prediction] = {}
    if pids:
        ek = s.scalar(select(Prediction.edition_key).where(Prediction.game_id == g.id, Prediction.created_at <= (g.tipoff_utc or utcnow()))
                      .order_by(Prediction.id.desc()).limit(1))
        if ek:   # the last forecast published before tipoff; shown beside what happened, never changed
            for pr in s.scalars(select(Prediction).where(Prediction.game_id == g.id, Prediction.edition_key == ek,
                                                         Prediction.subject_type == "player", Prediction.subject_id.in_(pids))):
                proj[(pr.subject_id, pr.stat)] = pr
    heads = {p.id: p.headshot_url for p in s.scalars(select(Player).where(Player.id.in_(pids)))} if pids else {}
    out = []
    for b in rows:
        d = {k: getattr(b, k) for k in ("espn_athlete_id", "player_id", "team_id", "name", "position", "jersey", "starter", "dnp",
                                        "ejected", "on_court", "minutes", *L.STAT_KEYS, "plus_minus")}
        if lg is None or lg.status not in L.IN_PLAY:
            d["on_court"] = None
        d["pra"], d["pr"], d["pa"], d["ra"] = (L.combo(d, k) for k in ("pra", "pr", "pa", "ra"))
        d["fg_pct"] = round(100 * b.fgm / b.fga, 1) if b.fga else None
        d["fg3_pct"] = round(100 * b.fg3m / b.fg3a, 1) if b.fg3a else None
        d["ft_pct"] = round(100 * b.ftm / b.fta, 1) if b.fta else None
        ts_den = 2 * ((b.fga or 0) + 0.44 * (b.fta or 0))
        d["true_shooting_pct"] = round(100 * b.pts / ts_den, 1) if ts_den and b.pts is not None else None
        d["foul_trouble"] = None if b.pf is None or lg is None else bool(b.pf >= 5 or (lg.period <= 2 and b.pf >= 3) or (lg.period == 3 and b.pf >= 4))
        d["role"] = None if b.starter is None else ("starter" if b.starter else "bench")
        d["headshot_url"] = heads.get(b.player_id)
        pm = proj.get((b.player_id, "pts"))
        d["pregame"] = None if b.player_id is None or pm is None else {
            "proj_min": round(pm.features.get("proj_min"), 1) if pm.features.get("proj_min") else None,
            **{st: round(proj[(b.player_id, st)].mean, 1) for st in ("pts", "reb", "ast", "fg3m") if (b.player_id, st) in proj},
            "published_at": pm.created_at}
        out.append(d)
    return out


def _plays(s, game_id: str, g: Game) -> list[dict]:
    side = {g.home_team_id: "home", g.away_team_id: "away"}
    return [{"event_id": p.event_id, "sequence": p.sequence, "period": p.period, "clock": p.clock, "elapsed_s": p.elapsed_s,
             "team_id": p.team_id, "team_side": side.get(p.team_id), "kind": p.kind, "type_text": p.type_text, "text": p.text,
             "scoring": p.scoring, "score_value": p.score_value, "home_score": p.home_score, "away_score": p.away_score,
             "athlete_ids": p.athlete_ids, "player_ids": p.player_ids, "provider_at": p.provider_at, "ingested_at": p.ingested_at,
             "corrected": p.revision > 0}
            for p in s.scalars(select(LivePlay).where(LivePlay.game_id == game_id).order_by(LivePlay.sequence))]


def _leaders(rows: list[dict], team_id: int) -> dict:
    out = {}
    for st in ("pts", "reb", "ast"):
        best = max((r for r in rows if r["team_id"] == team_id and r[st] is not None), key=lambda r: r[st], default=None)
        out[st] = None if best is None else {"player_id": best["player_id"], "name": best["name"], "value": best[st]}
    return out


@api.get("/live/games/{game_id}")
def live_game(game_id: str, p: Principal = Depends(current_user)):
    now = utcnow()
    with session_scope() as s:
        g, lg = _load(s, game_id)
        teams = {t.id: t for t in s.scalars(select(Team).where(Team.id.in_([g.home_team_id, g.away_team_id])))}
        row = _game_row(g, lg, teams, now, _followed(s, p.email, "game"))
        box = _box_rows(s, g, lg) if lg else []
        plays = _plays(s, g.id, g) if lg else []
        mo = L.momentum(plays)
        summaries = [{"kind": b.kind.replace("live_", ""), "text": b.text, "created_at": b.created_at}
                     for b in s.scalars(select(JarvisBriefing).where(JarvisBriefing.game_date == g.game_date, JarvisBriefing.kind.like("live_%"))
                                        .order_by(JarvisBriefing.id)) if (b.facts or {}).get("game_id") == g.id]
        mode = "pregame" if row["status"] == "scheduled" else "final" if row["status"] == "final" else "live" if row["status"] in L.IN_PLAY else row["status"]
        return {**row, "mode": mode, "team_stats": (lg.team_stats if lg else {}) or {},
                "leaders": {"home": _leaders(box, g.home_team_id), "away": _leaders(box, g.away_team_id)},
                "momentum": {k: v for k, v in mo.items() if k != "points"} | {"points": len(mo["points"])},
                "last_plays": plays[-8:][::-1], "plays_count": len(plays), "summaries": summaries,
                "poll_note": POLL_NOTE.format(s=cfg.live_poll_seconds),
                "notes": ["Pregame research for this game is unchanged by anything observed during it.",
                          "A value the source has not published is shown as missing, not as zero."]}


@api.get("/live/games/{game_id}/boxscore")
def live_boxscore(game_id: str, sort: str = "minutes", order: Literal["asc", "desc"] = "desc"):
    now = utcnow()
    with session_scope() as s:
        g, lg = _load(s, game_id)
        teams = {t.id: t for t in s.scalars(select(Team).where(Team.id.in_([g.home_team_id, g.away_team_id])))}
        rows = _box_rows(s, g, lg) if lg else []
        if rows and sort not in rows[0]:
            raise ApiError(422, "invalid_request", "unknown sort column")

        def key(r):
            v = r.get(sort)
            return (v is None, v if order == "asc" or isinstance(v, str) else -(v or 0)) if not isinstance(v, bool) else (False, -int(v))

        def team(tid):
            mine = sorted((r for r in rows if r["team_id"] == tid), key=key)
            tot = {k: sum(r[k] or 0 for r in mine) if any(r[k] is not None for r in mine) else None for k in L.STAT_KEYS}
            return {"team_id": tid, "abbr": teams[tid].abbr, "name": teams[tid].name, "players": mine, "totals": tot}
        return {"game_id": g.id, "status": lg.status if lg else "scheduled", "period": lg.period if lg else 0,
                "home": team(g.home_team_id), "away": team(g.away_team_id), "available": bool(rows), **_fresh(lg, now),
                "notes": ["Live usage rate is not published by the source and is not estimated.",
                          "On-court status is derived from the starting five and substitution events; when that chain is "
                          "incomplete it is shown as unknown.",
                          "Pregame values are the last forecast published before tipoff, shown for comparison only."]}


@api.get("/live/games/{game_id}/play-by-play")
def live_plays(game_id: str, filter: Literal["all", "scoring", "fouls", "substitutions"] = "all", team_id: int | None = None,
               player_id: int | None = None, after_sequence: int | None = None, order: Literal["asc", "desc"] = "desc",
               limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    with session_scope() as s:
        g, lg = _load(s, game_id)
        rows = _plays(s, g.id, g) if lg else []
        if filter == "scoring":
            rows = [r for r in rows if r["scoring"]]
        elif filter == "fouls":
            rows = [r for r in rows if r["kind"] == "foul"]
        elif filter == "substitutions":
            rows = [r for r in rows if r["kind"] == "substitution"]
        if team_id:
            rows = [r for r in rows if r["team_id"] == team_id]
        if player_id:
            rows = [r for r in rows if player_id in (r["player_ids"] or [])]
        if after_sequence is not None:
            rows = [r for r in rows if r["sequence"] > after_sequence]
        if order == "desc":
            rows = rows[::-1]
        return {"game_id": g.id, "total": len(rows), "items": rows[offset:offset + limit], **_fresh(lg, utcnow()),
                "note": "Event wording is the source's own. No commentary is generated."}


@api.get("/live/games/{game_id}/rotations")
def live_rotations(game_id: str):
    with session_scope() as s:
        g, lg = _load(s, game_id)
        teams = {t.id: t for t in s.scalars(select(Team).where(Team.id.in_([g.home_team_id, g.away_team_id])))}
        box = _box_rows(s, g, lg) if lg else []
        rot = L.rotations(box, _plays(s, g.id, g)) if box else {}
        elapsed = s.scalar(select(func.max(LivePlay.elapsed_s)).where(LivePlay.game_id == g.id)) or 0
        by_id = {r["espn_athlete_id"]: r for r in box}

        def team(tid):
            t = rot.get(tid) or {"determinable": False, "problems": [], "players": [], "note": "No box score has been observed yet."}
            players = []
            for r in t["players"]:
                b = by_id.get(r["espn_athlete_id"], {})
                pre = (b.get("pregame") or {}).get("proj_min")
                players.append({**r, "role": b.get("role"), "proj_min": pre, "foul_trouble": b.get("foul_trouble"),
                                "minutes_vs_projection": None if pre is None or r["minutes"] is None else round(r["minutes"] - pre, 1)})
            players.sort(key=lambda r: -(r["minutes"] or 0))
            return {"team_id": tid, "abbr": teams[tid].abbr, **{k: t[k] for k in ("determinable", "problems", "note")}, "players": players}
        return {"game_id": g.id, "status": lg.status if lg else "scheduled", "period": lg.period if lg else 0, "elapsed_s": elapsed,
                "home": team(g.home_team_id), "away": team(g.away_team_id), **_fresh(lg, utcnow()),
                "notes": ["Projected minutes are the pregame projection, kept as published.",
                          "During a game, minutes below the projection are expected: the comparison is meaningful once it is final."]}


@api.get("/live/games/{game_id}/team-stats")
def live_team_stats(game_id: str):
    with session_scope() as s:
        g, lg = _load(s, game_id)
        teams = {t.id: t for t in s.scalars(select(Team).where(Team.id.in_([g.home_team_id, g.away_team_id])))}
        ts = (lg.team_stats if lg else {}) or {}
        rows = [("Field goals", "fieldGoalsMade-fieldGoalsAttempted"), ("Field goal %", "fieldGoalPct"),
                ("Three-pointers", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"), ("Three-point %", "threePointFieldGoalPct"),
                ("Free throws", "freeThrowsMade-freeThrowsAttempted"), ("Free throw %", "freeThrowPct"), ("Rebounds", "totalRebounds"),
                ("Offensive rebounds", "offensiveRebounds"), ("Defensive rebounds", "defensiveRebounds"), ("Assists", "assists"),
                ("Steals", "steals"), ("Blocks", "blocks"), ("Turnovers", "totalTurnovers"), ("Fouls", "fouls"),
                ("Points in the paint", "pointsInPaint"), ("Fast-break points", "fastBreakPoints"), ("Points off turnovers", "turnoverPoints"),
                ("Largest lead", "largestLead")]

        def num(v):
            try:
                return float(str(v).split("-")[0])
            except (TypeError, ValueError):
                return None
        items = [{"key": k, "label": lab, "home": (ts.get("home") or {}).get(k), "away": (ts.get("away") or {}).get(k),
                  "home_value": num((ts.get("home") or {}).get(k)), "away_value": num((ts.get("away") or {}).get(k))}
                 for lab, k in rows if k in (ts.get("home") or {}) or k in (ts.get("away") or {})]
        return {"game_id": g.id, "home": {"team_id": g.home_team_id, "abbr": teams[g.home_team_id].abbr},
                "away": {"team_id": g.away_team_id, "abbr": teams[g.away_team_id].abbr}, "items": items, "available": bool(items),
                "not_published": ["Bench points"] if items else [], **_fresh(lg, utcnow())}


@api.get("/live/games/{game_id}/momentum")
def live_momentum(game_id: str):
    with session_scope() as s:
        g, lg = _load(s, game_id)
        mo = L.momentum(_plays(s, g.id, g)) if lg else L.momentum([])
        return {"game_id": g.id, "period": lg.period if lg else 0, **mo, **_fresh(lg, utcnow())}


@api.get("/live/games/{game_id}/stream")
def live_stream(game_id: str, p: Principal = Depends(current_user)):
    """Server-sent events: the game row is sent whenever its version changes (checked every 3 seconds), with a
    keep-alive comment between. The stream closes itself after five minutes; the client reconnects."""
    with session_scope() as s:
        g, _ = _load(s, game_id)
        gid = g.id
    if _streams["n"] >= 12:
        raise ApiError(429, "rate_limited", "Too many live streams are open.")

    def gen():
        _streams["n"] += 1
        try:
            last, t0, quiet = -1, time.monotonic(), 0
            while time.monotonic() - t0 < 300:
                now = utcnow()
                with session_scope() as s:
                    g2, lg = s.get(Game, gid), s.get(LiveGame, gid)
                    teams = {t.id: t for t in s.scalars(select(Team).where(Team.id.in_([g2.home_team_id, g2.away_team_id])))}
                    row = _game_row(g2, lg, teams, now, set())
                if row["version"] != last or quiet >= 5:        # also resend every ~15 s so staleness reaches the client
                    last, quiet = row["version"], 0
                    yield f"data: {json.dumps(row, default=lambda o: o.isoformat() if hasattr(o, 'isoformat') else str(o))}\n\n"
                else:
                    quiet += 1
                    yield ": keep-alive\n\n"
                time.sleep(3)
            yield 'event: end\ndata: {"reason":"reconnect"}\n\n'
        finally:
            _streams["n"] -= 1
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


def _live_line(s, player_id: int, d: date_cls) -> dict | None:
    b = s.scalar(select(LivePlayerBox).join(LiveGame, LiveGame.game_id == LivePlayerBox.game_id)
                 .where(LivePlayerBox.player_id == player_id, LiveGame.game_date == d))
    if b is None:
        return None
    g, lg = s.get(Game, b.game_id), s.get(LiveGame, b.game_id)
    row = next((r for r in _box_rows(s, g, lg) if r["player_id"] == player_id), None)
    teams = {t.id: t.abbr for t in s.scalars(select(Team).where(Team.id.in_([g.home_team_id, g.away_team_id])))}
    return {"game_id": g.id, "label": f"{teams[g.away_team_id]} @ {teams[g.home_team_id]}", "status": lg.status,
            "status_label": L.STATUS_LABEL.get(lg.status), "period": lg.period, "period_label": L.period_label(lg.period, lg.status),
            "clock": lg.clock, "line": row, **_fresh(lg, utcnow())}


def _milestone(m: LiveMilestone, line: dict | None) -> dict:
    cur = L.combo(line["line"], m.stat) if line and line.get("line") else None
    return {"id": m.id, "player_id": m.player_id, "stat": m.stat, "threshold": m.threshold, "game_date": m.game_date, "notify": m.notify,
            "current": cur, "remaining": None if cur is None else max(0.0, round(m.threshold - cur, 1)),
            "reached": m.reached_at is not None, "reached_at": m.reached_at, "reached_value": m.reached_value,
            "game_status": line["status"] if line else None, "observed_at": line["observed_at"] if line else None,
            "note": "Recorded progress toward a tracking threshold. It says nothing about the final result."}


@api.get("/live/players/{player_id}")
def live_player(player_id: int, date: str | None = None, p: Principal = Depends(current_user)):
    d = _date(date) if date else L.today_et()
    with session_scope() as s:
        pl = s.get(Player, player_id)
        if pl is None:
            raise ApiError(404, "not_found", "Player not found.")
        line = _live_line(s, player_id, d)
        ms = [_milestone(m, line) for m in s.scalars(select(LiveMilestone).where(
            LiveMilestone.owner == p.email, LiveMilestone.player_id == player_id, LiveMilestone.game_date == d, LiveMilestone.deleted_at.is_(None)))]
        return {"player_id": pl.id, "name": pl.name, "headshot_url": pl.headshot_url, "date": d, "live": line, "milestones": ms,
                "followed": str(pl.id) in _followed(s, p.email, "player")}


class FollowBody(BaseModel):
    kind: Literal["game", "player", "team"]
    ref_id: str = Field(min_length=1, max_length=24)


def _check_ref(s, kind: str, ref: str):
    ok = (kind == "game" and s.get(Game, ref) is not None) or (kind in ("player", "team") and ref.isdigit() and s.get(
        Player if kind == "player" else Team, int(ref)) is not None)
    if not ok:
        raise ApiError(404, "not_found", f"Unknown {kind}.")


@api.get("/live/watchlist")
def live_watchlist(date: str | None = None, p: Principal = Depends(current_user)):
    d = _date(date) if date else L.today_et()
    now = utcnow()
    with session_scope() as s:
        teams = {t.id: t for t in s.scalars(select(Team))}
        fol = list(s.scalars(select(LiveFollow).where(LiveFollow.owner == p.email).order_by(LiveFollow.id)))
        gids = [f.ref_id for f in fol if f.kind == "game"]
        games = [_game_row(g, s.get(LiveGame, g.id), teams, now, set(gids)) for g in s.scalars(select(Game).where(Game.id.in_(gids or ["-"])).order_by(Game.game_date.desc(), Game.tipoff_utc))]
        players = []
        for f in fol:
            if f.kind != "player":
                continue
            pl = s.get(Player, int(f.ref_id))
            if pl is None:
                continue
            line = _live_line(s, pl.id, d)
            ms = [_milestone(m, line) for m in s.scalars(select(LiveMilestone).where(
                LiveMilestone.owner == p.email, LiveMilestone.player_id == pl.id, LiveMilestone.game_date == d, LiveMilestone.deleted_at.is_(None)))]
            players.append({"player_id": pl.id, "name": pl.name, "team_abbr": teams[pl.team_id].abbr if pl.team_id in teams else None,
                            "headshot_url": pl.headshot_url, "live": line, "milestones": ms})
        fav = [{"team_id": int(f.ref_id), "abbr": teams[int(f.ref_id)].abbr, "name": teams[int(f.ref_id)].name}
               for f in fol if f.kind == "team" and f.ref_id.isdigit() and int(f.ref_id) in teams]
        return {"date": d, "games": games, "players": players, "teams": fav,
                "counts": {"games": len(gids), "players": len(players), "teams": len(fav)}}


@api.post("/live/watchlist/follow")
def live_follow(body: FollowBody, p: Principal = Depends(require_owner)):
    with session_scope() as s:
        _check_ref(s, body.kind, body.ref_id)
        if s.scalar(select(LiveFollow.id).where(LiveFollow.owner == p.email, LiveFollow.kind == body.kind, LiveFollow.ref_id == body.ref_id)) is None:
            s.add(LiveFollow(owner=p.email, kind=body.kind, ref_id=body.ref_id))
    return {"following": True, **body.model_dump()}


@api.post("/live/watchlist/unfollow")
def live_unfollow(body: FollowBody, p: Principal = Depends(require_owner)):
    with session_scope() as s:
        for f in s.scalars(select(LiveFollow).where(LiveFollow.owner == p.email, LiveFollow.kind == body.kind, LiveFollow.ref_id == body.ref_id)):
            s.delete(f)
    return {"following": False, **body.model_dump()}


class MilestoneBody(BaseModel):
    player_id: int = Field(ge=1)
    stat: Literal["pts", "reb", "ast", "fg3m", "stl", "blk", "min", "pra", "pr", "pa", "ra", "double_double"]
    threshold: float = Field(gt=0, le=200)
    date: str | None = Field(None, max_length=10)
    notify: bool = True


@api.get("/live/milestones")
def live_milestones(date: str | None = None, p: Principal = Depends(current_user)):
    d = _date(date) if date else L.today_et()
    with session_scope() as s:
        out = []
        for m in s.scalars(select(LiveMilestone).where(LiveMilestone.owner == p.email, LiveMilestone.game_date == d,
                                                       LiveMilestone.deleted_at.is_(None)).order_by(LiveMilestone.id)):
            pl = s.get(Player, m.player_id)
            out.append({**_milestone(m, _live_line(s, m.player_id, d)), "player_name": pl.name if pl else None})
        return {"date": d, "items": out, "stats": list(L.MILESTONE_STATS)}


@api.post("/live/milestones")
def live_milestone_create(body: MilestoneBody, request: Request, p: Principal = Depends(require_owner)):
    d = _date(body.date) if body.date else L.today_et()
    with session_scope() as s:
        if s.get(Player, body.player_id) is None:
            raise ApiError(404, "not_found", "Player not found.")
        if s.scalar(select(func.count()).select_from(LiveMilestone).where(LiveMilestone.owner == p.email, LiveMilestone.game_date == d,
                                                                          LiveMilestone.deleted_at.is_(None))) >= 60:
            raise ApiError(422, "invalid_request", "At most 60 tracking thresholds per day.")
        m = LiveMilestone(owner=p.email, player_id=body.player_id, stat=body.stat,
                          threshold=1.0 if body.stat == "double_double" else body.threshold, game_date=d, notify=body.notify)
        s.add(m)
        s.flush()
        out = _milestone(m, _live_line(s, m.player_id, d))
    audit(p.email, "live.milestone.create", {"id": out["id"]}, client_ip(request))
    return out


@api.post("/live/milestones/{milestone_id}/delete")
def live_milestone_delete(milestone_id: int, p: Principal = Depends(require_owner)):
    with session_scope() as s:
        m = s.get(LiveMilestone, milestone_id)
        if m is None or m.owner != p.email or m.deleted_at is not None:
            raise ApiError(404, "not_found", "Tracking threshold not found.")
        m.deleted_at = utcnow()
    return {"deleted": True}


STAT_OF_MARKET = {"player_pts": "pts", "player_reb": "reb", "player_ast": "ast", "player_fg3m": "fg3m", "player_stl": "stl",
                  "player_blk": "blk", "player_tov": "tov", "player_pra": "pra", "player_pr": "pr", "player_pa": "pa", "player_ra": "ra"}


@api.get("/live/research-tracker")
def live_research_tracker(date: str | None = None, limit: int = Query(60, ge=1, le=200)):
    """Paper tickets for a date with each leg's observed statistic beside its threshold. Observation only: a leg
    is never called won or lost here. Settlement is a separate verified step after the final box score."""
    d = _date(date) if date else L.today_et()
    now = utcnow()
    with session_scope() as s:
        tickets = list(s.scalars(select(PaperTicket).where(PaperTicket.game_date == d).order_by(PaperTicket.id.desc()).limit(limit)))
        settled = {}
        for st in s.scalars(select(PaperSettlement).where(PaperSettlement.ticket_id.in_([t.id for t in tickets] or [0])).order_by(PaperSettlement.id)):
            settled[st.ticket_id] = st          # the latest row per ticket is current
        lgs = {x.game_id: x for x in s.scalars(select(LiveGame).where(LiveGame.game_date == d))}
        boxes: dict[tuple, LivePlayerBox] = {}
        for b in s.scalars(select(LivePlayerBox).where(LivePlayerBox.game_id.in_(list(lgs) or ["-"]))):
            if b.player_id:
                boxes[(b.game_id, b.player_id)] = b
        items = []
        for t in tickets:
            legs = []
            for leg in t.legs or []:
                lg = lgs.get(leg.get("game_id"))
                stat = STAT_OF_MARKET.get(leg.get("market"))
                b = boxes.get((leg.get("game_id"), leg.get("subject_id")))
                cur = L.combo({k: getattr(b, k) for k in ("minutes", *L.STAT_KEYS)}, stat) if b is not None and stat else None
                if stat is None and lg is not None and lg.home_score is not None:
                    total, margin = lg.home_score + lg.away_score, lg.home_score - lg.away_score
                    cur = total if leg.get("market") == "total" else margin if leg.get("market") in ("spread", "moneyline") else None
                status = lg.status if lg else "scheduled"
                legs.append({"label": leg.get("label"), "market": leg.get("market"), "side": leg.get("side"), "line": leg.get("line"),
                             "game_id": leg.get("game_id"), "game_label": leg.get("game_label"), "subject_id": leg.get("subject_id"),
                             "current": cur, "current_basis": "live box score" if stat else "home margin / total points" if cur is not None else None,
                             "difference_to_line": None if cur is None or leg.get("line") is None else round(cur - leg["line"], 1),
                             "game_status": status, "status_label": L.STATUS_LABEL.get(status, status),
                             "period_label": L.period_label(lg.period, status) if lg else "", "clock": lg.clock if lg else None,
                             "observation": ("not_started" if status == "scheduled" else "in_progress" if status in L.IN_PLAY
                                             else "final_awaiting_settlement" if status == "final" else status),
                             **{k: v for k, v in _fresh(lg, now).items() if k in ("observed_at", "stale")}})
            st = settled.get(t.id)
            items.append({"ticket_id": t.id, "kind": t.kind, "engine": t.engine, "structure": t.structure, "classification": t.classification,
                          "created_at": t.created_at, "legs": legs,
                          "settlement": None if st is None else {"result": st.result, "settled_at": st.settled_at, "reason": st.reason},
                          "status": "settled" if st is not None else "pending"})
        return {"date": d, "items": items, "total": len(items),
                "notes": ["Current values are observations during the game. A ticket is settled only after the final box score is "
                          "verified against the contract rules, by the settlement job.",
                          "Paper testing only. Nothing here is a wagering recommendation."]}
