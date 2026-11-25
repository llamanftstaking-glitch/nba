"""V3: player historical intelligence, lineup statuses and change detection, manual markets, props API.
All data is SYNTHETIC and lives only in the test database."""
from datetime import date, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from conftest import SLATE, add_injuries, pname, seed_synthetic
from gizer import db as gdb
from gizer import history as H
from gizer import modeling as M
from gizer import research as R
from gizer.lineups import LineupContext, build_team_lineup, refresh_lineups
from gizer.security import _ph

ST = {}
PID = 990001  # hand-built player with a known game log


@pytest.fixture(scope="module", autouse=True)
def league(db):
    ST.update(seed_synthetic())
    t = ST["teams"]
    # A known 12-appearance log (oldest first) plus two missed team games inside the span.
    pts = [10, 12, 0, 30, 25, 25, 18, 22, 31, 9, 27, 24]
    with gdb.session_scope() as s:
        s.add(gdb.Player(id=PID, name="Fixture Known Log", name_key="fixtureknownlog", team_id=t[0]))
        games = list(s.scalars(select(gdb.Game).where(gdb.Game.status == "final",
                                                      (gdb.Game.home_team_id == t[0]) | (gdb.Game.away_team_id == t[0]))
                               .order_by(gdb.Game.game_date.desc()).limit(14)))[::-1]
        ST["team_games"] = [g.id for g in games]
        played = [g for i, g in enumerate(games) if i not in (4, 9)]  # misses the 5th and 10th team game
        for g, p in zip(played, pts):
            home = g.home_team_id == t[0]
            s.add(gdb.PlayerBox(game_id=g.id, player_id=PID, team_id=t[0], opp_team_id=g.away_team_id if home else g.home_team_id,
                                game_date=g.game_date, season="2025-26", is_home=home, minutes=30.0, pts=p, reb=5, ast=4, fg3m=2,
                                stl=1, blk=0, tov=2, fga=15, fta=4, starter=(p != 9), provider="synthetic"))
        for i in (4, 9):
            s.add(gdb.PlayerAbsence(game_id=games[i].id, player_id=PID, team_id=t[0], game_date=games[i].game_date,
                                    reason="DNP - fixture", provider="synthetic"))
    ST["pts"] = pts
    yield


def win(ws, key):
    return next(w for w in ws if w["key"] == key)


def test_window_averages_match_raw_game_logs_and_dnp_is_not_a_zero():
    pts = ST["pts"]
    with gdb.session_scope() as s:
        ws = H.windows(s, PID, SLATE)
        for key, n in (("L3", 3), ("L5", 5), ("L10", 10)):
            w = win(ws, key)
            assert w["games"] == n and w["requested"] == n
            assert w["stats"]["pts"]["mean"] == round(float(np.mean(pts[-n:])), 2)
            assert w["stats"]["pts"]["median"] == float(np.median(pts[-n:]))
            assert w["stats"]["pts"]["min"] == min(pts[-n:]) and w["stats"]["pts"]["max"] == max(pts[-n:])
            assert w["stats"]["pra"]["mean"] == round(float(np.mean(pts[-n:])) + 9, 2)  # reb 5 + ast 4 every game
        # the two missed games are reported separately and never averaged in as zeros
        assert win(ws, "L5")["missed"] == 1 and win(ws, "L10")["missed"] == 2 and win(ws, "season")["missed"] == 2
        assert win(ws, "season")["games"] == 12 and win(ws, "season")["stats"]["pts"]["mean"] == round(float(np.mean(pts)), 2)
        # a real zero in an appearance is kept
        assert win(ws, "season")["stats"]["pts"]["min"] == 0
        # asking for more games than exist is reported, not padded
        for key in ("L15", "L20", "L30"):
            w = win(ws, key)
            assert w["games"] == 12 and "only 12 of" in w["note"]
        assert win(ws, "L3")["small_sample"] and win(ws, "L5")["small_sample"] and not win(ws, "L10")["small_sample"]
        po = win(ws, "playoffs")
        assert po["available"] is False and po["games"] == 0 and po["stats"] == {}


def test_threshold_comparison_is_descriptive_and_counts_exactly():
    pts = ST["pts"]
    with gdb.session_scope() as s:
        r = H.threshold(s, PID, "pts", 24.5, "L10", SLATE)
        last = pts[-10:]
        assert (r["n"], r["over"], r["under"], r["equal"]) == (10, sum(x > 24.5 for x in last), sum(x < 24.5 for x in last), 0)
        assert r["frequency_over"] == round(r["over"] / 10, 4) and r["measurement"] == "A"
        assert [g["value"] for g in r["games"]] == [float(x) for x in last]  # oldest → newest
        assert r["market_history"]["available"] is False and "Measurement B" in r["market_history"]["reason"]
        assert any("not the probability" in n for n in r["notes"])
        whole = H.threshold(s, PID, "pts", 25, "season", SLATE)
        assert whole["equal"] == 2 and whole["over"] + whole["under"] + whole["equal"] == 12
        bench = H.threshold(s, PID, "pts", 5, "season", SLATE, role="bench")
        assert bench["n"] == 1 and bench["games"][0]["value"] == 9 and any("Small sample" in n for n in bench["notes"])
        nobody = H.threshold(s, 123456789, "pts", 10, "L10", SLATE)
        assert nobody["n"] == 0 and nobody["frequency_over"] is None and nobody["average"] is None


def test_splits_flag_small_samples_and_are_not_model_features():
    with gdb.session_scope() as s:
        abbr = {t.id: t.abbr for t in s.scalars(select(gdb.Team))}
        sp = H.splits(s, PID, SLATE, abbr)
        by = {(r["group"], r["label"]): r for r in sp["splits"]}
        st, be = by[("Role (season)", "Starter")], by[("Role (season)", "Bench")]
        assert st["games"] == 11 and be["games"] == 1 and be["small_sample"] and be["pts"] == 9.0
        assert by[("Venue (season)", "Home")]["games"] + by[("Venue (season)", "Away")]["games"] == 12
        assert any("not used by the prediction models" in n for n in sp["notes"])


def _confirm_last_game(team_id, starters):
    with gdb.session_scope() as s:
        g = s.scalar(select(gdb.Game).where(gdb.Game.status == "final", (gdb.Game.home_team_id == team_id) | (gdb.Game.away_team_id == team_id))
                     .order_by(gdb.Game.game_date.desc()).limit(1))
        for b in s.scalars(select(gdb.PlayerBox).where(gdb.PlayerBox.game_id == g.id, gdb.PlayerBox.team_id == team_id)):
            b.starter = b.player_id in starters


def test_lineup_unknown_without_any_confirmed_history_and_never_padded():
    now = ST["tipoff"] - timedelta(hours=8)
    add_injuries([], at=now - timedelta(minutes=5))
    with gdb.session_scope() as s:
        ctx = LineupContext(s, SLATE, now)
        g = s.get(gdb.Game, "S1")
        lu = build_team_lineup(ctx, g, s.get(gdb.Team, g.home_team_id))
        assert lu["status"] == "unknown" and lu["starters"] == [] and lu["verified_at"] is None


def test_projected_lineup_replaces_unavailable_starter_and_detects_change():
    t = ST["teams"]
    home, away = t[0], t[1]  # game S0
    hs, as_ = ST["players"][home][:5], ST["players"][away][:5]
    _confirm_last_game(home, set(hs)); _confirm_last_game(away, set(as_))
    now = ST["tipoff"] - timedelta(hours=7)
    add_injuries([], at=now - timedelta(minutes=5))
    r1 = refresh_lineups(SLATE, now, fetch_live=False)
    assert r1["projected"] >= 2 and r1["confirmed"] == 0 and r1["changes"] == []
    assert refresh_lineups(SLATE, now + timedelta(minutes=1), fetch_live=False)["snapshots"] == 0  # unchanged → nothing appended
    with gdb.session_scope() as s:
        snap = s.scalar(select(gdb.LineupSnapshot).where(gdb.LineupSnapshot.game_id == "S0", gdb.LineupSnapshot.team_id == home))
        assert snap.status == "projected" and "projection" in snap.source.lower()
        assert sorted(p["player_id"] for p in snap.players if p["role"] == "starter") == sorted(hs)
    # a starter is ruled out → new snapshot, previous one preserved, change recorded
    later = now + timedelta(hours=1)
    add_injuries([(hs[0], f"Synthetic Player {hs[0]}", home, "Out")], at=later - timedelta(minutes=2))
    r2 = refresh_lineups(SLATE, later, fetch_live=False)
    assert any(c["team"] and "out" in c["change"].lower() for c in r2["changes"])
    with gdb.session_scope() as s:
        snaps = list(s.scalars(select(gdb.LineupSnapshot).where(gdb.LineupSnapshot.game_id == "S0", gdb.LineupSnapshot.team_id == home)
                               .order_by(gdb.LineupSnapshot.id)))
        assert len(snaps) == 2 and snaps[1].status == "projected"
        new_start = [p["player_id"] for p in snaps[1].players if p["role"] == "starter"]
        # the replacement is the available rotation player with the most projected minutes (the 30-minute fixture player)
        assert hs[0] not in new_start and len(new_start) == 5 and PID in new_start and set(hs[1:]) <= set(new_start)
        assert any(p["player_id"] == hs[0] for p in snaps[1].players if p["role"] == "unavailable")
        assert sorted(p["player_id"] for p in snaps[0].players if p["role"] == "starter") == sorted(hs)  # history intact
        assert s.scalar(select(text("count(*)")).select_from(gdb.ResearchEvent).where(gdb.ResearchEvent.kind == "lineup_change")) >= 1
    with pytest.raises(Exception, match="immutable"):
        with gdb.get_engine().begin() as c:
            c.execute(text("update lineup_snapshots set status='confirmed'"))


def test_projected_never_becomes_confirmed_without_a_box_score_and_confirmed_is_not_downgraded():
    t = ST["teams"]
    home = t[0]
    live = [{"name": pname(p), "team_id": home, "starter": True, "position": "G", "jersey": "7", "headshot_url": "https://example.invalid/h.png"}
            for p in ST["players"][home][1:6]]
    with gdb.session_scope() as s:
        ctx = LineupContext(s, SLATE, ST["tipoff"] - timedelta(minutes=20))
        g = s.get(gdb.Game, "S0")
        assert build_team_lineup(ctx, g, s.get(gdb.Team, home))["status"] == "projected"
        four = build_team_lineup(ctx, g, s.get(gdb.Team, home), live[:4])
        assert four["status"] == "projected"  # an incomplete starter list is not a confirmation
        conf = build_team_lineup(ctx, g, s.get(gdb.Team, home), live)
        assert conf["status"] == "confirmed" and len(conf["starters"]) == 5 and "box score" in conf["source"]
        assert all(p["position"] == "G" and p["jersey"] == "7" and p["headshot_url"] for p in conf["starters"])  # identity from the box score


def test_manual_market_rules_and_props_api():
    M.run_all_backtests(register=True)
    now = gdb.utcnow()
    with gdb.session_scope() as s:
        for g in s.scalars(select(gdb.Game).where(gdb.Game.game_date == SLATE)):
            g.tipoff_utc = now + timedelta(hours=6)
        s.add(gdb.User(email="owner@test.local", password_hash=_ph.hash("correct horse battery"), role="owner"))
        s.add(gdb.User(email="viewer@test.local", password_hash=_ph.hash("viewer password 123"), role="viewer"))
        s.add(gdb.ProviderCall(provider="espn", endpoint="/scoreboard", status=200, ok=True, duration_ms=1, called_at=now))
    add_injuries([], at=now - timedelta(minutes=5))
    refresh_lineups(SLATE, now, fetch_live=False)
    from gizer.api import app
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"email": "owner@test.local", "password": "correct horse battery"})
    c.headers["X-CSRF-Token"] = r.json()["csrf"]
    star = ST["players"][ST["teams"][0]][1]
    base = {"game_id": "S0", "player_id": star, "market": "player_pts", "line": 14.5}
    assert c.post("/api/v1/player-props/manual", json={**base, "origin": "owner_entered"}).status_code == 422       # needs a price
    assert c.post("/api/v1/player-props/manual", json={**base, "origin": "owner_entered", "over_price": -50}).status_code == 422
    assert c.post("/api/v1/player-props/manual", json={**base, "line": 14.3, "origin": "hypothetical"}).status_code == 422
    assert c.post("/api/v1/player-props/manual", json={**base, "market": "player_xyz", "origin": "hypothetical"}).status_code == 422
    assert c.post("/api/v1/player-props/manual", json={**base, "player_id": ST["players"][ST["teams"][9]][0], "origin": "hypothetical"}).status_code == 422
    assert c.post("/api/v1/player-props/manual", json={**base, "origin": "verified"}).status_code == 422
    v = TestClient(app)
    rv = v.post("/api/v1/auth/login", json={"email": "viewer@test.local", "password": "viewer password 123"})
    v.headers["X-CSRF-Token"] = rv.json()["csrf"]
    assert v.post("/api/v1/player-props/manual", json={**base, "origin": "hypothetical"}).status_code == 403
    own = c.post("/api/v1/player-props/manual", json={**base, "origin": "owner_entered", "over_price": 1.91, "under_price": 1.91,
                                                      "odds_format": "decimal", "book": "TestBook", "note": "seen on app"})
    assert own.status_code == 200, own.text
    e = own.json()["entry"]
    assert e["origin"] == "owner_entered" and e["over_price"] == -110 and e["under_price"] == -110 and e["created_by"] == "owner@test.local"
    hyp = c.post("/api/v1/player-props/manual", json={**base, "market": "player_reb", "line": 6.5, "origin": "hypothetical", "over_price": -110})
    assert hyp.json()["entry"]["over_price"] is None  # a hypothetical threshold never carries a price
    res = R.publish_edition(SLATE, "morning")
    with gdb.session_scope() as s:
        sels = list(s.scalars(select(gdb.Selection).where(gdb.Selection.edition_id == res["id"], gdb.Selection.subject_type == "player")))
        assert {x.market for x in sels} == {"player_pts", "player_reb"}
        for x in sels:
            assert x.evidence["context"]["lineup_status"] == "projected" and x.evidence["context"]["l10"] is not None
            if x.market == "player_reb":
                assert x.classification == "rejected" and any("Hypothetical" in r_ for r_ in x.rejection_reasons)
            else:
                assert x.evidence["origin"] == "owner_entered" and x.classification != "high_confidence"
                assert any("not been independently verified" in o for o in x.evidence["opposing"])
        auto = list(s.scalars(select(gdb.PaperTicket).where(gdb.PaperTicket.source == "auto")))
        assert not any(leg["market"].startswith("player_") for t_ in auto for leg in t_.legs)  # never auto-ticketed
    pp = c.get(f"/api/v1/player-props?date={SLATE}&game_id=S0").json()
    assert pp["quote_status"]["provider_configured"] is False and "manually" in pp["quote_status"]["message"]
    assert {m["key"] for m in pp["markets"]} >= {"player_pts", "player_pra", "double_double", "first_quarter"}
    assert next(m for m in pp["markets"] if m["key"] == "double_double")["operational"] is False
    row = next(r_ for r_ in pp["items"] if r_["player_id"] == star and r_["market"] == "player_pts")
    assert row["line"] == 14.5 and row["origin"] == "owner_entered" and row["over_price"] == -110
    assert row["hist_n"] == 10 and 0 <= row["hist_over"] <= 10 and row["l10"] is not None and row["n_games"] > 20
    assert row["lineup_status"] == "projected" and row["lineup_role"] == "starter" and row["selection"] is not None
    unq = next(r_ for r_ in pp["items"] if r_["line"] is None)
    assert unq["over_price"] is None and unq["origin"] is None and unq["hist_over"] is None and unq["projection"] is not None
    assert c.get(f"/api/v1/player-props?date={SLATE}&quoted=true").json()["total"] == 2
    lst = c.get(f"/api/v1/player-props/manual?date={SLATE}").json()["items"]
    assert len(lst) == 2
    assert c.post(f"/api/v1/player-props/manual/{e['id']}/withdraw").json() == {"ok": True}
    assert next(x for x in c.get(f"/api/v1/player-props/manual?date={SLATE}").json()["items"] if x["id"] == e["id"])["withdrawn"] is True
    with gdb.session_scope() as s:
        assert s.scalar(select(text("count(*)")).select_from(gdb.OddsSnapshot).where(gdb.OddsSnapshot.provider == "manual")) == 4  # rows kept
    assert c.get(f"/api/v1/player-props?date={SLATE}&quoted=true").json()["total"] == 1
    # remaining V3 read endpoints
    lu = c.get("/api/v1/games/S0/lineups").json()
    assert lu["home"]["status"] == "projected" and len(lu["home"]["starters"]) == 5 and lu["home"]["team"]["abbr"]
    assert all({"availability", "proj_min", "recent_min", "starts_last10", "role"} <= set(p) for p in lu["home"]["starters"])
    assert len(c.get(f"/api/v1/lineups?date={SLATE}").json()["games"]) == 4
    assert c.get("/api/v1/games/S0/lineup-history").json()["items"]
    card = c.get(f"/api/v1/command-center?date={SLATE}").json()
    assert card["lineups_summary"]["projected"] >= 2 and card["props_summary"]["provider_configured"] is False
    g0 = next(g for g in card["slate"]["games"] if g["id"] == "S0")
    lineup_item = next(i for i in g0["research_completeness"]["items"] if i["name"] == "Starting lineups")
    assert lineup_item["ok"] is False and "projected" in lineup_item["note"]  # projected does not count as complete
    av = c.get(f"/api/v1/players/{PID}/averages").json()
    assert "appearances" in av["definition"] and len(av["windows"]) == 10
    gl = c.get(f"/api/v1/players/{PID}/game-logs?role=bench").json()
    # the fixture's bench game plus the latest game, which an earlier test re-flagged with a different starting five
    assert gl["total"] == 2 and 9 in [i["pts"] for i in gl["items"]] and all(i["starter"] is False for i in gl["items"])
    assert len(gl["missed"]) == 2 and gl["missed"][0]["reason"]
    th = c.get(f"/api/v1/players/{PID}/threshold?stat=pts&line=24.5&window=L10").json()
    assert th["n"] == 10 and th["measurement"] == "A"
    assert c.get(f"/api/v1/players/{PID}/threshold?stat=bogus&line=1").status_code == 422
    assert c.get(f"/api/v1/players/{PID}/splits").json()["splits"]
    pd_ = c.get(f"/api/v1/players/{star}").json()
    # the synthetic slate is in the past, so there is honestly no upcoming game for this player
    assert pd_["next_game"] is None and pd_["lineup"] is None and pd_["markets"] == []
    assert {"jersey", "headshot_url", "position"} <= set(pd_["player"])
    prov = c.get("/api/v1/data-health/providers").json()["items"]
    odds = next(p for p in prov if p["provider"] == "oddsapi")
    assert odds["credential"] == "missing" and "GIZER_ODDS_API_KEY" in odds["setup"] and "key" not in {k for k in odds if "secret" in k}
    stg = c.get("/api/v1/performance/strategies").json()
    keys = {g["key"] for g in stg["groups"]}
    assert {"single_player", "single_team", "player_pts", "player_pra", "DOUBLE", "SIX", "SGP", "CROSS"} <= keys
    assert all(g["hit_rate"] is None for g in stg["groups"] if g["settled"] == 0)  # honest empty groups


def test_lineup_falls_back_to_last_box_score_when_history_is_not_loaded():
    from gizer.lineups import _from_last_box
    t3 = ST["teams"][3]
    rows = [{"name": f"Fallback Starter {chr(65 + i)}", "team_id": t3, "starter": True, "dnp": False, "minutes": 30.0 - i,
             "position": "G", "jersey": str(i), "headshot_url": None} for i in range(5)]
    rows += [{"name": "Fallback Bench Big", "team_id": t3, "starter": False, "dnp": False, "minutes": 22.0, "position": "C", "jersey": "50", "headshot_url": None},
             {"name": "Fallback Bench Small", "team_id": t3, "starter": False, "dnp": False, "minutes": 9.0, "position": "G", "jersey": "51", "headshot_url": None},
             {"name": "Fallback Dnp", "team_id": t3, "starter": False, "dnp": True, "minutes": None, "position": "F", "jersey": "52", "headshot_url": None}]
    now = ST["tipoff"] - timedelta(hours=5)
    add_injuries([(None, "Fallback Starter A", t3, "Out")], at=now - timedelta(minutes=3))
    with gdb.session_scope() as s:
        ctx = LineupContext(s, SLATE, now)
        lu = _from_last_box(ctx, s.get(gdb.Team, t3), {"date": date(2026, 3, 18), "rows": rows})
        names = [p["name"] for p in lu["starters"]]
        assert lu["status"] == "projected" and "not official" in lu["note"] and "ESPN box score" in lu["source"]
        assert len(names) == 5 and "Fallback Starter A" not in names and "Fallback Bench Big" in names  # highest-minute available sub
        assert "Fallback Dnp" not in names and all(p["proj_min"] is None for p in lu["starters"])       # minutes are not invented
        assert any(p["name"] == "Fallback Starter A" for p in lu["unavailable"])
        # two starters out and only one usable replacement → no partial five
        add_injuries([(None, "Fallback Starter A", t3, "Out"), (None, "Fallback Starter B", t3, "Out"), (None, "Fallback Bench Small", t3, "Out")],
                     at=now - timedelta(minutes=1))
        ctx2 = LineupContext(s, SLATE, now)
        assert _from_last_box(ctx2, s.get(gdb.Team, t3), {"date": date(2026, 3, 18), "rows": rows}) is None
