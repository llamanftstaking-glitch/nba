"""Agents, durable job queue, worker and scheduler.

Production operation is independent of any development session: `gizer scheduler` and `gizer worker` are
long-running processes (containers with restart policies). The queue is PostgreSQL-backed
(FOR UPDATE SKIP LOCKED), with idempotency keys, retries with exponential backoff, a dead-letter state,
stale-lock recovery, heartbeats, timeouts and an administrative pause switch.

The 18 agents are deterministic workflows with declared triggers and validated output shapes. None of
them holds an LLM conversation loop; none can alter the risk policy or the research constitution.
"""
from __future__ import annotations

import os
import signal
import socket
import time
import traceback
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from pydantic import BaseModel
from sqlalchemy import func, select, text, update

from . import ingestion
from . import modeling as M
from .config import ET, get_settings
from .db import (AgentExecution, Combo, Edition, Game, Heartbeat, Job, ModelVersion, PaperSettlement, PaperTicket,
                 PlayerBox, ProviderCall, ResearchEvent, Selection, get_setting, session_scope, utcnow)
from .providers import ProviderError


# ---------------------------------------------------------------- agents
class AgentOutput(BaseModel):
    summary: str
    data: dict
    abstained: bool = False
    sources: list[str] = []


@dataclass(frozen=True)
class AgentSpec:
    number: int
    id: str
    name: str
    role: str
    trigger: str
    required: tuple[str, ...]  # keys that must be present in output.data
    on_failure: str = "record failure, retry with the job; downstream research abstains if inputs are missing"


AGENTS = [
    AgentSpec(1, "agent-01-chief-intelligence-officer", "Chief NBA Intelligence Officer",
              "Coordinates the slate and publishes the edition briefing; cannot override the risk officer.",
              "editions 10:00 / 12:00 / 15:00 ET and pregame checkpoints", ("edition", "counts")),
    AgentSpec(2, "agent-02-data-engineer", "NBA Data Engineer", "Results, box scores, identifiers, duplicates, freshness.",
              "04:00 and 06:00 ET", ("games_listed", "boxes_ingested", "quality")),
    AgentSpec(3, "agent-03-player-performance-analyst", "Player Performance Analyst",
              "Recent form versus shrunk long-run rates, with sample sizes.", "08:00 ET", ("players", "movers")),
    AgentSpec(4, "agent-04-injury-intelligence-analyst", "Injury Intelligence Analyst",
              "Timestamped, sourced injury report snapshots. Never infers medical information.",
              "08:00 ET, every edition and pregame checkpoint", ("rows", "unmatched_players")),
    AgentSpec(5, "agent-05-rotation-minutes-analyst", "Lineup, Rotation and Minutes Analyst",
              "Projected vs confirmed starting lineups, lineup change detection, minutes volatility and role changes.",
              "08:00 ET, every edition and pregame checkpoint", ("role_changes", "volatile", "lineups")),
    AgentSpec(6, "agent-06-matchup-intelligence-analyst", "Matchup Intelligence Analyst",
              "Team offensive/defensive rating matchups with sample sizes.", "08:00 ET", ("games",)),
    AgentSpec(7, "agent-07-pace-environment-analyst", "Pace and Game Environment Analyst",
              "Possessions, efficiency, total-score uncertainty.", "08:00 ET", ("games",)),
    AgentSpec(8, "agent-08-schedule-fatigue-analyst", "Schedule and Fatigue Analyst",
              "Rest and back-to-backs; reports the measured effect and whether it is distinguishable from zero.",
              "08:00 ET", ("back_to_backs", "rest_effect")),
    AgentSpec(9, "agent-09-historical-research-analyst", "Historical Research Analyst",
              "Coverage and league scoring environment by season.", "06:00 ET", ("coverage",)),
    AgentSpec(10, "agent-10-market-intelligence-analyst", "Market Intelligence Analyst",
              "Quote snapshots and observed line movement. No narratives.", "08:00 ET, editions, pregame checkpoints",
              ("games", "odds_rows_appended", "moves")),
    AgentSpec(11, "agent-11-player-projection-scientist", "Player Projection Scientist",
              "Probabilistic player projections; authors player models (cannot promote them).",
              "weekly evaluation; projections with every edition", ("families",)),
    AgentSpec(12, "agent-12-team-projection-scientist", "Team Projection Scientist",
              "Team scoring, totals and margins versus simple baselines; authors team models.",
              "weekly evaluation; projections with every edition", ("passed", "margin_mae", "margin_mae_baseline")),
    AgentSpec(13, "agent-13-correlation-research-scientist", "Correlation Research Scientist",
              "Empirical residual dependence; validates against independence and joint frequencies.",
              "weekly evaluation", ("validation",)),
    AgentSpec(14, "agent-14-simulation-scientist", "Simulation Scientist",
              "Reproducibility and convergence audits of stored simulations.", "weekly", ("reproducible", "checked")),
    AgentSpec(15, "agent-15-parlay-research-architect", "Parlay Research Architect",
              "Builds candidate combination arrays from qualified selections only.", "every edition", ("combos",)),
    AgentSpec(16, "agent-16-independent-risk-officer", "Independent Risk Officer (GIZER GUARD)",
              "Applies the version-controlled risk policy; independent authority to reject.", "every edition",
              ("evaluated", "rejected", "policy")),
    AgentSpec(17, "agent-17-postgame-forensic-analyst", "Postgame Forensic Analyst",
              "Settlement, forecast errors and forensic reports; separates variance from model error.",
              "04:00 ET; weekly forward review", ("settled", "unresolved")),
    AgentSpec(18, "agent-18-chief-model-auditor", "Chief Model Auditor",
              "Leakage checks, calibration, drift, promotion gate. Sole promotion authority.", "weekly",
              ("leakage_check", "models")),
]
AGENT_BY_ID = {a.id: a for a in AGENTS}
_N = {a.number: a for a in AGENTS}


def run_agent(number: int, fn, job_id: int | None = None) -> dict:
    """Execute one agent workflow, validate its output shape and record the execution."""
    spec = _N[number]
    t0, started = time.monotonic(), utcnow()
    with session_scope() as s:
        calls0 = s.scalar(select(func.count()).select_from(ProviderCall)) or 0
    status, err, out = "ok", None, {}
    try:
        res = fn()
        ao = res if isinstance(res, AgentOutput) else AgentOutput(**res)
        missing = [k for k in spec.required if k not in ao.data]
        if missing and not ao.abstained:
            raise ValueError(f"agent output failed schema validation; missing keys: {missing}")
        from .research import assert_no_forbidden_language
        assert_no_forbidden_language(ao.summary)
        out = ao.model_dump(mode="json")
        status = "abstained" if ao.abstained else "ok"
    except Exception as e:  # recorded, then re-raised so the job retries
        status, err = "failed", f"{type(e).__name__}: {e}"
        out = {"summary": "failed", "data": {}, "abstained": False, "sources": []}
    with session_scope() as s:
        calls1 = s.scalar(select(func.count()).select_from(ProviderCall)) or 0
        s.add(AgentExecution(agent=spec.id, job_id=job_id, status=status, started_at=started, finished_at=utcnow(),
                             duration_ms=int((time.monotonic() - t0) * 1000), output=out, error=err,
                             provider_calls=max(0, calls1 - calls0)))
    if status == "failed":
        raise RuntimeError(f"{spec.id}: {err}")
    return out


# ---- individual agent workflows (deterministic)
def a02_data(season: str | None = None) -> dict:
    seasons = [season] if season else get_settings().season_list[-1:]
    tot = {"games_listed": 0, "boxes_ingested": 0, "boxes_pending": 0, "failed": []}
    for sn in seasons:
        r = ingestion.ingest_results(sn)
        for k in ("games_listed", "boxes_ingested", "boxes_pending"):
            tot[k] += r[k]
        tot["failed"] += r["failed"]
    with session_scope() as s:
        dup = s.execute(text("select count(*) from (select game_date, home_team_id, away_team_id from games "
                             "group by 1,2,3 having count(*)>1) x")).scalar()
        bad = s.scalar(select(func.count()).select_from(PlayerBox).where((PlayerBox.minutes > 70) | (PlayerBox.pts < 0)))
        orphan = s.scalar(select(func.count()).select_from(Game).where(Game.status == "final", Game.box_ingested_at.is_(None),
                                                                      Game.game_date < ingestion.today_et() - timedelta(days=2)))
    try:
        tot["starters"] = ingestion.ingest_confirmed_starters(ingestion.today_et() - timedelta(days=10), max_games=60)
    except ProviderError as e:
        tot["starters"] = {"error": str(e)}
    tot["quality"] = {"duplicate_games": int(dup or 0), "implausible_box_rows": int(bad or 0),
                      "final_games_missing_box_over_2d": int(orphan or 0)}
    return {"summary": f"{tot['boxes_ingested']} box scores ingested; {tot['boxes_pending']} pending; "
                       f"quality {tot['quality']}", "data": tot, "sources": ["pbpstats"]}


def _frames(d: date):
    with session_scope() as s:
        return M.load_player_frame(s, before=d), M.load_games_frame(s, before=d)


def a03_players(d: date) -> dict:
    pf, _ = _frames(d)
    if pf.empty:
        return {"summary": "no box-score history", "data": {}, "abstained": True}
    f = M.live_player_features(pf, d)
    f = f[(f["n_games"] >= 10) & (f["proj_min"] >= 20)]
    f = f.assign(delta=f["l10_pts"] - f["avg_pts"])
    movers = [{"player_id": int(r.player_id), "l10_pts": round(r.l10_pts, 1), "season_pts": round(r.avg_pts, 1),
               "n_games": int(r.n_games), "note": "recent form differs from long-run average; regression toward the "
               "long-run rate is expected"} for r in f.reindex(f["delta"].abs().sort_values(ascending=False).index).head(15).itertuples()]
    return {"summary": f"{len(f)} rotation players profiled; {len(movers)} largest form deviations flagged (not predictions)",
            "data": {"players": int(len(f)), "movers": movers}, "sources": ["pbpstats"]}


def a05_rotation(d: date) -> dict:
    pf, _ = _frames(d)
    if pf.empty:
        return {"summary": "no box-score history", "data": {}, "abstained": True}
    g = pf.groupby("player_id")["minutes"]
    l5, l20, n = g.apply(lambda x: x.tail(5).mean()), g.apply(lambda x: x.tail(20).mean()), g.size()
    sd = g.apply(lambda x: x.tail(10).std())
    last = pf.groupby("player_id")["game_date"].max()
    act = last >= pd.Timestamp(d) - pd.Timedelta(days=14)
    chg = (l5 - l20)[act & (n >= 10)]
    role = [{"player_id": int(i), "l5_min": round(float(l5[i]), 1), "l20_min": round(float(l20[i]), 1)}
            for i in chg[chg.abs() >= 6].sort_values().index]
    vol = [{"player_id": int(i), "min_sd_l10": round(float(v), 1)} for i, v in sd[act & (n >= 10) & (sd >= 8)].items()]
    from .lineups import refresh_lineups
    lu = refresh_lineups(d)
    return {"summary": f"lineups: {lu['confirmed']} confirmed, {lu['projected']} projected, {lu['unknown']} unknown, "
                       f"{len(lu['changes'])} changes; {len(role)} players with a ≥6-minute role change; {len(vol)} with volatile minutes",
            "data": {"role_changes": role[:60], "volatile": vol[:60], "lineups": lu}, "sources": ["pbpstats", "espn"]}


def _today_games(d: date):
    with session_scope() as s:
        return [(g.id, g.home_team_id, g.away_team_id) for g in s.scalars(select(Game).where(Game.game_date == d))]


def a06_matchups(d: date) -> dict:
    _, gf = _frames(d)
    games = _today_games(d)
    if gf.empty or not games:
        return {"summary": "no games or no history", "data": {"games": []}, "abstained": not games}
    st = M.live_team_state(gf, d)
    rows = []
    for gid, h, a in games:
        th, ta = st["teams"].get(h), st["teams"].get(a)
        if th and ta:
            rows.append({"game_id": gid, "home_off": round(th["off"], 1), "home_def": round(th["deff"], 1),
                         "away_off": round(ta["off"], 1), "away_def": round(ta["deff"], 1),
                         "n_home": th["n"], "n_away": ta["n"], "league_off": round(st["league"]["off"], 1)})
    return {"summary": f"rating matchups computed for {len(rows)} games (shrunk, decayed ratings; no positional data)",
            "data": {"games": rows}, "sources": ["pbpstats"]}


def a07_environment(d: date) -> dict:
    _, gf = _frames(d)
    games = _today_games(d)
    with session_scope() as s:
        mv = s.scalar(select(ModelVersion).where(ModelVersion.family == "team_game").order_by(ModelVersion.id.desc()).limit(1))
        params = mv.params if mv else None
    if gf.empty or not games or not params:
        return {"summary": "no games, history or team model", "data": {"games": []}, "abstained": True}
    st = M.live_team_state(gf, d)
    rows = []
    for gid, h, a in games:
        p = M.predict_game(st, params, h, a)
        if p:
            from scipy import stats as sps
            rows.append({"game_id": gid, "pace": round(p["pace"], 1), "total": round(p["mu_total"], 1),
                         "total_sd": round(p["sd_total"], 1), "margin": round(p["mu_margin"], 1),
                         "p_margin_over_20": round(float(2 * sps.norm.sf(20, abs(p["mu_margin"]), p["sd_margin"])), 3)})
    return {"summary": f"game environments projected for {len(rows)} games", "data": {"games": rows}, "sources": ["pbpstats"]}


def a08_schedule(d: date) -> dict:
    _, gf = _frames(d)
    games = _today_games(d)
    if gf.empty:
        return {"summary": "no history", "data": {}, "abstained": True}
    t = M.team_long(gf)
    t["rest"] = t.groupby("team")["game_date"].diff().dt.days
    t["margin"] = t["pts"] - t["opp_pts"]
    b2b, rested = t[t["rest"] == 1]["margin"], t[t["rest"] >= 2]["margin"]
    eff = None
    if len(b2b) >= 30 and len(rested) >= 30:
        diff = float(b2b.mean() - rested.mean())
        se = float(np.sqrt(b2b.var() / len(b2b) + rested.var() / len(rested)))
        eff = {"margin_diff_b2b_vs_rested": round(diff, 2), "se": round(se, 2), "n_b2b": int(len(b2b)),
               "distinguishable_from_zero": bool(abs(diff) > 1.96 * se),
               "note": "raw difference, not adjusted for opponent or home/away; not used as a model feature"}
    last = t.groupby("team")["game_date"].max()
    today = [{"game_id": gid, "team_id": tid} for gid, h, a in games for tid in (h, a)
             if tid in last.index and (pd.Timestamp(d) - last[tid]).days == 1]
    return {"summary": f"{len(today)} teams on a back-to-back today; rest effect {eff}",
            "data": {"back_to_backs": today, "rest_effect": eff}, "sources": ["pbpstats"]}


def a09_history() -> dict:
    with session_scope() as s:
        rows = s.execute(text(
            "select g.season, count(*) games, count(g.box_ingested_at) boxes, min(g.game_date), max(g.game_date), "
            "avg(g.home_points+g.away_points)::float, avg((g.home_poss+g.away_poss)/2.0)::float "
            "from games g where g.status='final' group by 1 order by 1")).all()
    cov = [{"season": r[0], "games": r[1], "games_with_box": r[2], "first_date": str(r[3]), "last_date": str(r[4]),
            "avg_total_points": r[5] and round(r[5], 1), "avg_possessions": r[6] and round(r[6], 1)} for r in rows]
    return {"summary": f"historical coverage: {cov}", "data": {"coverage": cov}, "sources": ["pbpstats", "espn"]}


def a10_market(dates: list[date]) -> dict:
    tot = {"games": 0, "odds_rows_appended": 0, "props": None}
    for d in dates:
        r = ingestion.ingest_slate(d)
        tot["games"] += r["games"]; tot["odds_rows_appended"] += r["odds_rows_appended"]
    tot["props"] = ingestion.ingest_player_props(dates[0])
    try:
        from .kalshi import observe
        k = observe()
        tot["kalshi"] = {x: k[x] for x in ("markets_seen", "markets_new", "snapshots", "quotes_appended", "normalized", "unsupported")}
        tot["odds_rows_appended"] += k["quotes_appended"]
    except Exception as e:  # recorded, never substituted
        tot["kalshi"] = {"error": str(e)[:160]}
    with session_scope() as s:
        mv = s.execute(text(
            "select game_id, market, side, min(line), max(line), count(*) from odds_snapshots o "
            "join games g on g.id=o.game_id where g.game_date = :d and line is not null "
            "group by 1,2,3 having count(*)>1 and max(line)<>min(line)"), {"d": dates[0]}).all()
    tot["moves"] = [{"game_id": r[0], "market": r[1], "side": r[2], "min_line": r[3], "max_line": r[4], "snapshots": r[5]} for r in mv]
    return {"summary": f"{tot['games']} games on the slate; {tot['odds_rows_appended']} new quote snapshots; "
                       f"{len(tot['moves'])} observed line moves; Kalshi: {tot['kalshi']}", "data": tot,
            "sources": ["kalshi", "espn", "oddsapi" if tot["props"].get("available") else "oddsapi (not configured)"]}


def a14_simulation() -> dict:
    """Re-run stored combination simulations from their recorded seeds; they must reproduce exactly."""
    from .research import evaluate_combo
    checked, ok, conv = 0, 0, []
    with session_scope() as s:
        combos = list(s.scalars(select(Combo).order_by(Combo.id.desc()).limit(5)))
        for c in combos:
            sels = [s.get(Selection, i) for i in c.leg_selection_ids]
            games = {g.id: g for g in s.scalars(select(Game).where(Game.id.in_({x.game_id for x in sels})))}
            ctx_corr = s.scalar(select(M.ModelEvaluation).where(M.ModelEvaluation.kind == "correlation",
                                                              M.ModelEvaluation.created_at <= c.created_at)
                                .order_by(M.ModelEvaluation.id.desc()).limit(1))
            tm = M.production_model(s, "team_game")
            if c.correlation.get("seed") is None:
                continue
            a = evaluate_combo(sels, games, ctx_corr.metrics if ctx_corr else None, tm.params if tm else None,
                               c.correlation["draws"], c.correlation["seed"])["joint"]
            b = evaluate_combo(sels, games, ctx_corr.metrics if ctx_corr else None, tm.params if tm else None,
                               c.correlation["draws"] * 4, c.correlation["seed"] + 1)["joint"]
            checked += 1
            ok += abs(a["joint"] - c.joint_prob) < 1e-12
            conv.append({"uid": c.uid, "stored": c.joint_prob, "rerun": a["joint"], "4x_draws": b["joint"],
                         "within_3_mc_se": bool(abs(b["joint"] - a["joint"]) <= 3 * a["mc_se"] + 3 * b["mc_se"])})
    return {"summary": f"{ok}/{checked} stored simulations reproduced exactly from their seeds",
            "data": {"reproducible": ok == checked, "checked": checked, "convergence": conv},
            "abstained": checked == 0}


def a18_audit() -> dict:
    """Leakage check: features for early games must not change when later data is perturbed."""
    with session_scope() as s:
        pf = M.load_player_frame(s)
        models = [{"family": m.family, "name": m.name, "version": m.version, "status": m.status,
                   "promoted_by": m.promoted_by, "created_by": m.created_by} for m in s.scalars(select(ModelVersion))]
    if pf.empty or pf["game_date"].nunique() < 20:
        return {"summary": "insufficient data to audit", "data": {}, "abstained": True}
    cut = pf["game_date"].sort_values().unique()[int(pf["game_date"].nunique() * 0.6)]
    a = M.build_player_backtest_frame(pf)
    pert = pf.copy()
    late = pert["game_date"] > cut
    pert.loc[late, M.PLAYER_STATS] = pert.loc[late, M.PLAYER_STATS] * 3 + 7
    pert.loc[late, "minutes"] = 5.0
    b = M.build_player_backtest_frame(pert)
    cols = [f"mu_{st}" for st in M.PLAYER_STATS] + ["proj_min"]
    ea = a[a["game_date"] <= cut].set_index(["game_id", "player_id"])[cols]
    eb = b[b["game_date"] <= cut].set_index(["game_id", "player_id"])[cols].reindex(ea.index)
    leak_ok = bool(np.allclose(ea.to_numpy(), eb.to_numpy(), equal_nan=True))
    self_promoted = [m for m in models if m["status"] == "production" and m["promoted_by"] == m["created_by"]]
    return {"summary": f"leakage check {'passed' if leak_ok else 'FAILED'} on {len(ea)} early rows; "
                       f"{len(self_promoted)} self-promoted models", "data": {
        "leakage_check": {"passed": leak_ok, "rows_compared": int(len(ea))}, "models": models,
        "self_promoted": self_promoted}}


# ---------------------------------------------------------------- job handlers
def _refresh_inputs(d: date, job_id):
    """Market + injury refresh. A provider outage is recorded and the edition proceeds on stale data, which the
    risk officer then rejects on freshness grounds (fail safe, never fabricate)."""
    errs = []
    for num, fn in ((10, lambda: a10_market([d])), (4, lambda: _inj()), (5, lambda: a05_rotation(d))):
        try:
            run_agent(num, fn, job_id)
        except Exception as e:
            errs.append(str(e))
    return errs


def _inj():
    r = ingestion.ingest_injuries()
    return {"summary": f"{r['rows']} injury rows snapshotted from ESPN; {r['unmatched_players']} not matched to a known player",
            "data": r, "sources": ["espn"]}


def job_edition(args: dict, job_id=None) -> dict:
    from .research import RISK_POLICY, publish_edition
    d = date.fromisoformat(args["date"]) if args.get("date") else ingestion.today_et()
    kind = args.get("kind", "morning")
    errs = _refresh_inputs(d, job_id)
    res: dict = {}

    def chief():
        nonlocal res
        res = publish_edition(d, kind)
        return {"summary": f"edition {res['edition']}: {res['selections']} markets evaluated, {res['qualified']} qualified, "
                           f"{res['combos']} combinations", "data": {"edition": res["edition"], "counts": res["counts"],
                                                                     "input_errors": errs}}
    run_agent(1, chief, job_id)
    c = res["counts"]
    run_agent(16, lambda: {"summary": f"evaluated {c['markets_analyzed']} candidates under {RISK_POLICY['version']}; "
                                      f"{c.get('rejected', 0) + c.get('insufficient_evidence', 0)} rejected",
                           "data": {"evaluated": c["markets_analyzed"], "policy": RISK_POLICY["version"],
                                    "rejected": c.get("rejected", 0) + c.get("insufficient_evidence", 0),
                                    "watchlist": c.get("watchlist", 0), "qualified": c["qualified"]}}, job_id)
    run_agent(15, lambda: {"summary": f"{res['combos']} candidate combinations from {res['qualified']} qualified selections",
                           "data": {"combos": res["combos"], "by_engine": {k: v for k, v in c.items() if k.startswith("combo_")}},
                           "abstained": res["qualified"] < 2}, job_id)
    return res


def job_settlement(args: dict, job_id=None) -> dict:
    from .ledger import settle_date
    from .research import publish_edition
    today = ingestion.today_et()
    target = date.fromisoformat(args["date"]) if args.get("date") else today - timedelta(days=1)
    try:
        ingestion.ingest_slate(target)  # final scores/status from the schedule provider
    except ProviderError:
        pass
    data_out = run_agent(2, a02_data, job_id)
    out = {"dates": [], "data": data_out["data"]["quality"]}

    def settle():
        tot = {"settled": 0, "unresolved": 0, "prediction_outcomes": 0}
        with session_scope() as s:
            open_dates = set(s.scalars(select(PaperTicket.game_date).where(
                PaperTicket.game_date >= target - timedelta(days=7), PaperTicket.game_date <= target).distinct()))
        for dd in sorted(open_dates | {target}):
            r = settle_date(dd)
            out["dates"].append(r)
            for k in tot:
                tot[k] += r.get(k, 0)
        return {"summary": f"settled {tot['settled']} paper tickets, {tot['unresolved']} unresolved, "
                           f"{tot['prediction_outcomes']} prediction outcomes recorded", "data": tot}
    run_agent(17, settle, job_id)
    with session_scope() as s:
        has = s.scalar(select(func.count()).select_from(Edition).where(Edition.game_date == target))
        fin = s.scalar(select(func.count()).select_from(Edition).where(Edition.game_date == target, Edition.kind == "final"))
        all_final = not s.scalar(select(func.count()).select_from(Game).where(Game.game_date == target, Game.status.in_(("scheduled", "live"))))
    if has and not fin and all_final:
        out["final_edition"] = publish_edition(target, "final")["edition"]
    return out


def job_historical(args: dict, job_id=None) -> dict:
    a = run_agent(2, a02_data, job_id)
    b = run_agent(9, a09_history, job_id)
    return {"data": a["summary"], "history": b["summary"]}


def job_morning(args: dict, job_id=None) -> dict:
    d = ingestion.today_et()
    out = {}
    for ahead in range(2, 8):  # schedule for the week ahead (one call per day) so "next game" is always known
        try:
            ingestion.ingest_slate(d + timedelta(days=ahead))
        except ProviderError:
            pass
    for num, fn in ((10, lambda: a10_market([d, d + timedelta(days=1)])), (4, _inj), (3, lambda: a03_players(d)),
                    (5, lambda: a05_rotation(d)), (6, lambda: a06_matchups(d)), (7, lambda: a07_environment(d)),
                    (8, lambda: a08_schedule(d))):
        try:
            out[_N[num].id] = run_agent(num, fn, job_id)["summary"]
        except Exception as e:
            out[_N[num].id] = f"FAILED: {e}"
    if all(str(v).startswith("FAILED") for v in out.values()):
        raise RuntimeError("all morning intelligence agents failed")
    return out


def job_live_status(args: dict, job_id=None) -> dict:
    d = ingestion.today_et()
    return {"today": ingestion.ingest_slate(d), "yesterday": ingestion.ingest_slate(d - timedelta(days=1))}


def job_weekly(args: dict, job_id=None) -> dict:
    from .ledger import forward_review
    rep: dict = {}

    def evaluate():
        nonlocal rep
        rep = M.run_all_backtests(register=True)
        return rep
    def p11():
        evaluate()
        if rep.get("status") == "abstained":
            return {"summary": rep["reason"], "data": {}, "abstained": True}
        return {"summary": "player model walk-forward: " + ", ".join(f"{k} {'pass' if v['passed'] else 'FAIL'}" for k, v in rep["player"].items()),
                "data": {"families": rep["player"]}}
    run_agent(11, p11, job_id)
    if rep.get("status") != "abstained":
        t = rep["team"]
        run_agent(12, lambda: {"summary": f"team model walk-forward {'pass' if t['passed'] else 'FAIL'}: margin MAE "
                                          f"{t['margin_mae']:.2f} vs baseline {t['margin_mae_baseline']:.2f}",
                               "data": {k: v for k, v in t.items()}}, job_id)
        run_agent(13, lambda: {"summary": f"correlation validation: copula abs error {rep['correlation']['validation']['abs_error_copula']:.4f} "
                                          f"vs independence {rep['correlation']['validation']['abs_error_independence']:.4f}",
                               "data": rep["correlation"]}, job_id)
    run_agent(14, a14_simulation, job_id)
    run_agent(18, a18_audit, job_id)
    fr = forward_review()
    return {"backtests": {k: (v if k != "player" else {s_: x["passed"] for s_, x in v.items()}) for k, v in rep.items()
                          if k in ("player", "status")}, "forward_review": fr}


def job_monthly(args: dict, job_id=None) -> dict:
    with session_scope() as s:
        prov = ingestion.provider_status(s)
        dead = s.scalar(select(func.count()).select_from(Job).where(Job.status == "dead"))
        s.add(ResearchEvent(kind="monthly_review", actor="scheduler", detail={
            "providers": [{k: (str(v) if isinstance(v, datetime) else v) for k, v in p.items()} for p in prov],
            "dead_letter_jobs": int(dead or 0),
            "checklist": ["review provider terms and licensing (DATA-SOURCES.md)", "review dependency advisories",
                          "verify a backup restore (RUNBOOK.md)", "review model cards against latest evaluations"]}))
    return {"providers": len(prov), "dead_letter_jobs": int(dead or 0)}


def job_market_watch(args: dict, job_id=None) -> dict:
    """Kalshi observation pass: discover contracts and append price observations (read-only)."""
    from .kalshi import observe
    res: dict = {}

    def run():
        nonlocal res
        res = observe()
        return {"summary": f"Kalshi: {res['markets_seen']} contracts seen ({res['markets_new']} new), {res['snapshots']} price "
                           f"observations appended, {res['normalized']} normalised, {res['unsupported']} tracked-only, "
                           f"{len(res['series_failed'])} series failed",
                "data": {"games": res["markets_seen"], "odds_rows_appended": res["quotes_appended"], "moves": res["snapshots"], **res},
                "sources": ["kalshi"], "abstained": res["series_ok"] == 0}
    run_agent(10, run, job_id)
    return res


def job_availability_watch(args: dict, job_id=None) -> dict:
    """Injury + lineup refresh between editions. A material change queues an 'update' edition; earlier editions stay."""
    d = ingestion.today_et()
    inj = run_agent(4, _inj, job_id)["data"]
    lu = {}
    try:
        lu = run_agent(5, lambda: a05_rotation(d), job_id)["data"].get("lineups", {})
    except Exception as e:
        lu = {"error": str(e)[:120]}
    material = inj.get("material_changes", 0) + len(lu.get("changes", []) if isinstance(lu, dict) else [])
    queued = False
    if material:
        now = utcnow()
        with session_scope() as s:
            open_games = s.scalar(select(func.count()).select_from(Game).where(Game.game_date == d, Game.status == "scheduled",
                                                                               Game.tipoff_utc > now))
        if open_games:
            bucket = now.replace(minute=now.minute - now.minute % 10, second=0, microsecond=0)
            queued = enqueue("edition", {"kind": "update", "date": d.isoformat()}, f"edition:update:{bucket:%Y%m%dT%H%M}")
    return {"injury_changes": inj.get("changes", 0), "material_changes": material, "edition_queued": queued}


HANDLERS = {"market_watch": job_market_watch, "availability_watch": job_availability_watch, "edition": job_edition, "settlement": job_settlement, "historical_research": job_historical,
            "morning_intel": job_morning, "live_status": job_live_status, "weekly_evaluation": job_weekly,
            "monthly_review": job_monthly}

# name, hour, minute (America/New_York), day-of-week (0=Mon) or None, day-of-month or None, args, description
SCHEDULE = [
    ("settlement", 4, 0, None, None, {}, "Postgame settlement: results, paper settlement, forecast errors"),
    ("historical_research", 6, 0, None, None, {}, "Historical refresh and data-quality checks"),
    ("morning_intel", 8, 0, None, None, {}, "Morning intelligence: slate, availability, context reviews"),
    ("edition", 10, 0, None, None, {"kind": "morning"}, "Initial research edition"),
    ("edition", 12, 0, None, None, {"kind": "midday"}, "Midday research refresh"),
    ("edition", 15, 0, None, None, {"kind": "afternoon"}, "Afternoon research review"),
    ("weekly_evaluation", 5, 0, 0, None, {}, "Weekly chronological model evaluation, drift and audits"),
    ("monthly_review", 5, 30, None, 1, {}, "Monthly architecture, cost and licensing review"),
]
CATCHUP = timedelta(hours=2)


def due_occurrences(now: datetime) -> list[tuple[str, dict, str]]:
    """(job name, args, dedupe key) for schedule entries whose latest ET occurrence is within the catch-up window."""
    out = []
    now_et = now.astimezone(ET)
    for name, hh, mm, dow, dom, args, _ in SCHEDULE:
        for day in (now_et.date(), now_et.date() - timedelta(days=1)):
            occ = datetime(day.year, day.month, day.day, hh, mm, tzinfo=ET)  # zoneinfo resolves DST
            if dow is not None and occ.weekday() != dow:
                continue
            if dom is not None and occ.day != dom:
                continue
            if occ <= now_et and now_et - occ <= CATCHUP:
                out.append((name, args, f"{name}:{args.get('kind', '')}:{occ:%Y%m%dT%H%M}"))
    return out


def next_run(name: str, args: dict, now: datetime) -> datetime | None:
    now_et = now.astimezone(ET)
    best = None
    for n, hh, mm, dow, dom, a, _ in SCHEDULE:
        if n != name or a != args:
            continue
        for i in range(0, 40):
            day = now_et.date() + timedelta(days=i)
            occ = datetime(day.year, day.month, day.day, hh, mm, tzinfo=ET)
            if occ > now_et and (dow is None or occ.weekday() == dow) and (dom is None or occ.day == dom):
                best = occ if best is None or occ < best else best
                break
    return best


def enqueue(name: str, args: dict | None = None, dedupe_key: str | None = None, run_after: datetime | None = None,
            timeout_s: int = 1800) -> bool:
    """Insert a job unless one with the same dedupe key exists. Returns True if enqueued."""
    key = dedupe_key or f"{name}:manual:{utcnow():%Y%m%dT%H%M%S%f}"
    with session_scope() as s:
        r = s.execute(text(
            "insert into jobs (name, args, dedupe_key, status, attempts, max_attempts, timeout_s, run_after, created_at) "
            "values (:n, cast(:a as jsonb), :k, 'queued', 0, 4, :t, :ra, now()) on conflict (dedupe_key) do nothing"),
            {"n": name, "a": __import__("json").dumps(args or {}), "k": key, "t": timeout_s, "ra": run_after or utcnow()})
        return r.rowcount == 1


def is_paused() -> bool:
    with session_scope() as s:
        return bool((get_setting(s, "paused", {"paused": False}) or {}).get("paused"))


def beat(worker: str, role: str, info: dict | None = None):
    with session_scope() as s:
        hb = s.get(Heartbeat, worker)
        if hb is None:
            s.add(Heartbeat(worker=worker, role=role, beat_at=utcnow(), info=info or {}))
        else:
            hb.beat_at, hb.info = utcnow(), info or {}


def scheduler_tick(now: datetime | None = None) -> list[str]:
    """One scheduler pass. Idempotent: dedupe keys make repeated ticks and multiple schedulers safe."""
    from .research import due_pregame_checks
    now = now or utcnow()
    queued = []
    if is_paused():
        return queued
    for name, args, key in due_occurrences(now):
        if enqueue(name, args, key):
            queued.append(key)
    with session_scope() as s:
        checks = due_pregame_checks(s, now)
        live = s.scalar(select(func.count()).select_from(Game).where(
            Game.status.in_(("scheduled", "live")), Game.tipoff_utc.is_not(None), Game.tipoff_utc <= now,
            Game.tipoff_utc >= now - timedelta(hours=6)))
    if checks:
        bucket = now.astimezone(ET).replace(minute=now.minute - now.minute % 10, second=0, microsecond=0)
        key = f"edition:pregame:{bucket:%Y%m%dT%H%M}"
        if enqueue("edition", {"kind": "pregame", "date": bucket.date().isoformat()}, key):
            queued.append(key)
    cfgs = get_settings()
    with session_scope() as s:
        upcoming = s.scalar(select(func.count()).select_from(Game).where(
            Game.status == "scheduled", Game.tipoff_utc.is_not(None), Game.tipoff_utc > now,
            Game.tipoff_utc <= now + timedelta(hours=cfgs.watch_hours_before_tipoff)))
    if upcoming:
        for name, every in (("market_watch", cfgs.kalshi_poll_minutes), ("availability_watch", cfgs.availability_poll_minutes)):
            if every <= 0 or (name == "market_watch" and not cfgs.kalshi_enabled):
                continue
            mins = now.hour * 60 + now.minute
            bucket = now.replace(hour=(mins - mins % every) // 60, minute=(mins - mins % every) % 60, second=0, microsecond=0)
            key = f"{name}::{bucket:%Y%m%dT%H%M}"
            if enqueue(name, {}, key, timeout_s=600):
                queued.append(key)
    if live:
        bucket = now.replace(minute=now.minute - now.minute % 30, second=0, microsecond=0)
        key = f"live_status::{bucket:%Y%m%dT%H%M}"
        if enqueue("live_status", {}, key, timeout_s=300):
            queued.append(key)
    return queued


def scheduler_loop(interval: float = 30.0):
    name = f"scheduler@{socket.gethostname()}"
    while True:
        try:
            q = scheduler_tick()
            beat(name, "scheduler", {"queued": q, "paused": is_paused()})
        except Exception:
            traceback.print_exc()
        time.sleep(interval)


class JobTimeout(Exception):
    pass


def recover_stale(now: datetime | None = None) -> int:
    """Jobs left 'running' by a crashed worker are returned to the queue (or dead-lettered)."""
    now = now or utcnow()
    n = 0
    with session_scope() as s:
        for j in s.scalars(select(Job).where(Job.status == "running").with_for_update(skip_locked=True)):
            if j.locked_at and (now - j.locked_at).total_seconds() > j.timeout_s + 120:
                j.status = "dead" if j.attempts >= j.max_attempts else "queued"
                j.error = "worker lost (stale lock recovered)"
                j.locked_by = None
                n += 1
    return n


def claim(worker: str) -> int | None:
    with session_scope() as s:
        running = select(Job.name).where(Job.status == "running")
        j = s.scalar(select(Job).where(Job.status == "queued", Job.run_after <= utcnow(), Job.name.not_in(running))
                     .order_by(Job.run_after, Job.id).limit(1).with_for_update(skip_locked=True))
        if j is None:
            return None
        j.status, j.locked_by, j.locked_at, j.started_at = "running", worker, utcnow(), utcnow()
        j.attempts += 1
        return j.id


def execute(job_id: int, use_alarm: bool = True) -> str:
    with session_scope() as s:
        j = s.get(Job, job_id)
        name, args, timeout_s, attempts, max_attempts = j.name, j.args or {}, j.timeout_s, j.attempts, j.max_attempts
    handler = HANDLERS.get(name)
    status, result, err = "done", None, None

    def _alarm(*_):
        raise JobTimeout(f"job exceeded {timeout_s}s")
    try:
        if handler is None:
            raise KeyError(f"unknown job '{name}'")
        if use_alarm:
            signal.signal(signal.SIGALRM, _alarm)
            signal.alarm(timeout_s)
        result = handler(args, job_id)
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        status = "dead" if attempts >= max_attempts or isinstance(e, KeyError) else "queued"
    finally:
        if use_alarm:
            signal.alarm(0)
    with session_scope() as s:
        j = s.get(Job, job_id)
        j.status, j.error, j.locked_by = status, err, None
        j.result = __import__("json").loads(__import__("json").dumps(result, default=str)) if result is not None else None
        j.finished_at = utcnow()
        if status == "queued":  # retry with exponential backoff
            j.run_after = utcnow() + timedelta(seconds=min(3600, 60 * 2 ** attempts))
    return status


def worker_loop(poll: float = 5.0, once: bool = False):
    name = f"worker@{socket.gethostname()}:{os.getpid()}"
    while True:
        try:
            beat(name, "worker")
            recover_stale()
            jid = claim(name)
            if jid is not None:
                execute(jid)
                continue
        except Exception:
            traceback.print_exc()
        if once:
            return
        time.sleep(poll)


def run_inline(name: str, args: dict | None = None) -> dict:
    return HANDLERS[name](args or {}, None)


def operations_status() -> dict:
    now = utcnow()
    with session_scope() as s:
        hbs = [{"worker": h.worker, "role": h.role, "beat_at": h.beat_at,
                "alive": (now - h.beat_at).total_seconds() < 120} for h in s.scalars(select(Heartbeat))]
        jobs = [{"id": j.id, "name": j.name, "status": j.status, "attempts": j.attempts, "created_at": j.created_at,
                 "finished_at": j.finished_at, "error": j.error}
                for j in s.scalars(select(Job).order_by(Job.id.desc()).limit(40))]
        dead = s.scalar(select(func.count()).select_from(Job).where(Job.status == "dead")) or 0
        paused = bool((get_setting(s, "paused", {"paused": False}) or {}).get("paused"))
    sched = [{"name": f"{n}{':' + a['kind'] if a.get('kind') else ''}", "description": desc,
              "next_run_et": (next_run(n, a, now) or now).isoformat()} for n, _, _, _, _, a, desc in SCHEDULE]
    sched.append({"name": "edition:pregame", "description": "Pregame checkpoints ~90/60/30/10 minutes before each tipoff",
                  "next_run_et": None})
    return {"paused": paused, "heartbeats": hbs, "schedule": sched, "recent_jobs": jobs, "dead_letter": int(dead)}


def agents_status() -> list[dict]:
    now = utcnow()
    trig = {1: ("edition", {"kind": "morning"}), 2: ("settlement", {}), 3: ("morning_intel", {}), 4: ("morning_intel", {}),
            5: ("morning_intel", {}), 6: ("morning_intel", {}), 7: ("morning_intel", {}), 8: ("morning_intel", {}),
            9: ("historical_research", {}), 10: ("morning_intel", {}), 11: ("weekly_evaluation", {}),
            12: ("weekly_evaluation", {}), 13: ("weekly_evaluation", {}), 14: ("weekly_evaluation", {}),
            15: ("edition", {"kind": "morning"}), 16: ("edition", {"kind": "morning"}), 17: ("settlement", {}),
            18: ("weekly_evaluation", {})}
    out = []
    with session_scope() as s:
        for a in AGENTS:
            last = s.scalar(select(AgentExecution).where(AgentExecution.agent == a.id).order_by(AgentExecution.id.desc()).limit(1))
            ok = s.scalar(select(AgentExecution).where(AgentExecution.agent == a.id, AgentExecution.status != "failed")
                          .order_by(AgentExecution.id.desc()).limit(1))
            cands = [next_run(n, ar, now) for n, _, _, _, _, ar, _ in SCHEDULE if n == trig[a.number][0]]
            nxt = min([c for c in cands if c], default=None)
            out.append({"id": a.id, "number": a.number, "name": a.name, "role": a.role, "trigger": a.trigger,
                        "deterministic": True, "status": last.status if last else "never_run",
                        "last_execution_at": last.finished_at if last else None,
                        "last_success_at": ok.finished_at if ok else None,
                        "duration_ms": last.duration_ms if last else None,
                        "last_summary": (ok.output or {}).get("summary") if ok else None,
                        "error": last.error if last else None, "next_run_at": nxt,
                        "provider_calls": last.provider_calls if last else 0})
    return out


__all__ = ["AGENTS", "HANDLERS", "SCHEDULE", "enqueue", "scheduler_tick", "worker_loop", "scheduler_loop",
           "PaperSettlement", "update"]
