"""Paper-testing ledger: virtual tickets, settlement, postgame forensics, results and exposure analysis.

Strictly virtual. There is no code path that places, funds or submits a real wager. Tickets and
settlements are append-only (database triggers); a correction is a new settlement row that supersedes.
Stakes are fixed units: never scaled after losses, never martingale.
"""
from __future__ import annotations

import math
from datetime import date, datetime

import numpy as np
from sqlalchemy import func, select

from .config import get_settings
from .db import (Combo, Game, PaperSettlement, PaperTicket, PlayerBox, Prediction, PredictionOutcome,
                 ResearchEvent, ResearchFinding, Selection, Team, session_scope, utcnow)
from .modeling import calibration_table, nb_params, wilson
from .simulation import seed_for, simulate_legs

ENGINE_BY_LEGS = {1: "SINGLE", 2: "DOUBLE", 3: "TRIPLE", 4: "QUAD", 5: "FIVE", 6: "SIX"}
ALL_ENGINES = list(ENGINE_BY_LEGS.values())
SETTLEMENT_RULES = "gizer-v1"
DISCLAIMER = ("Simulated paper-testing results in fixed virtual units. Not real wagers and not real returns. "
              "Small samples are dominated by variance; no result here demonstrates a durable predictive advantage.")


class LedgerError(ValueError):
    pass


def create_ticket(s, sels: list[Selection], *, source: str, created_by: str, edition_id: int | None = None,
                  combo: Combo | None = None, stake_units: float | None = None, now: datetime | None = None) -> PaperTicket:
    from .research import american_to_decimal, evaluate_combo, leg_summary
    now = now or utcnow()
    if not sels or len(sels) > 6:
        raise LedgerError("a paper ticket needs between 1 and 6 selections")
    if len({x.key for x in sels}) != len(sels):
        raise LedgerError("duplicate selections in one ticket")
    stake = get_settings().paper_unit if stake_units is None else float(stake_units)
    if not (0 < stake <= 10 * get_settings().paper_unit):
        raise LedgerError("stake must be a positive number of virtual units (max 10x the base unit)")
    games = {g.id: g for g in s.scalars(select(Game).where(Game.id.in_({x.game_id for x in sels})))}
    for g in games.values():
        if g.status != "scheduled" or (g.tipoff_utc and g.tipoff_utc <= now):
            raise LedgerError("game already started: pregame research is frozen and cannot be ticketed")
    legs = [leg_summary(x) for x in sels]
    if len(sels) == 1:
        x = sels[0]
        prob, lo, hi, structure = x.prob, x.prob_low, x.prob_high, "SINGLE"
        price = american_to_decimal(x.price_american) if x.price_american is not None else None
        basis = "observed_quote" if price else "none"
        cls = x.classification
    else:
        if combo is not None:
            prob, lo, hi, structure, ref, cls = (combo.joint_prob, combo.joint_low, combo.joint_high, combo.structure,
                                                 combo.reference_price, combo.classification)
        else:
            from .db import ModelEvaluation
            from .modeling import production_model
            ce = s.scalar(select(ModelEvaluation).where(ModelEvaluation.kind == "correlation")
                          .order_by(ModelEvaluation.id.desc()).limit(1))
            tm = production_model(s, "team_game")
            ev = evaluate_combo(sels, games, ce.metrics if ce else None, tm.params if tm else None,
                                get_settings().sim_draws, seed_for("ticket", *sorted(x.key for x in sels)))
            jp = ev.get("joint") or {}
            prob, lo, hi, structure, ref = jp.get("joint"), jp.get("low"), jp.get("high"), ev.get("structure", "MIXED"), ev.get("reference_price")
            cls = "standard" if ev.get("reliable") and all(x.classification in ("standard", "high_confidence") for x in sels) else "watchlist"
        price = ref["decimal"] if ref else None
        basis = "leg_product_reference" if ref else "none"
    t = PaperTicket(kind="single" if len(sels) == 1 else "combo", engine=ENGINE_BY_LEGS[len(sels)], structure=structure,
                    source=source, game_date=max(x.game_date for x in sels), combo_uid=combo.uid if combo else None,
                    edition_id=edition_id or sels[0].edition_id, legs=legs, model_prob=prob, prob_low=lo, prob_high=hi,
                    price_decimal=price, price_basis=basis, classification=cls, stake_units=stake,
                    settlement_rules=SETTLEMENT_RULES, created_by=created_by, created_at=now)
    s.add(t)
    s.flush()
    return t


# ---------------------------------------------------------------- settlement
def grade_leg(s, leg: dict, game: Game | None) -> dict:
    """gizer-v1 rules: postponed/unplayed game → void; player who did not play → void; exact line → push."""
    base = {"label": leg["label"], "key": leg["key"], "actual": None}
    if game is None or game.status == "postponed":
        return {**base, "result": "void", "note": "game postponed or removed"}
    if game.status != "final" or game.home_points is None:
        return {**base, "result": "unresolved", "note": "final score not available"}
    m, side, line = leg["market"], leg["side"], leg["line"]
    if m in ("spread", "moneyline", "total"):
        margin = game.home_points - game.away_points
        if m == "total":
            actual, v = game.home_points + game.away_points, None
            v = actual - line
            if side == "under":
                v = -v
        else:
            actual = margin if side == "home" else -margin
            v = actual + (line if m == "spread" else 0.0)
        return {**base, "actual": float(actual), "result": "win" if v > 0 else "push" if v == 0 else "loss"}
    if game.box_ingested_at is None:
        return {**base, "result": "unresolved", "note": "box score not ingested yet"}
    stat = {"player_pts": "pts", "player_reb": "reb", "player_ast": "ast", "player_fg3m": "fg3m"}[m]
    row = s.get(PlayerBox, (game.id, leg["subject_id"]))
    if row is None:
        return {**base, "result": "void", "note": "player did not play"}
    actual = float(getattr(row, stat))
    v = actual - line if side == "over" else line - actual
    return {**base, "actual": actual, "minutes": row.minutes, "result": "win" if v > 0 else "push" if v == 0 else "loss"}


def settle_ticket(s, t: PaperTicket, games: dict) -> PaperSettlement | None:
    from .research import american_to_decimal
    legs = [grade_leg(s, leg, games.get(leg["game_id"])) for leg in t.legs]
    res = [x["result"] for x in legs]
    if "unresolved" in res:
        result = "unresolved"
    elif "loss" in res:
        result = "loss"
    elif all(r == "void" for r in res):
        result = "void"
    elif all(r in ("push", "void") for r in res):
        result = "push"
    else:
        result = "win"
    payout = pnl = None
    if result in ("push", "void"):
        payout, pnl = t.stake_units, 0.0
    elif result == "loss":
        payout, pnl = 0.0, -t.stake_units
    elif result == "win":
        if t.price_decimal is None:
            payout = pnl = None  # hit-rate only: no verified price, no simulated return
        elif all(r == "win" for r in res):
            payout = t.stake_units * t.price_decimal
            pnl = payout - t.stake_units
        else:
            # pushed/void legs drop out; reprice from the remaining observed leg prices
            dec = 1.0
            for leg, r in zip(t.legs, res):
                if r == "win":
                    if leg.get("price_american") is None:
                        dec = None; break
                    dec *= american_to_decimal(leg["price_american"])
            payout = None if dec is None else t.stake_units * dec
            pnl = None if dec is None else payout - t.stake_units
    prev = s.scalar(select(PaperSettlement).where(PaperSettlement.ticket_id == t.id).order_by(PaperSettlement.id.desc()).limit(1))
    if prev is not None and prev.result == result and [x["result"] for x in prev.leg_results] == res:
        return None  # nothing changed; idempotent
    st = PaperSettlement(ticket_id=t.id, result=result, leg_results=legs, payout_units=payout, pnl_units=pnl,
                         forensic=forensic_report(s, t, legs, result, games) if result != "unresolved" else {},
                         supersedes_id=prev.id if prev else None,
                         reason="correction of an earlier settlement" if prev and prev.result != "unresolved" else None)
    s.add(st)
    if prev and prev.result != "unresolved":
        s.add(ResearchEvent(kind="settlement_corrected", ref_type="ticket", ref_id=str(t.id), game_date=t.game_date,
                            actor="agent-17-postgame-forensic-analyst", detail={"from": prev.result, "to": result}))
    return st


def forensic_report(s, t: PaperTicket, leg_results: list[dict], result: str, games: dict) -> dict:
    """Deterministic postgame forensics for one ticket. Classifies each miss as within or outside the model's
    stated uncertainty; a single outcome is never treated as evidence of a systematic error."""
    findings, outside = [], 0
    for leg, r in zip(t.legs, leg_results):
        pred = s.get(Prediction, leg["prediction_id"]) if leg.get("prediction_id") else None
        g = games.get(leg["game_id"])
        txt = f"{leg['label']}: {r['result']}"
        if r.get("actual") is not None:
            txt += f" (actual {r['actual']:g})"
        if pred is not None and g is not None and g.status == "final":
            if pred.subject_type == "game":
                actual_stat = (g.home_points - g.away_points) if pred.stat == "margin" else (g.home_points + g.away_points)
                inside = pred.p10 <= actual_stat <= pred.p90
                txt += f"; game {pred.stat} {actual_stat:g} vs projected {pred.mean:.1f} (80% interval {pred.p10:.0f}–{pred.p90:.0f}, " \
                       f"{'inside' if inside else 'OUTSIDE'})"
                if pred.stat == "total" and g.home_poss:
                    pace = (g.home_poss + (g.away_poss or g.home_poss)) / 2
                    exp_pace = pred.features.get("pace")
                    if exp_pace:
                        txt += f"; pace {pace:.0f} vs expected {exp_pace:.0f}"
            else:
                inside = r.get("actual") is not None and pred.p10 <= r["actual"] <= pred.p90
                pm = pred.features.get("proj_min")
                if r.get("minutes") is not None and pm:
                    txt += f"; minutes {r['minutes']:.0f} vs projected {pm:.0f}"
                    if abs(r["minutes"] - pm) >= 8:
                        txt += " (minutes projection materially off)"
                txt += f"; {'inside' if inside else 'OUTSIDE'} the 80% interval {pred.p10:.0f}–{pred.p90:.0f}"
            outside += 0 if inside else 1
        inval = s.scalar(select(func.count()).select_from(ResearchEvent).where(
            ResearchEvent.kind == "invalidated", ResearchEvent.ref_type == "selection",
            ResearchEvent.ref_id == str(leg["selection_id"])))
        if inval:
            txt += "; this selection was invalidated by a later edition before tipoff (availability or market change)"
        findings.append(txt)
    n = len(t.legs)
    if result == "win":
        verdict = "Won. A single win is not evidence that the estimate was correct."
    elif outside == 0:
        verdict = "Ordinary variance: every graded outcome fell inside the model's stated 80% interval."
    elif outside / n <= 0.34:
        verdict = "Mostly ordinary variance; one outcome fell outside the 80% interval (expected about 1 time in 5 per leg)."
    else:
        verdict = ("Multiple outcomes outside the stated intervals. Logged for the weekly model review; no model is "
                   "changed because of a single ticket.")
    if n > 1 and t.model_prob is not None:
        findings.append(f"Estimated joint probability was {t.model_prob:.1%}; correlation assumptions can only be judged "
                        "over many tickets, not from one outcome.")
    return {"verdict": verdict, "findings": findings, "legs_outside_interval": outside}


def record_prediction_outcomes(s, d: date) -> int:
    """Turn each prediction for date d into a postgame observation (append-only, once per prediction)."""
    from scipy import stats as sps
    done = set(s.scalars(select(PredictionOutcome.prediction_id).where(PredictionOutcome.game_date == d)))
    games = {g.id: g for g in s.scalars(select(Game).where(Game.game_date == d))}
    # only the last pregame prediction per (game, subject, stat) is the forecast of record
    latest: dict[tuple, Prediction] = {}
    for p in s.scalars(select(Prediction).where(Prediction.game_date == d).order_by(Prediction.id)):
        latest[(p.game_id, p.subject_type, p.subject_id, p.stat)] = p
    n = 0
    for p in latest.values():
        g = games.get(p.game_id)
        if p.id in done or g is None or g.status != "final" or g.home_points is None:
            continue
        ctx, actual = {}, None
        if p.subject_type == "game":
            actual = float(g.home_points - g.away_points if p.stat == "margin" else g.home_points + g.away_points)
            pit = float(sps.norm.cdf(actual, p.dist["mu"], p.dist["sd"]))
        else:
            if g.box_ingested_at is None:
                continue
            row = s.get(PlayerBox, (g.id, p.subject_id))
            if row is None:
                ctx["dnp"] = True
                pit = None
            else:
                actual = float(getattr(row, p.stat))
                ctx = {"minutes": row.minutes, "proj_min": p.features.get("proj_min")}
                nn, pp = nb_params(p.dist["mu"], p.dist["r"])
                pit = float(sps.nbinom.cdf(actual, nn, pp))
        s.add(PredictionOutcome(prediction_id=p.id, game_date=d, stat=p.stat, model_version_id=p.model_version_id,
                                actual=actual, error=None if actual is None else actual - p.mean, pit=pit,
                                in_80=None if actual is None else bool(p.p10 <= actual <= p.p90), context=ctx))
        n += 1
    return n


def settle_date(d: date) -> dict:
    """Settle all tickets with legs on date d (idempotent) and record prediction outcomes."""
    out = {"date": d.isoformat(), "settled": 0, "unresolved": 0, "unchanged": 0}
    with session_scope() as s:
        tickets = list(s.scalars(select(PaperTicket).where(PaperTicket.game_date == d)))
        gids = {leg["game_id"] for t in tickets for leg in t.legs}
        games = {g.id: g for g in s.scalars(select(Game).where(Game.id.in_(gids)))} if gids else {}
        for t in tickets:
            cur = s.scalar(select(PaperSettlement).where(PaperSettlement.ticket_id == t.id).order_by(PaperSettlement.id.desc()).limit(1))
            if cur is not None and cur.result != "unresolved":
                # re-grade to detect stat corrections; a difference creates a superseding row
                pass
            st = settle_ticket(s, t, games)
            if st is None:
                out["unchanged"] += 1
            elif st.result == "unresolved":
                out["unresolved"] += 1
            else:
                out["settled"] += 1
        out["prediction_outcomes"] = record_prediction_outcomes(s, d)
    return out


def current_settlements(s, kind: str | None = None, filters=None) -> list[tuple[PaperTicket, PaperSettlement]]:
    sub = select(func.max(PaperSettlement.id)).group_by(PaperSettlement.ticket_id)
    q = select(PaperTicket, PaperSettlement).join(PaperSettlement, PaperSettlement.ticket_id == PaperTicket.id).where(
        PaperSettlement.id.in_(sub))
    if kind:
        q = q.where(PaperTicket.kind == kind)
    for f in filters or []:
        q = q.where(f)
    return [(t, st) for t, st in s.execute(q.order_by(PaperTicket.game_date, PaperTicket.id))]


# ---------------------------------------------------------------- results
def summarize(rows: list[tuple[PaperTicket, PaperSettlement | None]], seed: int = 7) -> dict:
    n = len(rows)
    res = [st.result if st else "open" for _, st in rows]
    wins, losses = res.count("win"), res.count("loss")
    decided = wins + losses
    probs = [t.model_prob for t, st in rows if st and st.result in ("win", "loss") and t.model_prob is not None]
    priced = [(t, st) for t, st in rows if st and st.pnl_units is not None and st.result in ("win", "loss", "push", "void")]
    pnl = [st.pnl_units for _, st in priced]
    staked = sum(t.stake_units for t, _ in priced if _.result in ("win", "loss"))
    roi = (sum(pnl) / staked) if staked > 0 else None
    roi_ci = None
    if roi is not None and len(pnl) >= 20:
        rng = np.random.default_rng(seed)
        arr = np.array([(st.pnl_units, t.stake_units if st.result in ("win", "loss") else 0.0) for t, st in priced])
        idx = rng.integers(0, len(arr), (2000, len(arr)))
        sums = arr[idx]
        r = sums[:, :, 0].sum(axis=1) / np.maximum(sums[:, :, 1].sum(axis=1), 1e-9)
        roi_ci = [float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))]
    dd = None
    if pnl:
        cum = np.cumsum(pnl)
        dd = float(np.max(np.maximum.accumulate(np.concatenate([[0.0], cum])) - np.concatenate([[0.0], cum])))
    ci = wilson(wins, decided)
    return {"tickets": n, "settled": sum(r in ("win", "loss", "push", "void") for r in res), "wins": wins,
            "losses": losses, "pushes": res.count("push"), "voids": res.count("void"),
            "unresolved": res.count("unresolved") + res.count("open"),
            "hit_rate": wins / decided if decided else None, "hit_rate_ci": list(ci) if ci else None,
            "avg_model_prob": float(np.mean(probs)) if probs else None,
            "staked_units": float(staked), "pnl_units": float(sum(pnl)) if pnl else None, "roi": roi, "roi_ci": roi_ci,
            "max_drawdown_units": dd, "priced_tickets": len(priced)}


def results_report(s, filters: list, limit: int = 50, offset: int = 0) -> dict:
    q = select(PaperTicket)
    for f in filters:
        q = q.where(f)
    tickets = list(s.scalars(q.order_by(PaperTicket.game_date, PaperTicket.id)))
    cur = {}
    if tickets:
        sub = select(func.max(PaperSettlement.id)).where(PaperSettlement.ticket_id.in_([t.id for t in tickets])).group_by(PaperSettlement.ticket_id)
        cur = {st.ticket_id: st for st in s.scalars(select(PaperSettlement).where(PaperSettlement.id.in_(sub)))}
    rows = [(t, cur.get(t.id)) for t in tickets]
    by_engine = [{"engine": e, **summarize([r for r in rows if r[0].engine == e])} for e in ALL_ENGINES]
    by_structure = [{"structure": k, **summarize([r for r in rows if r[0].structure == k])} for k in ("SGP", "CROSS", "MIXED")]
    dec = [(t.model_prob, 1.0 if st.result == "win" else 0.0) for t, st in rows
           if st and st.result in ("win", "loss") and t.model_prob is not None]
    cal = []
    if dec:
        p, y = np.array([d[0] for d in dec]), np.array([d[1] for d in dec])
        cal = [{"bucket": f"{r['lo']:.1f}–{r['hi']:.1f}", "n": r["n"], "predicted": r["predicted"],
                "observed": r["observed"], "ci": r["ci"]} for r in calibration_table(p, y) if r["n"]]
    daily: dict[date, float] = {}
    for t, st in rows:
        if st and st.pnl_units is not None:
            daily[t.game_date] = daily.get(t.game_date, 0.0) + st.pnl_units
    curve, c = [], 0.0
    for d in sorted(daily):
        c += daily[d]
        curve.append({"date": d.isoformat(), "pnl_units": round(daily[d], 4), "cumulative": round(c, 4)})
    n_out = s.scalar(select(func.count()).select_from(PredictionOutcome)) or 0
    page = list(reversed(rows))[offset:offset + limit]
    return {"summary": summarize(rows), "by_engine": by_engine, "by_structure": by_structure, "calibration": cal,
            "equity_curve": curve,
            "selection_outcomes": {"n": int(n_out), "note": "prediction outcomes recorded for forecast-error analysis"},
            "rows": page, "total": len(rows), "disclaimer": DISCLAIMER}


# ---------------------------------------------------------------- exposure / shared risk
def exposure_report(s, d: date, corr: dict | None, team_params: dict | None) -> dict:
    from .research import leg_from_selection
    tickets = list(s.scalars(select(PaperTicket).where(PaperTicket.game_date == d).order_by(PaperTicket.id)))
    teams = {t.id: t.abbr for t in s.scalars(select(Team))}
    n = len(tickets)
    notes = ["Overlapping tickets are not independent opportunities: when a shared leg fails, every ticket containing it fails together.",
             "Winning one ticket does not necessarily cover the losses from the others; compare the probability that at "
             "least one ticket succeeds with the expected aggregate result.",
             "Simulation frequencies are model outputs, not validated real-world probabilities."]
    if n == 0:
        return {"date": d.isoformat(), "n_tickets": 0, "players": [], "teams": [], "games": [], "selections": [],
                "shared_assumptions": [], "pairwise": [], "simulation": None, "notes": notes}

    def tally(fn):
        c: dict[str, int] = {}
        for t in tickets:
            for k in {fn(leg) for leg in t.legs} - {None}:
                c[k] = c.get(k, 0) + 1
        return [{"k": k, "tickets": v, "share": v / n} for k, v in sorted(c.items(), key=lambda x: -x[1])]

    players = [{"name": r["k"], **{k: r[k] for k in ("tickets", "share")}}
               for r in tally(lambda leg: leg["subject_name"] if leg["subject_type"] == "player" else None)]
    team_rows = [{"abbr": r["k"], "tickets": r["tickets"], "share": r["share"]}
                 for r in tally(lambda leg: teams.get(leg.get("team_id")))]
    games_rows = [{"label": r["k"], "tickets": r["tickets"], "share": r["share"]} for r in tally(lambda leg: leg["game_label"])]
    sel_rows = [{"label": r["k"], "tickets": r["tickets"], "share": r["share"]}
                for r in tally(lambda leg: f"{leg['game_label']} — {leg['label']}")]
    assumptions = []
    if any(r["tickets"] > 1 for r in sel_rows):
        top = sel_rows[0]
        assumptions.append(f"'{top['label']}' appears in {top['tickets']} of {n} tickets; if it fails, all of them fail.")
    if any(r["tickets"] > 1 for r in games_rows):
        assumptions.append("Several tickets depend on the same game environment (pace, blowout, overtime).")
    if all(leg["market"] in ("spread", "total", "moneyline") for t in tickets for leg in t.legs):
        assumptions.append("All tickets rely on one team model; a systematic model error would hit every ticket.")
    # joint simulation over the union of legs
    uniq: dict[str, dict] = {}
    for t in tickets:
        for leg in t.legs:
            uniq.setdefault(leg["key"], leg)
    keys = list(uniq)
    games = {g.id: g for g in s.scalars(select(Game).where(Game.id.in_({leg["game_id"] for leg in uniq.values()})))}
    sim = None
    pairwise = []
    if all(uniq[k].get("prob") is not None for k in keys):
        sim_legs = [leg_from_selection(uniq[k], None, games[uniq[k]["game_id"]], team_params) for k in keys]
        draws, seed = get_settings().sim_draws, seed_for("exposure", d, *keys)
        out = simulate_legs(sim_legs, corr, seed, draws)["central"]
        idx = {k: i for i, k in enumerate(keys)}
        wins = np.stack([out[:, [idx[leg["key"]] for leg in t.legs]].all(axis=1) for t in tickets], axis=1)
        pnl_known = all(t.price_decimal is not None for t in tickets)
        pnl = None
        if pnl_known:
            pay = np.array([t.stake_units * (t.price_decimal - 1) for t in tickets])
            stake = np.array([t.stake_units for t in tickets])
            pnl = (wins * pay - (~wins) * stake).sum(axis=1)
        ind = 1.0
        for j in range(n):
            ind *= 1 - wins[:, j].mean()
        sim = {"draws": draws, "seed": seed, "p_at_least_one": float(wins.any(axis=1).mean()),
               "p_all_lose": float((~wins.any(axis=1)).mean()),
               "expected_pnl_units": None if pnl is None else float(pnl.mean()),
               "pnl_p10": None if pnl is None else float(np.percentile(pnl, 10)),
               "pnl_p90": None if pnl is None else float(np.percentile(pnl, 90)),
               "independent_p_at_least_one": float(1 - ind)}
        w = wins.astype(float)
        for i in range(n):
            for j in range(i + 1, n):
                shared = len({leg["key"] for leg in tickets[i].legs} & {leg["key"] for leg in tickets[j].legs})
                rho = float(np.corrcoef(w[:, i], w[:, j])[0, 1]) if w[:, i].std() > 0 and w[:, j].std() > 0 else None
                if shared or (rho is not None and abs(rho) >= 0.05):
                    pairwise.append({"a": f"#{tickets[i].id} {tickets[i].engine}", "b": f"#{tickets[j].id} {tickets[j].engine}",
                                     "shared_legs": shared, "rho": None if rho is None else round(rho, 3)})
        pairwise = sorted(pairwise, key=lambda p: -(p["rho"] or 0))[:40]
    else:
        notes.append("Joint simulation unavailable: at least one leg has no model probability.")
    return {"date": d.isoformat(), "n_tickets": n, "players": players, "teams": team_rows, "games": games_rows,
            "selections": sel_rows, "shared_assumptions": assumptions, "pairwise": pairwise, "simulation": sim,
            "notes": notes}


# ---------------------------------------------------------------- weekly forward review (findings)
def forward_review() -> dict:
    """Weekly: compare forward prediction outcomes with stated intervals; open a finding only on adequate samples."""
    out = {"reviewed": [], "findings_opened": 0}
    with session_scope() as s:
        rows = s.execute(select(PredictionOutcome.stat, func.count(), func.avg(func.abs(PredictionOutcome.error)),
                                func.avg(func.cast(PredictionOutcome.in_80, __import__("sqlalchemy").Integer)))
                         .where(PredictionOutcome.actual.is_not(None)).group_by(PredictionOutcome.stat)).all()
        for stat, n, mae, cov in rows:
            out["reviewed"].append({"stat": stat, "n": int(n), "mae": float(mae), "coverage_80": float(cov)})
            if n >= 300 and not (0.72 <= float(cov) <= 0.88):
                uid = f"F-{utcnow():%Y%W}-{stat}-coverage"
                if not s.scalar(select(ResearchFinding).where(ResearchFinding.finding_uid == uid)):
                    half = 1.96 * math.sqrt(0.8 * 0.2 / n)
                    s.add(ResearchFinding(
                        finding_uid=uid, hypothesis=f"Forward 80% interval coverage for '{stat}' is miscalibrated.",
                        supporting=[f"Observed coverage {float(cov):.1%} on n={n} forward predictions (nominal 80% ± {half:.1%})."],
                        contradicting=["Outcomes within a game are correlated, so the effective sample is smaller than n."],
                        sample_size=int(n), proposed_experiment="Re-fit dispersion on the latest calibration window as a "
                        "challenger version and compare against the champion on a held-out period before any promotion.",
                        limitations="Single-season forward window.", source="agent-17-postgame-forensic-analyst"))
                    out["findings_opened"] += 1
    return out
