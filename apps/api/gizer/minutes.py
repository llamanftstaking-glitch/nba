"""Minutes and rotation intelligence (Pillar One).

Playing time is context, not a qualification rule: a high-minute player is not automatically predictable, and
nothing here raises a classification. Projected minutes come from the validated `player_minutes` model
(the same projection the stat models use); the uncertainty band is the empirical 10th-90th percentile of
out-of-sample projection errors for players in the same projected-minutes tier.
"""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
from sqlalchemy import select

from . import modeling as M
from .db import Game, Player, PlayerBox, Team
from .ingestion import latest_injuries

TIERS = [(35, "35+"), (30, "30–34.9"), (25, "25–29.9"), (20, "20–24.9"), (0, "Below 20")]
# Configurable, descriptive classification rules. Re-evaluated on every request from current data.
RULES = {"returning_gap_days": 10, "min_games": 5, "starter_starts_l10": 8, "high_minutes": 32.0, "stable_sd": 6.0,
         "primary_minutes": 24.0, "secondary_minutes": 15.0, "role_change_minutes": 6.0}
LABELS = {"returning": "Returning injured player", "uncertain": "Uncertain role", "high_minute_starter": "High-minute starter",
          "stable_starter": "Stable starter", "primary": "Primary rotation player", "variable": "Variable rotation player",
          "secondary": "Secondary rotation player", "limited": "Limited-minute player"}
UNCERTAIN_STATUS = ("question", "doubt", "day-to-day", "game-time", "gtd")


def tier_of(minutes: float | None) -> str | None:
    if minutes is None or (isinstance(minutes, float) and np.isnan(minutes)):
        return None
    return next(label for lo, label in TIERS if minutes >= lo)


def classify(p: dict) -> tuple[str, str]:
    """(key, reason). Based only on recent observed role, never on reputation."""
    r = RULES
    if p["returned_recently"]:
        return "returning", f"returned after a gap of {p['last_gap_days']} days within the last 3 appearances"
    if p["games_season"] < r["min_games"]:
        return "uncertain", f"only {p['games_season']} appearances this season"
    if p["availability"] != "available" and any(w in p["availability"] for w in UNCERTAIN_STATUS):
        return "uncertain", f"listed {p['availability']}"
    sd = p["sd_l10"] if p["sd_l10"] is not None else 99.0
    starts = p["starts_l10"]
    if starts is not None and starts >= r["starter_starts_l10"] and sd <= r["stable_sd"]:
        if p["l10"] >= r["high_minutes"]:
            return "high_minute_starter", f"started {starts} of last 10, {p['l10']:.1f} min, sd {sd:.1f}"
        return "stable_starter", f"started {starts} of last 10, sd {sd:.1f}"
    if sd > r["stable_sd"] and p["l10"] >= r["secondary_minutes"]:
        return "variable", f"minutes sd {sd:.1f} over the last 10"
    if p["l10"] >= r["primary_minutes"]:
        return "primary", f"{p['l10']:.1f} min over the last 10, sd {sd:.1f}"
    if p["l10"] >= r["secondary_minutes"]:
        return "secondary", f"{p['l10']:.1f} min over the last 10"
    return "limited", f"{p['l10']:.1f} min over the last 10"


def _profile(g: pd.DataFrame, season: str) -> dict:
    m = g["minutes"]
    cur = g[g["season"] == season]
    l10 = g.tail(10)
    known = l10[l10["starter"].notna()]
    gaps = pd.to_datetime(g["game_date"]).diff().dt.days.tail(3)
    gap = int(gaps.max()) if len(gaps.dropna()) else 0
    r1 = lambda x: None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), 1)  # noqa: E731
    sk = cur[cur["starter"].notna()]
    return {"games_season": int(len(cur)), "games_all": int(len(g)),
            "season_avg": r1(cur["minutes"].mean()) if len(cur) else None, "season_median": r1(cur["minutes"].median()) if len(cur) else None,
            "l3": r1(m.tail(3).mean()), "l5": r1(m.tail(5).mean()), "l10": r1(l10["minutes"].mean()), "l20": r1(m.tail(20).mean()),
            "min_l10": r1(l10["minutes"].min()), "max_l10": r1(l10["minutes"].max()),
            "sd_l10": r1(l10["minutes"].std(ddof=1)) if len(l10) > 1 else None,
            "starts_l10": int(known["starter"].sum()) if len(known) else None,
            "starts_season": int(sk["starter"].sum()) if len(sk) else None,
            "bench_season": int((~sk["starter"].astype(bool)).sum()) if len(sk) else None,
            "last_gap_days": gap, "returned_recently": gap >= RULES["returning_gap_days"],
            "role_change": (r1(m.tail(5).mean() - m.tail(20).mean()) if len(g) >= 10 and abs(m.tail(5).mean() - m.tail(20).mean()) >= RULES["role_change_minutes"] else None),
            "last_game_date": g["game_date"].iloc[-1]}


def slate_minutes(s, d: date, team_ids: set[int] | None = None, player_id: int | None = None) -> dict:
    """Minutes intelligence rows for players on teams playing on `d` (or one player)."""
    from .lineups import lineup_status_map
    from .providers import season_for_date
    teams = {t.id: t for t in s.scalars(select(Team))}
    games = list(s.scalars(select(Game).where(Game.game_date == d)))
    opp, gid = {}, {}
    for g in games:
        opp[g.home_team_id], opp[g.away_team_id] = g.away_team_id, g.home_team_id
        gid[g.home_team_id] = gid[g.away_team_id] = g.id
    tids = set(opp) if team_ids is None else team_ids
    q = select(PlayerBox.player_id, PlayerBox.team_id, PlayerBox.game_date, PlayerBox.season, PlayerBox.minutes, PlayerBox.starter).where(
        PlayerBox.game_date < d).order_by(PlayerBox.game_date, PlayerBox.game_id)
    if player_id is not None:
        q = q.where(PlayerBox.player_id == player_id)
    df = pd.DataFrame(s.execute(q).all(), columns=["player_id", "team_id", "game_date", "season", "minutes", "starter"])
    mv = M.production_model(s, "player_minutes") or s.scalar(select(M.ModelVersion).where(M.ModelVersion.family == "player_minutes")
                                                            .order_by(M.ModelVersion.id.desc()).limit(1))
    bands = (mv.params.get("bands") if mv else None) or {}
    meta = {"model": None if mv is None else {"name": mv.name, "version": mv.version, "status": mv.status},
            "uncertainty": "10th–90th percentile of out-of-sample projection error for the same projected-minutes tier"
                           if bands else "unavailable: the minutes model has not been evaluated yet",
            "restrictions_note": "No authorized source publishes minutes restrictions; none are assumed.",
            "tiers": [t for _, t in TIERS], "rules": RULES}
    if df.empty:
        return {"date": d, "items": [], **meta}
    players = {p.id: p for p in s.scalars(select(Player))}
    inj = {i.player_id: i for i in latest_injuries(s) if i.player_id}
    lus = lineup_status_map(s, [g.id for g in games])
    season = season_for_date(d)
    recent = pd.Timestamp(d) - pd.Timedelta(days=21)
    rows = []
    for pid, g in df.groupby("player_id"):
        pid = int(pid)
        pl = players.get(pid)
        if pl is None or (player_id is None and (pl.team_id not in tids or pd.Timestamp(g["game_date"].iloc[-1]) < recent)):
            continue
        prof = _profile(g, season)
        av = inj[pid].status.lower() if pid in inj else "available"
        out_now = any(w in av for w in ("out", "suspension", "injured reserve"))
        proj = None
        if not out_now and len(g) >= 1:
            ew = g["minutes"].ewm(halflife=4, adjust=True).mean().iloc[-1]
            proj = round(float(0.6 * ew + 0.4 * g["minutes"].tail(10).mean()), 1)  # identical to the stat models' proj_min
        band = bands.get(tier_of(proj) or "", None) if proj is not None else None
        snap = lus.get((gid.get(pl.team_id), pl.team_id))
        role = None
        if snap is not None:
            role = next((("starter" if x["role"] == "starter" else "bench") for x in snap.players
                         if x["player_id"] == pid and x["role"] != "unavailable"), None)
        row = {"player_id": pid, "player_name": pl.name, "headshot_url": pl.headshot_url, "position": pl.position,
               "team_abbr": teams[pl.team_id].abbr if pl.team_id in teams else None,
               "opp_abbr": teams[opp[pl.team_id]].abbr if pl.team_id in opp else None, "game_id": gid.get(pl.team_id),
               "availability": av, "injury_detail": (inj[pid].detail if pid in inj else None),
               "lineup_role": role, "lineup_status": snap.status if snap else "unknown",
               "proj_min": proj, "proj_min_low": None if band is None else round(max(0.0, proj + band[0]), 1),
               "proj_min_high": None if band is None else round(min(48.0, proj + band[1]), 1),
               "tier": tier_of(proj if proj is not None else prof["l10"]), **prof,
               "restriction": None, "source_updated_at": inj[pid].ingested_at if pid in inj else None}
        key, why = classify(row)
        row.update(classification=key, classification_label=LABELS[key], classification_reason=why)
        rows.append(row)
    rows.sort(key=lambda r: (-(r["proj_min"] or -1), r["player_name"]))
    return {"date": d, "items": rows, **meta}


def evaluate_minutes(f: pd.DataFrame) -> dict:
    """Walk-forward evaluation of the minutes projection used by every stat model, plus a study of whether
    projected-minutes tiers are actually more predictable (they are compared, not assumed)."""
    t1, t2 = M._split_dates(f["game_date"])
    cal, ev = f[(f["game_date"] >= t1) & (f["game_date"] < t2)], f[f["game_date"] >= t2]
    y = ev["minutes"].to_numpy(float)
    err = lambda p: float(np.mean(np.abs(y - p)))  # noqa: E731
    models = {"minutes_blend": err(ev["proj_min"].to_numpy(float)), "baseline_last10_avg": err(ev["min_l10"].to_numpy(float)),
              "baseline_recent_ewma": err(ev["min_ewm"].to_numpy(float)), "baseline_season_avg": err(ev["min_avg"].to_numpy(float))}
    bands, tier_rows, hits, n_all = {}, [], 0, 0
    for _, label in TIERS:
        c = cal[cal["proj_min"].map(tier_of) == label]
        e = ev[ev["proj_min"].map(tier_of) == label]
        if len(c) < 50 or len(e) == 0:
            continue
        res = (c["minutes"] - c["proj_min"]).to_numpy(float)
        lo, hi = float(np.percentile(res, 10)), float(np.percentile(res, 90))
        bands[label] = [round(lo, 2), round(hi, 2)]
        r = (e["minutes"] - e["proj_min"]).to_numpy(float)
        inside = int(((r >= lo) & (r <= hi)).sum())
        hits += inside; n_all += len(e)
        pts_err = np.abs(e["pts"].to_numpy(float) - e["mu_pts"].to_numpy(float))
        tier_rows.append({"tier": label, "n": int(len(e)), "minutes_mae": float(np.mean(np.abs(r))),
                          "minutes_sd_of_error": float(np.std(r)), "band_coverage": inside / len(e),
                          "pts_mae": float(pts_err.mean()),
                          "pts_mae_relative": float(pts_err.mean() / max(1e-9, e["pts"].mean()))})
    cov = hits / n_all if n_all else None
    best = min(v for k, v in models.items() if k.startswith("baseline"))
    checks = {"enough_observations": len(ev) >= M.GATE["min_eval_obs"],
              "not_worse_than_best_baseline": models["minutes_blend"] <= best * M.GATE["max_mae_ratio_vs_best_baseline"],
              "band_coverage": cov is not None and abs(cov - 0.80) <= M.GATE["max_coverage_gap"]}
    return {"metrics": {"models": {k: {"mae": v} for k, v in models.items()}, "mae_ratio_vs_best_baseline": models["minutes_blend"] / best,
                        "band_coverage_80": cov, "bands": bands, "tier_study": tier_rows, "n_eval": int(len(ev)),
                        "n_calibration": int(len(cal)), "gate_checks": checks,
                        "tier_study_note": "Absolute error is compared across projected-minutes tiers; a higher tier is not assumed to be more predictable."},
            "passed": all(checks.values()), "params": {"bands": bands, "blend": "0.6 x recent EWMA (half-life 4 games) + 0.4 x last-10 average"},
            "periods": {"training": M._period(f[f["game_date"] < t1]["game_date"]), "calibration": M._period(cal["game_date"]),
                        "evaluation": M._period(ev["game_date"])}}
