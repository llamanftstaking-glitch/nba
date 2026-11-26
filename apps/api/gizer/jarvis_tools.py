"""JARVIS tool registry: the only things the assistant can do.

Every tool is a typed, bounded, read-only view over an existing application service (the same functions that
serve the dashboard), plus three narrow writes: its own memory, and a request for one of a fixed list of
read-only refresh jobs. There is no SQL, shell, file, network, trading, model-promotion or settings tool, and
none can be added from a conversation: the registry is this module.
"""
from __future__ import annotations

import json
import time
from datetime import date as _date_cls
from typing import Callable, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select

from . import ai_budget
from .db import (Combo, InjurySnapshot, JarvisBriefing, JarvisEvent, JarvisMemory, JarvisToolCall, ModelVersion, Player,
                 ResearchEvent, Selection, session_scope, utcnow)

MAX_RESULT_CHARS = 14_000
STATS = Literal["pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "pra", "pr", "pa", "ra"]


class Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ToolError(Exception):
    pass


# ------------------------------------------------------------------ bounding
def _cap_lists(obj, n: int):
    if isinstance(obj, list):
        out = [_cap_lists(x, n) for x in obj[:n]]
        if len(obj) > n:
            out.append({"_omitted_items": len(obj) - n})
        return out
    if isinstance(obj, dict):
        return {k: _cap_lists(v, n) for k, v in obj.items()}
    return obj


def bound(obj, max_chars: int = MAX_RESULT_CHARS) -> tuple[str, bool]:
    """Serialise a tool result within the size limit by shortening lists (never by cutting JSON mid-value)."""
    raw = json.dumps(obj, default=str, separators=(",", ":"))
    if len(raw) <= max_chars:
        return raw, False
    for n in (40, 25, 15, 10, 6, 4, 2, 1):
        raw = json.dumps(_cap_lists(obj, n), default=str, separators=(",", ":"))
        if len(raw) <= max_chars:
            return raw, True
    return json.dumps({"error": "result too large to return", "hint": "narrow the request (filters, smaller limit)"}), True


def _pick(d: dict, keys) -> dict:
    return {k: d.get(k) for k in keys if k in d}


# ------------------------------------------------------------------ tool implementations
class DateArg(Args):
    date: str | None = Field(None, description="YYYY-MM-DD in US Eastern time. Omit for today.", pattern=r"^\d{4}-\d{2}-\d{2}$")


class GameArg(Args):
    game_id: str = Field(max_length=24)


class PlayerArg(Args):
    player_id: int = Field(ge=1)


class TeamArg(Args):
    team_id: int = Field(ge=1)


class NoArgs(Args):
    pass


def t_daily_slate(a: DateArg, ctx):
    from .api import command_center, games_list
    g = games_list(a.date)
    cc = command_center(a.date)
    return {"date": g["date"], "games": g["games"],
            "summary": _pick(cc, ("edition", "counts", "props_summary", "warnings", "data_freshness", "kalshi"))}


def t_game_details(a: GameArg, ctx):
    from .api import game_detail
    return game_detail(a.game_id)


def t_team_profile(a: TeamArg, ctx):
    from .api import team_detail
    return team_detail(a.team_id)


class FindPlayer(Args):
    query: str = Field(min_length=2, max_length=60, description="Part of the player's name.")
    team: str | None = Field(None, max_length=4, description="Team abbreviation, e.g. DEN.")


def t_find_player(a: FindPlayer, ctx):
    from .api import players
    return players(q=a.query, team=a.team, limit=10, offset=0)


def t_player_profile(a: PlayerArg, ctx):
    from .api import player_detail
    return player_detail(a.player_id)


class GameLogs(Args):
    player_id: int = Field(ge=1)
    limit: int = Field(10, ge=1, le=30)
    venue: Literal["home", "away"] | None = None
    opponent: str | None = Field(None, max_length=4)


def t_player_game_logs(a: GameLogs, ctx):
    from .api_v3 import player_game_logs
    return player_game_logs(a.player_id, season=None, venue=a.venue, role=None, opponent=a.opponent, limit=a.limit, offset=0)


def t_player_averages(a: PlayerArg, ctx):
    from .api_v3 import player_averages
    return player_averages(a.player_id)


def t_player_splits(a: PlayerArg, ctx):
    from .api_v3 import player_splits
    return player_splits(a.player_id)


class Threshold(Args):
    player_id: int = Field(ge=1)
    stat: STATS
    line: float = Field(ge=0, le=200)
    window: Literal["L3", "L5", "L10", "L15", "L20", "L30", "season", "prev_season", "all"] = "L10"


def t_threshold_history(a: Threshold, ctx):
    from .api_v3 import player_threshold
    return player_threshold(a.player_id, stat=a.stat, line=a.line, window=a.window, venue=None, role=None)


class Compare(Args):
    player_ids: list[int] = Field(min_length=2, max_length=3)


def t_compare_players(a: Compare, ctx):
    from .api_v3 import player_averages
    return {"players": [player_averages(pid) for pid in a.player_ids],
            "note": "Descriptive averages over each player's own appearances; sample sizes are in each window."}


def t_projected_minutes(a: PlayerArg, ctx):
    from .api_core import player_minutes
    return player_minutes(a.player_id)


class MinutesTable(Args):
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    team: str | None = Field(None, max_length=4)
    limit: int = Field(20, ge=1, le=40)


def t_minutes_table(a: MinutesTable, ctx):
    from .api_core import minutes_table
    return minutes_table(date=a.date, team=a.team, q=None, classification=None, sort="proj_min", order="desc", limit=a.limit, offset=0)


def t_opportunity_profile(a: PlayerArg, ctx):
    """Usage, shot volume, per-minute production and scoring efficiency from stored box scores."""
    from . import history as H
    from .ingestion import today_et
    from .providers import season_for_date
    with session_scope() as s:
        pl = s.get(Player, a.player_id)
        if pl is None:
            raise ToolError("player not found")
        df = H.player_frame(s, a.player_id)
    if df.empty:
        return {"player_id": a.player_id, "player_name": pl.name, "available": False, "note": "No appearances ingested."}
    cur = df[df["season"] == season_for_date(today_et())]

    def window(d, label):
        if d.empty:
            return {"window": label, "n": 0}
        mins = float(d["min"].sum())
        fga, fta, pts = float(d["fga"].sum()), float(d["fta"].sum()), float(d["pts"].sum())
        us = d["usage"].dropna()
        ts_den = 2 * (fga + 0.44 * fta)
        per36 = lambda col: round(float(d[col].sum()) / mins * 36, 2) if mins > 0 else None  # noqa: E731
        return {"window": label, "n": int(len(d)), "avg_minutes": round(mins / len(d), 1),
                "usage_pct_avg": round(float(us.mean()), 1) if len(us) else None, "usage_n": int(len(us)),
                "fga_per_game": round(fga / len(d), 1), "fta_per_game": round(fta / len(d), 1),
                "fg3m_per_game": round(float(d["fg3m"].mean()), 1), "tov_per_game": round(float(d["tov"].mean()), 1),
                "true_shooting_pct": round(100 * pts / ts_den, 1) if ts_den > 0 else None,
                "per36": {c: per36(c) for c in ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov")}}
    return {"player_id": a.player_id, "player_name": pl.name, "available": True,
            "windows": [window(df.tail(5), "L5"), window(df.tail(10), "L10"), window(df.tail(20), "L20"), window(cur, "season")],
            "not_available": ["three-point attempts", "touches", "potential assists", "rebound chances", "per-possession rates",
                              "validated usage projection"],
            "see_also": "get_teammate_availability_splits for with/without-teammate numbers",
            "notes": ["Usage is the provider's per-game usage percentage (PBP Stats); games without it are excluded from its average.",
                      "True shooting = points / (2 * (FGA + 0.44 * FTA)) over the window.",
                      "These are descriptive history, not projections. No usage model is validated."]}


def t_teammate_splits(a: PlayerArg, ctx):
    """With/without splits against each main teammate, from stored box scores of the current season and team."""
    import pandas as pd

    from .db import PlayerBox
    from .ingestion import today_et
    from .providers import season_for_date
    season = season_for_date(today_et())
    with session_scope() as s:
        pl = s.get(Player, a.player_id)
        if pl is None:
            raise ToolError("player not found")
        rows = s.execute(select(PlayerBox.game_id, PlayerBox.player_id, PlayerBox.minutes, PlayerBox.usage, PlayerBox.pts, PlayerBox.reb,
                                PlayerBox.ast, PlayerBox.fg3m, PlayerBox.fga, PlayerBox.game_date)
                         .where(PlayerBox.team_id == pl.team_id, PlayerBox.season == season)).all()
        names = {p.id: p.name for p in s.scalars(select(Player).where(Player.team_id == pl.team_id))}
    df = pd.DataFrame(rows, columns=["game_id", "player_id", "min", "usage", "pts", "reb", "ast", "fg3m", "fga", "date"])
    df = df[df["min"].fillna(0) > 0]
    mine = df[df["player_id"] == a.player_id]
    base = {"player_id": a.player_id, "player_name": pl.name, "season": season, "games_played_for_this_team": int(len(mine))}
    if len(mine) < 4:
        return {**base, "available": False, "note": "Fewer than 4 appearances for this team this season: no split is shown."}
    others = df[df["player_id"] != a.player_id].groupby("player_id").agg(g=("game_id", "nunique"), mpg=("min", "mean"))
    main = others[(others["g"] >= 5) & (others["mpg"] >= 18)].sort_values("mpg", ascending=False).head(7)

    def line(d):
        us = d["usage"].dropna()
        return {"n": int(len(d)), "minutes": round(float(d["min"].mean()), 1), "usage_pct": round(float(us.mean()), 1) if len(us) else None,
                "pts": round(float(d["pts"].mean()), 1), "reb": round(float(d["reb"].mean()), 1), "ast": round(float(d["ast"].mean()), 1),
                "fg3m": round(float(d["fg3m"].mean()), 1), "fga": round(float(d["fga"].mean()), 1)}
    out = []
    for tid in main.index:
        played = set(df[df["player_id"] == tid]["game_id"])
        w, wo = mine[mine["game_id"].isin(played)], mine[~mine["game_id"].isin(played)]
        if len(wo) == 0:
            out.append({"teammate_id": int(tid), "teammate": names.get(int(tid), str(tid)), "with": line(w), "without": None,
                        "note": "This teammate has not missed a game the player appeared in."})
            continue
        out.append({"teammate_id": int(tid), "teammate": names.get(int(tid), str(tid)), "with": line(w), "without": line(wo),
                    "small_sample": bool(len(wo) < 5 or len(w) < 5)})
    return {**base, "available": True, "overall": line(mine), "teammates": out,
            "notes": ["Descriptive averages over the player's own appearances for his current team this season.",
                      "'Without' means the teammate recorded no minutes in that game, for any reason. Opponent, rest and blowouts are not controlled for.",
                      "Splits with fewer than 5 games on either side are flagged small_sample and should not carry a conclusion.",
                      "These are not model inputs: the projection models do not adjust for an absent teammate."]}


class TeamContext(Args):
    team_id: int = Field(ge=1, description="The defending team, i.e. the opponent of the player being researched.")


def t_opponent_context(a: TeamContext, ctx):
    """What a team has allowed per game this season (totals and to the opposing leading scorer), with league rank."""
    import pandas as pd

    from .db import PlayerBox, Team
    from .ingestion import today_et
    from .providers import season_for_date
    season = season_for_date(today_et())
    with session_scope() as s:
        team = s.get(Team, a.team_id)
        if team is None:
            raise ToolError("team not found")
        rows = s.execute(select(PlayerBox.opp_team_id, PlayerBox.game_id, PlayerBox.pts, PlayerBox.reb, PlayerBox.ast, PlayerBox.fg3m,
                                PlayerBox.tov, PlayerBox.fga, PlayerBox.fta, PlayerBox.starter).where(PlayerBox.season == season)).all()
        abbr = {t.id: t.abbr for t in s.scalars(select(Team))}
    df = pd.DataFrame(rows, columns=["def_team", "game_id", "pts", "reb", "ast", "fg3m", "tov", "fga", "fta", "starter"])
    if df.empty or a.team_id not in set(df["def_team"]):
        return {"team_id": a.team_id, "team": team.abbr, "season": season, "available": False, "note": "No games ingested for this team this season."}
    cols = ["pts", "reb", "ast", "fg3m", "tov", "fga", "fta"]
    per_game = df.groupby(["def_team", "game_id"])[cols].sum().reset_index()
    allowed = per_game.groupby("def_team")[cols].mean()
    games = per_game.groupby("def_team")["game_id"].nunique()
    top = df.groupby(["def_team", "game_id"])["pts"].max().groupby("def_team").mean()
    bench = df[df["starter"] == False].groupby(["def_team", "game_id"])["pts"].sum().groupby("def_team").mean()   # noqa: E712
    n_teams = int(len(allowed))

    def item(label, series, low_is_stingy=True):
        v = float(series.loc[a.team_id])
        rank = int((series < v).sum()) + 1 if low_is_stingy else int((series > v).sum()) + 1
        return {"stat": label, "allowed_per_game": round(v, 1), "league_average": round(float(series.mean()), 1),
                "rank_fewest_allowed": rank, "of_teams": n_teams}
    items = [item("points", allowed["pts"]), item("rebounds", allowed["reb"]), item("assists", allowed["ast"]),
             item("three-pointers made", allowed["fg3m"]), item("field goal attempts", allowed["fga"]),
             item("free throw attempts", allowed["fta"]), item("points by the opposing top scorer", top)]
    if a.team_id in bench.index:
        items.append(item("opposing bench points (games with starter data)", bench))
    forced = allowed["tov"]
    items.append({"stat": "turnovers forced", "per_game": round(float(forced.loc[a.team_id]), 1), "league_average": round(float(forced.mean()), 1),
                  "rank_most_forced": int((forced > float(forced.loc[a.team_id])).sum()) + 1, "of_teams": n_teams})
    return {"team_id": a.team_id, "team": abbr.get(a.team_id), "season": season, "games": int(games.loc[a.team_id]), "available": True,
            "allowed": items,
            "notes": ["Raw per-game totals allowed this season; not adjusted for pace, opponent strength or garbage time.",
                      "Rank 1 = fewest allowed. Early in a season these ranks move a lot: read them with the games count.",
                      "No positional (versus guards / versus centres) breakdown exists in our data.",
                      "Descriptive context only. The projection models do not use these numbers as inputs unless a model card says so."]}


class InjuryReport(Args):
    team: str | None = Field(None, max_length=4, description="Team abbreviation to filter by.")


def t_injury_report(a: InjuryReport, ctx):
    from .api import injuries
    data = injuries()
    if a.team:
        for key in ("items", "injuries", "teams"):
            if isinstance(data.get(key), list):
                data[key] = [r for r in data[key] if str(r.get("team_abbr") or r.get("abbr") or "").upper() == a.team.upper()]
    return data


class Changes(Args):
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    material_only: bool = False


def t_availability_changes(a: Changes, ctx):
    from .api_core import injury_changes
    return injury_changes(date=a.date, material=True if a.material_only else None, limit=60)


def t_lineups(a: GameArg, ctx):
    from .api_v3 import game_lineups
    return game_lineups(a.game_id)


def t_lineup_history(a: GameArg, ctx):
    from .api_v3 import lineup_history
    return lineup_history(a.game_id)


class KalshiList(Args):
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    game_id: str | None = Field(None, max_length=24)
    player_id: int | None = Field(None, ge=1)
    market: str | None = Field(None, max_length=24, description="e.g. player_pts, player_reb, game, total, spread")
    query: str | None = Field(None, max_length=60)
    sort: Literal["volume", "movement", "player", "spread"] = "volume"
    limit: int = Field(20, ge=1, le=40)


def t_kalshi_markets(a: KalshiList, ctx):
    from .api_core import kalshi_markets
    return kalshi_markets(date=a.date, game_id=a.game_id, kind=None, market=a.market, interpretation=None, q=a.query,
                          player_id=a.player_id, sort=a.sort, limit=a.limit, offset=0)


class Ticker(Args):
    ticker: str = Field(min_length=3, max_length=80)


def t_kalshi_market(a: Ticker, ctx):
    from .api_core import kalshi_market_detail
    d = kalshi_market_detail(a.ticker)
    if isinstance(d.get("series"), list) and len(d["series"]) > 40:   # keep first, last and an even sample between
        ser = d["series"]
        step = max(1, len(ser) // 38)
        d["series"] = ser[:1] + ser[1:-1:step] + ser[-1:]
        d["series_note"] = f"{len(ser)} observations stored; an even sample is shown."
    return d


class PlayerMarkets(Args):
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    player_query: str | None = Field(None, max_length=60, description="Player name fragment.")
    game_id: str | None = Field(None, max_length=24)
    market: str | None = Field(None, max_length=24)
    limit: int = Field(20, ge=1, le=40)


def t_player_markets(a: PlayerMarkets, ctx):
    from .api_v3 import player_props
    return player_props(date=a.date, game_id=a.game_id, team=None, market=a.market, q=a.player_query, quoted=None,
                        lineup_status=None, model_ready=None, limit=a.limit, offset=0)


def t_model_readiness(a: NoArgs, ctx):
    from .api import models
    return models()


class Selections(Args):
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    classification: Literal["qualified", "high_confidence", "standard", "watchlist", "stale", "insufficient_evidence",
                            "rejected", "invalidated"] | None = None
    game_id: str | None = Field(None, max_length=24)
    query: str | None = Field(None, max_length=60)
    top_ranked_only: bool = Field(False, description="Only the top-ranked qualified selections per game.")
    limit: int = Field(15, ge=1, le=30)


def t_research_selections(a: Selections, ctx):
    from .api import selections
    return selections(date=a.date, classification=a.classification, market=None, game_id=a.game_id,
                      ranked=True if a.top_ranked_only else None, q=a.query, limit=a.limit, offset=0)


class Parlays(Args):
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: Literal["double", "triple", "quad", "five", "six", "sgp", "cross"] = "double"


def t_parlay_research(a: Parlays, ctx):
    from .api import combos
    return combos(date=a.date, category=a.category)


class Inspect(Args):
    kind: Literal["selection", "combo"]
    record_id: int = Field(ge=1)


def _audit_selection(s, x: Selection, now) -> dict:
    mv = s.get(ModelVersion, x.model_version_id) if x.model_version_id else None
    inv = s.scalar(select(ResearchEvent).where(ResearchEvent.kind == "invalidated", ResearchEvent.ref_type == "selection",
                                               ResearchEvent.ref_id == str(x.id)))
    ev = x.evidence or {}
    changes = []
    if x.subject_type == "player" and x.verified_at is not None:
        for r in s.scalars(select(ResearchEvent).where(ResearchEvent.kind == "availability_change",
                                                       ResearchEvent.created_at > x.verified_at).order_by(ResearchEvent.id.desc()).limit(200)):
            if str((r.detail or {}).get("player_id")) == str(x.subject_id):
                changes.append(_pick(r.detail, ("player_name", "previous_status", "new_status", "material")) | {"at": r.created_at})
    latest_inj = None
    if x.subject_type == "player":
        latest_inj = s.scalar(select(InjurySnapshot).where(InjurySnapshot.player_id == x.subject_id).order_by(InjurySnapshot.id.desc()))
    quote_at = ev.get("quote_at")
    return {"id": x.id, "edition_id": x.edition_id, "game_id": x.game_id, "game_label": ev.get("game_label"),
            "subject": x.subject_name, "market": x.market, "side": x.side, "line": x.line, "price_american": x.price_american,
            "book": x.book, "quote_origin": ev.get("origin") or "provider", "quote_at": quote_at,
            "model_probability": x.prob, "probability_interval": [x.prob_low, x.prob_high], "breakeven": x.breakeven,
            "edge": x.edge, "sample_size": x.sample_size, "evidence_score": x.evidence_score,
            "classification_at_publication": x.classification, "rejection_reasons": x.rejection_reasons or [],
            "invalidated": inv is not None, "invalidation_reason": (inv.detail or {}).get("reason") if inv else None,
            "model": None if mv is None else {"name": mv.name, "version": mv.version, "family": mv.family,
                                              "status_now": mv.status, "production_eligible_now": mv.status == "production"},
            "verified_at": x.verified_at,
            "availability_changes_since_verification": changes[:10],
            "latest_availability": None if latest_inj is None else {"status": latest_inj.status, "ingested_at": latest_inj.ingested_at},
            "supporting": (ev.get("supporting") or [])[:8], "opposing": (ev.get("opposing") or [])[:8],
            "note": "Classification is the risk officer's decision at publication. This audit reports facts; it cannot change it."}


def t_inspect_research(a: Inspect, ctx):
    now = utcnow()
    with session_scope() as s:
        if a.kind == "selection":
            x = s.get(Selection, a.record_id)
            if x is None:
                raise ToolError("selection not found")
            return _audit_selection(s, x, now)
        c = s.get(Combo, a.record_id)
        if c is None:
            raise ToolError("combination not found")
        legs = [s.get(Selection, i) for i in (c.leg_selection_ids or [])]
        inv = s.scalar(select(ResearchEvent).where(ResearchEvent.kind == "invalidated", ResearchEvent.ref_type == "combo",
                                                   ResearchEvent.ref_id == str(c.id)))
        cols = {k: getattr(c, k) for k in ("id", "edition_id", "category", "engine", "n_legs", "joint_prob", "joint_prob_low",
                                           "joint_prob_high", "independent_prob", "fair_american", "classification",
                                           "method", "seed", "draws", "notes", "created_at") if hasattr(c, k)}
        return {"combination": cols, "invalidated": inv is not None,
                "invalidation_reason": (inv.detail or {}).get("reason") if inv else None,
                "legs": [_audit_selection(s, x, now) for x in legs if x is not None],
                "note": "Joint probability comes from the simulation engine with estimated dependence, not from multiplying "
                        "leg probabilities. No exchange price exists for this combination; it is paper research only."}


class EvaluateCombo(Args):
    selection_ids: list[int] = Field(min_length=2, max_length=6, description="Ids of evaluated selections (from get_existing_research_candidates).")


def t_evaluate_combination(a: EvaluateCombo, ctx):
    from .api import BuilderBody, builder_evaluate
    out = builder_evaluate(BuilderBody(selection_ids=a.selection_ids))
    out["note"] = ("Computed by the platform's simulation engine with estimated dependence between legs, for these exact evaluated "
                   "selections. Nothing is stored and no exchange price exists for the combination. Paper research only.")
    return out


def t_research_lab(a: NoArgs, ctx):
    from .api import research_lab
    return research_lab()


def t_backtests(a: NoArgs, ctx):
    from .api import backtests
    return backtests()


class EditionArg(Args):
    edition_id: int | None = Field(None, ge=1, description="Omit for the latest edition of the date.")
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


def t_edition(a: EditionArg, ctx):
    from .api import edition_detail, editions
    if a.edition_id is None:
        items = editions(a.date).get("items") or []
        if not items:
            return {"available": False, "note": "No research edition has been published for this date."}
        return {"editions": items, "latest": edition_detail(items[0]["id"])}
    return edition_detail(a.edition_id)


class Results(Args):
    date_from: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    date_to: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    market: str | None = Field(None, max_length=24)
    engine: str | None = Field(None, max_length=24)
    player_id: int | None = Field(None, ge=1)


def t_paper_results(a: Results, ctx):
    from .api import results
    return results(date_from=a.date_from, date_to=a.date_to, season=None, engine=a.engine, market=a.market, classification=None,
                   model_version_id=None, team=None, player_id=a.player_id, limit=15, offset=0)


class Tickets(Args):
    status: Literal["open", "won", "lost", "void", "settled"] | None = None
    limit: int = Field(15, ge=1, le=30)


def t_paper_tickets(a: Tickets, ctx):
    from .api import paper_list
    return paper_list(status=a.status, engine=None, date_from=None, date_to=None, limit=a.limit, offset=0)


def t_agent_status(a: NoArgs, ctx):
    from .jobs import agents_status
    return {"agents": agents_status()}


def t_data_health(a: NoArgs, ctx):
    from .api import data_health
    return data_health()


def t_system_status(a: NoArgs, ctx):
    from .jobs import operations_status
    return operations_status()


def t_budget_status(a: NoArgs, ctx):
    st = ai_budget.status()
    return _pick(st, ("policy", "spent_usd", "pending_usd", "remaining_usd", "usable_usd", "today_usd", "state", "checkpoints",
                      "buckets", "requests", "est_days_remaining"))


class Events(Args):
    kind: str | None = Field(None, max_length=32)
    limit: int = Field(20, ge=1, le=40)


def t_recent_events(a: Events, ctx):
    with session_scope() as s:
        q = select(JarvisEvent).order_by(JarvisEvent.id.desc()).limit(a.limit)
        if a.kind:
            q = q.where(JarvisEvent.kind == a.kind)
        return {"events": [{"id": e.id, "kind": e.kind, "severity": e.severity, "title": e.title, "detail": e.detail,
                            "occurred_at": e.occurred_at, "game_date": e.game_date} for e in s.scalars(q)]}


class Briefings(Args):
    kind: Literal["overnight", "morning", "midday", "pregame", "postgame"] | None = None
    limit: int = Field(3, ge=1, le=6)


def t_briefings(a: Briefings, ctx):
    with session_scope() as s:
        q = select(JarvisBriefing).order_by(JarvisBriefing.id.desc()).limit(a.limit)
        if a.kind:
            q = q.where(JarvisBriefing.kind == a.kind)
        return {"briefings": [{"id": b.id, "kind": b.kind, "date": b.game_date, "text": b.text, "generator": b.generator,
                               "created_at": b.created_at} for b in s.scalars(q)]}


class Recall(Args):
    query: str | None = Field(None, max_length=80)
    category: Literal["research", "operational", "preference", "conversation"] | None = None
    subject_type: Literal["player", "team", "game", "market", "model", "system"] | None = None
    subject_id: str | None = Field(None, max_length=64)
    limit: int = Field(12, ge=1, le=25)


def t_recall(a: Recall, ctx):
    with session_scope() as s:
        q = select(JarvisMemory).where(JarvisMemory.deleted_at.is_(None)).order_by(JarvisMemory.id.desc())
        if a.category:
            q = q.where(JarvisMemory.category == a.category)
        if a.subject_type:
            q = q.where(JarvisMemory.subject_type == a.subject_type)
        if a.subject_id:
            q = q.where(JarvisMemory.subject_id == a.subject_id)
        if a.query:
            q = q.where(JarvisMemory.text.ilike(f"%{a.query.replace('%', '').replace('_', ' ')}%"))
        return {"memories": [memory_dict(m) for m in s.scalars(q.limit(a.limit))]}


class Remember(Args):
    category: Literal["research", "operational", "preference"]
    text: str = Field(min_length=8, max_length=600)
    status: Literal["verified", "hypothesis", "preference"] = "hypothesis"
    subject_type: Literal["player", "team", "game", "market", "model", "system"] | None = None
    subject_id: str | None = Field(None, max_length=64)
    sources: list[str] = Field(default_factory=list, max_length=6,
                               description="Tool names / record ids the statement came from. Required for status 'verified'.")
    observed_on: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


def t_remember(a: Remember, ctx):
    status = a.status
    if a.category == "preference":
        status = "preference"
    elif status == "verified" and not a.sources:
        status = "hypothesis"       # a fact without a source is stored as a hypothesis, never as verified
    with session_scope() as s:
        m = JarvisMemory(category=a.category, status=status, subject_type=a.subject_type, subject_id=a.subject_id, text=a.text,
                         sources=[x[:120] for x in a.sources], created_by="jarvis", conversation_id=ctx.get("conversation_id"),
                         observed_on=_date_cls.fromisoformat(a.observed_on) if a.observed_on else None)
        s.add(m)
        s.flush()
        return {"saved": True, "id": m.id, "status": status,
                "note": None if status == a.status else "Stored as a hypothesis because no source was given."}


JOBS_ALLOWED = {"availability_watch": "Re-read the injury feed and lineups now.",
                "market_watch": "Take a new Kalshi market observation now."}


class JobRequest(Args):
    task: Literal["availability_watch", "market_watch"]


def t_request_job(a: JobRequest, ctx):
    from .jobs import enqueue
    now = utcnow()
    bucket = now.replace(minute=now.minute - now.minute % 10, second=0, microsecond=0)
    queued = enqueue(a.task, {}, f"{a.task}:jarvis:{bucket:%Y%m%dT%H%M}", timeout_s=600)
    return {"task": a.task, "queued": queued,
            "note": "Queued for the background worker." if queued else "Already requested in the last 10 minutes; not queued again.",
            "result_available": "Call the matching read tool again in about a minute."}


# ------------------------------------------------------------------ GIZER LIVE (observed in-game data)
class _P:
    """Stand-in principal for calling live routes as functions: the tool runs for the conversation's owner."""

    def __init__(self, email):
        self.email, self.role = email or "", "owner"


class LiveGameArg(Args):
    game_id: str = Field(max_length=24, description="Game id, e.g. from get_live_scoreboard or page context.")


def t_live_scoreboard(a: DateArg, ctx):
    from .api_live import live_scoreboard
    return live_scoreboard(a.date, _P(ctx.get("owner")))


def t_live_game_state(a: LiveGameArg, ctx):
    from .api_live import live_game
    return live_game(a.game_id, _P(ctx.get("owner")))


class LiveBox(Args):
    game_id: str = Field(max_length=24)
    min_fouls: int | None = Field(None, ge=1, le=6, description="Only players with at least this many personal fouls.")
    on_court_only: bool = False


def _slim_box(r: dict) -> dict:
    keep = ("player_id", "name", "role", "on_court", "dnp", "minutes", "pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "pf", "fgm", "fga",
            "fg3a", "ftm", "fta", "plus_minus", "pra", "foul_trouble", "true_shooting_pct", "pregame")
    return {k: r.get(k) for k in keep}


def t_live_boxscore(a: LiveBox, ctx):
    from .api_live import live_boxscore
    d = live_boxscore(a.game_id, sort="minutes", order="desc")
    for side in ("home", "away"):
        rows = [r for r in d[side]["players"] if not r["dnp"]]
        if a.min_fouls:
            rows = [r for r in rows if (r["pf"] or 0) >= a.min_fouls]
        if a.on_court_only:
            rows = [r for r in rows if r["on_court"] is True]
        d[side]["players"] = [_slim_box(r) for r in rows]
    return d


class LivePlayerArg(Args):
    player_id: int = Field(ge=1)
    date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


def t_live_player(a: LivePlayerArg, ctx):
    from .api_live import live_player
    return live_player(a.player_id, a.date, _P(ctx.get("owner")))


class LivePlaysArg(Args):
    game_id: str = Field(max_length=24)
    filter: Literal["all", "scoring", "fouls", "substitutions"] = "all"
    period: int | None = Field(None, ge=1, le=10, description="Only plays from this period (3 = third quarter).")
    player_id: int | None = Field(None, ge=1)
    limit: int = Field(40, ge=1, le=80)


def t_live_plays(a: LivePlaysArg, ctx):
    from .api_live import live_plays
    d = live_plays(a.game_id, filter=a.filter, team_id=None, player_id=a.player_id, after_sequence=None, order="desc", limit=500, offset=0)
    rows = [r for r in d["items"] if a.period is None or r["period"] == a.period]
    d["total"] = len(rows)
    d["items"] = [{k: r[k] for k in ("period", "clock", "team_side", "kind", "text", "scoring", "home_score", "away_score", "corrected")}
                  for r in rows[:a.limit]]
    d["order"] = "newest first"
    return d


def t_live_rotations(a: LiveGameArg, ctx):
    from .api_live import live_rotations
    return live_rotations(a.game_id)


def t_live_team_stats(a: LiveGameArg, ctx):
    from .api_live import live_team_stats
    return live_team_stats(a.game_id)


def t_followed(a: DateArg, ctx):
    from .api_live import live_watchlist
    return live_watchlist(a.date, _P(ctx.get("owner")))


def t_pregame_comparison(a: LiveGameArg, ctx):
    """Pregame projection beside what has been observed, per player. Meaningful as a comparison once the game is final."""
    from .api_live import live_boxscore
    d = live_boxscore(a.game_id, sort="minutes", order="desc")
    out = {"game_id": d["game_id"], "status": d["status"], "period": d["period"], "observed_at": d.get("observed_at"), "stale": d.get("stale")}
    for side in ("home", "away"):
        rows = []
        for r in d[side]["players"]:
            pre = r.get("pregame")
            if r["dnp"] or not pre:
                continue
            rows.append({"player_id": r["player_id"], "name": r["name"], "role": r["role"],
                         "minutes": {"projected": pre.get("proj_min"), "actual": r["minutes"]},
                         **{st: {"projected": pre.get(st), "actual": r[st]} for st in ("pts", "reb", "ast", "fg3m") if pre.get(st) is not None}})
        out[side] = {"abbr": d[side]["abbr"], "players": rows}
    out["note"] = ("Projections are the last ones published before tipoff and are never changed. While the game is in progress "
                   "the actual values are partial, so a shortfall is expected and is not a forecast error yet.")
    return out


def t_paper_progress(a: DateArg, ctx):
    from .api_live import live_research_tracker
    return live_research_tracker(a.date, limit=25)


# ------------------------------------------------------------------ GIZER CORTEX (basketball knowledge and profiles)
class KnowledgeSearch(Args):
    query: str = Field(min_length=2, max_length=200, description="Basketball term or question, e.g. 'drop coverage', 'true shooting'.")
    department: int | None = Field(None, ge=1, le=20)
    kind: Literal["rule", "statistic", "offense", "defense", "role", "concept", "context", "market", "method", "live"] | None = None
    limit: int = Field(5, ge=1, le=8)


def t_knowledge_search(a: KnowledgeSearch, ctx):
    from . import cortex
    return cortex.search(a.query, a.department, a.kind, a.limit, caller="jarvis")


class ConceptArg(Args):
    slug: str = Field(min_length=2, max_length=80, description="Record slug from search_basketball_knowledge.")


def t_concept(a: ConceptArg, ctx):
    from . import cortex
    c = cortex.get_concept(a.slug)
    if c is None:
        raise ToolError("no knowledge record with that slug; use search_basketball_knowledge first")
    return c


def t_player_dna(a: PlayerArg, ctx):
    from . import cortex
    d = cortex.player_dna(a.player_id)
    if d is None:
        raise ToolError("player not found")
    return d


def t_team_dna(a: TeamArg, ctx):
    from . import cortex
    d = cortex.team_dna(a.team_id)
    if d is None:
        raise ToolError("team not found")
    return d


def t_knowledge_coverage(a: NoArgs, ctx):
    from . import cortex
    return cortex.coverage()


def t_knowledge_sources(a: NoArgs, ctx):
    from .db import CortexSource
    with session_scope() as s:
        return {"sources": [{"key": x.key, "title": x.title, "publisher": x.publisher, "url": x.url, "league": x.league,
                             "reliability": x.reliability, "permission": x.permission, "accessed": x.accessed,
                             "access_result": x.access_result} for x in s.scalars(select(CortexSource).order_by(CortexSource.key))]}


def memory_dict(m: JarvisMemory) -> dict:
    return {"id": m.id, "category": m.category, "status": m.status, "subject_type": m.subject_type, "subject_id": m.subject_id,
            "text": m.text, "sources": m.sources, "observed_on": m.observed_on, "created_by": m.created_by, "created_at": m.created_at}


# ------------------------------------------------------------------ registry
class Tool:
    def __init__(self, name: str, label: str, description: str, args: type[Args], fn: Callable, group: str, writes: bool = False):
        self.name, self.label, self.description, self.args, self.fn, self.group, self.writes = name, label, description, args, fn, group, writes

    def schema(self) -> dict:
        js = self.args.model_json_schema()
        js.pop("title", None)
        for p in js.get("properties", {}).values():
            p.pop("title", None)
        js.setdefault("properties", {})
        js["additionalProperties"] = False
        return {"name": self.name, "description": self.description, "input_schema": js}


def _t(name, label, description, args, fn, group, writes=False):
    return Tool(name, label, description, args, fn, group, writes)


TOOLS: list[Tool] = [
    _t("get_daily_slate", "Retrieving the slate", "Games on a date with status, game lines and the latest research edition summary. Start here for 'today'.", DateArg, t_daily_slate, "nba"),
    _t("get_game_details", "Loading game research", "Full research page for one game: environment, projections, lineups, selections, limitations.", GameArg, t_game_details, "nba"),
    _t("get_team_profile", "Loading team profile", "Team record, recent games, roster and listed injuries.", TeamArg, t_team_profile, "nba"),
    _t("find_player", "Looking up the player", "Resolve a player name to player_id (needed by the player tools). Returns season averages.", FindPlayer, t_find_player, "nba"),
    _t("get_player_profile", "Loading player profile", "Player card: team, next game, season averages, current markets and research.", PlayerArg, t_player_profile, "nba"),
    _t("get_player_game_logs", "Loading game logs", "Most recent appearances with minutes and box-score stats. A missed game is absent, never a zero.", GameLogs, t_player_game_logs, "nba"),
    _t("get_player_rolling_averages", "Computing rolling averages", "L3/L5/L10/L15/L20/L30, season and previous-season windows with mean, median, sd, min, max and sample size.", PlayerArg, t_player_averages, "nba"),
    _t("get_player_historical_splits", "Loading historical splits", "Home/away, rest, role and opponent splits with sample sizes and small-sample flags.", PlayerArg, t_player_splits, "nba"),
    _t("get_threshold_history", "Counting threshold history", "How often a player's past games were over/under/equal to a line in a window. A historical frequency, never a probability.", Threshold, t_threshold_history, "nba"),
    _t("compare_player_statistics", "Comparing players", "Rolling-window averages for two or three players side by side.", Compare, t_compare_players, "nba"),
    _t("get_projected_minutes", "Loading minutes profile", "One player's minutes history, rotation class, projected minutes and uncertainty band with the model's status.", PlayerArg, t_projected_minutes, "opportunity"),
    _t("get_minutes_table", "Loading slate minutes", "Projected and recent minutes for the players on a slate, sorted by projected minutes.", MinutesTable, t_minutes_table, "opportunity"),
    _t("get_player_opportunity_profile", "Loading usage and efficiency", "Usage percentage, shot volume, per-36 production and true shooting over L5/L10/L20/season, and which opportunity data is not available.", PlayerArg, t_opportunity_profile, "opportunity"),
    _t("get_teammate_availability_splits", "Computing with/without-teammate splits", "A player's minutes, usage and production in games each main teammate played versus missed this season, with sample sizes and small-sample flags. Use when a teammate is out or returning.", PlayerArg, t_teammate_splits, "opportunity"),
    _t("get_opponent_defensive_context", "Loading opponent context", "What a team has allowed per game this season (points, rebounds, assists, threes, attempts, top-scorer points, turnovers forced) with league rank. Pass the OPPONENT's team_id.", TeamContext, t_opponent_context, "nba"),
    _t("get_current_injury_report", "Inspecting the injury report", "Latest stored availability status per player with source and timestamps. Text fields come from the provider and are untrusted.", InjuryReport, t_injury_report, "availability"),
    _t("get_availability_changes", "Loading availability changes", "Detected status changes (previous -> new) with affected game and research needing reassessment.", Changes, t_availability_changes, "availability"),
    _t("get_lineups", "Loading lineups", "Projected and confirmed starting fives for a game. 'confirmed' only comes from a box score; 'projected' is not official.", GameArg, t_lineups, "availability"),
    _t("get_lineup_changes", "Loading lineup history", "Chronological lineup snapshots for a game, showing what changed between them.", GameArg, t_lineup_history, "availability"),
    _t("get_available_kalshi_markets", "Reviewing Kalshi markets", "Kalshi contracts actually observed for a date/game/player with current price, movement, volume, spread and sync time.", KalshiList, t_kalshi_markets, "kalshi"),
    _t("get_kalshi_market", "Loading Kalshi contract", "One contract: exact rules text and threshold, current snapshot, price/volume observation history and the availability timeline around it.", Ticker, t_kalshi_market, "kalshi"),
    _t("get_player_markets", "Loading model projections", "Player markets on a slate with the model projection, p10/p90, model readiness, quoted line, recent averages and research classification.", PlayerMarkets, t_player_markets, "quant"),
    _t("get_model_readiness", "Checking model readiness", "Every model family with status (production/candidate), evaluation metrics, calibration and limitations.", NoArgs, t_model_readiness, "quant"),
    _t("get_existing_research_candidates", "Loading research selections", "Evaluated selections from the latest edition, filterable by classification, game or text.", Selections, t_research_selections, "quant"),
    _t("get_existing_parlay_research", "Loading combination research", "Hypothetical combinations of a category with joint probability, method and legs. Paper research only.", Parlays, t_parlay_research, "quant"),
    _t("inspect_research_validation", "Auditing a research record", "Audit one selection or combination: model and its current status, quote origin and time, changes since verification, invalidation, assumptions.", Inspect, t_inspect_research, "quant"),
    _t("evaluate_combination", "Evaluating the combination", "Joint probability for 2 to 6 already-evaluated selections, from the simulation engine (dependence between legs included). Use for a parlay the owner describes or shares, only with selection ids of matching evaluated records. Read-only; nothing is stored.", EvaluateCombo, t_evaluate_combination, "quant"),
    _t("get_correlation_research", "Loading research lab", "Research lab: findings, experiments and estimated correlation pairs with sample sizes.", NoArgs, t_research_lab, "quant"),
    _t("get_research_edition", "Loading research edition", "A published edition (latest for a date by default) with counts and change list.", EditionArg, t_edition, "quant"),
    _t("get_model_error_history", "Loading backtests", "Backtest runs and forecast-error metrics per model.", NoArgs, t_backtests, "learning"),
    _t("get_paper_testing_results", "Loading paper results", "Settled paper-testing results: record, calibration and breakdowns. Simulated units, not money.", Results, t_paper_results, "learning"),
    _t("get_settled_research_records", "Loading paper tickets", "Paper tickets by status.", Tickets, t_paper_tickets, "learning"),
    _t("get_live_scoreboard", "Reading the live scoreboard", "Observed scores, period, clock and status for every game on a date, with how fresh each observation is. Use for 'what is happening tonight'.", DateArg, t_live_scoreboard, "live"),
    _t("get_live_game_state", "Reading the live game", "One game's observed state: score by quarter, leaders, team statistics, score-progression facts (lead changes, largest leads, runs), latest plays and automatic period summaries.", LiveGameArg, t_live_game_state, "live"),
    _t("get_live_boxscore", "Reading the live box score", "Observed player statistics for a game (minutes, points, rebounds, assists, fouls, shooting, plus/minus), on-court status where derivable, with the pregame projection beside each player. Can filter by fouls or to players on the court.", LiveBox, t_live_boxscore, "live"),
    _t("get_live_player_statistics", "Reading the player's live line", "One player's observed line in today's game with game status, plus the owner's tracking thresholds for him.", LivePlayerArg, t_live_player, "live"),
    _t("get_live_play_by_play", "Reading the play-by-play", "Recorded game events (source wording), newest first; filter by type, period or player. Use for 'what happened in the third quarter'.", LivePlaysArg, t_live_plays, "live"),
    _t("get_live_rotation_history", "Reading live rotations", "Who is on the court and each player's stints and minutes by quarter, derived from starters and substitution events; says so when it cannot be derived.", LiveGameArg, t_live_rotations, "live"),
    _t("get_live_team_statistics", "Reading live team statistics", "Published team totals for both sides (shooting, rebounds, assists, turnovers, fouls, paint and fast-break points).", LiveGameArg, t_live_team_stats, "live"),
    _t("get_followed_games", "Loading followed games", "The owner's watchlist: followed games, followed players with their live lines and tracking thresholds, favourite teams.", DateArg, t_followed, "live"),
    _t("get_followed_players", "Loading followed players", "Same watchlist as get_followed_games; use when the question is about followed players and their live lines.", DateArg, t_followed, "live"),
    _t("get_pregame_projection_comparison", "Comparing with pregame projections", "Per player: pregame projected minutes/points/rebounds/assists beside what has been observed so far.", LiveGameArg, t_pregame_comparison, "live"),
    _t("get_paper_research_progress", "Reading paper research progress", "Paper tickets for a date with each leg's line beside its observed statistic and settlement status. Observation only.", DateArg, t_paper_progress, "live"),
    _t("search_basketball_knowledge", "Searching the basketball library", "Search the CORTEX knowledge library (rules, offensive and defensive concepts, roles, statistics and formulas, market literacy, research methods). Returns short records with slugs. Use before explaining a concept, a statistic or a rule.", KnowledgeSearch, t_knowledge_search, "cortex"),
    _t("get_basketball_concept", "Reading a knowledge record", "One full knowledge record by slug: explanation, formula, limitations, what our data can and cannot observe for it, sources and whether the text was checked against a source.", ConceptArg, t_concept, "cortex"),
    _t("get_player_dna", "Building the player profile", "Evidence-derived player profile: identity, team history, season rates per 36, usage, true shooting, start share, minutes spread, rule-based archetypes with the rule shown, teammate context, and what is not available.", PlayerArg, t_player_dna, "cortex"),
    _t("get_team_dna", "Building the team profile", "Evidence-derived team profile for the season: record, scoring, pace and ratings where possessions exist, shot volume, rotation length, starter minutes, starting-five stability, minutes leaders, first-substitution timing from live games. Includes the rotation tendencies (coach identity is not held).", TeamArg, t_team_dna, "cortex"),
    _t("get_knowledge_coverage", "Checking knowledge coverage", "What CORTEX holds: knowledge records by department and verification status, sources, profile counts, benchmark size and latest results, and what is not built.", NoArgs, t_knowledge_coverage, "cortex"),
    _t("get_knowledge_sources", "Listing knowledge sources", "The source registry with publisher, permission note and whether each source was actually opened by the author.", NoArgs, t_knowledge_sources, "cortex"),
    _t("get_agent_status", "Checking the research agents", "The 18 agent roles with last run, status, last report and errors.", NoArgs, t_agent_status, "operations"),
    _t("get_data_provider_health", "Checking data providers", "Provider status, data freshness, coverage and warnings.", NoArgs, t_data_health, "operations"),
    _t("get_system_health", "Checking system health", "Worker/scheduler heartbeats, schedule, recent jobs and pause state.", NoArgs, t_system_status, "operations"),
    _t("get_ai_budget_status", "Checking the AI budget", "JARVIS's own spending: lifetime budget, spent, remaining, today's use and limits.", NoArgs, t_budget_status, "operations"),
    _t("get_recent_events", "Loading recent events", "Deduplicated operational and research events (availability changes, lineup confirmations, outages, checkpoints).", Events, t_recent_events, "operations"),
    _t("get_briefings", "Loading briefings", "Recent scheduled intelligence briefings.", Briefings, t_briefings, "operations"),
    _t("recall_memory", "Searching memory", "Search JARVIS's stored memory (research findings, operational notes, owner preferences).", Recall, t_recall, "memory"),
    _t("remember", "Saving to memory", "Store one durable note. Use 'verified' only with sources from tools used in this conversation; otherwise 'hypothesis'. Use 'preference' only for something the owner explicitly asked for.", Remember, t_remember, "memory", writes=True),
    _t("request_research_job", "Requesting a data refresh", "Ask the background worker to re-read injuries/lineups or take a Kalshi observation now. At most once per 10 minutes each.", JobRequest, t_request_job, "operations", writes=True),
]
BY_NAME = {t.name: t for t in TOOLS}


def tool_definitions() -> list[dict]:
    """Stable, deterministic order: the tool list is part of the cached prompt prefix."""
    return [t.schema() for t in TOOLS]


def execute(name: str, raw_args, ctx: dict) -> dict:
    """Validate and run one tool call. Never raises: returns {ok, content, label, ...} for the tool_result block."""
    t0 = time.monotonic()
    tool = BY_NAME.get(name)
    ok, err, content, truncated, args_dump = False, None, "", False, raw_args if isinstance(raw_args, dict) else {}
    if tool is None:
        err = f"unknown tool '{name}'"                      # not in the registry: rejected, nothing runs
    elif not isinstance(raw_args, dict):
        err = "tool input must be a JSON object"
    else:
        try:
            args = tool.args.model_validate(raw_args)
            args_dump = args.model_dump(exclude_none=True)
            content, truncated = bound(tool.fn(args, ctx))
            ok = True
        except ValidationError as e:
            err = "invalid arguments: " + "; ".join(f"{'.'.join(str(p) for p in x['loc'])}: {x['msg']}" for x in e.errors()[:4])
        except ToolError as e:
            err = str(e)
        except Exception as e:  # service errors (e.g. ApiError 404) are reported to the model as data
            err = f"{type(e).__name__}: {getattr(e, 'message', None) or e}"[:240]
    if not ok:
        content = json.dumps({"error": err})
    ms = int((time.monotonic() - t0) * 1000)
    with session_scope() as s:
        s.add(JarvisToolCall(conversation_id=ctx.get("conversation_id"), message_id=None, tool=name[:48],
                             args=json.loads(json.dumps(args_dump, default=str)),
                             ok=ok, error=err[:240] if err else None, result_chars=len(content), truncated=truncated, duration_ms=ms))
    return {"ok": ok, "content": content, "error": err, "truncated": truncated, "duration_ms": ms,
            "label": tool.label if tool else "Rejected an unknown tool", "group": tool.group if tool else None, "args": args_dump}
