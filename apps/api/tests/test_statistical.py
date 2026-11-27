"""Unit + statistical tests: distributions, calibration, leakage, simulation reproducibility, correlation."""
import math

import numpy as np
import pandas as pd
import pytest

from gizer import modeling as M
from gizer import simulation as S


def synth_frame(n_players=40, n_games=60, seed=3):
    rng = np.random.default_rng(seed)
    rows = []
    for g in range(n_games):
        day = pd.Timestamp("2025-11-01") + pd.Timedelta(days=g)
        for p in range(n_players):
            m = max(5.0, rng.normal(20 + p % 15, 3))
            rows.append(dict(game_id=f"G{g:03d}-{p % 4}", player_id=p, team_id=p % 4, opp_team_id=(p + 1) % 4,
                             game_date=day, season="2025-26", is_home=bool(p % 2), minutes=m,
                             pts=int(rng.poisson(0.5 * m)), reb=int(rng.poisson(0.2 * m)),
                             ast=int(rng.poisson(0.12 * m)), fg3m=int(rng.poisson(0.05 * m)),
                             stl=int(rng.poisson(0.03 * m)), blk=int(rng.poisson(0.02 * m)), tov=int(rng.poisson(0.06 * m))))
    return M.add_combo_stats(pd.DataFrame(rows).sort_values(["game_date", "game_id", "player_id"]).reset_index(drop=True))


def test_no_future_information_in_features():
    df = synth_frame()
    cut = pd.Timestamp("2025-12-01")
    a = M.build_player_backtest_frame(df)
    pert = df.copy()
    late = pert["game_date"] > cut
    pert.loc[late, "pts"] = 99
    pert.loc[late, "minutes"] = 1.0
    b = M.build_player_backtest_frame(pert)
    cols = ["mu_pts", "mu_reb", "proj_min", "rate_pts", "lg_pts"]
    ea = a[a["game_date"] <= cut].set_index(["game_id", "player_id"])[cols]
    eb = b[b["game_date"] <= cut].set_index(["game_id", "player_id"])[cols].reindex(ea.index)
    assert len(ea) > 500
    np.testing.assert_allclose(ea.to_numpy(), eb.to_numpy())


def test_live_features_equal_backtest_features():
    """The live path and the backtest path must produce identical pre-game features (one code path)."""
    df = synth_frame()
    d = pd.Timestamp("2025-12-10")
    bt = M.build_player_backtest_frame(df)
    row = bt[bt["game_date"] == d].set_index("player_id")
    live = M.live_player_features(df, d.date()).set_index("player_id").loc[row.index]
    for c in ("mu_pts", "mu_ast", "proj_min", "rate_reb"):
        np.testing.assert_allclose(row[c].to_numpy(), live[c].to_numpy(), rtol=1e-9)


def test_features_exclude_same_day_outcome():
    df = synth_frame()
    f = M.build_player_backtest_frame(df)
    r = f.iloc[-1]
    hist = df[(df["player_id"] == r["player_id"]) & (df["game_date"] < r["game_date"])]
    assert r["n_games"] == len(hist)
    assert math.isclose(r["avg_pts"], hist["pts"].mean())


def test_prob_over_push_and_complement():
    d = {"family": "nbinom", "mu": 20.0, "r": 6.0}
    over, push = M.prob_over(d, 20.5)
    assert push == 0 and 0 < over < 1
    over_i, push_i = M.prob_over(d, 20)
    under_i = 1 - over_i - push_i
    assert push_i > 0 and math.isclose(over_i + push_i + under_i, 1.0)
    assert over_i < over + 1e-12 + push_i
    n = {"family": "normal", "mu": 5.0, "sd": 12.0}
    o, p = M.prob_over(n, 5)
    assert p > 0 and math.isclose(o, (1 - p) / 2, rel_tol=1e-9)


def test_dispersion_and_calibration_on_known_process():
    rng = np.random.default_rng(0)
    mu = rng.uniform(5, 30, 20000)
    r = 5.0
    y = rng.negative_binomial(r, r / (r + mu)).astype(float)
    est = M.fit_nb_dispersion(y, mu)
    assert 4.3 < est < 5.8
    p_over = np.array([M.prob_over({"family": "nbinom", "mu": m, "r": est}, math.floor(m) + 0.5)[0] for m in mu[:4000]])
    hit = (y[:4000] > np.floor(mu[:4000]) + 0.5).astype(float)
    table = M.calibration_table(p_over, hit)
    assert M.ece(table) < 0.03
    iv = M.calibrated_interval(table, 0.45)
    assert iv["low"] < 0.45 < iv["high"] and iv["n"] >= 30
    assert M.calibrated_interval(table, 0.999)["low"] is None  # empty bin => no interval, never invented


def test_wilson_bounds():
    lo, hi = M.wilson(50, 100)
    assert 0.39 < lo < 0.41 and 0.59 < hi < 0.61
    assert M.wilson(0, 0) is None


def test_walk_forward_is_chronological():
    f = M.build_player_backtest_frame(synth_frame(n_games=80))
    res = M.backtest_player_stat(f, "pts", with_gbm=False)
    tr, ca, ev = (res["periods"][k].split("..") for k in ("training", "calibration", "evaluation"))
    assert tr[1] < ca[0] <= ca[1] < ev[0]
    m = res["metrics"]
    assert set(m["models"]) >= {"minutes_rate_nb", "baseline_season_avg", "baseline_last10_avg", "baseline_ewma"}
    assert abs(m["coverage_80"] - m["coverage_80_expected"]) < 0.06
    assert m["gate_checks"]["enough_observations"] is (m["n_eval"] >= M.GATE["min_eval_obs"])



def test_player_dispersion_includes_minutes_uncertainty():
    """1.1.0: a player with volatile minutes gets a wider distribution than one with steady minutes (same mean)."""
    prm = {"dispersion_r0": 20.0, "minutes_var_k": 1.0, "min_sd_fill": 5.0}
    steady = M.player_dist(20.0, 0.6, 1.0, prm)
    volatile = M.player_dist(20.0, 0.6, 9.0, prm)
    assert volatile["r"] < steady["r"]  # smaller r = more variance for a negative binomial
    assert M.player_dist(20.0, 0.6, None, prm)["r"] == M.player_dist(20.0, 0.6, 5.0, prm)["r"]  # missing sd -> fill
    # a 1.0.0 parameter set keeps its single dispersion
    assert M.player_dist(20.0, 0.6, 9.0, {"dispersion_r": 7.5}) == {"family": "nbinom", "mu": 20.0, "r": 7.5}


def test_dispersion_is_fitted_on_calibration_period_only():
    f = M.build_player_backtest_frame(synth_frame(n_games=80))
    t1, t2 = M._split_dates(f["game_date"])
    cal = f[(f["game_date"] >= t1) & (f["game_date"] < t2)]
    res = M.backtest_player_stat(f, "pts", with_gbm=False)
    assert res["metrics"]["dispersion"] == M.fit_player_dispersion(cal, "pts")
    # changing evaluation-period outcomes must not change the fitted dispersion
    g = f.copy()
    g.loc[g["game_date"] >= t2, "pts"] = g.loc[g["game_date"] >= t2, "pts"] * 3
    assert M.backtest_player_stat(g, "pts", with_gbm=False)["metrics"]["dispersion"] == res["metrics"]["dispersion"]


def test_line_calibration_covers_both_sides_and_high_probabilities():
    f = M.build_player_backtest_frame(synth_frame(n_games=80))
    m = M.backtest_player_stat(f, "pts", with_gbm=False)["metrics"]
    lines = m["calibration_lines"]
    # over and under at every pseudo-line: twice the observations per offset, symmetric around 0.5
    assert sum(r["n"] for r in lines) == 2 * len(M.CAL_LINE_OFFSETS) * m["n_eval"]
    assert sum(r["n"] for r in lines if r["lo"] >= 0.6) > sum(r["n"] for r in m["calibration"] if r["lo"] >= 0.6)
    # the promotion-gate ECE is still computed on the original single pseudo-line table
    assert m["ece"] == M.ece(m["calibration"])

CORR = {"team_home_away": 0.25, "own_team": {s: 0.15 for s in S.PLAYER_STATS}, "opp_team": {s: 0.02 for s in S.PLAYER_STATS},
        "same_player": {S._key(a, b): 0.3 for a in S.PLAYER_STATS for b in S.PLAYER_STATS if a != b},
        "teammate": {S._key(a, b): -0.05 for a in S.PLAYER_STATS for b in S.PLAYER_STATS},
        "opponent": {S._key(a, b): 0.02 for a in S.PLAYER_STATS for b in S.PLAYER_STATS}}
TEAM = {"home_team_id": 1, "away_team_id": 2, "sd_home": 12.0, "sd_away": 11.5}


def pleg(game, pid, stat, p, direction=1, team=1):
    return {"game_id": game, "kind": "player", "direction": direction, "prob": p, "prob_low": p - 0.05, "prob_high": p + 0.05,
            "player": {"player_id": pid, "team_id": team, "stat": stat}}


def test_simulation_reproducible_and_seed_sensitive():
    legs = [pleg("g1", 1, "pts", 0.55), pleg("g1", 1, "ast", 0.5), pleg("g1", 2, "pts", 0.6)]
    a = S.joint_probability(legs, CORR, seed=42, draws=20000)
    b = S.joint_probability(legs, CORR, seed=42, draws=20000)
    c = S.joint_probability(legs, CORR, seed=43, draws=20000)
    assert a == b
    assert a["joint"] != c["joint"] and abs(a["joint"] - c["joint"]) < 6 * a["mc_se"]
    assert a["low"] < a["joint"] < a["high"]


def test_simulation_preserves_marginals_and_orders_dependence():
    legs = [pleg("g1", 1, "pts", 0.55), pleg("g1", 1, "ast", 0.45)]
    sim = S.simulate_legs(legs, CORR, seed=1, draws=200000)["central"]
    assert abs(sim[:, 0].mean() - 0.55) < 0.005 and abs(sim[:, 1].mean() - 0.45) < 0.005
    pos = S.joint_probability(legs, CORR, 1, 200000)
    assert pos["joint"] > pos["independent"] + 0.02  # positive same-player correlation
    opp = [pleg("g1", 1, "pts", 0.55), pleg("g1", 1, "ast", 0.45, direction=-1)]
    neg = S.joint_probability(opp, CORR, 1, 200000)
    assert neg["joint"] < neg["independent"] - 0.02  # over + under of positively related stats


def test_cross_game_legs_are_independent_and_exact_quadrature_agrees():
    legs = [pleg("g1", 1, "pts", 0.6), pleg("g2", 9, "pts", 0.5, team=5)]
    j = S.joint_probability(legs, CORR, 5, 200000)
    assert abs(j["joint"] - 0.30) < 4 * j["mc_se"]
    same = S.joint_probability([pleg("g1", 1, "pts", 0.6), pleg("g1", 1, "reb", 0.5)], CORR, 5, 400000)
    exact = float(S.bvn_both_over(np.array([0.6]), np.array([0.5]), 0.3)[0])
    assert abs(same["joint"] - exact) < 0.004


def test_team_legs_margin_total_dependence():
    home = {"game_id": "g1", "kind": "margin", "direction": 1, "prob": 0.5, "prob_low": 0.45, "prob_high": 0.55, "team": TEAM}
    away = {**home, "direction": -1}
    both = S.joint_probability([home, away], CORR, 3, 50000)
    assert both["joint"] < 0.001  # the two sides of one spread cannot both win
    star = pleg("g1", 1, "pts", 0.5, team=1)
    over = {"game_id": "g1", "kind": "total", "direction": 1, "prob": 0.5, "prob_low": 0.45, "prob_high": 0.55, "team": TEAM}
    j = S.joint_probability([star, over], CORR, 3, 200000)
    assert j["joint"] > 0.25  # player points and the game total move together


def test_no_correlation_estimate_means_independence_is_declared():
    legs = [pleg("g1", 1, "pts", 0.5), pleg("g1", 1, "ast", 0.5)]
    j = S.joint_probability(legs, None, 1, 100000)
    assert j["method"] == "independence_assumed" and abs(j["joint"] - 0.25) < 0.01


def test_psd_repair():
    m = np.array([[1, .9, -.9], [.9, 1, .9], [-.9, .9, 1.0]])
    r = S._psd(m)
    assert np.all(np.linalg.eigvalsh(r) > 0) and np.allclose(np.diag(r), 1)


@pytest.mark.parametrize("a,expected", [(-110, 1.9091), (150, 2.5), (100, 2.0), (-453, 1.2208)])
def test_price_conversion(a, expected):
    from gizer.research import american_to_decimal, decimal_to_american
    assert math.isclose(american_to_decimal(a), expected, abs_tol=1e-4)
    assert decimal_to_american(american_to_decimal(a)) == a
