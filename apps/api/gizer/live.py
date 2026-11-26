"""GIZER LIVE: server-side ingestion of observed game state (scoreboard, box score, play-by-play).

One process polls the provider; browsers and JARVIS read our database. Everything stored here is an observation
with its timestamps. Nothing here writes to research tables, and nothing is invented: a value the source did not
publish stays null, an on-court status that cannot be derived stays unknown, and a feed that stops is shown as stale.

This module deliberately avoids the modelling stack so the live process stays small.
"""
from __future__ import annotations

import hashlib
import json
import socket
import time
from datetime import date, datetime, timedelta

from sqlalchemy import select, text

from .config import ET, get_settings
from .db import (Game, JarvisBriefing, LiveGame, LiveMilestone, LivePlay, LivePlayerBox, Player, Team, session_scope,
                 utcnow)
from .providers import ESPN_ABBR_TO_ID, EspnProvider, ProviderError, name_key

IN_PLAY = ("live", "halftime", "end_period", "overtime")
STATUS_LABEL = {"scheduled": "Scheduled", "live": "Live", "halftime": "Halftime", "end_period": "End of quarter",
                "overtime": "Overtime", "final": "Final", "delayed": "Delayed", "postponed": "Postponed",
                "suspended": "Suspended", "cancelled": "Cancelled"}
STAT_KEYS = ("pts", "reb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb")
MILESTONE_STATS = ("pts", "reb", "ast", "fg3m", "stl", "blk", "min", "pra", "pr", "pa", "ra", "double_double")


def today_et(now: datetime | None = None) -> date:
    return (now or utcnow()).astimezone(ET).date()


# ------------------------------------------------------------------ parsing (pure functions; unit-tested on real payloads)
def map_status(st: dict, period: int) -> str:
    """Our status from the provider's. A game is only 'live' when the provider says it is in progress."""
    t = st.get("type") or {}
    name, state = (t.get("name") or "").upper(), t.get("state")
    if "POSTPONED" in name:
        return "postponed"
    if "CANCEL" in name:
        return "cancelled"
    if "SUSPEND" in name:
        return "suspended"
    if "DELAY" in name:
        return "delayed"
    if t.get("completed") or state == "post" or "FINAL" in name:
        return "final"
    if "HALFTIME" in name:
        return "halftime"
    if "END_PERIOD" in name or "END_OF_PERIOD" in name:
        return "end_period"
    if state == "in":
        return "overtime" if period > 4 else "live"
    return "scheduled"


def period_label(period: int, status: str) -> str:
    if status == "scheduled" or not period:
        return ""
    if period <= 4:
        return f"Q{period}"
    return "OT" if period == 5 else f"{period - 4}OT"


def clock_seconds(clock: str | None) -> float | None:
    if not clock:
        return None
    try:
        if ":" in clock:
            m, s = clock.split(":")
            return int(m) * 60 + float(s)
        return float(clock)
    except ValueError:
        return None


def elapsed_seconds(period: int, clock: str | None) -> float | None:
    """Game seconds elapsed at (period, clock): quarters are 12 minutes, overtime periods 5."""
    rem = clock_seconds(clock)
    if not period or rem is None:
        return None
    length = 720 if period <= 4 else 300
    before = 720 * min(period - 1, 4) + 300 * max(period - 5, 0)
    return before + max(0.0, length - rem)


def play_kind(type_text: str, text_: str, scoring: bool) -> str:
    t, x = (type_text or "").lower(), (text_ or "").lower()
    if "substitution" in t:
        return "substitution"
    if "free throw" in t:
        return "free_throw"
    if "rebound" in t:
        return "rebound"
    if "turnover" in t or "traveling" in t or "violation" in t and "turnover" in x:
        return "turnover"
    if "foul" in t or "charge" in t:
        return "foul"
    if "timeout" in t:
        return "timeout"
    if "end period" in t or "end game" in t or "end of" in t or "start period" in t:
        return "period"
    if "review" in t or "challenge" in t:
        return "review"
    if "jumpball" in t or "jump ball" in t:
        return "jumpball"
    if scoring:
        return "made"
    if " misses " in f" {x} " or "blocks" in x and "shot" in t:
        return "missed"
    if " makes " in f" {x} ":
        return "made"
    return "other"


def _int(v):
    try:
        return int(str(v).replace("+", ""))
    except (TypeError, ValueError):
        return None


def _pair(v):
    try:
        a, b = str(v).split("-")
        return int(a), int(b)
    except (TypeError, ValueError):
        return None, None


def parse_scoreboard(data: dict) -> list[dict]:
    out = []
    for ev in data.get("events") or []:
        try:
            comp = ev["competitions"][0]
            if (ev.get("season") or {}).get("type") not in (2, 3, None):
                continue
            sides = {c["homeAway"]: c for c in comp["competitors"]}
            h = ESPN_ABBR_TO_ID.get(sides["home"]["team"]["abbreviation"])
            a = ESPN_ABBR_TO_ID.get(sides["away"]["team"]["abbreviation"])
            if not h or not a:
                continue
            st = comp["status"]
            period = int(st.get("period") or 0)
            status = map_status(st, period)
            started = status != "scheduled" and status not in ("postponed", "cancelled")

            def lines(c):
                return [_int(x.get("displayValue") if isinstance(x, dict) else x) for x in (c.get("linescores") or [])]
            out.append({"espn_event_id": str(ev["id"]), "home_team_id": h, "away_team_id": a, "status": status,
                        "provider_status": ((st.get("type") or {}).get("name") or "")[:40], "period": period,
                        "clock": st.get("displayClock") if status in ("live", "overtime") else None,
                        "home_score": _int(sides["home"].get("score")) if started else None,
                        "away_score": _int(sides["away"].get("score")) if started else None,
                        "linescores": {"home": lines(sides["home"]), "away": lines(sides["away"])} if started else {},
                        "tipoff_utc": datetime.fromisoformat(ev["date"].replace("Z", "+00:00"))})
        except (KeyError, TypeError, ValueError, IndexError):
            continue        # one malformed event never blocks the others
    return out


def parse_summary(data: dict) -> dict:
    """Box score, team statistics and plays from a game summary payload. Missing sections come back empty."""
    comp = ((data.get("header") or {}).get("competitions") or [{}])[0]
    side_of = {str(c.get("id")): c.get("homeAway") for c in comp.get("competitors") or []}
    abbr_of = {str(c.get("id")): ((c.get("team") or {}).get("abbreviation")) for c in comp.get("competitors") or []}
    box = data.get("boxscore") or {}
    team_stats: dict = {}
    for t in box.get("teams") or []:
        side = side_of.get(str((t.get("team") or {}).get("id")))
        if side:
            team_stats[side] = {s.get("name"): s.get("displayValue") for s in t.get("statistics") or [] if s.get("name")}
    players = []
    for t in box.get("players") or []:
        tid_espn = str((t.get("team") or {}).get("id"))
        team_id = ESPN_ABBR_TO_ID.get((t.get("team") or {}).get("abbreviation") or abbr_of.get(tid_espn))
        for block in t.get("statistics") or []:
            labels = block.get("labels") or []
            for a in block.get("athletes") or []:
                ath = a.get("athlete") or {}
                vals = dict(zip(labels, a.get("stats") or []))
                fgm, fga = _pair(vals.get("FG"))
                f3m, f3a = _pair(vals.get("3PT"))
                ftm, fta = _pair(vals.get("FT"))
                mins = vals.get("MIN")
                try:
                    minutes = float(mins) if mins not in (None, "", "--") else None
                except ValueError:
                    minutes = clock_seconds(mins) / 60 if clock_seconds(mins) is not None else None
                players.append({"espn_athlete_id": str(ath.get("id")), "name": ath.get("displayName") or "", "team_id": team_id,
                                "position": ((ath.get("position") or {}).get("abbreviation") or None), "jersey": ath.get("jersey"),
                                "starter": a.get("starter"), "dnp": bool(a.get("didNotPlay")), "ejected": bool(a.get("ejected")),
                                "minutes": minutes, "pts": _int(vals.get("PTS")), "reb": _int(vals.get("REB")),
                                "ast": _int(vals.get("AST")), "stl": _int(vals.get("STL")), "blk": _int(vals.get("BLK")),
                                "tov": _int(vals.get("TO")), "pf": _int(vals.get("PF")), "fgm": fgm, "fga": fga, "fg3m": f3m,
                                "fg3a": f3a, "ftm": ftm, "fta": fta, "oreb": _int(vals.get("OREB")), "dreb": _int(vals.get("DREB")),
                                "plus_minus": _int(vals.get("+/-"))})
    team_by_espn = {k: ESPN_ABBR_TO_ID.get(v) for k, v in abbr_of.items()}
    plays = []
    for p in data.get("plays") or []:
        try:
            period = int((p.get("period") or {}).get("number") or 0)
            clock = (p.get("clock") or {}).get("displayValue")
            ttext = ((p.get("type") or {}).get("text") or "").replace("\n", " ")[:64]
            wc = p.get("wallclock")
            plays.append({"event_id": str(p["id"]), "sequence": int(p.get("sequenceNumber") or 0), "period": period, "clock": clock,
                          "elapsed_s": elapsed_seconds(period, clock), "team_id": team_by_espn.get(str((p.get("team") or {}).get("id"))),
                          "type_text": ttext, "text": (p.get("text") or "").strip(), "scoring": bool(p.get("scoringPlay")),
                          "score_value": int(p.get("scoreValue") or 0), "home_score": _int(p.get("homeScore")),
                          "away_score": _int(p.get("awayScore")),
                          "athlete_ids": [str((x.get("athlete") or {}).get("id")) for x in p.get("participants") or []
                                          if (x.get("athlete") or {}).get("id")],
                          "provider_at": datetime.fromisoformat(wc.replace("Z", "+00:00")) if wc else None,
                          "kind": play_kind(ttext, p.get("text") or "", bool(p.get("scoringPlay")))})
        except (KeyError, TypeError, ValueError):
            continue
    return {"team_stats": team_stats, "players": players, "plays": plays}


# ------------------------------------------------------------------ derived, from stored observations only
def rotations(players: list[dict], plays: list[dict]) -> dict:
    """Stints from confirmed starters plus substitution events. If the chain is inconsistent for a team (a player
    leaves who was not on the floor, or five starters are not known), that team is reported as not determinable
    rather than guessed."""
    out = {}
    last_elapsed = max([p["elapsed_s"] for p in plays if p.get("elapsed_s") is not None], default=0.0)
    for tid in sorted({p["team_id"] for p in players if p.get("team_id")}):
        roster = [p for p in players if p["team_id"] == tid]
        starters = [p["espn_athlete_id"] for p in roster if p.get("starter")]
        ok = len(starters) == 5
        on = set(starters)
        stints = {a: [[0.0, None]] for a in starters}
        problems = [] if ok else [f"{len(starters)} starters published (5 needed)"]
        for ev in sorted((p for p in plays if p["kind"] == "substitution" and p.get("team_id") == tid), key=lambda p: p["sequence"]):
            ids = ev.get("athlete_ids") or []
            if len(ids) != 2 or ev.get("elapsed_s") is None:
                ok = False
                problems.append(f"substitution {ev['event_id']} is incomplete")
                continue
            p_in, p_out = ids[0], ids[1]
            if p_out not in on or p_in in on:
                ok = False
                problems.append(f"substitution {ev['event_id']} does not match the players on the floor")
                continue
            on.discard(p_out)
            on.add(p_in)
            stints[p_out][-1][1] = ev["elapsed_s"]
            stints.setdefault(p_in, []).append([ev["elapsed_s"], None])
        rows = []
        for p in roster:
            st = stints.get(p["espn_athlete_id"], []) if ok else []
            by_period: dict[int, float] = {}
            for a, b in st:
                end = b if b is not None else last_elapsed
                for per in range(1, 15):
                    lo = 720 * min(per - 1, 4) + 300 * max(per - 5, 0)
                    hi = lo + (720 if per <= 4 else 300)
                    ov = min(end, hi) - max(a, lo)
                    if ov > 0:
                        by_period[per] = by_period.get(per, 0.0) + ov
                    if hi >= end:
                        break
            rows.append({"espn_athlete_id": p["espn_athlete_id"], "player_id": p.get("player_id"), "name": p["name"],
                         "starter": p.get("starter"), "on_court": (p["espn_athlete_id"] in on) if ok else None,
                         "stints": [{"start_s": round(a, 1), "end_s": None if b is None else round(b, 1)} for a, b in st],
                         "minutes_by_period": {str(k): round(v / 60, 1) for k, v in sorted(by_period.items())},
                         "minutes": p.get("minutes"), "pf": p.get("pf")})
        out[tid] = {"determinable": ok, "problems": problems[:5], "players": rows,
                    "note": "Derived from the published starting five and substitution events."
                            if ok else "On-court status and stints cannot be derived reliably for this team; none are shown."}
    return out


def momentum(plays: list[dict]) -> dict:
    """Observed score progression. Descriptive only: no win probability, no 'momentum score'."""
    pts = []
    lead_changes = ties = 0
    largest = {"home": 0, "away": 0}
    prev_sign = 0
    run_team, run_pts, run_start, runs = None, 0, None, []
    for p in sorted(plays, key=lambda x: x["sequence"]):
        if p.get("home_score") is None or p.get("away_score") is None or p.get("elapsed_s") is None:
            continue
        if not p.get("scoring"):
            continue
        h, a = p["home_score"], p["away_score"]
        diff = h - a
        pts.append({"t": round(p["elapsed_s"], 1), "period": p["period"], "home": h, "away": a, "diff": diff})
        sign = (diff > 0) - (diff < 0)
        if sign == 0:
            ties += 1
        elif prev_sign and sign != prev_sign:
            lead_changes += 1
        if sign:
            prev_sign = sign
        largest["home"], largest["away"] = max(largest["home"], diff), max(largest["away"], -diff)
        side = "home" if p.get("team_side") == "home" else "away" if p.get("team_side") == "away" else None
        if side is None:
            continue
        if side == run_team:
            run_pts += p.get("score_value") or 0
        else:
            if run_team and run_pts >= 8:
                runs.append({"team": run_team, "points": run_pts, "start_s": run_start, "end_s": pts[-2]["t"] if len(pts) > 1 else run_start})
            run_team, run_pts, run_start = side, p.get("score_value") or 0, round(p["elapsed_s"], 1)
    if run_team and run_pts >= 8 and pts:
        runs.append({"team": run_team, "points": run_pts, "start_s": run_start, "end_s": pts[-1]["t"]})
    return {"points": pts, "lead_changes": lead_changes, "ties": ties, "largest_lead": largest,
            "runs": sorted(runs, key=lambda r: -r["points"])[:6],
            "note": "Observed scoring events only. This is not a forecast and no win probability is computed."}


def combo(row: dict, stat: str):
    """Value of a tracked statistic from a live box row (None when a component is missing)."""
    g = row.get
    if stat == "min":
        return g("minutes")
    if stat == "double_double":
        vals = [g(k) for k in ("pts", "reb", "ast", "stl", "blk")]
        return None if any(v is None for v in vals[:3]) else float(sum(1 for v in vals if (v or 0) >= 10) >= 2)
    parts = {"pra": ("pts", "reb", "ast"), "pr": ("pts", "reb"), "pa": ("pts", "ast"), "ra": ("reb", "ast")}.get(stat, (stat,))
    vals = [g(k) for k in parts]
    return None if any(v is None for v in vals) else sum(vals)


# ------------------------------------------------------------------ ingestion
def _match_players(s, rows: list[dict]) -> dict[str, int | None]:
    ids = [r["espn_athlete_id"] for r in rows]
    by_espn = {p.espn_id: p.id for p in s.scalars(select(Player).where(Player.espn_id.in_(ids)))} if ids else {}
    out = {}
    missing = [r for r in rows if r["espn_athlete_id"] not in by_espn]
    by_name: dict[tuple, int] = {}
    if missing:
        tids = {r["team_id"] for r in missing if r["team_id"]}
        for p in s.scalars(select(Player).where(Player.team_id.in_(tids))):
            by_name[(p.team_id, p.name_key)] = p.id
    for r in rows:
        out[r["espn_athlete_id"]] = by_espn.get(r["espn_athlete_id"]) or by_name.get((r["team_id"], name_key(r["name"])))
    return out


def apply_scoreboard(rows: list[dict], now: datetime) -> dict:
    """Upsert observed game state from a parsed scoreboard. Games we do not hold are counted, never created."""
    seen = changed = unknown = 0
    with session_scope() as s:
        games = {g.espn_event_id: g for g in s.scalars(select(Game).where(Game.espn_event_id.in_([r["espn_event_id"] for r in rows])))} if rows else {}
        for r in rows:
            g = games.get(r["espn_event_id"])
            if g is None or {g.home_team_id, g.away_team_id} != {r["home_team_id"], r["away_team_id"]}:
                unknown += 1          # no canonical game, or the teams do not match it: never attach to the wrong game
                continue
            seen += 1
            if r["status"] in IN_PLAY and g.status == "scheduled":
                g.status = "live"
            lg = s.get(LiveGame, g.id)
            fields = {k: r[k] for k in ("status", "provider_status", "period", "clock", "home_score", "away_score", "linescores")}
            if lg is None:
                s.add(LiveGame(game_id=g.id, espn_event_id=r["espn_event_id"], game_date=g.game_date, version=1, observed_at=now,
                               changed_at=now, **fields))
                changed += 1
                continue
            if any(getattr(lg, k) != v for k, v in fields.items()):
                for k, v in fields.items():
                    setattr(lg, k, v)
                lg.version, lg.changed_at = lg.version + 1, now
                changed += 1
            lg.observed_at = now
    return {"games": seen, "changed": changed, "not_in_schedule": unknown}


def apply_summary(game_id: str, parsed: dict, now: datetime) -> dict:
    new_plays = corrected = 0
    with session_scope() as s:
        lg = s.get(LiveGame, game_id)
        g = s.get(Game, game_id)
        if lg is None or g is None:
            return {"skipped": True}
        side = {g.home_team_id: "home", g.away_team_id: "away"}
        players = [p for p in parsed["players"] if p["team_id"] in side]      # ignore anything not from these two teams
        match = _match_players(s, players)
        existing = {b.espn_athlete_id: b for b in s.scalars(select(LivePlayerBox).where(LivePlayerBox.game_id == game_id))}
        have = {p.event_id: p for p in s.scalars(select(LivePlay).where(LivePlay.game_id == game_id))}
        for p in parsed["plays"]:
            cur = have.get(p["event_id"])
            pids = [match.get(a) for a in p["athlete_ids"]]
            if cur is None:
                # ON CONFLICT keeps a second poller (or a retry) from ever duplicating an event
                r = s.execute(text(
                    "insert into live_plays (game_id, event_id, sequence, period, clock, elapsed_s, team_id, kind, type_text, text, scoring,"
                    " score_value, home_score, away_score, athlete_ids, player_ids, provider_at, ingested_at, revision, corrections) values"
                    " (:g, :e, :seq, :per, :clock, :el, :team, :kind, :tt, :text, :sc, :sv, :hs, :as_, cast(:aids as jsonb), cast(:pids as jsonb),"
                    " :pat, :now, 0, cast('[]' as jsonb)) on conflict (game_id, event_id) do nothing"),
                    {"g": game_id, "e": p["event_id"], "seq": p["sequence"], "per": p["period"], "clock": p["clock"], "el": p["elapsed_s"],
                     "team": p["team_id"], "kind": p["kind"], "tt": p["type_text"], "text": p["text"], "sc": p["scoring"],
                     "sv": p["score_value"], "hs": p["home_score"], "as_": p["away_score"], "aids": json.dumps(p["athlete_ids"]),
                     "pids": json.dumps(pids), "pat": p["provider_at"], "now": now})
                new_plays += r.rowcount
            elif (cur.text, cur.home_score, cur.away_score, cur.sequence, cur.type_text) != (
                    p["text"], p["home_score"], p["away_score"], p["sequence"], p["type_text"]):
                cur.corrections = (cur.corrections or []) + [{"text": cur.text, "home_score": cur.home_score, "away_score": cur.away_score,
                                                              "sequence": cur.sequence, "type_text": cur.type_text, "replaced_at": now.isoformat()}]
                cur.revision += 1
                for k in ("text", "home_score", "away_score", "sequence", "type_text", "kind", "scoring", "score_value", "period", "clock",
                          "elapsed_s", "team_id"):
                    setattr(cur, k, p[k])
                cur.athlete_ids, cur.player_ids = p["athlete_ids"], pids
                corrected += 1
        rot = rotations([{**p, "player_id": match.get(p["espn_athlete_id"])} for p in players], parsed["plays"])
        on_court = {r["espn_athlete_id"]: r["on_court"] for t in rot.values() for r in t["players"]}
        box_changed = False
        for p in players:
            vals = {k: p[k] for k in ("team_id", "name", "position", "jersey", "starter", "dnp", "ejected", "minutes", *STAT_KEYS, "plus_minus")}
            vals["player_id"] = match.get(p["espn_athlete_id"])
            vals["on_court"] = on_court.get(p["espn_athlete_id"]) if lg.status in IN_PLAY else None
            row = existing.get(p["espn_athlete_id"])
            if row is None:
                s.add(LivePlayerBox(game_id=game_id, espn_athlete_id=p["espn_athlete_id"], updated_at=now, **vals))
                box_changed = True
            elif any(getattr(row, k) != v for k, v in vals.items()):
                for k, v in vals.items():
                    setattr(row, k, v)
                row.updated_at = now
                box_changed = True
        stats_changed = bool(parsed["team_stats"]) and parsed["team_stats"] != (lg.team_stats or {})
        if stats_changed:
            lg.team_stats = parsed["team_stats"]
        latest = max([p["provider_at"] for p in parsed["plays"] if p["provider_at"]], default=None)
        if latest and (lg.provider_updated_at is None or latest > lg.provider_updated_at):
            lg.provider_updated_at = latest
        lg.plays_count = len(have) + new_plays
        lg.detail_at = now
        if lg.status == "final":
            lg.final_detail_done = True
        if new_plays or corrected or box_changed or stats_changed:
            lg.version, lg.changed_at = lg.version + 1, now
    check_milestones(game_id, now)
    return {"new_plays": new_plays, "corrected_plays": corrected}


def check_milestones(game_id: str, now: datetime) -> int:
    n = 0
    with session_scope() as s:
        lg = s.get(LiveGame, game_id)
        boxes = {b.player_id: b for b in s.scalars(select(LivePlayerBox).where(LivePlayerBox.game_id == game_id)) if b.player_id}
        if lg is None or not boxes:
            return 0
        for m in s.scalars(select(LiveMilestone).where(LiveMilestone.game_date == lg.game_date, LiveMilestone.reached_at.is_(None),
                                                       LiveMilestone.deleted_at.is_(None), LiveMilestone.player_id.in_(list(boxes)))):
            b = boxes[m.player_id]
            v = combo({k: getattr(b, k) for k in ("minutes", *STAT_KEYS)}, m.stat)
            if v is not None and v >= m.threshold:
                m.reached_at, m.reached_value = now, float(v)
                n += 1
                s.execute(text(
                    "insert into jarvis_events (kind, dedupe_key, game_date, severity, title, detail, occurred_at) values "
                    "('milestone_reached', :k, :gd, 'notice', :t, cast(:d as jsonb), now()) on conflict (dedupe_key) do nothing"),
                    {"k": f"milestone:{m.id}", "gd": lg.game_date, "t": f"{b.name} reached {m.threshold:g} {m.stat}",
                     "d": json.dumps({"milestone_id": m.id, "player_id": m.player_id, "stat": m.stat, "threshold": m.threshold,
                                      "value": float(v), "game_id": game_id, "notify": m.notify})})
    return n


def period_summaries(game_id: str, now: datetime) -> list[str]:
    """Deterministic end-of-quarter / halftime / final summaries from stored observations. No model is involved."""
    made = []
    with session_scope() as s:
        lg, g = s.get(LiveGame, game_id), s.get(Game, game_id)
        if lg is None or g is None or lg.home_score is None:
            return made
        ends = sum(1 for (k,) in s.execute(select(LivePlay.kind).where(LivePlay.game_id == game_id, LivePlay.kind == "period")))
        due = []
        if lg.status == "final":
            due = ["final"]
        elif lg.status in ("end_period", "halftime"):
            due = [{1: "q1", 2: "half", 3: "q3"}.get(lg.period)] if lg.period in (1, 2, 3) else []
        due = [k for k in due if k and k not in (lg.summaries_done or [])]
        if not due or (lg.status == "final" and not lg.final_detail_done and ends == 0):
            return made
        teams = {t.id: t.abbr for t in s.scalars(select(Team).where(Team.id.in_([g.home_team_id, g.away_team_id])))}
        boxes = list(s.scalars(select(LivePlayerBox).where(LivePlayerBox.game_id == game_id)))
        for kind in due:
            title = {"q1": "End of first quarter", "half": "Halftime", "q3": "End of third quarter", "final": "Final"}[kind]
            lines = [f"{title}: {teams[g.away_team_id]} {lg.away_score}, {teams[g.home_team_id]} {lg.home_score}."]
            for tid in (g.away_team_id, g.home_team_id):
                top = sorted((b for b in boxes if b.team_id == tid and b.pts is not None), key=lambda b: -b.pts)[:3]
                if top:
                    lines.append(f"{teams[tid]} scoring: " + ", ".join(f"{b.name} {b.pts}" for b in top) + ".")
            limit = 3 if kind in ("q1", "half") else 4
            fouls = [f"{b.name} ({teams.get(b.team_id)}) {b.pf}" for b in boxes if (b.pf or 0) >= limit]
            if fouls:
                lines.append(f"Fouls at {limit} or more: " + ", ".join(fouls) + ".")
            mins = sorted((b for b in boxes if b.minutes), key=lambda b: -b.minutes)[:4]
            if mins:
                lines.append("Most minutes so far: " + ", ".join(f"{b.name} {b.minutes:g}" for b in mins) + ".")
            body = "\n".join(lines)
            facts = {"game_id": game_id, "kind": kind, "home_score": lg.home_score, "away_score": lg.away_score, "period": lg.period}
            s.add(JarvisBriefing(kind=f"live_{kind}", game_date=lg.game_date,
                                 digest_hash=hashlib.sha256(f"{game_id}:{kind}".encode()).hexdigest(), facts=facts, text=body,
                                 generator="deterministic", cost_usd=None))
            lg.summaries_done = (lg.summaries_done or []) + [kind]
            made.append(kind)
    return made


def poll(now: datetime | None = None, provider: EspnProvider | None = None) -> dict:
    """One pass: scoreboard for the current game day(s), then detail for every game in progress (and one last
    time for a game that just finished). Provider failures leave the last verified observation untouched."""
    now = now or utcnow()
    prov = provider or EspnProvider()
    out = {"at": now.isoformat(), "errors": []}
    d = today_et(now)
    days = [d] + ([d - timedelta(days=1)] if now.astimezone(ET).hour < 4 else [])     # late games run past midnight ET
    rows = []
    for day in days:
        try:
            rows += parse_scoreboard(prov.get_json("/scoreboard", {"dates": day.strftime("%Y%m%d")}))
        except Exception as e:      # ProviderError, network, schema: keep what we have
            out["errors"].append(f"scoreboard {day}: {type(e).__name__}")
    if rows:
        out["scoreboard"] = apply_scoreboard(rows, now)
    with session_scope() as s:
        need = [(lg.game_id, lg.espn_event_id) for lg in s.scalars(select(LiveGame).where(LiveGame.game_date.in_(days)))
                if lg.status in IN_PLAY or (lg.status == "final" and not lg.final_detail_done)]
    detail = 0
    for gid, ev in need:
        try:
            apply_summary(gid, parse_summary(prov.get_json("/summary", {"event": ev})), now)
            period_summaries(gid, now)
            detail += 1
        except Exception as e:
            out["errors"].append(f"summary {gid}: {type(e).__name__}")
    out["detail_games"] = detail
    return out


def next_interval(now: datetime | None = None) -> int:
    cfg = get_settings()
    now = now or utcnow()
    d = today_et(now)
    with session_scope() as s:
        live = list(s.scalars(select(LiveGame.status).where(LiveGame.game_date.in_([d, d - timedelta(days=1)]))))
        soon = s.scalar(select(Game.tipoff_utc).where(Game.game_date == d, Game.status == "scheduled", Game.tipoff_utc.is_not(None),
                                                      Game.tipoff_utc > now - timedelta(minutes=30)).order_by(Game.tipoff_utc).limit(1))
    if any(x in ("live", "overtime", "end_period") for x in live):
        return cfg.live_poll_seconds
    if any(x == "halftime" for x in live) or (soon is not None and soon - now <= timedelta(minutes=20)):
        return cfg.live_pregame_poll_seconds
    if soon is not None:
        return cfg.live_idle_poll_seconds
    return 600


def run_loop(once: bool = False):
    """The live ingestion process (`gizer live`). Independent of the job queue so research jobs never delay it."""
    from .db import Heartbeat

    def beat(worker: str, role: str, info: dict):       # local copy: importing the job module would load the modelling stack
        with session_scope() as s:
            hb = s.get(Heartbeat, worker)
            if hb is None:
                s.add(Heartbeat(worker=worker, role=role, beat_at=utcnow(), info=info))
            else:
                hb.beat_at, hb.info = utcnow(), info
    cfg = get_settings()
    me = f"live-{socket.gethostname()}"
    fails = 0
    while True:
        wait = 600
        try:
            if cfg.live_enabled:
                res = poll()
                fails = fails + 1 if res["errors"] and not res.get("scoreboard") else 0
                wait = next_interval()
                beat(me, "live", {"last": res, "next_in_s": wait})
            else:
                beat(me, "live", {"disabled": True})
        except Exception as e:      # never die: back off and try again
            fails += 1
            try:
                beat(me, "live", {"error": type(e).__name__})
            except Exception:
                pass
        if once:
            return
        time.sleep(min(600, wait * (2 ** min(fails, 4))))       # exponential backoff while the provider is failing


__all__ = ["IN_PLAY", "MILESTONE_STATS", "ProviderError", "STATUS_LABEL", "apply_scoreboard", "apply_summary", "combo", "momentum",
           "parse_scoreboard", "parse_summary", "period_label", "poll", "rotations", "run_loop"]
