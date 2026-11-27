"""Research engine: selections, the independent risk officer (GIZER GUARD), combination engines
(GIZER DOUBLE..SIX, SGP, CROSS) and versioned daily editions.

Everything here is deterministic. No LLM output is ever used as a probability. A slate with zero
qualified selections is a valid, successful outcome.
"""
from __future__ import annotations

import hashlib
import itertools
import json
from datetime import date, datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import func, select, text

from . import modeling as M
from .config import ET, get_settings
from .db import (Combo, Edition, Game, ModelEvaluation, OddsSnapshot, PaperTicket, Player, PlayerBox,
                 Prediction, ProviderCall, ResearchEvent, Selection, Team, session_scope, utcnow)
from .ingestion import latest_injuries
from .simulation import joint_probability, seed_for

QUALIFIED = ("high_confidence", "standard")
ENGINES = {2: "DOUBLE", 3: "TRIPLE", 4: "QUAD", 5: "FIVE", 6: "SIX"}
FORBIDDEN_PHRASES = ("guaranteed", "free money", "risk-free", "risk free", "cannot lose", "can't lose", "lock of",
                     "sure thing")

# Version-controlled risk policy. Changing it requires a commit; no agent or LLM can alter it at runtime.
RISK_POLICY = {
    "version": "gizer-risk-1.2",
    # Owner decision D-037: the ranked "top picks" (and everything built from them: combinations, automatic paper
    # tickets) contain only selections the model gives at least this probability. Every other gate still applies.
    "top_picks": {"min_prob": 0.65, "max_per_game": 5},
    "qualifying_price_band": [0.15, 0.85],  # break-even outside this band cannot rise above watchlist
    "max_quote_age_hours": 12, "fresh_quote_hours": 3,
    "max_injury_age_hours": 8, "max_box_staleness_days": 3,
    "min_team_games": 10, "min_player_games": 10, "min_calibration_bin_n": 30,
    "max_plausible_edge": 0.10,
    "standard": {"min_evidence": 65, "min_edge_low": 0.0},
    "watchlist": {"min_evidence": 50, "min_edge": 0.0},
    "high_confidence": {"min_evidence": 85, "min_edge_low": 0.02, "min_forward_settled": 200,
                        "max_forward_calibration_gap": 0.04},
    "combo": {"pool_size": 10, "max_per_engine": 12, "min_evidence": 60, "sgp_per_game_per_size": 2},
    "auto_paper": {"singles": True, "combos_per_engine": 3},
    "unavailable_statuses": ["out", "suspension", "injured reserve"],
    "uncertain_statuses": ["day-to-day", "questionable", "doubtful", "probable", "gtd"],
    "rotation_minutes": 24,
}
MARKET_STAT = {f"player_{s}": s for s in M.PLAYER_STATS}
STAT_LABEL = {"pts": "PTS", "reb": "REB", "ast": "AST", "fg3m": "3PM", "stl": "STL", "blk": "BLK", "tov": "TOV",
              "pra": "PTS+REB+AST", "pr": "PTS+REB", "pa": "PTS+AST", "ra": "REB+AST"}
STAT_NAME = {"pts": "Points", "reb": "Rebounds", "ast": "Assists", "fg3m": "Three-pointers made", "stl": "Steals",
             "blk": "Blocks", "tov": "Turnovers", "pra": "Points + Rebounds + Assists", "pr": "Points + Rebounds",
             "pa": "Points + Assists", "ra": "Rebounds + Assists"}


def american_to_decimal(a: int) -> float:
    return 1 + (a / 100 if a > 0 else 100 / -a)


def decimal_to_american(d: float) -> int:
    return int(round((d - 1) * 100)) if d >= 2 else int(round(-100 / (d - 1)))


def _hours(a: datetime, b: datetime) -> float:
    return (a - b).total_seconds() / 3600


# ---------------------------------------------------------------- context
class SlateContext:
    """Everything known at `now` for one ET date. Built once per edition."""

    def __init__(self, s, d: date, now: datetime | None = None):
        self.s, self.date, self.now = s, d, now or utcnow()
        self.teams = {t.id: t for t in s.scalars(select(Team))}
        self.games = list(s.scalars(select(Game).where(Game.game_date == d).order_by(Game.tipoff_utc, Game.id)))
        self.injuries = latest_injuries(s, self.now)
        self.injury_at = max((i.ingested_at for i in self.injuries), default=None)
        self.inj_by_player = {i.player_id: i for i in self.injuries if i.player_id}
        self.inj_by_team: dict[int, list] = {}
        for i in self.injuries:
            self.inj_by_team.setdefault(i.team_id, []).append(i)
        self.models = {f: M.production_model(s, f) for f in ["team_game", *[f"player_{x}" for x in M.PLAYER_STATS]]}
        self.evals = {f: (M.latest_evaluation(s, mv.id) if mv else None) for f, mv in self.models.items()}
        ce = s.scalar(select(ModelEvaluation).where(ModelEvaluation.kind == "correlation")
                      .order_by(ModelEvaluation.id.desc()).limit(1))
        self.corr = ce.metrics if ce else None
        self.last_box_date = s.scalar(select(func.max(PlayerBox.game_date)))
        self.last_final_date = s.scalar(select(func.max(Game.game_date)).where(Game.status == "final", Game.game_date < d))
        self.quote_checked_at = s.scalar(select(func.max(ProviderCall.called_at)).where(
            ProviderCall.provider.in_(("espn", "oddsapi")), ProviderCall.ok.is_(True)))
        self.provider_checked = dict(s.execute(select(ProviderCall.provider, func.max(ProviderCall.called_at)).where(
            ProviderCall.ok.is_(True)).group_by(ProviderCall.provider)).all())
        gf, pf = M.load_games_frame(s, before=d), M.load_player_frame(s, before=d)
        self.team_state = M.live_team_state(gf, d) if not gf.empty else {"teams": {}, "league": None}
        self.player_feats = M.live_player_features(pf, d) if not pf.empty else pd.DataFrame()
        self.players = {p.id: p for p in s.scalars(select(Player))}
        self.forward = forward_validation(s)
        self.hist_cache: dict[int, pd.DataFrame] = {}
        self.withdrawn = {int(x) for x in s.scalars(select(ResearchEvent.ref_id).where(ResearchEvent.kind == "manual_withdrawn"))}
        from .lineups import lineup_status_map
        self.lineups = lineup_status_map(s, [g.id for g in self.games])

    def lineup_of(self, game_id: str, team_id: int | None, player_id: int | None) -> dict:
        snap = self.lineups.get((game_id, team_id))
        if snap is None:
            return {"lineup_role": None, "lineup_status": "unknown"}
        role = next((("starter" if p["role"] == "starter" else "bench") for p in snap.players
                     if p["player_id"] == player_id and p["role"] != "unavailable"), None)
        return {"lineup_role": role, "lineup_status": snap.status}

    def quotes(self, game_id: str) -> list[OddsSnapshot]:
        """Latest snapshot per (market, subject, side, book) at or before now."""
        rows = self.s.scalars(select(OddsSnapshot).where(OddsSnapshot.game_id == game_id,
                                                         OddsSnapshot.ingested_at <= self.now)
                              .order_by(OddsSnapshot.id.desc())).all()
        seen, out = set(), []
        for r in rows:
            if r.id in self.withdrawn:
                continue
            k = (r.market, r.subject_id, r.side, r.book, r.line if r.book == "Kalshi" else None)  # Kalshi lists several thresholds
            if k not in seen:
                seen.add(k); out.append(r)
        return out

    def team_roster(self, team_id: int) -> pd.DataFrame:
        f = self.player_feats
        if f.empty:
            return f
        recent = pd.Timestamp(self.date) - pd.Timedelta(days=21)
        return f[(f["team_id"] == team_id) & (f["last_date"] >= recent)].sort_values("proj_min", ascending=False)

    def availability_flags(self, team_id: int) -> tuple[list[str], list[str]]:
        """(unavailable, uncertain) rotation players for a team per the latest injury snapshot."""
        out, unc = [], []
        roster = self.team_roster(team_id)
        rot = set(roster[roster["proj_min"] >= RISK_POLICY["rotation_minutes"]]["player_id"].astype(int)) if len(roster) else set()
        for i in self.inj_by_team.get(team_id, []):
            if i.player_id not in rot:
                continue
            st = i.status.lower()
            if any(k in st for k in RISK_POLICY["unavailable_statuses"]):
                out.append(i.player_name)
            else:
                unc.append(f"{i.player_name} ({i.status})")
        return out, unc


def forward_validation(s) -> dict:
    """Settled forward (paper) evidence per market group, from the immutable ledger. Used for HIGH-CONFIDENCE."""
    from .ledger import current_settlements
    out: dict[str, dict] = {}
    for t, st in current_settlements(s, kind="single"):
        if st.result not in ("win", "loss") or not t.legs:
            continue
        leg = t.legs[0]
        grp = "team" if leg["market"] in ("spread", "total", "moneyline") else "player"
        key = f"{grp}:{leg.get('model_version_id')}"
        o = out.setdefault(key, {"n": 0, "wins": 0, "p_sum": 0.0})
        o["n"] += 1; o["wins"] += st.result == "win"; o["p_sum"] += leg.get("prob") or 0.0
    return out


# ---------------------------------------------------------------- GIZER GUARD (independent risk officer)
def guard(ctx: SlateContext, c: dict) -> dict:
    """Classify one candidate selection. Pure function of documented inputs; returns classification, evidence
    score with components, supporting/opposing evidence and auditable rejection reasons."""
    P = RISK_POLICY
    reasons, support, oppose, comps = [], [], [], []
    hard = False

    def comp(name, score, mx, note):
        comps.append({"name": name, "score": int(score), "max": mx, "note": note})

    mv, ev = c.get("model"), c.get("evaluation")
    if mv is None or ev is None or not ev.passed:
        reasons.append("No validated production model for this market family (RULE 09).")
        hard = True
        comp("Model validation", 0, 25, "no production model")
    else:
        comp("Model validation", 25, 25, f"{mv.name} {mv.version} passed walk-forward gate (n={ev.n_obs})")
        support.append(f"Model {mv.name} {mv.version} passed chronological out-of-sample validation on {ev.n_obs} observations.")

    # data freshness
    fresh = 0
    if ctx.last_box_date and ctx.last_final_date and (ctx.last_final_date - ctx.last_box_date).days <= P["max_box_staleness_days"]:
        fresh += 10
    else:
        reasons.append("Box-score history is stale relative to completed games (RULE 17)."); hard = True
    if ctx.injury_at and _hours(ctx.now, ctx.injury_at) <= P["max_injury_age_hours"]:
        fresh += 10
    else:
        reasons.append("No fresh injury report snapshot; availability cannot be confirmed (RULE 17)."); hard = True
    comp("Data freshness", fresh, 20, f"box scores through {ctx.last_box_date}; injuries at "
         f"{ctx.injury_at.isoformat(timespec='minutes') if ctx.injury_at else 'never'}")

    n = c.get("sample_size") or 0
    min_n = P["min_player_games"] if c["subject_type"] == "player" else P["min_team_games"]
    comp("Sample size", min(20, 20 * n / 30), 20, f"n={n} prior games")
    insufficient = n < min_n
    if insufficient:
        reasons.append(f"Only {n} prior games (minimum {min_n}); estimates are not reliable.")

    q = c.get("quote")
    origin = getattr(q, "origin", None) or "provider"
    if q is not None and origin == "hypothetical":
        reasons.append("Hypothetical research threshold: not a market quote, so it cannot qualify (RULE 05).")
        hard = True
        comp("Market quote", 0, 10, "hypothetical threshold")
    elif q is None or q.price_american is None:
        reasons.append("No verified market quote with a price; price-dependent evaluation unavailable (RULE 05).")
        hard = True
        comp("Market quote", 0, 10, "no quote")
    elif origin == "owner_entered":
        age = _hours(ctx.now, q.ingested_at)
        if age > P["max_quote_age_hours"]:
            reasons.append(f"Owner-entered quote is {age:.0f}h old (max {P['max_quote_age_hours']}h)."); hard = True
        comp("Market quote", 5 if age <= P["max_quote_age_hours"] else 0, 10,
             f"owner-entered quote ({q.book}), not independently verified; entered {age:.1f}h ago")
        oppose.append("The price was entered by the owner and has not been independently verified against a provider.")
    else:
        # freshness is judged against the last successful call to the provider that supplied THIS quote
        checked = getattr(ctx, "provider_checked", {}).get(q.provider) or (ctx.quote_checked_at if q.provider != "kalshi" else None) or q.ingested_at
        age = _hours(ctx.now, max(checked, q.ingested_at))
        if age > P["max_quote_age_hours"]:
            reasons.append(f"Market quote not re-verified for {age:.0f}h (max {P['max_quote_age_hours']}h)."); hard = True
        comp("Market quote", 10 if age <= P["fresh_quote_hours"] else 5 if age <= P["max_quote_age_hours"] else 0, 10,
             f"{q.book} quote verified {age:.1f}h ago")

    # availability
    avail = 10
    for note in c.get("unavailable", []):
        oppose.append(f"Rotation player unavailable: {note}. The model does not adjust for absences.")
        avail = min(avail, 4)
    for note in c.get("uncertain", []):
        oppose.append(f"Unresolved availability: {note}.")
        avail = min(avail, 3)
    if c.get("player_out"):
        reasons.append(f"Player listed {c['player_out']} in the latest injury report."); hard = True; avail = 0
    comp("Availability", avail, 10, "no unresolved rotation availability" if avail == 10 else "availability concerns present")

    prob, iv = c.get("prob"), c.get("interval") or {}
    cal_n = iv.get("n") or 0
    if prob is None:
        reasons.append("Model produced no probability for this market."); hard = True
    if iv.get("low") is None:
        insufficient = True
        reasons.append(f"Calibration evidence too thin near this probability (n={cal_n}); uncertainty cannot be stated.")
    comp("Calibration support", 15 if cal_n >= 200 else 8 if cal_n >= P["min_calibration_bin_n"] else 0, 15,
         f"{cal_n} out-of-sample observations in this probability range")

    score = sum(x["score"] for x in comps)
    be = c.get("breakeven")
    edge = None if prob is None or be is None else prob - be
    edge_low = None if iv.get("low") is None or be is None else iv["low"] - be
    if edge is not None:
        (support if edge > 0 else oppose).append(
            f"Model probability {prob:.1%} vs price break-even {be:.1%} (difference {edge:+.1%}).")
    if c.get("market_validated") is False:
        oppose.append("This model has not been validated against market prices; disagreement with the market is "
                      "more likely model error than opportunity.")
    for x in c.get("support", []):
        support.append(x)
    for x in c.get("oppose", []):
        oppose.append(x)

    if hard:
        fresh_words = ("stale", "No fresh injury", "not re-verified", "old (max")
        cls = "stale" if reasons and all(any(w in r for w in fresh_words) for r in reasons) else "rejected"
    elif insufficient:
        cls = "insufficient_evidence"
    elif edge is not None and abs(edge) > P["max_plausible_edge"]:
        cls = "rejected"
        reasons.append(f"Implausible difference vs market ({edge:+.1%}); treated as model or data error.")
    else:
        fw = ctx.forward.get(f"{'player' if c['subject_type'] == 'player' else 'team'}:{mv.id}", {"n": 0})
        hc = P["high_confidence"]
        fw_ok = fw["n"] >= hc["min_forward_settled"] and abs(fw["wins"] / fw["n"] - fw["p_sum"] / fw["n"]) <= hc["max_forward_calibration_gap"]
        if (score >= hc["min_evidence"] and edge_low is not None and edge_low >= hc["min_edge_low"] and fw_ok
                and avail == 10 and origin == "provider"):
            cls = "high_confidence"
        elif score >= P["standard"]["min_evidence"] and edge_low is not None and edge_low > P["standard"]["min_edge_low"]:
            cls = "standard"
            if not fw_ok:
                oppose.append(f"Not eligible for high-confidence: forward paper evidence is {fw['n']} settled records "
                              f"(requires {hc['min_forward_settled']} with calibration within {hc['max_forward_calibration_gap']:.0%}).")
        elif score >= P["watchlist"]["min_evidence"] and edge is not None and edge > P["watchlist"]["min_edge"]:
            cls = "watchlist"
            reasons.append("Point estimate is above break-even but the uncertainty interval is not; not qualified.")
        else:
            cls = "rejected"
            reasons.append("No positive expected difference versus the quoted price." if (edge or 0) <= 0
                           else f"Evidence quality {score}/100 below the watchlist threshold.")
    lo_b, hi_b = P["qualifying_price_band"]
    if cls in QUALIFIED and be is not None and not (lo_b <= be <= hi_b):
        cls = "watchlist"
        reasons.append(f"Break-even {be:.0%} is outside the {lo_b:.0%}–{hi_b:.0%} band: the model's tail estimates are its least "
                       "reliable, so long-shot and near-certain contracts are not qualified.")
    return {"classification": cls, "evidence_score": score, "edge": edge, "edge_low": edge_low,
            "evidence": {"components": comps, "supporting": support, "opposing": oppose},
            "rejection_reasons": reasons}


# ---------------------------------------------------------------- selection building
def _label(market, side, line, name, abbr) -> str:
    if market == "spread":
        return f"{abbr} {line:+g}"
    if market == "moneyline":
        return f"{abbr} moneyline"
    if market == "total":
        return f"{side.capitalize()} {line:g}"
    return f"{name} {side.capitalize()} {line:g} {STAT_LABEL[MARKET_STAT[market]]}"


def evaluate_game(ctx: SlateContext, g: Game, edition_key: str) -> dict:
    """Predictions + candidate selections for one unstarted game. Returns ORM rows (not yet added)."""
    s = ctx.s
    home, away = ctx.teams[g.home_team_id], ctx.teams[g.away_team_id]
    label = f"{away.abbr} @ {home.abbr}"
    preds, cands = [], []
    tm, tev = ctx.models["team_game"], ctx.evals["team_game"]
    # A team prediction is computed from the registered parameters even for a candidate model so the game
    # environment can be shown, but GUARD rejects any selection that lacks a production model.
    any_tm = tm or s.scalar(select(M.ModelVersion).where(M.ModelVersion.family == "team_game")
                            .order_by(M.ModelVersion.id.desc()).limit(1))
    gp = M.predict_game(ctx.team_state, any_tm.params, g.home_team_id, g.away_team_id) if any_tm else None
    pred_ids: dict[str, Prediction] = {}
    cutoff = ctx.now
    if gp:
        feats = {"home": ctx.team_state["teams"][g.home_team_id], "away": ctx.team_state["teams"][g.away_team_id],
                 "league": ctx.team_state["league"], "pace": gp["pace"], "mu_home": gp["mu_home"], "mu_away": gp["mu_away"]}
        for stat, mu, sd in (("margin", gp["mu_margin"], gp["sd_margin"]), ("total", gp["mu_total"], gp["sd_total"])):
            dist = {"family": "normal", "mu": mu, "sd": sd}
            q = M.dist_quantiles(dist)
            p = Prediction(game_id=g.id, game_date=g.game_date, subject_type="game", subject_id=None, stat=stat,
                           model_version_id=any_tm.id, mean=mu, dist=dist, p10=q[0], p50=q[1], p90=q[2],
                           features=feats, data_cutoff=cutoff, edition_key=edition_key)
            preds.append(p); pred_ids[stat] = p
    unavailable_h, uncertain_h = ctx.availability_flags(g.home_team_id)
    unavailable_a, uncertain_a = ctx.availability_flags(g.away_team_id)
    team_cal = (tev.metrics.get("calibration") if tev else None) or []
    quotes = ctx.quotes(g.id)
    n_team = min(gp["n_home"], gp["n_away"]) if gp else 0

    for q in quotes:
        if q.market not in ("spread", "total", "moneyline"):
            continue
        prob = proj = None
        pred = None
        if gp:
            if q.market == "total":
                over, push = M.prob_over({"family": "normal", "mu": gp["mu_total"], "sd": gp["sd_total"]}, q.line)
                prob = over if q.side == "over" else 1 - over - push
                denom = 1 - push
                prob = prob / denom if denom > 0 else None  # conditional on no push (pushes are refunded)
                proj, pred = gp["mu_total"], pred_ids["total"]
            else:
                line = q.line if q.market == "spread" else 0.0
                sign = 1 if q.side == "home" else -1
                mu = sign * gp["mu_margin"]
                over, push = M.prob_over({"family": "normal", "mu": mu, "sd": gp["sd_margin"]}, -line)
                prob = over / (1 - push) if push < 1 else None
                proj, pred = mu, pred_ids["margin"]
        team = home if q.side == "home" else away if q.side == "away" else None
        support, oppose = [], []
        if gp:
            support.append(f"Projected score {away.abbr} {gp['mu_away']:.1f} – {home.abbr} {gp['mu_home']:.1f} "
                           f"(margin sd {gp['sd_margin']:.1f}, total sd {gp['sd_total']:.1f}).")
            if q.market == "spread":
                gap = abs(gp["mu_margin"] + (q.line if q.side == "home" else -q.line))
                if gap > 0.5 * gp["sd_margin"]:
                    oppose.append(f"Model margin differs from the market line by {gap:.1f} points; large gaps usually "
                                  "reflect information the model lacks.")
        cands.append(dict(
            game=g, label=label, market=q.market, subject_type=q.subject_type,
            subject_id=team.id if team else None, subject_name=team.name if team else label,
            team_id=team.id if team else None, side=q.side, line=q.line, quote=q, prediction=pred, model=tm,
            evaluation=tev, projection=proj, prob=prob,
            interval=M.calibrated_interval(team_cal, prob) if prob is not None else {},
            breakeven=1 / american_to_decimal(q.price_american) if q.price_american is not None else None,
            sample_size=n_team, market_validated=False, support=support, oppose=oppose,
            unavailable=[*unavailable_h, *unavailable_a], uncertain=[*uncertain_h, *uncertain_a],
            market_label=_label(q.market, q.side, q.line, None, team.abbr if team else None)))

    # player predictions (rotation players not listed as unavailable) and any quoted player props
    prop_quotes: dict[tuple, list] = {}
    for q in quotes:
        if q.market in MARKET_STAT:
            prop_quotes.setdefault((q.subject_id, q.market), []).append(q)
    player_pred: dict[tuple, tuple] = {}
    for team in (home, away):
        roster = ctx.team_roster(team.id)
        for r in roster.itertuples():
            pid = int(r.player_id)
            if r.n_games < M.MIN_PRIOR_GAMES or r.proj_min < M.MIN_PROJ_MINUTES:
                continue
            inj = ctx.inj_by_player.get(pid)
            out_status = inj.status if inj and any(k in inj.status.lower() for k in RISK_POLICY["unavailable_statuses"]) else None
            if out_status and not any((pid, m) in prop_quotes for m in MARKET_STAT):
                continue  # no projection is published for a player listed out
            for stat in M.PLAYER_STATS:
                mv = ctx.models[f"player_{stat}"] or s.scalar(
                    select(M.ModelVersion).where(M.ModelVersion.family == f"player_{stat}")
                    .order_by(M.ModelVersion.id.desc()).limit(1))
                if mv is None:
                    continue
                mu = float(getattr(r, f"mu_{stat}"))
                dist = M.player_dist(mu, float(getattr(r, f"rate_{stat}")),
                                     None if pd.isna(r.min_sd) else float(r.min_sd), mv.params)
                qs = M.dist_quantiles(dist)
                feats = {"proj_min": float(r.proj_min), "rate": float(getattr(r, f"rate_{stat}")),
                         "n_games": int(r.n_games), "l10": float(getattr(r, f"l10_{stat}")),
                         "season_avg": float(getattr(r, f"avg_{stat}")), "rest_days": float(r.rest_days),
                         "team_id": team.id, "injury_status": inj.status if inj else None}
                p = Prediction(game_id=g.id, game_date=g.game_date, subject_type="player", subject_id=pid, stat=stat,
                               model_version_id=mv.id, mean=mu, dist=dist, p10=qs[0], p50=qs[1], p90=qs[2],
                               features=feats, data_cutoff=cutoff, edition_key=edition_key)
                if not out_status:
                    preds.append(p)
                player_pred[(pid, stat)] = (p, dist, r, team, inj, out_status)
    for (pid, market), qs in prop_quotes.items():
        stat = MARKET_STAT[market]
        pp = player_pred.get((pid, stat))
        pl = ctx.players.get(pid)
        fam = f"player_{stat}"
        # 1.1+ evaluations carry over/under calibration across many lines; 1.0 only near the last-10 average
        ev_m = ctx.evals[fam].metrics if ctx.evals[fam] else {}
        cal = ev_m.get("calibration_lines") or ev_m.get("calibration") or []
        for q in qs:
            prob = proj = None
            support, oppose = [], []
            if pp:
                p, dist, r, team, inj, out_status = pp
                over, push = M.prob_over(dist, q.line)
                raw = over if q.side == "over" else 1 - over - push
                prob = raw / (1 - push) if push < 1 else None
                proj = dist["mu"]
                support.append(f"Projection {proj:.1f} {STAT_LABEL[stat]} in {r.proj_min:.0f} projected minutes "
                               f"(80% interval {p.p10:.0f}–{p.p90:.0f}); last-10 average {getattr(r, f'l10_{stat}'):.1f}.")
                if (r.min_sd or 0) > 6:
                    oppose.append(f"Minutes have been volatile (sd {r.min_sd:.1f} over the last 10 games).")
            from .history import player_frame, quick_averages
            if pid not in ctx.hist_cache:
                ctx.hist_cache[pid] = player_frame(s, pid, before=ctx.date)
            hist = quick_averages(ctx.hist_cache[pid], stat, ctx.date)
            context = {**{k: hist[k] for k in ("l5", "l10", "l20", "season_avg")},
                       "proj_min": float(pp[2].proj_min) if pp else None,
                       **ctx.lineup_of(g.id, pp[3].id if pp else (pl.team_id if pl else None), pid)}
            if context["lineup_status"] == "projected":
                oppose.append("Starting lineup is projected, not confirmed; minutes assume the usual role.")
            cands.append(dict(
                context=context,
                game=g, label=label, market=market, subject_type="player", subject_id=pid,
                subject_name=pl.name if pl else str(pid), team_id=pp[3].id if pp else (pl.team_id if pl else None),
                side=q.side, line=q.line, quote=q, prediction=pp[0] if pp and not pp[5] else None,
                model=ctx.models[fam], evaluation=ctx.evals[fam], projection=proj, prob=prob,
                interval=M.calibrated_interval(cal, prob) if prob is not None else {},
                breakeven=1 / american_to_decimal(q.price_american) if q.price_american is not None else None,
                sample_size=int(pp[2].n_games) if pp else 0, market_validated=False, support=support, oppose=oppose,
                player_out=pp[5] if pp else None,
                uncertain=[f"{pl.name if pl else pid} ({pp[4].status})"] if pp and pp[4] and not pp[5] else [],
                market_label=_label(market, q.side, q.line, pl.name if pl else str(pid), None)))
    env = None
    if gp:
        env = {"proj_home_points": gp["mu_home"], "proj_away_points": gp["mu_away"], "proj_total": gp["mu_total"],
               "proj_margin": gp["mu_margin"], "proj_pace": gp["pace"],
               "total_p10": pred_ids["total"].p10, "total_p90": pred_ids["total"].p90,
               "model_status": any_tm.status}
    return {"game": g, "label": label, "predictions": preds, "candidates": cands, "environment": env,
            "has_game_quotes": any(q.market in ("spread", "total", "moneyline") for q in quotes),
            "has_prop_quotes": bool(prop_quotes)}


def selection_key(g: Game, c: dict) -> str:
    q = c.get("quote")
    key = f"{g.id}:{c['market']}:{c['subject_id'] or 'game'}:{c['side']}:{q.book if q else '-'}"
    return f"{key}:{q.line:g}" if q is not None and q.book == "Kalshi" and q.line is not None else key


def _rank_key(sel: Selection):
    """Most likely first: the conservative end of the model's probability interval, then the margin over the
    price, then evidence. (Before 1.2 this ranked by margin alone, which pushed long shots to the top.)"""
    order = {"high_confidence": 0, "standard": 1}
    return (order.get(sel.classification, 9), -(sel.prob_low if sel.prob_low is not None else sel.prob or 0),
            -((sel.prob_low or 0) - (sel.breakeven or 0)), -(sel.evidence_score or 0))


def top_pick_eligible(sel: Selection) -> bool:
    return sel.classification in QUALIFIED and sel.prob is not None and sel.prob >= RISK_POLICY["top_picks"]["min_prob"]


# ---------------------------------------------------------------- combination engines
def leg_from_selection(sel, pred_dist: dict | None, game: Game, team_params: dict | None) -> dict:
    """Simulation leg for a selection. `sel` may be an ORM Selection or a dict with the same fields."""
    g = lambda k: sel[k] if isinstance(sel, dict) else getattr(sel, k)  # noqa: E731
    base = {"game_id": g("game_id"), "prob": g("prob"), "prob_low": g("prob_low"), "prob_high": g("prob_high")}
    if g("market") in MARKET_STAT:
        return {**base, "kind": "player", "direction": 1 if g("side") == "over" else -1,
                "player": {"player_id": g("subject_id"), "team_id": g("team_id"), "stat": MARKET_STAT[g("market")]}}
    team = {"home_team_id": game.home_team_id, "away_team_id": game.away_team_id,
            "sd_home": (team_params or {}).get("sd_home", 12.0), "sd_away": (team_params or {}).get("sd_away", 12.0)}
    if g("market") == "total":
        return {**base, "kind": "total", "direction": 1 if g("side") == "over" else -1, "team": team}
    return {**base, "kind": "margin", "direction": 1 if g("side") == "home" else -1, "team": team}


def _conflict(a, b) -> bool:
    """Legs that cannot or should not be combined: opposite sides of one market, or the same team's spread +
    moneyline (near-duplicate exposure)."""
    if a.game_id != b.game_id:
        return False
    if a.market == b.market and a.subject_type != "player" and a.market == "total":
        return True
    if {a.market, b.market} <= {"spread", "moneyline"}:
        return True
    return a.market == b.market and a.subject_id == b.subject_id


def shared_risks(sels, games: dict) -> list[str]:
    out = []
    by_game: dict[str, list] = {}
    for x in sels:
        by_game.setdefault(x.game_id, []).append(x)
    for gid, xs in by_game.items():
        if len(xs) > 1:
            out.append(f"{len(xs)} legs depend on the same game ({xs[0].evidence.get('game_label', gid)}): one unusual "
                       "game script (blowout, overtime, foul trouble) affects all of them.")
    by_team: dict[int, int] = {}
    for x in sels:
        if x.team_id:
            by_team[x.team_id] = by_team.get(x.team_id, 0) + 1
    if any(v > 1 for v in by_team.values()):
        out.append("Multiple legs on the same team share its availability and rotation assumptions.")
    if len(by_game) > 1:
        out.append("Different games are assumed independent; league-wide factors are not modelled.")
    if all(x.market in ("spread", "total", "moneyline") for x in sels):
        out.append("Every leg uses the same team model; a systematic model error would affect all legs together.")
    return out


def evaluate_combo(sels: list, games: dict, corr: dict | None, team_params: dict | None, draws: int, seed: int) -> dict:
    """Joint evaluation of a set of selections (ORM rows). Deterministic for a given seed."""
    warnings = []
    legs = [leg_from_selection(x, None, games[x.game_id], team_params) for x in sels]
    reliable = True
    if any(x.prob is None for x in sels):
        return {"reliable": False, "warnings": ["A leg has no model probability; the joint probability cannot be estimated."]}
    same_game = len({x.game_id for x in sels}) < len(sels)
    if corr is None and same_game:
        reliable = False
        warnings.append("No correlation estimate is available; same-game legs are NOT independent, so the joint "
                        "probability cannot be reliably estimated.")
    if any(x.prob_low is None for x in sels):
        reliable = False
        warnings.append("At least one leg has no uncertainty interval; joint uncertainty cannot be stated.")
    for a, b in itertools.combinations(sels, 2):
        if _conflict(a, b):
            reliable = False
            warnings.append(f"'{a.evidence.get('market_label')}' and '{b.evidence.get('market_label')}' are conflicting "
                            "or near-duplicate legs.")
    jp = joint_probability(legs, corr, seed, draws)
    structure = "SGP" if len({x.game_id for x in sels}) == 1 else "CROSS" if not same_game else "MIXED"
    pair = [{"a": sels[p["i"]].evidence.get("market_label"), "b": sels[p["j"]].evidence.get("market_label"),
             "rho": p["rho"]} for p in jp["pairwise"]]
    strongest = max((abs(p["rho"]) for p in pair), default=0.0)
    ratio = jp["joint"] / jp["independent"] if jp["independent"] > 0 else 1.0
    assessment = ("Legs are modelled as independent (different games)." if structure == "CROSS" else
                  f"Dependence changes the joint probability to {ratio:.2f}x the independent product "
                  f"(strongest pairwise outcome correlation {strongest:.2f}).")
    weakest = min(sels, key=lambda x: (x.evidence_score or 0, x.prob or 0))
    reference = None
    if structure == "CROSS" and all(x.price_american is not None for x in sels):
        dec = 1.0
        for x in sels:
            dec *= american_to_decimal(x.price_american)
        reference = {"decimal": round(dec, 4), "american": decimal_to_american(dec),
                     "note": "Arithmetic product of observed leg prices — not a sportsbook quote."}
    return {"reliable": reliable, "warnings": warnings, "structure": structure, "joint": jp, "pairwise": pair,
            "assessment": assessment, "reference_price": reference,
            "weakest_assumption": f"{weakest.evidence.get('market_label')}: lowest evidence quality "
                                  f"({weakest.evidence_score}/100) among the legs; "
                                  + (weakest.evidence["opposing"][0] if weakest.evidence["opposing"] else "no specific counter-evidence recorded."),
            "shared_risks": shared_risks(sels, games),
            "evidence_score": min((x.evidence_score or 0) for x in sels)}


def leg_summary(x: Selection) -> dict:
    return {"selection_id": x.id, "key": x.key, "label": x.evidence.get("market_label"), "game_id": x.game_id,
            "game_label": x.evidence.get("game_label"), "market": x.market, "subject_name": x.subject_name,
            "subject_id": x.subject_id, "subject_type": x.subject_type, "team_id": x.team_id,
            "side": x.side, "line": x.line, "price_american": x.price_american, "book": x.book,
            "odds_snapshot_id": x.odds_snapshot_id, "prediction_id": x.prediction_id,
            "model_version_id": x.model_version_id, "prob": x.prob, "prob_low": x.prob_low, "prob_high": x.prob_high,
            "classification": x.classification, "evidence_score": x.evidence_score, "sample_size": x.sample_size,
            "supporting": x.evidence.get("supporting", []), "opposing": x.evidence.get("opposing", [])}


def _make_combo(edition: Edition, engine: str, n: int, tag: str, combo, ev: dict) -> Combo:
    P = RISK_POLICY["combo"]
    jp = ev["joint"]
    reasons = list(ev["warnings"])
    if not ev["reliable"]:
        cls = "insufficient_evidence"
    elif ev["evidence_score"] < P["min_evidence"]:
        cls = "watchlist"; reasons.append("Weakest leg evidence is below the combination threshold.")
    elif n == 6:
        cls = "watchlist"; reasons.append("Six-leg combinations are experimental; compounding model error is large.")
    else:
        cls = "high_confidence" if all(x.classification == "high_confidence" for x in combo) else "standard"
    priced = ev["reference_price"] is not None
    return Combo(
        uid=f"GZ-{edition.game_date:%Y%m%d}-V{edition.version}-{tag}", edition_id=edition.id,
        game_date=edition.game_date, engine=engine, n_legs=n, structure=ev["structure"],
        leg_selection_ids=[x.id for x in combo], legs=[leg_summary(x) for x in combo],
        joint_prob=jp["joint"], joint_low=jp["low"], joint_high=jp["high"], independent_prob=jp["independent"],
        correlation={"method": jp["method"], "seed": jp["seed"], "draws": jp["draws"], "mc_se": jp["mc_se"],
                     "assessment": ev["assessment"], "pairwise": ev["pairwise"], "shared_risks": ev["shared_risks"]},
        observed_quote=None, reference_price=ev["reference_price"], evidence_score=ev["evidence_score"],
        weakest_assumption=ev["weakest_assumption"], classification=cls,
        designation="paper_testing" if priced and cls in QUALIFIED else "research_only", rejection_reasons=reasons,
        invalidation_conditions=["Any leg's player or a rotation player is ruled out or newly listed.",
                                 "Any leg's market line moves by 1.0 or more, or its quote is withdrawn.",
                                 "A leg's game is postponed or rescheduled.",
                                 "A later edition reclassifies any leg below 'standard'."])


def build_combos(ctx: SlateContext, edition: Edition, qualified: list[Selection], games: dict) -> list[Combo]:
    P = RISK_POLICY["combo"]
    pool = sorted(qualified, key=_rank_key)[:P["pool_size"]]
    tm = ctx.models["team_game"]
    out = []
    draws = get_settings().sim_draws
    for n, engine in ENGINES.items():
        cands = []
        for combo in itertools.combinations(pool, n):
            if any(_conflict(a, b) for a, b in itertools.combinations(combo, 2)):
                continue
            ev = evaluate_combo(list(combo), games, ctx.corr, tm.params if tm else None, draws,
                                seed_for(edition.key, *sorted(x.key for x in combo)))
            if not ev.get("joint"):
                continue
            cands.append((combo, ev))
        cands.sort(key=lambda c: (-(c[1]["joint"]["low"] if c[1]["joint"]["low"] is not None else -1), -c[1]["joint"]["joint"]))
        for i, (combo, ev) in enumerate(cands[:P["max_per_engine"]], 1):
            out.append(_make_combo(edition, engine, n, f"{engine}-{i:02d}", combo, ev))
    # Same-game research: built per game from that game's own ranked selections, so it does not depend on which
    # ten selections happen to lead the whole slate.
    seen = {frozenset(c.leg_selection_ids) for c in out}
    by_game: dict[str, list[Selection]] = {}
    for x in qualified:
        by_game.setdefault(x.game_id, []).append(x)
    k = 0
    for gid, xs in by_game.items():
        xs = sorted(xs, key=_rank_key)[:5]
        for n in (2, 3):
            cands = []
            for combo in itertools.combinations(xs, n):
                if frozenset(x.id for x in combo) in seen or any(_conflict(a, b) for a, b in itertools.combinations(combo, 2)):
                    continue
                ev = evaluate_combo(list(combo), games, ctx.corr, tm.params if tm else None, draws,
                                    seed_for(edition.key, "sgp", *sorted(x.key for x in combo)))
                if ev.get("joint"):
                    cands.append((combo, ev))
            cands.sort(key=lambda c: (-(c[1]["joint"]["low"] if c[1]["joint"]["low"] is not None else -1), -c[1]["joint"]["joint"]))
            for combo, ev in cands[:P["sgp_per_game_per_size"]]:
                k += 1
                seen.add(frozenset(x.id for x in combo))
                out.append(_make_combo(edition, ENGINES[n], n, f"SGP-{k:02d}", combo, ev))
    return out


# ---------------------------------------------------------------- editions
def _canon(o) -> str:
    return json.dumps(o, sort_keys=True, default=str, separators=(",", ":"))


def assert_no_forbidden_language(text: str):
    low = text.lower()
    for ph in FORBIDDEN_PHRASES:
        if ph in low:
            raise ValueError(f"forbidden certainty language in published research: '{ph}' (RULE 07)")


def publish_edition(d: date, kind: str = "morning", now: datetime | None = None) -> dict:
    """Evaluate the slate and publish a new immutable edition. Earlier editions are never modified."""
    assert kind in ("morning", "midday", "afternoon", "pregame", "update", "final")
    with session_scope() as s:
        ctx = SlateContext(s, d, now)
        prev = s.scalar(select(Edition).where(Edition.game_date == d).order_by(Edition.version.desc()).limit(1))
        version = (prev.version + 1) if prev else 1
        key = f"{d:%Y%m%d}-v{version}-{kind}"
        games = {g.id: g for g in ctx.games}
        open_games = [g for g in ctx.games if g.status == "scheduled" and (g.tipoff_utc is None or g.tipoff_utc > ctx.now)]
        edition = Edition(game_date=d, kind=kind, version=version, key=key, summary={}, changes=[], content_sha256="")
        results, sel_rows, all_preds = [], [], []
        if kind != "final":
            for g in open_games:  # predictions freeze at tipoff: started games are never re-evaluated
                results.append(evaluate_game(ctx, g, key))
        # Reserve the id, compute everything, then insert the edition row exactly once (the table is immutable).
        edition.id = s.scalar(text("select nextval('editions_id_seq')"))
        for r in results:
            for p in r["predictions"]:
                s.add(p)
            s.flush()
            per_game = []
            for c in r["candidates"]:
                v = guard(ctx, c)
                q = c.get("quote")
                iv = c.get("interval") or {}
                v["evidence"].update(context=c.get("context"), origin=(q.origin if q else "provider"),
                                     contract=(q.source_ref if q is not None and q.book == "Kalshi" else None),
                                     market_label=c["market_label"], game_label=r["label"],
                                     quote_at=q.ingested_at.isoformat() if q else None,
                                     calibration_n=iv.get("n"), policy=RISK_POLICY["version"])
                sel = Selection(
                    edition_id=edition.id, game_id=r["game"].id, game_date=d, key=selection_key(r["game"], c),
                    market=c["market"], subject_type=c["subject_type"], subject_id=c["subject_id"],
                    subject_name=c["subject_name"], team_id=c["team_id"], side=c["side"], line=c["line"],
                    price_american=q.price_american if q else None, book=q.book if q else None,
                    odds_snapshot_id=q.id if q else None,
                    prediction_id=c["prediction"].id if c.get("prediction") is not None else None,
                    model_version_id=c["model"].id if c.get("model") else None, projection=c["projection"],
                    prob=c["prob"], prob_low=iv.get("low"), prob_high=iv.get("high"), breakeven=c["breakeven"],
                    edge=v["edge"], sample_size=c["sample_size"], evidence_score=v["evidence_score"],
                    evidence=v["evidence"], classification=v["classification"],
                    rejection_reasons=v["rejection_reasons"], verified_at=ctx.now)
                per_game.append(sel)
            ranked = sorted([x for x in per_game if top_pick_eligible(x)], key=_rank_key)
            # one side per market per game in the ranked list, at most five
            seen, rank = set(), 0
            for x in ranked:
                # spread and moneyline are the same underlying view of the margin: one slot between them
                mk = ("margin" if x.market in ("spread", "moneyline") else x.market,
                      x.subject_id if x.subject_type == "player" else None)
                if mk in seen or rank >= RISK_POLICY["top_picks"]["max_per_game"]:
                    continue
                seen.add(mk); rank += 1; x.rank_in_game = rank
            sel_rows.extend(per_game)
            all_preds.extend(r["predictions"])
        s.add_all(sel_rows)
        s.flush()
        qualified = [x for x in sel_rows if x.classification in QUALIFIED and x.rank_in_game]
        combos = build_combos(ctx, edition, qualified, games) if len(qualified) >= 2 else []
        s.add_all(combos)
        s.flush()

        # ---- changes vs previous edition, invalidations (new audit events; nothing is rewritten)
        changes = []
        if prev is not None and kind != "final":
            old = {x.key: x for x in s.scalars(select(Selection).where(Selection.edition_id == prev.id))}
            new = {x.key: x for x in sel_rows}
            invalid_keys = set()
            for k, o in old.items():
                n = new.get(k)
                if n is None:
                    g = games.get(o.game_id)
                    if g is not None and g in open_games and o.classification in QUALIFIED:
                        changes.append({"type": "invalidated", "text": f"{o.evidence.get('market_label')}: quote no longer available."})
                        invalid_keys.add(k)
                    continue
                if o.classification != n.classification:
                    typ = "invalidated" if o.classification in QUALIFIED and n.classification not in QUALIFIED else "reclassified"
                    changes.append({"type": typ, "text": f"{n.evidence.get('market_label')}: {o.classification} → {n.classification}"
                                    + (f" ({n.rejection_reasons[0]})" if n.rejection_reasons else "")})
                    if typ == "invalidated":
                        invalid_keys.add(k)
                if o.line != n.line or o.price_american != n.price_american:
                    changes.append({"type": "market_move", "text": f"{o.evidence.get('market_label')} → "
                                    f"{n.evidence.get('market_label')} ({o.price_american} → {n.price_american})"})
                    if o.line is not None and n.line is not None and abs(o.line - n.line) >= 1.0 and o.classification in QUALIFIED:
                        invalid_keys.add(k)
            for k in new.keys() - old.keys():
                if new[k].classification in QUALIFIED:
                    changes.append({"type": "new", "text": f"New qualified selection: {new[k].evidence.get('market_label')}"})
            for k in invalid_keys:
                o = old[k]
                s.add(ResearchEvent(kind="invalidated", ref_type="selection", ref_id=str(o.id), game_date=d,
                                    actor="agent-16-independent-risk-officer",
                                    detail={"key": k, "by_edition": key, "reason": "superseded by materially changed inputs"}))
            if invalid_keys:
                old_ids = {old[k].id for k in invalid_keys}
                for c in s.scalars(select(Combo).where(Combo.edition_id == prev.id)):
                    if old_ids & set(c.leg_selection_ids):
                        s.add(ResearchEvent(kind="invalidated", ref_type="combo", ref_id=c.uid, game_date=d,
                                            actor="agent-16-independent-risk-officer",
                                            detail={"by_edition": key, "reason": "a component selection was invalidated"}))
            pi = {i.player_id: i.status for i in latest_injuries(s, prev.published_at) if i.player_id}
            for pid, i in ctx.inj_by_player.items():
                if pi.get(pid) != i.status:
                    changes.append({"type": "injury", "text": f"{i.player_name}: {pi.get(pid, 'not listed')} → {i.status} "
                                    f"(source {i.provider}, published {i.source_published_at})"})

        summary = json.loads(_canon(build_summary(ctx, kind, open_games, results, sel_rows, combos)))
        assert_no_forbidden_language(_canon(summary))
        edition.summary, edition.changes = summary, changes[:200]
        edition.content_sha256 = hashlib.sha256(_canon({
            "summary": summary, "selections": [[x.key, x.line, x.price_american, x.prob, x.classification] for x in sel_rows],
            "combos": [[c.uid, c.leg_selection_ids, c.joint_prob] for c in combos]}).encode()).hexdigest()
        edition.published_at = ctx.now
        s.add(edition)
        s.flush()
        n_auto = auto_paper(s, ctx, edition, qualified, combos) if kind != "final" else 0
        return {"edition": key, "id": edition.id, "games_evaluated": len(results), "selections": len(sel_rows),
                "qualified": len(qualified), "combos": len(combos), "changes": len(changes),
                "predictions": len(all_preds), "auto_paper_tickets": n_auto, "counts": summary["counts"]}


def build_summary(ctx, kind, open_games, results, sels, combos) -> dict:
    counts: dict[str, int] = {"markets_analyzed": len(sels), "combinations": len(combos)}
    for x in sels:
        counts[x.classification] = counts.get(x.classification, 0) + 1
    counts["qualified"] = sum(1 for x in sels if x.classification in QUALIFIED and x.rank_in_game)
    for c in combos:
        counts[f"combo_{c.engine}"] = counts.get(f"combo_{c.engine}", 0) + 1
    readiness = {f: bool(mv) for f, mv in ctx.models.items()}
    narrative, limits, unresolved = [], [], []
    n_games = len(ctx.games)
    if kind == "final":
        narrative.append("Final archived edition: research for this date is closed. Earlier editions are preserved unchanged.")
    elif n_games == 0:
        narrative.append("No NBA games are scheduled for this date. No research candidates were generated.")
    else:
        narrative.append(f"{n_games} games scheduled; {len(open_games)} had not started and were evaluated in this edition.")
        narrative.append(f"{len(sels)} quoted markets were evaluated: {counts['qualified']} qualified, "
                         f"{counts.get('watchlist', 0)} on the watchlist, {counts.get('rejected', 0) + counts.get('insufficient_evidence', 0)} "
                         "rejected or lacking evidence.")
        if counts["qualified"] == 0:
            narrative.append("No selection met the qualification criteria. A no-opportunity report is a valid research outcome.")
        if counts.get("high_confidence", 0) == 0:
            narrative.append("The high-confidence tier is empty: it requires forward paper-testing evidence that does not yet exist.")
    if not readiness.get("team_game"):
        limits.append("Team model is not in production; game-market selections are rejected.")
    if not any(r["has_prop_quotes"] for r in results):
        limits.append("No player-prop quotes are available (no prop odds provider configured and no owner-entered "
                      "markets); player projections are published without market evaluation.")
        unresolved.append("Player-prop research requires a prop odds provider key (GIZER_ODDS_API_KEY) or owner-entered markets.")
    lu = [x.status for x in ctx.lineups.values()]
    if lu and "confirmed" not in lu:
        limits.append("Starting lineups are projected from the last confirmed starting five and the injury report; "
                      "they are not official until the box score lists starters.")
    elif not lu:
        limits.append("No lineup snapshot exists for this slate yet.")
    if any(not r["has_game_quotes"] for r in results):
        limits.append("At least one game has no game-level quote; its markets could not be evaluated.")
    if len(sels) > 100:
        limits.append(f"{len(sels)} contracts were evaluated. Picking the largest apparent differences from that many "
                      "comparisons selects for model error as well as for real differences; the ranked picks are "
                      "paper-testing candidates, and only their settled record can show whether they mean anything.")
    limits.append("Models are not validated against historical market prices (none are held); probabilities are "
                  "calibrated to outcomes at non-market thresholds only.")
    if ctx.corr is None:
        limits.append("No correlation estimate exists; same-game joint probabilities are flagged unreliable.")
    unresolved.append("Does the team model retain any value once conditioned on the market line? Only forward results can answer this.")
    not_q = [x for x in sels if x.classification not in QUALIFIED]
    order = {"watchlist": 0, "stale": 1, "insufficient_evidence": 2, "rejected": 3}
    rejected = [{"label": f"{x.evidence.get('game_label')} — {x.evidence.get('market_label')}", "reasons": x.rejection_reasons}
                for x in sorted(not_q, key=lambda x: (order.get(x.classification, 9), -(x.edge or -9)))[:200]]
    counts["not_qualified_total"] = len(not_q)
    return {
        "slate": {"n_games": n_games, "games": [{"id": g.id, "label": f"{ctx.teams[g.away_team_id].abbr} @ {ctx.teams[g.home_team_id].abbr}",
                                                "tipoff_utc": g.tipoff_utc, "status": g.status} for g in ctx.games],
                  "injury_snapshot_at": ctx.injury_at, "injuries_listed": len(ctx.injuries),
                  "model_readiness": readiness},
        "environments": {r["game"].id: r["environment"] for r in results},
        "completeness": {r["game"].id: {"game_quotes": r["has_game_quotes"], "prop_quotes": r["has_prop_quotes"]} for r in results},
        "counts": counts, "narrative": narrative, "limitations": limits, "unresolved": unresolved,
        "rejected": rejected, "risk_policy": RISK_POLICY["version"],
    }


def auto_paper(s, ctx, edition, qualified, combos) -> int:
    """Forward validation: record a fixed-unit paper ticket for each newly qualified selection and the top
    combinations per engine. Fixed stake; never scaled by confidence or by previous results."""
    from .ledger import create_ticket
    pol = RISK_POLICY["auto_paper"]
    existing = set()
    for t in s.scalars(select(PaperTicket).where(PaperTicket.game_date == edition.game_date, PaperTicket.source == "auto")):
        existing.add(tuple(sorted(leg["key"] for leg in t.legs)))
    n = 0
    if pol["singles"]:
        for x in qualified:
            if x.evidence.get("origin", "provider") != "provider":
                continue  # owner-entered prices are never auto-ticketed
            if (x.key,) not in existing:
                create_ticket(s, [x], source="auto", created_by="system", edition_id=edition.id, now=ctx.now); n += 1
    per: dict[tuple, int] = {}
    for c in combos:
        if c.classification not in QUALIFIED:
            continue
        k = (c.engine, c.structure)
        if per.get(k, 0) >= pol["combos_per_engine"]:
            continue
        legs_key = tuple(sorted(leg["key"] for leg in c.legs))
        per[k] = per.get(k, 0) + 1
        if legs_key in existing:
            continue
        sels = [s.get(Selection, i) for i in c.leg_selection_ids]
        create_ticket(s, sels, source="auto", created_by="system", edition_id=edition.id, combo=c, now=ctx.now); n += 1
    return n


def due_pregame_checks(s, now: datetime, offsets=(90, 60, 30, 10), window_min: int = 5) -> list[tuple[str, int]]:
    """(game_id, offset) pairs whose pregame checkpoint falls inside the current scheduler window."""
    out = []
    for g in s.scalars(select(Game).where(Game.status == "scheduled", Game.tipoff_utc.is_not(None),
                                          Game.tipoff_utc > now, Game.tipoff_utc <= now + timedelta(minutes=max(offsets) + window_min))):
        mins = (g.tipoff_utc - now).total_seconds() / 60
        for off in offsets:
            if off - window_min < mins <= off:
                out.append((g.id, off))
    return out


def et_date_of(ts: datetime) -> date:
    return ts.astimezone(ET).date()


__all__ = ["publish_edition", "RISK_POLICY", "QUALIFIED", "guard", "evaluate_combo", "SlateContext", "timezone"]
