"""Correlation and simulation lab.

Dependence between legs is modelled with a Gaussian copula whose pairwise correlations are estimated
empirically from standardised out-of-sample forecast residuals. Marginal leg probabilities are preserved
exactly; only the dependence comes from the copula. Runs are reproducible (explicit seed and draw count)
and report Monte-Carlo standard error. Simulation frequency is NOT a validated real-world probability.
"""
from __future__ import annotations

import hashlib
import math

import numpy as np
import pandas as pd
from scipy import stats as sps

PLAYER_STATS = ["pts", "reb", "ast", "fg3m"]
METHOD = "gaussian_copula_empirical_v1"


def _key(a: str, b: str) -> str:
    return "|".join(sorted((a, b)))


def bvn_both_over(pa: np.ndarray, pb: np.ndarray, rho: float) -> np.ndarray:
    """P(A and B) for events with marginal probabilities pa, pb under a Gaussian copula (vectorised quadrature)."""
    pa, pb = np.clip(pa, 1e-6, 1 - 1e-6), np.clip(pb, 1e-6, 1 - 1e-6)
    ta, tb = sps.norm.isf(pa), sps.norm.isf(pb)
    x = np.linspace(-6, 6, 241)
    w = sps.norm.pdf(x) * (x[1] - x[0])
    inner = sps.norm.cdf((rho * x[None, :] - tb[:, None]) / math.sqrt(max(1e-9, 1 - rho * rho)))
    return np.sum(w[None, :] * (x[None, :] > ta[:, None]) * inner, axis=1)


def estimate_correlations(f: pd.DataFrame, tg: pd.DataFrame, team_params: dict) -> dict:
    """Estimate pairwise residual correlations on the earlier 75% of dates; validate joint frequencies on the rest."""
    from .modeling import _split_dates, fit_nb_dispersion
    _, t2 = _split_dates(f["game_date"])
    est_mask = f["game_date"] < t2
    z = f[["game_id", "player_id", "team_id", "opp_team_id", "game_date", "minutes", "proj_min"]].copy()
    disp = {}
    for st in PLAYER_STATS:
        mu, y = f[f"mu_{st}"].to_numpy(float), f[st].to_numpy(float)
        r = fit_nb_dispersion(y[est_mask.to_numpy()], mu[est_mask.to_numpy()])
        disp[st] = r
        z[st] = (y - mu) / np.sqrt(mu + mu ** 2 / r)
        z[f"p_{st}"] = sps.nbinom.sf(np.floor(np.floor(f[f"l10_{st}"]) + 0.5), r, r / (r + np.maximum(mu, 1e-6)))
        z[f"hit_{st}"] = (y > np.floor(f[f"l10_{st}"]) + 0.5).astype(float)
    hca = team_params["hca"]
    th = pd.DataFrame({"game_id": tg["game_id"], "team_id": tg["home"],
                       "t_own": (tg["hp"] - tg["raw_h"] - hca / 2) / team_params["sd_home"],
                       "t_opp": (tg["ap"] - tg["raw_a"] + hca / 2) / team_params["sd_away"]})
    ta = pd.DataFrame({"game_id": tg["game_id"], "team_id": tg["away"], "t_own": th["t_opp"].to_numpy(),
                       "t_opp": th["t_own"].to_numpy()})
    z = z.merge(pd.concat([th, ta]), on=["game_id", "team_id"], how="inner")
    e = z[z["game_date"] < t2]
    sd = {st: float(e[st].std()) for st in PLAYER_STATS}
    same, mate, opp, own, oppt, pairs = {}, {}, {}, {}, {}, []
    grp = e.groupby(["game_id", "team_id"])
    S = grp[PLAYER_STATS].sum()
    n = grp.size()
    n_pairs = float((n * (n - 1)).sum())
    gsum = S.reset_index()
    # opponents: join the two team rows of each game
    both = gsum.merge(gsum, on="game_id", suffixes=("_a", "_b"))
    both = both[both["team_id_a"] != both["team_id_b"]]
    nn = n.reset_index(name="n")
    nb = nn.merge(nn, on="game_id", suffixes=("_a", "_b"))
    n_opp = float((nb[nb["team_id_a"] != nb["team_id_b"]]["n_a"] * nb[nb["team_id_a"] != nb["team_id_b"]]["n_b"]).sum())
    for i, s1 in enumerate(PLAYER_STATS):
        own[s1] = float(np.mean(e[s1] * e["t_own"]) / sd[s1])
        oppt[s1] = float(np.mean(e[s1] * e["t_opp"]) / sd[s1])
        pairs.append({"a": f"player {s1}", "b": "own team points", "rho": own[s1], "n": int(len(e))})
        for s2 in PLAYER_STATS[i:]:
            norm = sd[s1] * sd[s2]
            q = float((e[s1] * e[s2]).sum())
            mate[_key(s1, s2)] = float((float((S[s1] * S[s2]).sum()) - q) / n_pairs / norm)
            opp[_key(s1, s2)] = float((both[f"{s1}_a"] * both[f"{s2}_b"]).sum() / n_opp / norm)
            pairs.append({"a": f"teammate {s1}", "b": f"teammate {s2}", "rho": mate[_key(s1, s2)], "n": int(n_pairs / 2)})
            pairs.append({"a": f"opponent {s1}", "b": f"opponent {s2}", "rho": opp[_key(s1, s2)], "n": int(n_opp / 2)})
            if s1 != s2:
                same[_key(s1, s2)] = float(q / len(e) / norm)
                pairs.append({"a": f"same player {s1}", "b": f"same player {s2}", "rho": same[_key(s1, s2)],
                              "n": int(len(e))})
    pairs.append({"a": "home team points", "b": "away team points", "rho": team_params["rho"], "n": int(len(tg))})

    # ---- validation on the later period: observed joint frequency vs independence vs copula
    v = z[z["game_date"] >= t2]
    rows, err_ind, err_cop = [], 0.0, 0.0
    for s1, s2 in (("pts", "ast"), ("pts", "reb"), ("pts", "fg3m"), ("reb", "ast")):
        pa, pb = v[f"p_{s1}"].to_numpy(), v[f"p_{s2}"].to_numpy()
        obs = float((v[f"hit_{s1}"] * v[f"hit_{s2}"]).mean())
        ind = float((pa * pb).mean())
        cop = float(bvn_both_over(pa, pb, same[_key(s1, s2)]).mean())
        rows.append({"pair": f"same player {s1} over & {s2} over", "n": int(len(v)), "observed": obs,
                     "independence": ind, "copula": cop})
        err_ind += abs(ind - obs); err_cop += abs(cop - obs)
    # top-two-minute teammates, points over & points over
    top = v.sort_values("proj_min", ascending=False).groupby(["game_id", "team_id"]).head(2)
    tt = top.groupby(["game_id", "team_id"]).filter(lambda d: len(d) == 2)
    if len(tt):
        a, b = tt.iloc[0::2], tt.iloc[1::2]
        obs = float((a["hit_pts"].to_numpy() * b["hit_pts"].to_numpy()).mean())
        ind = float((a["p_pts"].to_numpy() * b["p_pts"].to_numpy()).mean())
        cop = float(bvn_both_over(a["p_pts"].to_numpy(), b["p_pts"].to_numpy(), mate[_key("pts", "pts")]).mean())
        rows.append({"pair": "top-2 teammates pts over & pts over", "n": int(len(a)), "observed": obs,
                     "independence": ind, "copula": cop})
        err_ind += abs(ind - obs); err_cop += abs(cop - obs)
    return {"method": METHOD, "period": f"estimate<{t2.date()}; validate>={t2.date()}",
            "n_team_games": int(len(S)), "dispersion": disp, "same_player": same, "teammate": mate, "opponent": opp,
            "own_team": own, "opp_team": oppt, "team_home_away": team_params["rho"], "pairs": pairs,
            "validation": {"rows": rows, "abs_error_independence": err_ind, "abs_error_copula": err_cop,
                           "copula_beats_independence": bool(err_cop < err_ind)},
            "notes": ["Correlations are pooled league-wide averages by stat pair; individual pairs may differ.",
                      "Different games are treated as independent.",
                      "Correlation of residuals is descriptive; it is not evidence of a predictive edge."]}


# ---------------------------------------------------------------- joint simulation
def seed_for(*parts) -> int:
    return int(hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:8], 16)


def _latent_corr(a: dict, b: dict, corr: dict) -> float:
    """Correlation between two base latents. Latent: ('team', game, team_id) or ('player', game, pid, team, stat)."""
    if a["game_id"] != b["game_id"]:
        return 0.0
    if a["kind"] == "team" and b["kind"] == "team":
        return corr["team_home_away"]
    if a["kind"] == "team" or b["kind"] == "team":
        t, p = (a, b) if a["kind"] == "team" else (b, a)
        return corr["own_team"][p["stat"]] if p["team_id"] == t["team_id"] else corr["opp_team"][p["stat"]]
    if a["player_id"] == b["player_id"]:
        return corr["same_player"][_key(a["stat"], b["stat"])]
    table = corr["teammate"] if a["team_id"] == b["team_id"] else corr["opponent"]
    return table[_key(a["stat"], b["stat"])]


def _psd(m: np.ndarray) -> np.ndarray:
    w, v = np.linalg.eigh((m + m.T) / 2)
    m2 = (v * np.clip(w, 1e-6, None)) @ v.T
    d = np.sqrt(np.diag(m2))
    return m2 / np.outer(d, d)


def simulate_legs(legs: list[dict], corr: dict | None, seed: int, draws: int) -> dict:
    """Simulate leg outcomes jointly.

    Each leg: {game_id, kind: 'player'|'margin'|'total', direction: +1|-1, prob, prob_low, prob_high,
               player: {player_id, team_id, stat} | team: {home_team_id, away_team_id, sd_home, sd_away}}.
    Returns boolean outcome matrices (draws x legs) at the central, low and high marginal probabilities.
    With corr=None every leg is independent (used when no correlation estimate exists).
    """
    base: dict[tuple, dict] = {}
    comps = []  # per leg: list of (latent_key, weight)
    for leg in legs:
        if leg["kind"] == "player":
            p = leg["player"]
            k = ("player", leg["game_id"], p["player_id"], p["stat"])
            base.setdefault(k, {"kind": "player", "game_id": leg["game_id"], **p})
            comps.append([(k, 1.0)])
        else:
            t = leg["team"]
            kh, ka = ("team", leg["game_id"], t["home_team_id"]), ("team", leg["game_id"], t["away_team_id"])
            base.setdefault(kh, {"kind": "team", "game_id": leg["game_id"], "team_id": t["home_team_id"]})
            base.setdefault(ka, {"kind": "team", "game_id": leg["game_id"], "team_id": t["away_team_id"]})
            sign = -1.0 if leg["kind"] == "margin" else 1.0
            comps.append([(kh, t["sd_home"]), (ka, sign * t["sd_away"])])
    keys = list(base)
    n = len(keys)
    c = np.eye(n)
    if corr is not None:
        for i in range(n):
            for j in range(i + 1, n):
                c[i, j] = c[j, i] = _latent_corr(base[keys[i]], base[keys[j]], corr)
        c = _psd(c)
    rng = np.random.default_rng(seed)
    zs = rng.standard_normal((draws, n)) @ np.linalg.cholesky(c).T
    idx = {k: i for i, k in enumerate(keys)}
    lat = np.empty((draws, len(legs)))
    for li, comp in enumerate(comps):
        wv = np.zeros(n)
        for k, w in comp:
            wv[idx[k]] += w
        lat[:, li] = zs @ wv / math.sqrt(float(wv @ c @ wv))  # unit-variance latent per leg

    def outcomes(field: str) -> np.ndarray:
        out = np.empty((draws, len(legs)), dtype=bool)
        for li, leg in enumerate(legs):
            p = leg.get(field)
            p = leg["prob"] if p is None else p
            p = min(max(p, 1e-6), 1 - 1e-6)
            out[:, li] = lat[:, li] > sps.norm.isf(p) if leg["direction"] > 0 else lat[:, li] < sps.norm.ppf(p)
        return out

    return {"central": outcomes("prob"), "low": outcomes("prob_low"), "high": outcomes("prob_high"),
            "n_latents": n}


def joint_probability(legs: list[dict], corr: dict | None, seed: int, draws: int) -> dict:
    sim = simulate_legs(legs, corr, seed, draws)
    hit = sim["central"].all(axis=1)
    joint = float(hit.mean())
    mc_se = math.sqrt(max(joint * (1 - joint), 1e-12) / draws)
    have_bounds = all(leg.get("prob_low") is not None and leg.get("prob_high") is not None for leg in legs)
    low = float(sim["low"].all(axis=1).mean()) - 1.96 * mc_se if have_bounds else None
    high = float(sim["high"].all(axis=1).mean()) + 1.96 * mc_se if have_bounds else None
    pairwise = []
    c = sim["central"].astype(float)
    for i in range(len(legs)):
        for j in range(i + 1, len(legs)):
            si, sj = c[:, i].std(), c[:, j].std()
            rho = float(np.corrcoef(c[:, i], c[:, j])[0, 1]) if si > 0 and sj > 0 else 0.0
            pairwise.append({"i": i, "j": j, "rho": round(rho, 4)})
    return {"joint": joint, "low": None if low is None else max(0.0, low), "high": None if high is None else min(1.0, high),
            "independent": float(np.prod([leg["prob"] for leg in legs])), "mc_se": mc_se, "pairwise": pairwise,
            "seed": seed, "draws": draws, "method": METHOD if corr is not None else "independence_assumed"}
