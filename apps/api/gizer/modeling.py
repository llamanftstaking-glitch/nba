"""Quantitative modeling engine: point-in-time features, baselines, probabilistic models, walk-forward
evaluation, and the model registry with an independent promotion gate.

Leakage control: every feature for a game on date D is a function of rows with game_date < D only.
`player_post_state` computes each player's state *after* each game; training/backtest features are that
state shifted by one game, and live features are the last state. One code path, tested for equality.
"""
from __future__ import annotations

import math
from datetime import date

import numpy as np
import pandas as pd
from scipy import stats as sps
from sqlalchemy import select

from .db import Game, ModelEvaluation, ModelVersion, PlayerBox, ResearchEvent, session_scope, utcnow

BASE_STATS = ["pts", "reb", "ast", "fg3m", "stl", "blk", "tov"]
COMBO_STATS = {"pra": ("pts", "reb", "ast"), "pr": ("pts", "reb"), "pa": ("pts", "ast"), "ra": ("reb", "ast")}
PLAYER_STATS = [*BASE_STATS, *COMBO_STATS]  # every stat has its own model family, evaluation and gate


def add_combo_stats(df):
    for k, parts in COMBO_STATS.items():
        df[k] = sum(df[p] for p in parts)
    return df
DECAY = 0.94          # per-game exponential decay of a player's history
PRIOR_MINUTES = 60.0  # shrinkage toward the league per-minute rate (pseudo-minutes)
MIN_PRIOR_GAMES = 5
MIN_PROJ_MINUTES = 10.0
TEAM_DECAY = 0.96
TEAM_PRIOR_GAMES = 6.0

PLAYER_MODEL = ("minutes_rate_nb", "1.0.0")
TEAM_MODEL = ("efficiency_normal", "1.0.0")
SCIENTIST_PLAYER = "agent-11-player-projection-scientist"
SCIENTIST_TEAM = "agent-12-team-projection-scientist"
AUDITOR = "agent-18-chief-model-auditor"

# Promotion gate (see MODEL-CARDS.md). Applied by the auditor, never by the model's author.
GATE = {"min_eval_obs": 1000, "max_mae_ratio_vs_best_baseline": 1.01, "max_coverage_gap": 0.04,
        "max_ece": 0.04, "team_min_eval_games": 150, "team_max_ece": 0.05}


# ---------------------------------------------------------------- data frames
def load_player_frame(s, before: date | None = None) -> pd.DataFrame:
    q = select(PlayerBox.game_id, PlayerBox.player_id, PlayerBox.team_id, PlayerBox.opp_team_id, PlayerBox.game_date,
               PlayerBox.season, PlayerBox.is_home, PlayerBox.minutes, *[getattr(PlayerBox, c) for c in BASE_STATS])
    if before:
        q = q.where(PlayerBox.game_date < before)
    df = pd.DataFrame(s.execute(q).all(), columns=["game_id", "player_id", "team_id", "opp_team_id", "game_date",
                                                   "season", "is_home", "minutes", *BASE_STATS])
    if df.empty:
        return df
    add_combo_stats(df)
    df["game_date"] = pd.to_datetime(df["game_date"])
    return df.sort_values(["game_date", "game_id", "player_id"]).reset_index(drop=True)


def load_games_frame(s, before: date | None = None) -> pd.DataFrame:
    q = select(Game.id, Game.game_date, Game.season, Game.home_team_id, Game.away_team_id, Game.home_points,
               Game.away_points, Game.home_poss, Game.away_poss).where(
        Game.status == "final", Game.home_points.is_not(None), Game.home_poss.is_not(None))
    if before:
        q = q.where(Game.game_date < before)
    df = pd.DataFrame(s.execute(q).all(), columns=["game_id", "game_date", "season", "home", "away", "hp", "ap",
                                                   "hposs", "aposs"])
    if df.empty:
        return df
    df["game_date"] = pd.to_datetime(df["game_date"])
    return df.sort_values(["game_date", "game_id"]).reset_index(drop=True)


# ---------------------------------------------------------------- player features
def player_post_state(df: pd.DataFrame) -> pd.DataFrame:
    """State of each player AFTER each of their games (includes that game). Input sorted by date."""
    g = df.groupby("player_id", sort=False)
    out = df[["game_id", "player_id", "team_id", "game_date", "season"]].copy()
    n = g.cumcount() + 1
    out["n_games"] = n
    wsum = (1 - DECAY ** n) / (1 - DECAY)  # sum of decay weights over the player's games so far
    ew = lambda col: g[col].transform(lambda x: x.ewm(alpha=1 - DECAY, adjust=True).mean())  # noqa: E731
    out["d_min"] = ew("minutes") * wsum
    out["min_ewm"] = g["minutes"].transform(lambda x: x.ewm(halflife=4, adjust=True).mean())
    out["min_l10"] = g["minutes"].transform(lambda x: x.rolling(10, min_periods=1).mean())
    out["min_sd"] = g["minutes"].transform(lambda x: x.rolling(10, min_periods=3).std())
    for st in PLAYER_STATS:
        out[f"d_{st}"] = ew(st) * wsum
        out[f"avg_{st}"] = g[st].transform(lambda x: x.expanding().mean())
        out[f"l10_{st}"] = g[st].transform(lambda x: x.rolling(10, min_periods=1).mean())
        out[f"ewm_{st}"] = g[st].transform(lambda x: x.ewm(halflife=5, adjust=True).mean())
    out["last_date"] = df["game_date"]
    return out


STATE_COLS = (["n_games", "d_min", "min_ewm", "min_l10", "min_sd", "last_date"]
              + [f"{p}_{st}" for st in PLAYER_STATS for p in ("d", "avg", "l10", "ewm")])


def league_rates_before(df: pd.DataFrame) -> pd.DataFrame:
    """League per-minute rate of each stat using only dates strictly before each date."""
    daily = df.groupby("game_date")[["minutes", *PLAYER_STATS]].sum().sort_index()
    cum = daily.cumsum().shift(1)
    out = pd.DataFrame(index=daily.index)
    for st in PLAYER_STATS:
        out[f"lg_{st}"] = cum[st] / cum["minutes"]
    return out


def league_rates_now(df: pd.DataFrame) -> dict:
    tot = df[["minutes", *PLAYER_STATS]].sum()
    return {f"lg_{st}": float(tot[st] / tot["minutes"]) for st in PLAYER_STATS}


def _apply_projection(f: pd.DataFrame) -> pd.DataFrame:
    """Turn a (pre-game) state into projections. Used identically for backtests and live predictions."""
    f["proj_min"] = 0.6 * f["min_ewm"] + 0.4 * f["min_l10"]
    for st in PLAYER_STATS:
        rate = (f[f"d_{st}"] + PRIOR_MINUTES * f[f"lg_{st}"]) / (f["d_min"] + PRIOR_MINUTES)
        f[f"rate_{st}"] = rate
        f[f"mu_{st}"] = rate * f["proj_min"]
    return f


def build_player_backtest_frame(df: pd.DataFrame) -> pd.DataFrame:
    """One row per player-game with pre-game features (strictly prior information) and actual outcomes."""
    post = player_post_state(df)
    pre = post.groupby("player_id", sort=False)[STATE_COLS].shift(1)
    f = pd.concat([df, pre], axis=1)
    f = f.join(league_rates_before(df), on="game_date")
    f["rest_days"] = (f["game_date"] - f["last_date"]).dt.days.clip(upper=10)
    f = _apply_projection(f)
    f = f[(f["n_games"] >= MIN_PRIOR_GAMES) & (f["proj_min"] >= MIN_PROJ_MINUTES)].copy()
    return f.dropna(subset=[f"lg_{PLAYER_STATS[0]}"])


def live_player_features(df: pd.DataFrame, as_of: date) -> pd.DataFrame:
    """Pre-game features for each player's NEXT game, from history strictly before `as_of`."""
    hist = df[df["game_date"] < pd.Timestamp(as_of)]
    if hist.empty:
        return hist
    post = player_post_state(hist)
    last = post.groupby("player_id", sort=False).tail(1).copy()
    for k, v in league_rates_now(hist).items():
        last[k] = v
    last["rest_days"] = (pd.Timestamp(as_of) - last["last_date"]).dt.days.clip(upper=10)
    return _apply_projection(last)


# ---------------------------------------------------------------- distributions
def nb_params(mu: float, r: float) -> tuple[float, float]:
    mu = max(mu, 1e-6)
    return r, r / (r + mu)


def dist_quantiles(dist: dict) -> tuple[float, float, float]:
    if dist["family"] == "nbinom":
        n, p = nb_params(dist["mu"], dist["r"])
        return tuple(float(x) for x in sps.nbinom.ppf([0.1, 0.5, 0.9], n, p))
    return tuple(float(x) for x in sps.norm.ppf([0.1, 0.5, 0.9], dist["mu"], dist["sd"]))


def prob_over(dist: dict, line: float) -> tuple[float, float]:
    """(P(X > line), P(X == line)). The second term is the push probability for whole-number lines."""
    if dist["family"] == "nbinom":
        n, p = nb_params(dist["mu"], dist["r"])
        over = float(sps.nbinom.sf(math.floor(line), n, p))
        push = float(sps.nbinom.pmf(int(line), n, p)) if float(line).is_integer() else 0.0
        return over, push
    # team scores: integer outcomes approximated by a normal with continuity handling for whole lines
    if float(line).is_integer():
        over = float(sps.norm.sf(line + 0.5, dist["mu"], dist["sd"]))
        push = float(sps.norm.cdf(line + 0.5, dist["mu"], dist["sd"]) - sps.norm.cdf(line - 0.5, dist["mu"], dist["sd"]))
        return over, push
    return float(sps.norm.sf(line, dist["mu"], dist["sd"])), 0.0


def fit_nb_dispersion(y: np.ndarray, mu: np.ndarray) -> float:
    """Method of moments for Var = mu + mu^2 / r. Returns a large r (≈Poisson) if no overdispersion."""
    excess = float(np.sum((y - mu) ** 2 - mu))
    if excess <= 0:
        return 1e6
    return float(np.clip(np.sum(mu ** 2) / excess, 0.5, 1e6))


def wilson(k: float, n: int, z: float = 1.96) -> tuple[float, float] | None:
    if n <= 0:
        return None
    ph = k / n
    den = 1 + z * z / n
    c = (ph + z * z / (2 * n)) / den
    h = z * math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / den
    return max(0.0, c - h), min(1.0, c + h)


def calibration_table(p: np.ndarray, y: np.ndarray, bins: int = 10) -> list[dict]:
    out = []
    idx = np.clip((p * bins).astype(int), 0, bins - 1)
    for b in range(bins):
        m = idx == b
        n = int(m.sum())
        row = {"lo": b / bins, "hi": (b + 1) / bins, "n": n, "predicted": None, "observed": None, "ci": None}
        if n:
            ci = wilson(float(y[m].sum()), n)
            row.update(predicted=float(p[m].mean()), observed=float(y[m].mean()), ci=[ci[0], ci[1]])
        out.append(row)
    return out


def ece(table: list[dict]) -> float | None:
    n = sum(r["n"] for r in table)
    if not n:
        return None
    return float(sum(r["n"] * abs(r["predicted"] - r["observed"]) for r in table if r["n"]) / n)


def calibrated_interval(table: list[dict], p: float, min_n: int = 30) -> dict:
    """Uncertainty interval for a model probability: the Wilson interval of the observed out-of-sample
    frequency in the calibration bin containing p, re-centred on p by the bin's calibration error."""
    for r in table:
        if r["lo"] <= p < r["hi"] or (p >= 1.0 and r["hi"] >= 1.0):
            if r["n"] < min_n or r["ci"] is None:
                return {"low": None, "high": None, "n": r["n"], "bias": None}
            half = (r["ci"][1] - r["ci"][0]) / 2
            bias = r["observed"] - r["predicted"]
            return {"low": max(0.0, p + bias - half), "high": min(1.0, p + bias + half), "n": r["n"], "bias": bias}
    return {"low": None, "high": None, "n": 0, "bias": None}


def _split_dates(dates: pd.Series) -> tuple[pd.Timestamp, pd.Timestamp]:
    u = np.sort(dates.unique())
    return pd.Timestamp(u[int(len(u) * 0.55)]), pd.Timestamp(u[int(len(u) * 0.75)])


def _period(d: pd.Series) -> str:
    return f"{d.min().date()}..{d.max().date()}" if len(d) else "empty"


# ---------------------------------------------------------------- player walk-forward
def backtest_player_stat(f: pd.DataFrame, stat: str, with_gbm: bool = True) -> dict:
    """Chronological evaluation. Train < t1 <= calibration < t2 <= final evaluation. No random splits."""
    t1, t2 = _split_dates(f["game_date"])
    train, cal, ev = f[f["game_date"] < t1], f[(f["game_date"] >= t1) & (f["game_date"] < t2)], f[f["game_date"] >= t2]
    y_ev, mu_ev = ev[stat].to_numpy(float), ev[f"mu_{stat}"].to_numpy(float)
    r = fit_nb_dispersion(cal[stat].to_numpy(float), cal[f"mu_{stat}"].to_numpy(float))

    def err(pred):
        e = y_ev - pred
        return {"mae": float(np.mean(np.abs(e))), "rmse": float(np.sqrt(np.mean(e ** 2))), "bias": float(np.mean(e))}

    models = {"minutes_rate_nb": err(mu_ev), "baseline_season_avg": err(ev[f"avg_{stat}"].to_numpy(float)),
              "baseline_last10_avg": err(ev[f"l10_{stat}"].to_numpy(float)),
              "baseline_ewma": err(ev[f"ewm_{stat}"].to_numpy(float))}
    if with_gbm and len(train) > 2000:
        from sklearn.ensemble import HistGradientBoostingRegressor
        cols = ["proj_min", f"rate_{stat}", f"avg_{stat}", f"l10_{stat}", f"ewm_{stat}", "min_sd", "rest_days",
                "is_home", "n_games"]
        gbm = HistGradientBoostingRegressor(loss="poisson", max_iter=200, learning_rate=0.05, max_depth=4,
                                            random_state=20261124)
        fit = pd.concat([train, cal])  # the GBM is scored on the final period only
        gbm.fit(fit[cols].astype(float), fit[stat].astype(float))
        models["challenger_gbm_poisson"] = err(gbm.predict(ev[cols].astype(float)))

    n_, p_ = r, r / (r + np.maximum(mu_ev, 1e-6))
    lo, hi = sps.nbinom.ppf(0.1, n_, p_), sps.nbinom.ppf(0.9, n_, p_)
    cov = float(np.mean((y_ev >= lo) & (y_ev <= hi)))
    # For discrete counts the nominal "80%" interval covers more than 80%; compare with the model's own
    # expected coverage of the same integer interval.
    cov_expected = float(np.mean(sps.nbinom.cdf(hi, n_, p_) - sps.nbinom.cdf(lo - 1, n_, p_)))
    # Over/under calibration at pseudo-lines (rounded last-10 average + 0.5). These are NOT market lines.
    line = np.floor(ev[f"l10_{stat}"].to_numpy(float)) + 0.5
    p_over = sps.nbinom.sf(np.floor(line), n_, p_)
    hit = (y_ev > line).astype(float)
    pc = np.clip(p_over, 1e-6, 1 - 1e-6)
    table = calibration_table(p_over, hit)
    base_p = float((cal[stat].to_numpy(float) > np.floor(cal[f"l10_{stat}"].to_numpy(float)) + 0.5).mean())
    best_base = min(v["mae"] for k, v in models.items() if k.startswith("baseline"))
    metrics = {
        "stat": stat, "dispersion_r": r, "n_train": int(len(train)), "n_calibration": int(len(cal)),
        "n_eval": int(len(ev)), "models": models, "best_baseline_mae": best_base,
        "mae_ratio_vs_best_baseline": models["minutes_rate_nb"]["mae"] / best_base,
        "coverage_80": cov, "coverage_80_expected": cov_expected, "brier": float(np.mean((p_over - hit) ** 2)),
        "brier_baseline_constant": float(np.mean((base_p - hit) ** 2)),
        "log_loss": float(-np.mean(hit * np.log(pc) + (1 - hit) * np.log(1 - pc))),
        "ece": ece(table), "calibration": table,
        "pseudo_line_note": "over/under calibration uses floor(last-10 average)+0.5 as a pseudo-line; "
                            "it is a forecasting test, not a market backtest",
        "filters": {"min_prior_games": MIN_PRIOR_GAMES, "min_projected_minutes": MIN_PROJ_MINUTES},
    }
    g = GATE
    checks = {"enough_observations": metrics["n_eval"] >= g["min_eval_obs"],
              "not_worse_than_best_baseline": metrics["mae_ratio_vs_best_baseline"] <= g["max_mae_ratio_vs_best_baseline"],
              "interval_coverage": abs(cov - cov_expected) <= g["max_coverage_gap"],
              "calibration_ece": metrics["ece"] is not None and metrics["ece"] <= g["max_ece"]}
    metrics["gate_checks"] = checks
    return {"metrics": metrics, "passed": all(checks.values()),
            "periods": {"training": _period(train["game_date"]), "calibration": _period(cal["game_date"]),
                        "evaluation": _period(ev["game_date"])}}


# ---------------------------------------------------------------- team model
def team_long(games: pd.DataFrame) -> pd.DataFrame:
    h = games.rename(columns={"home": "team", "away": "opp", "hp": "pts", "ap": "opp_pts", "hposs": "poss"})
    a = games.rename(columns={"away": "team", "home": "opp", "ap": "pts", "hp": "opp_pts", "aposs": "poss"})
    h, a = h.assign(is_home=True), a.assign(is_home=False)
    cols = ["game_id", "game_date", "team", "opp", "pts", "opp_pts", "poss", "is_home"]
    t = pd.concat([h[cols], a[cols]]).sort_values(["game_date", "game_id"]).reset_index(drop=True)
    t["off"] = 100 * t["pts"] / t["poss"]
    t["deff"] = 100 * t["opp_pts"] / t["poss"]
    return t


def team_post_state(t: pd.DataFrame) -> pd.DataFrame:
    g = t.groupby("team", sort=False)
    out = t[["game_id", "game_date", "team"]].copy()
    out["tn"] = g.cumcount() + 1
    for c in ("off", "deff", "poss"):
        out[f"t_{c}"] = g[c].transform(lambda x: x.ewm(alpha=1 - TEAM_DECAY, adjust=True).mean())
    return out


def _team_shrink(st: pd.DataFrame, lg: dict) -> pd.DataFrame:
    w = st["tn"] / (st["tn"] + TEAM_PRIOR_GAMES)
    for c in ("off", "deff", "poss"):
        st[f"s_{c}"] = w * st[f"t_{c}"] + (1 - w) * lg[c]
    return st


def build_team_backtest_frame(games: pd.DataFrame) -> pd.DataFrame:
    t = team_long(games)
    post = team_post_state(t)
    pre = post.groupby("team", sort=False)[["tn", "t_off", "t_deff", "t_poss"]].shift(1)
    st = pd.concat([t[["game_id", "game_date", "team", "is_home"]], pre], axis=1)
    daily = t.groupby("game_date")[["pts", "poss"]].sum().sort_index().cumsum().shift(1)
    ngames = t.groupby("game_date").size().sort_index().cumsum().shift(1)
    lg_off = (100 * daily["pts"] / daily["poss"]).rename("lg_off")
    lg_poss = (daily["poss"] / ngames).rename("lg_poss")
    st = st.join(lg_off, on="game_date").join(lg_poss, on="game_date")
    st = st.dropna(subset=["tn", "lg_off"])
    st = _team_shrink(st, {"off": st["lg_off"], "deff": st["lg_off"], "poss": st["lg_poss"]})
    h = st[st["is_home"]].set_index("game_id")
    a = st[~st["is_home"]].set_index("game_id")
    g = games.set_index("game_id").join(h[["tn", "s_off", "s_deff", "s_poss", "lg_off", "lg_poss"]].add_prefix("h_"),
                                        how="inner").join(a[["tn", "s_off", "s_deff", "s_poss"]].add_prefix("a_"),
                                                          how="inner")
    g["poss"] = (g["h_s_poss"] + g["a_s_poss"]) / 2
    g["raw_h"] = g["poss"] * (g["h_s_off"] + g["a_s_deff"] - g["h_lg_off"]) / 100
    g["raw_a"] = g["poss"] * (g["a_s_off"] + g["h_s_deff"] - g["h_lg_off"]) / 100
    return g.reset_index()


def backtest_team(g: pd.DataFrame) -> dict:
    t1, t2 = _split_dates(g["game_date"])
    train, cal, ev = g[g["game_date"] < t1], g[(g["game_date"] >= t1) & (g["game_date"] < t2)], g[g["game_date"] >= t2]
    fit = pd.concat([train, cal])
    hca = float(((fit["hp"] - fit["ap"]) - (fit["raw_h"] - fit["raw_a"])).mean())
    rh, ra = cal["hp"] - (cal["raw_h"] + hca / 2), cal["ap"] - (cal["raw_a"] - hca / 2)
    sd_h, sd_a = float(rh.std()), float(ra.std())
    rho = float(np.corrcoef(rh, ra)[0, 1])
    params = {"hca": hca, "sd_home": sd_h, "sd_away": sd_a, "rho": rho}
    mu_h, mu_a = ev["raw_h"] + hca / 2, ev["raw_a"] - hca / 2
    margin, total = (ev["hp"] - ev["ap"]).to_numpy(float), (ev["hp"] + ev["ap"]).to_numpy(float)
    mu_m, mu_t = (mu_h - mu_a).to_numpy(float), (mu_h + mu_a).to_numpy(float)
    sd_m = math.sqrt(sd_h ** 2 + sd_a ** 2 - 2 * rho * sd_h * sd_a)
    sd_t = math.sqrt(sd_h ** 2 + sd_a ** 2 + 2 * rho * sd_h * sd_a)
    base_margin = float((fit["hp"] - fit["ap"]).mean())
    base_total = float((fit["hp"] + fit["ap"]).mean())
    p_home = sps.norm.sf(0, mu_m, sd_m)
    win = (margin > 0).astype(float)
    base_p = float(((fit["hp"] - fit["ap"]) > 0).mean())
    # threshold-event calibration pooled over fixed offsets around the baseline (not market lines)
    ps, ys = [p_home], [win]
    for off in (-8, -4, 4, 8):
        ps.append(sps.norm.sf(base_margin + off, mu_m, sd_m)); ys.append((margin > base_margin + off).astype(float))
    for off in (-12, -6, 0, 6, 12):
        ps.append(sps.norm.sf(base_total + off, mu_t, sd_t)); ys.append((total > base_total + off).astype(float))
    table = calibration_table(np.concatenate(ps), np.concatenate(ys))
    lo_t, hi_t = sps.norm.ppf(0.1, mu_t, sd_t), sps.norm.ppf(0.9, mu_t, sd_t)
    metrics = {
        "params": params, "sd_margin": sd_m, "sd_total": sd_t,
        "n_train": int(len(train)), "n_calibration": int(len(cal)), "n_eval": int(len(ev)),
        "margin_mae": float(np.mean(np.abs(margin - mu_m))), "margin_mae_baseline": float(np.mean(np.abs(margin - base_margin))),
        "total_mae": float(np.mean(np.abs(total - mu_t))), "total_mae_baseline": float(np.mean(np.abs(total - base_total))),
        "home_win_brier": float(np.mean((p_home - win) ** 2)), "home_win_brier_baseline": float(np.mean((base_p - win) ** 2)),
        "home_win_accuracy": float(np.mean((p_home > 0.5) == (win > 0.5))),
        "total_coverage_80": float(np.mean((total >= lo_t) & (total <= hi_t))),
        "ece": ece(table), "calibration": table,
        "calibration_note": "pooled threshold events around historical baselines (correlated within game); "
                            "NOT calibration against market lines, which requires historical odds",
    }
    checks = {"enough_games": metrics["n_eval"] >= GATE["team_min_eval_games"],
              "margin_beats_baseline": metrics["margin_mae"] < metrics["margin_mae_baseline"],
              "home_win_brier_beats_baseline": metrics["home_win_brier"] < metrics["home_win_brier_baseline"],
              "calibration_ece": metrics["ece"] is not None and metrics["ece"] <= GATE["team_max_ece"]}
    metrics["gate_checks"] = checks
    return {"metrics": metrics, "passed": all(checks.values()), "params": params,
            "periods": {"training": _period(train["game_date"]), "calibration": _period(cal["game_date"]),
                        "evaluation": _period(ev["game_date"])}}


def live_team_state(games: pd.DataFrame, as_of: date) -> dict:
    """Shrunk team ratings from games strictly before `as_of`: {team_id: {off, deff, poss, n}} + league."""
    hist = games[games["game_date"] < pd.Timestamp(as_of)]
    if hist.empty:
        return {"teams": {}, "league": None}
    t = team_long(hist)
    last = team_post_state(t).groupby("team", sort=False).tail(1).copy()
    lg = {"off": float(100 * t["pts"].sum() / t["poss"].sum()), "poss": float(t["poss"].mean())}
    last = _team_shrink(last, {"off": lg["off"], "deff": lg["off"], "poss": lg["poss"]})
    return {"league": lg, "teams": {int(r.team): {"off": float(r.s_off), "deff": float(r.s_deff),
                                                 "poss": float(r.s_poss), "n": int(r.tn)} for r in last.itertuples()}}


def predict_game(state: dict, params: dict, home: int, away: int) -> dict | None:
    h, a, lg = state["teams"].get(home), state["teams"].get(away), state["league"]
    if not h or not a or not lg:
        return None
    poss = (h["poss"] + a["poss"]) / 2
    mu_h = poss * (h["off"] + a["deff"] - lg["off"]) / 100 + params["hca"] / 2
    mu_a = poss * (a["off"] + h["deff"] - lg["off"]) / 100 - params["hca"] / 2
    sh, sa, rho = params["sd_home"], params["sd_away"], params["rho"]
    return {"mu_home": mu_h, "mu_away": mu_a, "pace": poss, "sd_home": sh, "sd_away": sa, "rho": rho,
            "mu_margin": mu_h - mu_a, "sd_margin": math.sqrt(sh * sh + sa * sa - 2 * rho * sh * sa),
            "mu_total": mu_h + mu_a, "sd_total": math.sqrt(sh * sh + sa * sa + 2 * rho * sh * sa),
            "n_home": h["n"], "n_away": a["n"]}


# ---------------------------------------------------------------- registry
class PromotionError(RuntimeError):
    pass


def register_model(s, family: str, name: str, version: str, params: dict, periods: dict, limitations: str,
                   created_by: str) -> ModelVersion:
    mv = s.scalar(select(ModelVersion).where(ModelVersion.family == family, ModelVersion.name == name,
                                             ModelVersion.version == version))
    if mv is None:
        mv = ModelVersion(family=family, name=name, version=version, params=params, created_by=created_by,
                          limitations=limitations)
        s.add(mv)
    elif mv.status != "production":
        mv.params = params  # a candidate may be re-fit; a production model's parameters are frozen
    if mv.status != "production":
        mv.training_period, mv.calibration_period, mv.evaluation_period = (
            periods["training"], periods["calibration"], periods["evaluation"])
    s.flush()
    return mv


def promote_model(s, mv: ModelVersion, evaluation: ModelEvaluation, promoted_by: str) -> ModelVersion:
    """Independent promotion gate. Enforced in code: no self-promotion, no promotion without a passing,
    sufficiently large out-of-sample evaluation of this exact model version."""
    if promoted_by == mv.created_by:
        raise PromotionError("a model's author cannot promote it (RULE 19: no production model self-promotion)")
    if promoted_by != AUDITOR:
        raise PromotionError("only the Chief Model Auditor may promote models")
    if evaluation.model_version_id != mv.id or evaluation.kind != "walk_forward":
        raise PromotionError("promotion requires a walk-forward evaluation of this model version")
    if not evaluation.passed:
        raise PromotionError("evaluation did not pass the documented promotion gate")
    for old in s.scalars(select(ModelVersion).where(ModelVersion.family == mv.family,
                                                    ModelVersion.status == "production", ModelVersion.id != mv.id)):
        old.status = "retired"  # kept for rollback
    mv.status, mv.promoted_by, mv.promoted_at = "production", promoted_by, utcnow()
    s.add(ResearchEvent(kind="model_promoted", ref_type="model_version", ref_id=str(mv.id), actor=promoted_by,
                        detail={"family": mv.family, "name": mv.name, "version": mv.version,
                                "evaluation_id": evaluation.id}))
    return mv


def production_model(s, family: str) -> ModelVersion | None:
    return s.scalar(select(ModelVersion).where(ModelVersion.family == family, ModelVersion.status == "production"))


def latest_evaluation(s, model_version_id: int) -> ModelEvaluation | None:
    return s.scalar(select(ModelEvaluation).where(ModelEvaluation.model_version_id == model_version_id,
                                                  ModelEvaluation.kind == "walk_forward")
                    .order_by(ModelEvaluation.id.desc()).limit(1))


PLAYER_LIMITS = ("Conditional on the player appearing in the game. Minutes are projected from recent history and do "
                 "not yet react to same-day lineup news beyond published injury statuses. No opponent adjustment. "
                 "Over/under calibration was measured at pseudo-lines, not market lines. Regular season only.")
TEAM_LIMITS = ("Ratings use final scores and possessions only; no injury, rest or travel adjustment. Not validated "
               "against market prices (no historical odds are held), so disagreement with a market line is more "
               "likely model error than opportunity. Normal approximation of integer scores.")


def run_all_backtests(register: bool = True) -> dict:
    """Reproducible walk-forward evaluation of every model family. Stores every result, pass or fail."""
    from .simulation import estimate_correlations
    report = {"player": {}, "team": None, "correlation": None}
    with session_scope() as s:
        pf, gf = load_player_frame(s), load_games_frame(s)
    if pf.empty or pf["game_date"].nunique() < 30:
        return {"status": "abstained", "reason": "insufficient historical data for chronological validation"}
    f = build_player_backtest_frame(pf)
    for st in PLAYER_STATS:
        res = backtest_player_stat(f, st)
        report["player"][st] = {"passed": res["passed"], "gate_checks": res["metrics"]["gate_checks"],
                                "mae": res["metrics"]["models"], "coverage_80": res["metrics"]["coverage_80"],
                                "ece": res["metrics"]["ece"], "n_eval": res["metrics"]["n_eval"]}
        if register:
            with session_scope() as s:
                mv = register_model(s, f"player_{st}", *PLAYER_MODEL,
                                    {"dispersion_r": res["metrics"]["dispersion_r"], "decay": DECAY,
                                     "prior_minutes": PRIOR_MINUTES}, res["periods"], PLAYER_LIMITS, SCIENTIST_PLAYER)
                evl = ModelEvaluation(model_version_id=mv.id, family=mv.family, model_name=mv.name, kind="walk_forward",
                                      period=res["periods"]["evaluation"], n_obs=res["metrics"]["n_eval"],
                                      metrics=res["metrics"], passed=res["passed"],
                                      notes="chronological split: train < calibration < evaluation")
                s.add(evl); s.flush()
                if res["passed"] and mv.status == "candidate":
                    promote_model(s, mv, evl, AUDITOR)
    tg = build_team_backtest_frame(gf)
    tres = backtest_team(tg)
    report["team"] = {"passed": tres["passed"], **{k: v for k, v in tres["metrics"].items() if k != "calibration"}}
    if register:
        with session_scope() as s:
            mv = register_model(s, "team_game", *TEAM_MODEL, tres["params"], tres["periods"], TEAM_LIMITS, SCIENTIST_TEAM)
            evl = ModelEvaluation(model_version_id=mv.id, family="team_game", model_name=mv.name, kind="walk_forward",
                                  period=tres["periods"]["evaluation"], n_obs=tres["metrics"]["n_eval"],
                                  metrics=tres["metrics"], passed=tres["passed"], notes="chronological split")
            s.add(evl); s.flush()
            if tres["passed"] and mv.status == "candidate":
                promote_model(s, mv, evl, AUDITOR)
    corr = estimate_correlations(f, tg, tres["params"])
    report["correlation"] = {k: corr[k] for k in ("n_team_games", "validation")}
    if register:
        with session_scope() as s:
            s.add(ModelEvaluation(model_version_id=None, family="correlation", model_name="gaussian_copula_empirical",
                                  kind="correlation", period=corr["period"], n_obs=corr["n_team_games"], metrics=corr,
                                  passed=corr["validation"]["copula_beats_independence"],
                                  notes="pairwise residual correlations; joint-frequency validation on later period"))
    return report
