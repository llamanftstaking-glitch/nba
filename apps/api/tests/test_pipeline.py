"""Integration tests on a SYNTHETIC league in the test database: registry, risk officer, editions,
immutability, paper ledger and settlement, exposure."""
from datetime import timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from conftest import SLATE, add_injuries, add_quotes, model_aware_quotes, seed_synthetic
from gizer import db as gdb
from gizer import modeling as M
from gizer import research as R
from gizer.ledger import LedgerError, create_ticket, exposure_report, results_report, settle_date

STATE = {}


@pytest.fixture(scope="module", autouse=True)
def league(db):
    STATE.update(seed_synthetic())
    STATE["now"] = STATE["tipoff"] - timedelta(hours=8)
    yield


def test_backtests_are_recorded_pass_or_fail_and_reproducible():
    a = M.run_all_backtests(register=True)
    b = M.run_all_backtests(register=False)
    assert a["team"]["margin_mae"] == b["team"]["margin_mae"]
    assert a["player"]["pts"]["mae"] == b["player"]["pts"]["mae"]
    with gdb.session_scope() as s:
        evs = list(s.scalars(select(gdb.ModelEvaluation)))
        assert {e.family for e in evs} >= {"team_game", "player_pts", "player_reb", "player_ast", "player_fg3m", "player_stl", "player_pra", "correlation"}
        assert M.production_model(s, "team_game") is not None  # synthetic teams have real signal
        for mv in s.scalars(select(gdb.ModelVersion)):
            if mv.status == "production":
                assert mv.promoted_by == M.AUDITOR and mv.promoted_by != mv.created_by


def test_no_self_promotion_and_no_promotion_without_passing_evaluation():
    with gdb.session_scope() as s:
        mv = M.register_model(s, "player_pts", "experimental", "0.0.1", {"dispersion_r": 5}, {
            "training": "a", "calibration": "b", "evaluation": "c"}, "test", M.SCIENTIST_PLAYER)
        bad = gdb.ModelEvaluation(model_version_id=mv.id, family="player_pts", model_name="experimental", kind="walk_forward",
                                  period="c", n_obs=10, metrics={}, passed=False)
        good = gdb.ModelEvaluation(model_version_id=mv.id, family="player_pts", model_name="experimental", kind="walk_forward",
                                   period="c", n_obs=5000, metrics={}, passed=True)
        s.add_all([bad, good]); s.flush()
        with pytest.raises(M.PromotionError):
            M.promote_model(s, mv, good, M.SCIENTIST_PLAYER)
        with pytest.raises(M.PromotionError):
            M.promote_model(s, mv, good, "some-llm")
        with pytest.raises(M.PromotionError):
            M.promote_model(s, mv, bad, M.AUDITOR)
        assert mv.status == "candidate"


def test_edition_without_quotes_abstains():
    add_injuries([], at=STATE["now"] - timedelta(hours=1))
    res = R.publish_edition(SLATE, "morning", now=STATE["now"])
    assert res["games_evaluated"] == 4 and res["selections"] == 0 and res["combos"] == 0
    assert res["auto_paper_tickets"] == 0 and res["predictions"] > 0
    with gdb.session_scope() as s:
        e = s.scalar(select(gdb.Edition).where(gdb.Edition.key == res["edition"]))
        assert any("No selection met" in n for n in e.summary["narrative"])
        assert any("player-prop" in x.lower() for x in e.summary["limitations"])


def test_edition_with_quotes_classifies_and_never_reaches_high_confidence_without_forward_evidence():
    model_aware_quotes([f"S{i}" for i in range(4)], STATE["now"] + timedelta(minutes=30))
    now = STATE["now"] + timedelta(hours=1)
    add_injuries([], at=now - timedelta(minutes=5))
    res = R.publish_edition(SLATE, "midday", now=now)
    STATE["ed2"] = res
    assert res["selections"] == 24
    with gdb.session_scope() as s:
        sels = list(s.scalars(select(gdb.Selection).where(gdb.Selection.edition_id == res["id"])))
        assert all(x.classification != "high_confidence" for x in sels)
        for x in sels:
            assert x.odds_snapshot_id and x.model_version_id and x.prediction_id  # traceable (RULE 08)
            assert 0 <= x.evidence_score <= 100
            if x.classification not in R.QUALIFIED:
                assert x.rejection_reasons, "every rejection must be explainable (RULE 10)"
            else:
                assert x.prob_low is not None and x.prob_low > x.breakeven
        ranked = [x for x in sels if x.rank_in_game]
        assert all(x.classification in R.QUALIFIED for x in ranked)
        for gid in {x.game_id for x in ranked}:
            assert len([x for x in ranked if x.game_id == gid]) <= 5
        combos = list(s.scalars(select(gdb.Combo).where(gdb.Combo.edition_id == res["id"])))
        ids = {x.id for x in ranked}
        assert len(ranked) >= 2 and len(combos) >= 1 and {c.engine for c in combos} >= {"DOUBLE"}
        assert res["auto_paper_tickets"] >= len(ranked)
        for c in combos:
            assert set(c.leg_selection_ids) <= ids
            assert c.observed_quote is None  # combined quotes are never invented
            assert c.correlation["seed"] is not None and c.correlation["draws"] > 0
            if c.structure != "CROSS":
                assert c.reference_price is None and c.designation == "research_only"
            if c.engine == "SIX":
                assert c.classification not in R.QUALIFIED


def test_guard_rejects_on_stale_injuries_and_missing_models():
    late = STATE["tipoff"] - timedelta(minutes=30)
    with gdb.session_scope() as s:
        ctx = R.SlateContext(s, SLATE, late)  # injury snapshot is now ~6.5h old... make it older than policy
        ctx.injury_at = late - timedelta(hours=R.RISK_POLICY["max_injury_age_hours"] + 1)
        g = ctx.games[0]
        r = R.evaluate_game(ctx, g, "probe")
        v = R.guard(ctx, r["candidates"][0])
        # a record whose only failure is freshness is classified "stale" (still not qualified)
        assert v["classification"] == "stale" and any("injury" in x.lower() for x in v["rejection_reasons"])
        assert "stale" not in R.QUALIFIED
        c = dict(r["candidates"][0]); c["model"] = None; c["evaluation"] = None
        ctx.injury_at = late
        v2 = R.guard(ctx, c)
        assert v2["classification"] == "rejected" and any("RULE 09" in x for x in v2["rejection_reasons"])
        c3 = dict(r["candidates"][0]); c3["quote"] = None
        assert R.guard(ctx, c3)["classification"] == "rejected"
        c4 = dict(r["candidates"][0]); c4["prob"] = 0.95; c4["breakeven"] = 0.52; c4["interval"] = {"low": 0.9, "high": 0.97, "n": 500}
        v4 = R.guard(ctx, c4)
        assert v4["classification"] == "rejected" and any("Implausible" in x for x in v4["rejection_reasons"])
        c5 = dict(r["candidates"][0]); c5["player_out"] = "Out"
        assert R.guard(ctx, c5)["classification"] == "rejected"
        s.rollback()


def test_long_shot_and_near_certain_prices_cannot_qualify():
    late = STATE["tipoff"] - timedelta(minutes=30)
    with gdb.session_scope() as s:
        ctx = R.SlateContext(s, SLATE, late)
        c = dict(R.evaluate_game(ctx, ctx.games[0], "probe")["candidates"][0])
        base = dict(c, sample_size=40, unavailable=[], uncertain=[])
        ok = R.guard(ctx, dict(base, prob=0.60, breakeven=0.52, interval={"low": 0.56, "high": 0.64, "n": 500}))
        tail = R.guard(ctx, dict(base, prob=0.20, breakeven=0.12, interval={"low": 0.16, "high": 0.24, "n": 500}))
        sure = R.guard(ctx, dict(base, prob=0.95, breakeven=0.88, interval={"low": 0.92, "high": 0.97, "n": 500}))
        assert ok["classification"] == "standard"
        assert tail["classification"] == "watchlist" and any("outside" in r for r in tail["rejection_reasons"])
        assert sure["classification"] == "watchlist"
        s.rollback()


def test_forbidden_certainty_language_blocked():
    with pytest.raises(ValueError):
        R.assert_no_forbidden_language("This is a guaranteed winner")
    R.assert_no_forbidden_language("High-confidence research candidate with stated uncertainty")


@pytest.mark.parametrize("table", ["predictions", "selections", "combos", "editions", "odds_snapshots",
                                   "injury_snapshots", "paper_tickets", "model_evaluations"])
def test_history_cannot_be_rewritten(table):
    eng = gdb.get_engine()
    for stmt in (f"UPDATE {table} SET id = id", f"DELETE FROM {table}", f"TRUNCATE {table}"):
        with pytest.raises(DBAPIError) as e:
            with eng.begin() as c:
                c.execute(text(stmt))
        assert "immutable" in str(e.value)


def test_material_change_invalidates_without_rewriting():
    t = STATE["teams"]
    now = STATE["now"] + timedelta(hours=3)
    with gdb.session_scope() as s:
        before = {x.id: (x.classification, x.line, x.prob) for x in s.scalars(select(gdb.Selection).where(
            gdb.Selection.edition_id == STATE["ed2"]["id"]))}
        qualified_before = [x for x in s.scalars(select(gdb.Selection).where(
            gdb.Selection.edition_id == STATE["ed2"]["id"])) if x.classification in R.QUALIFIED]
    for i in range(4):  # the market moves 4 points on every game
        add_quotes(f"S{i}", t[2 * i], t[2 * i + 1], spread=-5.5, total=229.5, at=now - timedelta(minutes=10))
    star = STATE["players"][t[0]][0]
    add_injuries([(star, f"Synthetic Player {star}", t[0], "Out")], at=now - timedelta(minutes=5))
    res = R.publish_edition(SLATE, "afternoon", now=now)
    with gdb.session_scope() as s:
        after = {x.id: (x.classification, x.line, x.prob) for x in s.scalars(select(gdb.Selection).where(
            gdb.Selection.edition_id == STATE["ed2"]["id"]))}
        assert after == before  # the earlier edition is untouched
        e = s.get(gdb.Edition, res["id"])
        assert any(c["type"] == "market_move" for c in e.changes)
        assert any(c["type"] == "injury" and "Out" in c["text"] for c in e.changes)
        inv = s.scalar(select(text("count(*)")).select_from(gdb.ResearchEvent).where(gdb.ResearchEvent.kind == "invalidated"))
        if qualified_before:
            assert inv >= 1
        new = list(s.scalars(select(gdb.Selection).where(gdb.Selection.edition_id == res["id"], gdb.Selection.game_id == "S0")))
        assert any("unavailable" in " ".join(x.evidence["opposing"]).lower() for x in new)


def test_predictions_freeze_at_tipoff():
    after_tip = STATE["tipoff"] + timedelta(minutes=5)
    add_injuries([], at=after_tip - timedelta(minutes=1))
    res = R.publish_edition(SLATE, "pregame", now=after_tip)
    assert res["games_evaluated"] == 0 and res["selections"] == 0 and res["predictions"] == 0


def _sel(s, classification=None):
    q = select(gdb.Selection).where(gdb.Selection.edition_id == STATE["ed2"]["id"]).order_by(gdb.Selection.id)
    return [x for x in s.scalars(q) if classification is None or x.classification in classification]


def test_paper_ticket_rules_and_settlement():
    now = STATE["now"] + timedelta(hours=2)
    with gdb.session_scope() as s:
        sels = _sel(s)
        home_sp = next(x for x in sels if x.game_id == "S0" and x.market == "spread" and x.side == "home")
        over = next(x for x in sels if x.game_id == "S1" and x.market == "total" and x.side == "over")
        ml_away = next(x for x in sels if x.game_id == "S2" and x.market == "moneyline" and x.side == "away")
        t1 = create_ticket(s, [home_sp], source="owner", created_by="t", now=now)
        t2 = create_ticket(s, [home_sp, over], source="builder", created_by="t", now=now)
        t3 = create_ticket(s, [home_sp, over, ml_away], source="builder", created_by="t", now=now)
        assert (t1.engine, t2.engine, t3.engine) == ("SINGLE", "DOUBLE", "TRIPLE")
        assert t2.structure == "CROSS" and t2.price_basis == "leg_product_reference"
        assert abs(t2.price_decimal - (1 + 100 / 110) ** 2) < 1e-3  # both legs quoted at -110
        assert t1.legs[0]["odds_snapshot_id"] and t1.legs[0]["model_version_id"]
        with pytest.raises(LedgerError):
            create_ticket(s, [home_sp, home_sp], source="owner", created_by="t", now=now)
        with pytest.raises(LedgerError):
            create_ticket(s, [home_sp], source="owner", created_by="t", now=now, stake_units=1000)
        with pytest.raises(LedgerError):  # after tipoff
            create_ticket(s, [home_sp], source="owner", created_by="t", now=STATE["tipoff"] + timedelta(minutes=1))
        STATE["tickets"] = (t1.id, t2.id, t3.id)
    r = settle_date(SLATE)
    assert r["unresolved"] >= 3 and r["settled"] == 0  # games not final: nothing is guessed
    with gdb.session_scope() as s:
        g0, g1, g2, g3 = (s.get(gdb.Game, f"S{i}") for i in range(4))
        g0.status, g0.home_points, g0.away_points, g0.home_poss, g0.away_poss = "final", 140, 100, 98, 98   # home covers any line
        g1.status, g1.home_points, g1.away_points = "final", 100, 100                                       # total 200: over loses
        g2.status = "postponed"
        g3.status, g3.home_points, g3.away_points = "final", 120, 119
    r = settle_date(SLATE)
    with gdb.session_scope() as s:
        cur = lambda tid: s.scalar(select(gdb.PaperSettlement).where(gdb.PaperSettlement.ticket_id == tid).order_by(gdb.PaperSettlement.id.desc()))  # noqa: E731
        a, b, c = (cur(t) for t in STATE["tickets"])
        assert a.result == "win" and abs(a.pnl_units - 100 / 110) < 1e-6
        assert b.result == "loss" and b.pnl_units == -1.0
        assert c.result == "loss" and [x["result"] for x in c.leg_results] == ["win", "loss", "void"]
        assert a.supersedes_id is not None  # the unresolved row was superseded, not edited
        assert a.forensic["verdict"] and a.forensic["findings"]
        n_rows = s.scalar(select(text("count(*)")).select_from(gdb.PaperSettlement))
        assert s.scalar(select(text("count(*)")).select_from(gdb.PredictionOutcome)) > 0
    assert settle_date(SLATE)["settled"] == 0  # idempotent
    with gdb.session_scope() as s:
        assert s.scalar(select(text("count(*)")).select_from(gdb.PaperSettlement)) == n_rows
        g1 = s.get(gdb.Game, "S1"); g1.home_points, g1.away_points = 130, 120  # stat correction
    settle_date(SLATE)
    with gdb.session_scope() as s:
        b2 = s.scalar(select(gdb.PaperSettlement).where(gdb.PaperSettlement.ticket_id == STATE["tickets"][1]).order_by(gdb.PaperSettlement.id.desc()))
        assert b2.result == "win" and b2.supersedes_id is not None
        assert s.scalar(select(text("count(*)")).select_from(gdb.ResearchEvent).where(gdb.ResearchEvent.kind == "settlement_corrected")) >= 1
        assert s.scalar(select(text("count(*)")).select_from(gdb.PaperSettlement).where(gdb.PaperSettlement.ticket_id == STATE["tickets"][1])) == 3


def test_push_and_void_grading():
    from gizer.ledger import grade_leg
    with gdb.session_scope() as s:
        g = s.get(gdb.Game, "S3")  # 120-119
        leg = {"label": "x", "key": "k", "market": "spread", "side": "away", "line": 1.0, "game_id": "S3"}
        assert grade_leg(s, leg, g)["result"] == "push"
        assert grade_leg(s, {**leg, "market": "total", "side": "under", "line": 239.0}, g)["result"] == "push"
        assert grade_leg(s, {**leg, "market": "moneyline", "side": "home", "line": None}, g)["result"] == "win"
        assert grade_leg(s, leg, None)["result"] == "void"
        g.box_ingested_at = gdb.utcnow()
        dnp = {"label": "p", "key": "k2", "market": "player_pts", "side": "over", "line": 10.5, "game_id": "S3", "subject_id": 424242}
        assert grade_leg(s, dnp, g)["result"] == "void"


def test_results_report_shows_all_engines_and_losses():
    with gdb.session_scope() as s:
        rep = results_report(s, [])
        assert [e["engine"] for e in rep["by_engine"]] == ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "FIVE", "SIX"]
        sm = rep["summary"]
        assert sm["wins"] >= 1 and sm["settled"] == sm["wins"] + sm["losses"] + sm["pushes"] + sm["voids"]
        assert rep["total"] == rep["summary"]["tickets"]
        assert all(st is not None for _, st in rep["rows"])  # every ticket is listed with its outcome, wins and losses alike
        assert "not real" in rep["disclaimer"].lower()


def test_exposure_report_flags_shared_legs():
    with gdb.session_scope() as s:
        ce = s.scalar(select(gdb.ModelEvaluation).where(gdb.ModelEvaluation.kind == "correlation"))
        tm = M.production_model(s, "team_game")
        rep = exposure_report(s, SLATE, ce.metrics, tm.params)
        assert rep["n_tickets"] >= 3
        top = rep["selections"][0]
        assert top["tickets"] >= 3 and any("fail" in a for a in rep["shared_assumptions"])
        sim = rep["simulation"]
        assert abs(sim["p_at_least_one"] + sim["p_all_lose"] - 1) < 1e-9 and sim["draws"] > 0 and sim["seed"]
        assert rep == exposure_report(s, SLATE, ce.metrics, tm.params)  # reproducible
        assert any(p["shared_legs"] >= 1 and p["rho"] > 0.2 for p in rep["pairwise"])
        assert all("independent opportunities" not in n or "not" in n for n in rep["notes"])
