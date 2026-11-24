"""Lineup intelligence.

Statuses, and what each one means here:
* confirmed  — the source box score lists the five starters (available at/after tipoff). Never inferred.
* projected  — GIZER's deterministic projection: the team's most recent confirmed starting five, with players
               who are now unavailable (latest injury report) or no longer on the team replaced by the available
               rotation player with the most projected minutes. Not an official lineup.
* unknown    — no confirmed lineup and no basis for a projection. Starters are left empty, never padded.

Snapshots are append-only; a new snapshot is stored only when something material changed, with a
human-readable description of the change (lineup change detection).
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime

import pandas as pd
from sqlalchemy import func, select

from . import modeling as M
from .db import Game, LineupSnapshot, Player, PlayerBox, ResearchEvent, Team, session_scope, utcnow
from .ingestion import latest_injuries
from .providers import EspnProvider, ProviderError

OUT_WORDS = ("out", "suspension", "injured reserve")
PROJECTED_SOURCE = "GIZER projection: last confirmed starting five adjusted for the latest injury report"


def availability_of(inj) -> tuple[str, str | None]:
    if inj is None:
        return "available", None
    return inj.status.lower(), inj.detail or inj.comment


def is_out(status: str) -> bool:
    return any(w in status for w in OUT_WORDS)


class LineupContext:
    def __init__(self, s, d: date, now: datetime | None = None):
        self.s, self.date, self.now = s, d, now or utcnow()
        self.players = {p.id: p for p in s.scalars(select(Player))}
        self.inj = {i.player_id: i for i in latest_injuries(s, self.now) if i.player_id}
        self.inj_at = max((i.ingested_at for i in self.inj.values()), default=None)
        pf = M.load_player_frame(s, before=d)
        self.feats = M.live_player_features(pf, d) if not pf.empty else pd.DataFrame()
        self.recent_min = pf.groupby("player_id")["minutes"].apply(lambda x: float(x.tail(5).mean())).to_dict() if not pf.empty else {}

    def roster(self, team_id: int) -> pd.DataFrame:
        f = self.feats
        if f.empty:
            return f
        recent = pd.Timestamp(self.date) - pd.Timedelta(days=21)
        f = f[(f["team_id"] == team_id) & (f["last_date"] >= recent)]
        on_team = [pid for pid in f["player_id"] if self.players.get(int(pid)) and self.players[int(pid)].team_id == team_id]
        return f[f["player_id"].isin(on_team)].sort_values("proj_min", ascending=False)

    def starts_last10(self, player_id: int) -> int | None:
        rows = self.s.execute(select(PlayerBox.starter).where(PlayerBox.player_id == player_id, PlayerBox.game_date < self.date)
                              .order_by(PlayerBox.game_date.desc()).limit(10)).all()
        known = [r[0] for r in rows if r[0] is not None]
        return sum(1 for x in known if x) if known else None

    def player_row(self, pid: int | None, role: str, name: str | None = None, extra: dict | None = None) -> dict:
        pl = self.players.get(pid) if pid else None
        av, det = availability_of(self.inj.get(pid)) if pid else ("available", None)
        pm = None
        if pid is not None and not self.feats.empty:
            m = self.feats[self.feats["player_id"] == pid]
            pm = round(float(m["proj_min"].iloc[0]), 1) if len(m) else None
        rm = self.recent_min.get(pid)
        return {"player_id": pid, "name": pl.name if pl else (name or "Unknown"), "headshot_url": pl.headshot_url if pl else None,
                "jersey": pl.jersey if pl else None, "position": pl.position if pl else None, "role": role,
                "availability": av, "injury_detail": det, "proj_min": None if is_out(av) else pm,
                "recent_min": None if rm is None else round(rm, 1),
                "starts_last10": self.starts_last10(pid) if pid else None, **(extra or {})}


def confirmed_from_box(ctx: LineupContext, game: Game, team_id: int) -> list[int] | None:
    ids = [r[0] for r in ctx.s.execute(select(PlayerBox.player_id).where(
        PlayerBox.game_id == game.id, PlayerBox.team_id == team_id, PlayerBox.starter.is_(True)))]
    return ids if len(ids) == 5 else None


def last_confirmed_five(ctx: LineupContext, team_id: int) -> tuple[list[int], date] | None:
    gid = ctx.s.execute(select(PlayerBox.game_id, PlayerBox.game_date).where(
        PlayerBox.team_id == team_id, PlayerBox.starter.is_(True), PlayerBox.game_date < ctx.date)
        .order_by(PlayerBox.game_date.desc()).limit(1)).first()
    if not gid:
        return None
    ids = [r[0] for r in ctx.s.execute(select(PlayerBox.player_id).where(
        PlayerBox.game_id == gid[0], PlayerBox.team_id == team_id, PlayerBox.starter.is_(True)))]
    return (ids, gid[1]) if len(ids) == 5 else None


def build_team_lineup(ctx: LineupContext, game: Game, team: Team, provider_rows: list[dict] | None = None) -> dict:
    """Current best lineup knowledge for one team. `provider_rows` are live box-score rows (confirmed starters)."""
    roster = ctx.roster(team.id)
    roster_ids = [int(x) for x in roster["player_id"]] if len(roster) else []
    status, source, note, starters = "unknown", "none", "No lineup information available.", []
    conf = confirmed_from_box(ctx, game, team.id)
    if conf is None and provider_rows:
        from .ingestion import match_player
        ids = [match_player(ctx.s, r["name"], [team.id]) for r in provider_rows if r["team_id"] == team.id and r["starter"]]
        conf = ids if len(ids) == 5 and all(ids) else None
    if conf is not None:
        status, source = "confirmed", "ESPN box score (starters as listed by the source)"
        note = "Confirmed starters from the game's box score."
        starters = conf
    else:
        last = last_confirmed_five(ctx, team.id)
        if last is not None:
            ids, when = last
            keep = [p for p in ids if not is_out(availability_of(ctx.inj.get(p))[0])
                    and ctx.players.get(p) is not None and ctx.players[p].team_id == team.id]
            repl = [p for p in roster_ids if p not in keep and not is_out(availability_of(ctx.inj.get(p))[0])]
            need = 5 - len(keep)
            if need <= len(repl):
                starters = keep + repl[:need]
                status, source = "projected", PROJECTED_SOURCE
                swapped = [ctx.players[p].name for p in ids if p not in keep and p in ctx.players]
                note = (f"Projected — not official. Based on the confirmed starters of {when}."
                        + (f" Replaced (unavailable or no longer with the team): {', '.join(swapped)}." if swapped else ""))
            else:
                note = "Not enough available rotation players with history to project five starters."
    rows = [ctx.player_row(p, "starter") for p in starters]
    out_rows = [ctx.player_row(p, "bench") for p in roster_ids if p not in starters]
    injured_extra = [i for pid, i in ctx.inj.items() if i.team_id == team.id and pid not in roster_ids and pid not in starters
                     and is_out(i.status.lower())]
    unavailable = [r for r in out_rows if is_out(r["availability"])] + [ctx.player_row(i.player_id, "bench") for i in injured_extra]
    bench = [r for r in out_rows if not is_out(r["availability"])]
    return {"team_id": team.id, "status": status, "source": source, "note": note,
            "verified_at": ctx.now if status != "unknown" else None,
            "starters": rows, "bench": bench[:10], "unavailable": unavailable}


def _signature(lu: dict) -> str:
    key = [lu["status"], sorted((r["player_id"], r["availability"]) for r in lu["starters"]),
           sorted(r["player_id"] for r in lu["unavailable"] if r["player_id"])]
    return hashlib.sha256(json.dumps(key, default=str).encode()).hexdigest()


def describe_change(prev: LineupSnapshot | None, lu: dict) -> str:
    if prev is None:
        return f"First {lu['status']} lineup recorded."
    old = {p["player_id"]: p for p in prev.players if p["role"] == "starter"}
    new = {p["player_id"]: p for p in lu["starters"]}
    parts = []
    if prev.status != lu["status"]:
        parts.append(f"status {prev.status} → {lu['status']}")
    ins = [new[k]["name"] for k in new.keys() - old.keys()]
    outs = [old[k]["name"] for k in old.keys() - new.keys()]
    if ins or outs:
        parts.append(f"starting five: in {', '.join(ins) or '—'}; out {', '.join(outs) or '—'}")
    for k in new.keys() & old.keys():
        if new[k]["availability"] != old[k]["availability"]:
            parts.append(f"{new[k]['name']}: {old[k]['availability']} → {new[k]['availability']}")
    old_un = {p["player_id"] for p in prev.players if p["role"] == "unavailable"}
    for p in lu["unavailable"]:
        if p["player_id"] not in old_un:
            parts.append(f"{p['name']} now unavailable ({p['availability']})")
    return "; ".join(parts) or "availability details updated"


def refresh_lineups(d: date, now: datetime | None = None, provider: EspnProvider | None = None, fetch_live: bool = True) -> dict:
    """Recompute lineups for every game on `d`, append snapshots where something changed, and record
    material changes as audit events so dependent research is revalidated by the next edition."""
    out = {"games": 0, "snapshots": 0, "changes": [], "confirmed": 0, "projected": 0, "unknown": 0, "provider_errors": 0}
    now = now or utcnow()
    with session_scope() as s:
        ctx = LineupContext(s, d, now)
        teams = {t.id: t for t in s.scalars(select(Team))}
        for g in s.scalars(select(Game).where(Game.game_date == d, Game.status != "postponed").order_by(Game.tipoff_utc)):
            out["games"] += 1
            live_rows = None
            near_tip = g.tipoff_utc is not None and (g.tipoff_utc - now).total_seconds() <= 45 * 60
            if fetch_live and g.espn_event_id and near_tip and g.lineup_ingested_at is None:
                try:
                    live_rows = (provider or EspnProvider()).summary_box(g.espn_event_id)
                except ProviderError:
                    out["provider_errors"] += 1
            for tid in (g.away_team_id, g.home_team_id):
                lu = build_team_lineup(ctx, g, teams[tid], live_rows)
                out[lu["status"]] += 1
                prev = s.scalar(select(LineupSnapshot).where(LineupSnapshot.game_id == g.id, LineupSnapshot.team_id == tid)
                                .order_by(LineupSnapshot.id.desc()).limit(1))
                sig = _signature(lu)
                if prev is not None and prev.signature == sig:
                    continue
                if prev is not None and prev.status == "confirmed" and lu["status"] != "confirmed":
                    continue  # a confirmed lineup is never downgraded by a later projection
                change = describe_change(prev, lu)
                players = ([{**p, "role": "starter"} for p in lu["starters"]] + [{**p, "role": "bench"} for p in lu["bench"]]
                           + [{**p, "role": "unavailable"} for p in lu["unavailable"]])
                s.add(LineupSnapshot(game_id=g.id, team_id=tid, status=lu["status"], source=lu["source"], signature=sig,
                                     players=json.loads(json.dumps(players, default=str)), change=change, verified_at=now,
                                     ingested_at=now))
                out["snapshots"] += 1
                if prev is not None:
                    out["changes"].append({"game_id": g.id, "team": teams[tid].abbr, "change": change})
                    s.add(ResearchEvent(kind="lineup_change", ref_type="game", ref_id=g.id, game_date=d,
                                        actor="agent-05-rotation-minutes-analyst",
                                        detail={"team": teams[tid].abbr, "change": change, "status": lu["status"]}))
    return out


def current_lineup(s, ctx: LineupContext | None, game: Game, team: Team) -> dict:
    """Latest stored snapshot for API responses; computed on the fly (not stored) when none exists."""
    snap = s.scalar(select(LineupSnapshot).where(LineupSnapshot.game_id == game.id, LineupSnapshot.team_id == team.id)
                    .order_by(LineupSnapshot.id.desc()).limit(1))
    if snap is not None:
        ps = snap.players
        strip = lambda r: {k: v for k, v in r.items() if k != "role"} | {"role": "starter" if r["role"] == "starter" else "bench"}  # noqa: E731
        return {"team_id": team.id, "status": snap.status, "source": snap.source, "verified_at": snap.verified_at,
                "note": ("Confirmed starters from the game's box score." if snap.status == "confirmed" else
                         "Projected — not official." if snap.status == "projected" else "No lineup information available."),
                "starters": [strip(p) for p in ps if p["role"] == "starter"],
                "bench": [strip(p) for p in ps if p["role"] == "bench"],
                "unavailable": [strip(p) for p in ps if p["role"] == "unavailable"]}
    if ctx is None:
        return {"team_id": team.id, "status": "unknown", "source": "none", "verified_at": None,
                "note": "No lineup information available.", "starters": [], "bench": [], "unavailable": []}
    return build_team_lineup(ctx, game, team)


def lineup_status_map(s, game_ids: list[str]) -> dict[tuple[str, int], LineupSnapshot]:
    if not game_ids:
        return {}
    sub = select(func.max(LineupSnapshot.id)).where(LineupSnapshot.game_id.in_(game_ids)).group_by(
        LineupSnapshot.game_id, LineupSnapshot.team_id)
    return {(x.game_id, x.team_id): x for x in s.scalars(select(LineupSnapshot).where(LineupSnapshot.id.in_(sub)))}
