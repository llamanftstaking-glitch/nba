"""Test harness. All data created here is SYNTHETIC and exists only in the dedicated test database."""
import os

os.environ["GIZER_DATABASE_URL"] = os.environ.get(
    "GIZER_TEST_DATABASE_URL", "postgresql+psycopg://gizer:gizer_dev@localhost:5432/gizer_nba_test")
os.environ["GIZER_ENV"] = "test"
os.environ["GIZER_COOKIE_SECURE"] = "false"
os.environ["GIZER_PROVIDER_MIN_INTERVAL_S"] = "0"
os.environ["GIZER_SIM_DRAWS"] = "4000"
os.environ["GIZER_ODDS_API_KEY"] = ""
os.environ["GIZER_SEASONS"] = "2025-26"
os.environ["GIZER_PUBLIC_ORIGIN"] = "http://testserver"

from datetime import date, datetime, timedelta, timezone  # noqa: E402

import numpy as np  # noqa: E402
import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402

from gizer import db as gdb  # noqa: E402
from gizer.providers import TEAMS, name_key  # noqa: E402

assert "test" in os.environ["GIZER_DATABASE_URL"], "tests must never run against a non-test database"


def pname(pid: int) -> str:
    """Unique alphabetic synthetic player name (name matching ignores digits)."""
    letters = "".join(chr(97 + int(c)) for c in str(pid))
    return f"Synthetic {letters.capitalize()}"


def reset_schema():
    gdb.reset_engine()
    eng = gdb.get_engine()
    with eng.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    gdb.create_all_for_tests()


@pytest.fixture(scope="module")
def db():
    reset_schema()
    yield
    gdb.reset_engine()


SLATE = date(2026, 3, 20)


def seed_synthetic(n_days: int = 110, seed: int = 11, slate: date = SLATE):
    """Synthetic league: 30 teams x 8 players, n_days of results before `slate`, 4 scheduled games on it."""
    from gizer import ingestion
    rng = np.random.default_rng(seed)
    ingestion.seed_reference()
    tids = [t[0] for t in TEAMS]
    strength = {t: rng.normal(0, 4) for t in tids}
    players = {t: [(t % 100000) * 100 + i for i in range(8)] for t in tids}
    rate = {p: rng.uniform(0.25, 0.75) for t in tids for p in players[t]}
    mins = {p: m for t in tids for p, m in zip(players[t], [34, 32, 30, 28, 24, 20, 16, 12])}
    with gdb.session_scope() as s:
        for t in tids:
            for p in players[t]:
                s.add(gdb.Player(id=p, name=pname(p), name_key=name_key(pname(p)), team_id=t))
        gnum = 0
        for d in range(n_days, 0, -1):
            day = slate - timedelta(days=d)
            order = list(rng.permutation(tids))
            for i in range(0, 12, 2):
                h, a = int(order[i]), int(order[i + 1])
                gnum += 1
                gid = f"T{gnum:07d}"
                poss = int(rng.normal(99, 4))
                hp = int(rng.normal(112 + strength[h] - strength[a] + 1.5, 9))
                ap = int(rng.normal(112 + strength[a] - strength[h] - 1.5, 9))
                if hp == ap:
                    hp += 1
                s.add(gdb.Game(id=gid, season="2025-26", game_date=day, home_team_id=h, away_team_id=a, status="final",
                               home_points=hp, away_points=ap, home_poss=poss, away_poss=poss, provider="synthetic",
                               tipoff_utc=datetime(day.year, day.month, day.day, 23, 0, tzinfo=timezone.utc),
                               box_ingested_at=gdb.utcnow()))
                for team, opp, home in ((h, a, True), (a, h, False)):
                    for p in players[team]:
                        m = max(4.0, rng.normal(mins[p], 3))
                        lam = rate[p] * m
                        pts = int(rng.negative_binomial(6, 6 / (6 + lam)))
                        s.add(gdb.PlayerBox(game_id=gid, player_id=p, team_id=team, opp_team_id=opp, game_date=day,
                                            season="2025-26", is_home=home, minutes=round(m, 1), pts=pts,
                                            reb=int(rng.poisson(0.18 * m)), ast=int(rng.poisson(0.12 * m)),
                                            fg3m=int(rng.poisson(0.05 * m)), stl=int(rng.poisson(0.03 * m)),
                                            blk=int(rng.poisson(0.02 * m)), tov=int(rng.poisson(0.06 * m)), fga=10, fta=2,
                                            provider="synthetic"))
        for p in s.query(gdb.Player):
            p.last_game_date = slate - timedelta(days=1)
        tip = datetime(slate.year, slate.month, slate.day, 23, 30, tzinfo=timezone.utc)
        for i in range(4):
            s.add(gdb.Game(id=f"S{i}", season="2025-26", game_date=slate, home_team_id=tids[2 * i],
                           away_team_id=tids[2 * i + 1], status="scheduled", provider="synthetic", tipoff_utc=tip))
    return {"teams": tids, "players": players, "tipoff": tip}


def add_quotes(game_id, home, away, spread=-3.5, total=224.5, at=None, book="TestBook", ml_home=-150, ml_away=130):
    at = at or gdb.utcnow()
    with gdb.session_scope() as s:
        for market, st, sid, side, line, price in (
                ("spread", "team", home, "home", spread, -110), ("spread", "team", away, "away", -spread, -110),
                ("total", "game", None, "over", total, -110), ("total", "game", None, "under", total, -110),
                ("moneyline", "team", home, "home", None, ml_home), ("moneyline", "team", away, "away", None, ml_away)):
            s.add(gdb.OddsSnapshot(game_id=game_id, market=market, subject_type=st, subject_id=sid, side=side, line=line,
                                   price_american=price, book=book, provider="synthetic", ingested_at=at))
        s.add(gdb.ProviderCall(provider="espn", endpoint="/scoreboard", status=200, ok=True, duration_ms=1, called_at=at))


def add_injuries(rows, at=None):
    """rows: [(player_id, name, team_id, status)]"""
    import uuid
    at = at or gdb.utcnow()
    b = uuid.uuid4().hex
    with gdb.session_scope() as s:
        for pid, name, tid, status in rows:
            s.add(gdb.InjurySnapshot(batch_id=b, player_id=pid, player_name=name, team_id=tid, status=status,
                                     provider="synthetic", ingested_at=at, source_published_at=at))
        if not rows:
            s.add(gdb.InjurySnapshot(batch_id=b, player_id=None, player_name="(none listed)", team_id=None, status="none",
                                     provider="synthetic", ingested_at=at, quality="ok"))


def model_aware_quotes(game_ids, at, shift=3.0):
    """Synthetic quotes placed a few points away from the model so that some selections qualify."""
    from scipy import stats as sps
    from gizer import modeling as M
    from gizer.research import decimal_to_american
    with gdb.session_scope() as s:
        tm = M.production_model(s, "team_game")
        g0 = s.get(gdb.Game, game_ids[0])
        state = M.live_team_state(M.load_games_frame(s, before=g0.game_date), g0.game_date)
        rows = []
        for gid in game_ids:
            g = s.get(gdb.Game, gid)
            gp = M.predict_game(state, tm.params, g.home_team_id, g.away_team_id)
            ph = float(sps.norm.sf(0, gp["mu_margin"], gp["sd_margin"]))
            rows.append((gid, g.home_team_id, g.away_team_id, -(round(gp["mu_margin"] - shift) + 0.5),
                         round(gp["mu_total"] - shift - 1) + 0.5,
                         decimal_to_american(1 / max(0.05, ph - 0.07)), decimal_to_american(1 / max(0.05, 1 - ph + 0.09))))
    for gid, h, a, sp, tot, mh, ma in rows:
        add_quotes(gid, h, a, spread=sp, total=tot, at=at, ml_home=mh, ml_away=ma)
