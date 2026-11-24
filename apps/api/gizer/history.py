"""Player historical intelligence: descriptive statistics reproducible from stored game logs.

Definitions (documented in docs/research/PLAYER-HISTORICAL-ANALYSIS.md):
* A window counts the player's most recent **appearances** (games with recorded minutes), never team games.
* A game the player missed is not an appearance and is never treated as zero production. Missed games are
  reported separately (team games inside the window's date span without an appearance).
* A real zero in a game the player appeared in is kept.
* Everything here is DESCRIPTIVE. A historical frequency is not a probability for the next game.
"""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
from sqlalchemy import select

from .db import Game, PlayerAbsence, PlayerBox
from .modeling import COMBO_STATS
from .providers import season_for_date

STATS = ["min", "pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "pra", "pr", "pa", "ra"]
WINDOWS = [("L3", 3), ("L5", 5), ("L10", 10), ("L15", 15), ("L20", 20), ("L30", 30)]
SMALL_SAMPLE = 10
DEFINITION = ("Windows count the player's most recent appearances (games with recorded minutes). Games the player "
              "missed are listed separately and are never counted as zero production.")
CAVEAT = ("Descriptive history only. An observed historical frequency is not the probability of the same result in "
          "the next game.")


def player_frame(s, player_id: int, before: date | None = None) -> pd.DataFrame:
    """All appearances of a player, oldest first, with team result and derived combination stats."""
    q = (select(PlayerBox, Game).join(Game, Game.id == PlayerBox.game_id).where(PlayerBox.player_id == player_id)
         .order_by(PlayerBox.game_date, PlayerBox.game_id))
    if before:
        q = q.where(PlayerBox.game_date < before)
    rows = []
    for b, g in s.execute(q):
        tp, op = (g.home_points, g.away_points) if b.is_home else (g.away_points, g.home_points)
        rows.append({"game_id": b.game_id, "date": b.game_date, "season": b.season, "team_id": b.team_id,
                     "opp_team_id": b.opp_team_id, "is_home": b.is_home, "starter": b.starter, "min": b.minutes,
                     "pts": b.pts, "reb": b.reb, "ast": b.ast, "fg3m": b.fg3m, "stl": b.stl, "blk": b.blk, "tov": b.tov,
                     "fga": b.fga, "fta": b.fta, "usage": b.usage, "team_points": tp, "opp_points": op,
                     "result": None if tp is None or op is None else ("W" if tp > op else "L"), "provider": b.provider})
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    for k, parts in COMBO_STATS.items():
        df[k] = sum(df[p] for p in parts)
    return df


def summarize(values: pd.Series) -> dict:
    v = values.to_numpy(float)
    return {"mean": round(float(v.mean()), 2), "median": float(np.median(v)), "min": float(v.min()), "max": float(v.max()),
            "sd": round(float(v.std(ddof=1)), 2) if len(v) > 1 else None,
            "p25": float(np.percentile(v, 25)), "p75": float(np.percentile(v, 75))}


def _missed(s, df: pd.DataFrame, sub: pd.DataFrame) -> int | None:
    """Team games within the window's date span in which the player did not appear (same team(s) only)."""
    if sub.empty:
        return None
    lo, hi = sub["date"].min(), sub["date"].max()
    n = 0
    for tid, grp in sub.groupby("team_id"):
        tlo, thi = grp["date"].min(), grp["date"].max()
        total = s.scalar(select(__import__("sqlalchemy").func.count()).select_from(Game).where(
            Game.status == "final", Game.game_date >= tlo, Game.game_date <= thi,
            (Game.home_team_id == int(tid)) | (Game.away_team_id == int(tid))))
        n += max(0, int(total or 0) - len(grp))
    del lo, hi
    return n


def _window(s, df, sub, key, label, requested, available=True, note=None) -> dict:
    n = len(sub)
    return {"key": key, "label": label, "requested": requested, "games": n,
            "missed": _missed(s, df, sub) if n else None,
            "small_sample": n < SMALL_SAMPLE, "available": available and n > 0,
            "note": note or (f"only {n} of {requested} requested appearances exist" if requested and 0 < n < requested else
                             ("no appearances" if n == 0 and available else None)),
            "stats": {st: summarize(sub[st]) for st in STATS} if n else {}}


def windows(s, player_id: int, as_of: date) -> list[dict]:
    df = player_frame(s, player_id, before=None)
    out = []
    cur, prev = season_for_date(as_of), season_for_date(date(as_of.year - 1, as_of.month, min(as_of.day, 28)))
    empty = df.iloc[0:0] if not df.empty else pd.DataFrame(columns=["date", "team_id", *STATS])
    for key, n in WINDOWS:
        out.append(_window(s, df, df.tail(n) if not df.empty else empty, key, f"Last {n}", n))
    out.append(_window(s, df, df[df["season"] == cur] if not df.empty else empty, "season", f"Season {cur}", None))
    out.append(_window(s, df, df[df["season"] == prev] if not df.empty else empty, "prev_season", f"Season {prev}", None))
    out.append(_window(s, df, df if not df.empty else empty, "regular_season", "Regular season (all ingested)", None))
    out.append(_window(s, df, empty, "playoffs", "Playoffs", None, available=False,
                       note="Playoff games are not ingested yet (regular season only)."))
    return out


def select_window(df: pd.DataFrame, window: str, as_of: date) -> pd.DataFrame:
    w = window.upper()
    if w.startswith("L") and w[1:].isdigit():
        return df.tail(int(w[1:]))
    if window == "season":
        return df[df["season"] == season_for_date(as_of)]
    if window == "prev_season":
        return df[df["season"] == season_for_date(date(as_of.year - 1, as_of.month, min(as_of.day, 28)))]
    return df


def apply_filters(df: pd.DataFrame, venue: str | None = None, role: str | None = None, opponent_id: int | None = None,
                  season: str | None = None) -> pd.DataFrame:
    if df.empty:
        return df
    if venue in ("home", "away"):
        df = df[df["is_home"] == (venue == "home")]
    if role in ("starter", "bench"):
        df = df[df["starter"] == (role == "starter")]  # games with unknown starter status are excluded
    if opponent_id:
        df = df[df["opp_team_id"] == opponent_id]
    if season:
        df = df[df["season"] == season]
    return df


def threshold(s, player_id: int, stat: str, line: float, window: str, as_of: date, venue=None, role=None,
              team_abbr: dict | None = None) -> dict:
    """Measurement A: the player's actual results versus one selected threshold. Filters apply BEFORE the window,
    so 'L10 home' means the last ten home appearances."""
    df = apply_filters(player_frame(s, player_id), venue, role)
    sub = select_window(df, window, as_of) if not df.empty else df
    games = []
    over = under = equal = 0
    for r in sub.itertuples():
        v = float(getattr(r, stat))
        oc = "over" if v > line else "under" if v < line else "equal"
        over += oc == "over"; under += oc == "under"; equal += oc == "equal"
        games.append({"game_id": r.game_id, "date": r.date, "opp_abbr": (team_abbr or {}).get(r.opp_team_id),
                      "is_home": bool(r.is_home), "starter": None if r.starter is None or pd.isna(r.starter) else bool(r.starter),
                      "min": float(r.min), "value": v, "outcome": oc})
    n = len(games)
    notes = [CAVEAT]
    if n < SMALL_SAMPLE:
        notes.append(f"Small sample (n={n}).")
    if role:
        notes.append("Starter/bench filters exclude games whose starting status is not known.")
    return {"player_id": player_id, "stat": stat, "line": line, "window": window, "measurement": "A",
            "label": "Historical results versus today's selected threshold (descriptive)",
            "n": n, "over": over, "under": under, "equal": equal,
            "frequency_over": round(over / n, 4) if n else None,
            "average": round(float(sub[stat].mean()), 2) if n else None, "games": games,
            "market_history": {"available": False,
                               "reason": "Measurement B needs the market line that was offered before each past game. "
                                         "No historical player-prop quotes are held; they accumulate only from the day "
                                         "a prop odds provider is configured."},
            "notes": notes}


def quick_averages(df: pd.DataFrame, stat: str, as_of: date) -> dict:
    """L5/L10/L20/season means for one stat (None when there are no appearances in the window)."""
    if df.empty:
        return {"l5": None, "l10": None, "l20": None, "season_avg": None, "n_games": 0}
    m = lambda x: round(float(x[stat].mean()), 1) if len(x) else None  # noqa: E731
    return {"l5": m(df.tail(5)), "l10": m(df.tail(10)), "l20": m(df.tail(20)),
            "season_avg": m(df[df["season"] == season_for_date(as_of)]), "n_games": int(len(df))}


def splits(s, player_id: int, as_of: date, team_abbr: dict, next_opp_id: int | None = None) -> dict:
    df = player_frame(s, player_id)
    out = []
    if df.empty:
        return {"splits": [], "notes": ["No appearances ingested."]}
    cur = df[df["season"] == season_for_date(as_of)]
    df = df.assign(rest=pd.to_datetime(df["date"]).diff().dt.days)
    cur = df[df["season"] == season_for_date(as_of)]

    def row(group, label, sub):
        n = len(sub)
        r = {"group": group, "label": label, "games": n, "small_sample": n < SMALL_SAMPLE}
        for st in ("min", "pts", "reb", "ast", "fg3m", "pra"):
            r[st] = round(float(sub[st].mean()), 1) if n else None
        out.append(r)

    row("Venue (season)", "Home", cur[cur["is_home"]]); row("Venue (season)", "Away", cur[~cur["is_home"]])
    known = cur[cur["starter"].notna()]
    row("Role (season)", "Starter", known[known["starter"] == True])  # noqa: E712
    row("Role (season)", "Bench", known[known["starter"] == False])  # noqa: E712
    row("Rest (season)", "Back-to-back (0 days rest)", cur[cur["rest"] == 1])
    row("Rest (season)", "1 day rest", cur[cur["rest"] == 2])
    row("Rest (season)", "2+ days rest", cur[cur["rest"] >= 3])
    for lo, hi, lab in ((0, 20, "Under 20 minutes"), (20, 30, "20–29 minutes"), (30, 99, "30+ minutes")):
        row("Minutes (season)", lab, cur[(cur["min"] >= lo) & (cur["min"] < hi)])
    row("Result (season)", "Team wins", cur[cur["result"] == "W"]); row("Result (season)", "Team losses", cur[cur["result"] == "L"])
    for tid, grp in df.groupby("team_id"):
        if df["team_id"].nunique() > 1:
            row("Team context (all ingested)", f"With {team_abbr.get(int(tid), tid)}", grp)
    if next_opp_id:
        row("Opponent (all ingested)", f"vs {team_abbr.get(next_opp_id, next_opp_id)}", df[df["opp_team_id"] == next_opp_id])
    row("Season type", "Regular season (all ingested)", df)
    return {"splits": out, "notes": [
        CAVEAT, f"Splits with fewer than {SMALL_SAMPLE} games are flagged as small samples.",
        "Splits are not used by the prediction models: a difference between two historical averages is not evidence "
        "of a predictive effect until it passes chronological validation.",
        "Teammate-availability splits and playoff splits are not available yet."]}


def missed_games(s, player_id: int, limit: int = 80) -> list[dict]:
    """Team games the player did not appear in, between the first and last appearance of each team stint per
    season. The published reason is attached when the source listed one; otherwise it is stated as unknown."""
    df = player_frame(s, player_id)
    if df.empty:
        return []
    reasons = {a.game_id: a.reason for a in s.scalars(select(PlayerAbsence).where(PlayerAbsence.player_id == player_id))}
    played = set(df["game_id"])
    out = []
    for (season, tid), grp in df.groupby(["season", "team_id"]):
        tid = int(tid)
        for g in s.scalars(select(Game).where(Game.status == "final", Game.season == season,
                                              Game.game_date >= grp["date"].min(), Game.game_date <= grp["date"].max(),
                                              (Game.home_team_id == tid) | (Game.away_team_id == tid))):
            if g.id not in played:
                out.append({"date": g.game_date, "game_id": g.id, "team_id": tid,
                            "opp_team_id": g.away_team_id if g.home_team_id == tid else g.home_team_id,
                            "reason": reasons.get(g.id) or "Did not appear (reason not published by the source)"})
    return sorted(out, key=lambda r: r["date"], reverse=True)[:limit]
