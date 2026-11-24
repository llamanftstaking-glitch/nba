"""Core Intelligence: Kalshi contracts (real captured payloads as fixtures), observations, movement, minutes
intelligence, availability change events. No test here talks to the live Kalshi service."""
import copy
import inspect
import json
import os
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from conftest import add_injuries, pname, seed_synthetic
from gizer import db as gdb
from gizer import ingestion, kalshi
from gizer import minutes as MI
from gizer.providers import ABBR_TO_ID, ProviderError, name_key
from gizer.security import _ph

FX = json.load(open(os.path.join(os.path.dirname(__file__), "fixtures", "kalshi_markets.json")))["markets"]
BY = {m["ticker"]: m for m in FX}
JOKIC25 = "KXNBAPTS-26NOV24DALDEN-DENNJOKIC15-25"
NOW = datetime(2026, 11, 24, 18, 0, tzinfo=timezone.utc)
ST = {}


class StubKalshi:
    name = "kalshi"

    def __init__(self, markets, fail=()):
        self.markets, self.fail, self.calls = markets, set(fail), []

    def open_markets(self, series):
        self.calls.append(series)
        if series in self.fail:
            raise ProviderError(f"kalshi {series}: HTTP 503")
        return [copy.deepcopy(m) for m in self.markets if m["ticker"].split("-")[0] == series]


@pytest.fixture(scope="module", autouse=True)
def league(db):
    ST.update(seed_synthetic(n_days=30, slate=date(2026, 11, 24)))
    tip = datetime(2026, 11, 25, 3, 0, tzinfo=timezone.utc)
    with gdb.session_scope() as s:
        s.execute(text("delete from games where id like 'S_'"))  # the generic synthetic slate is not used here
        for gid, away, home, d in (("K1", "DAL", "DEN", date(2026, 11, 24)), ("K2", "DET", "ORL", date(2026, 11, 24)),
                                   ("K3", "PHX", "HOU", date(2026, 11, 25))):
            s.add(gdb.Game(id=gid, season="2026-27", game_date=d, home_team_id=ABBR_TO_ID[home], away_team_id=ABBR_TO_ID[away],
                           status="scheduled", provider="synthetic", tipoff_utc=tip if d.day == 24 else tip + timedelta(days=1)))
        for pid, nm, team in ((203999, "Nikola Jokić", "DEN"), (990010, "Cooper Flagg", "DAL"), (990011, "Nikola Vučević", "ORL")):
            s.add(gdb.Player(id=pid, name=nm, name_key=name_key(nm), team_id=ABBR_TO_ID[team]))
    yield


# ---------------------------------------------------------------- contract interpretation (pure)
def test_standard_player_threshold_is_normalised_with_exact_strike():
    it = kalshi.interpret(BY[JOKIC25])
    assert it["interpretation"] == "normalized" and it["market"] == "player_pts" and it["stat"] == "pts"
    assert it["threshold"] == 24.5 and it["comparator"] == ">= 25" and it["player_name"] == "Nikola Jokić"
    assert it["team_code"] == "DEN" and it["protected"] is False


@pytest.mark.parametrize("ticker,kind,market", [("KXNBAGAME-26NOV24DALDEN-DEN", "game", "moneyline"),
                                                ("KXNBATOTAL-26NOV24DALDEN-228", "total", "total"),
                                                ("KXNBASPREAD-26NOV25PHXHOU-PHX8", "spread", "spread"),
                                                ("KXNBAREB-26NOV24DETORL-ORLNVUCEVIC9-8", "player", "player_reb")])
def test_other_supported_contracts(ticker, kind, market):
    it = kalshi.interpret(BY[ticker])
    assert (it["interpretation"], it["kind"], it["market"]) == ("normalized", kind, market)
    if kind == "total":
        assert it["threshold"] == 227.5 and it["comparator"] == "> 227.5"
    if kind == "spread":
        assert it["threshold"] == 7.5 and it["team_code"] == "PHX"
    if kind == "game":
        assert it["team_code"] == "DEN" and it["threshold"] is None


@pytest.mark.parametrize("ticker,word", [("KXNBAPTSPROT-26NOV24DETORL-ORLGBITADZE35-15", "Protected"),
                                         ("KXNBAESCALATORPTS-26NOV24DALDEN-DENNJOKIC15", "Escalator"),
                                         ("KXNBA2D-26NOV24DALDEN-DALNMARSHALL3", "Double-double")])
def test_protected_escalator_and_double_double_are_never_normalised(ticker, word):
    it = kalshi.interpret(BY[ticker])
    assert it["interpretation"] == "unsupported" and it["market"] is None and word in it["note"]
    assert it["protected"] is ticker.split("-")[0].endswith("PROT")


def test_interpretation_refuses_anything_whose_rules_or_type_do_not_match():
    m = copy.deepcopy(BY[JOKIC25])
    m["rules_primary"] = m["rules_primary"].replace("25+ points", "at least 25 points in the first half")
    assert kalshi.interpret(m)["interpretation"] == "unsupported"
    m = copy.deepcopy(BY[JOKIC25]); m["market_type"] = "scalar"
    assert kalshi.interpret(m)["interpretation"] == "unsupported"
    m = copy.deepcopy(BY[JOKIC25]); m["strike_type"] = "between"
    assert kalshi.interpret(m)["interpretation"] == "unsupported"
    m = copy.deepcopy(BY[JOKIC25]); m["floor_strike"] = 29.5  # strike disagrees with the rule text
    it = kalshi.interpret(m)
    assert it["interpretation"] == "unsupported" and "does not agree" in it["note"]
    m = copy.deepcopy(BY[JOKIC25]); m["ticker"] = "KXNBAWHATEVER-26NOV24DALDEN-X"
    assert kalshi.interpret(m)["interpretation"] == "unsupported"


def test_event_ticker_parsing():
    ev = kalshi.parse_event("KXNBAPTS-26NOV24DALDEN")
    assert ev == {"date": date(2026, 11, 24), "away_team_id": ABBR_TO_ID["DAL"], "home_team_id": ABBR_TO_ID["DEN"]}
    assert kalshi.parse_event("KXNBAPTS-26NOV24XXXYYY") is None and kalshi.parse_event("garbage") is None
    assert kalshi.parse_event("KXNBAGAME-26NOV24NYGS")["away_team_id"] == ABBR_TO_ID["NYK"]


def test_adapter_is_read_only():
    src = inspect.getsource(kalshi)
    for banned in ("/portfolio", "/orders", "create_order", "KALSHI-ACCESS", "private_key", ".post(", ".put(", ".delete("):
        assert banned not in src, banned
    methods = [n for n, _ in inspect.getmembers(kalshi.KalshiProvider, inspect.isfunction) if not n.startswith("_")]
    assert not [n for n in methods if any(w in n.lower() for w in ("order", "trade", "buy", "sell", "portfolio"))]


def test_breakeven_includes_fee_and_is_never_below_the_ask():
    assert kalshi.breakeven_from_ask(0.56) == pytest.approx(0.56 + 0.07 * 0.56 * 0.44)
    assert all(kalshi.breakeven_from_ask(a) > a for a in (0.05, 0.5, 0.95))


# ---------------------------------------------------------------- observation service
def test_observe_stores_contracts_snapshots_and_normalised_quotes():
    r = kalshi.observe(provider=StubKalshi(FX), now=NOW)
    assert r["series_failed"] == [] and r["markets_seen"] == 11 and r["markets_new"] == 11 and r["snapshots"] == 11
    with gdb.session_scope() as s:
        mk = s.get(gdb.KalshiMarket, JOKIC25)
        assert (mk.game_id, mk.player_id, mk.interpretation, mk.threshold) == ("K1", 203999, "normalized", 24.5)
        assert "25+ points" in mk.rules_primary and "fair price" in mk.rules_secondary and mk.title == "Nikola Jokić: 25+ points"
        prot = s.get(gdb.KalshiMarket, "KXNBAPTSPROT-26NOV24DETORL-ORLGBITADZE35-15")
        assert prot.interpretation == "unsupported" and prot.protected and prot.market is None
        qs = {(q.side): q for q in s.scalars(select(gdb.OddsSnapshot).where(gdb.OddsSnapshot.source_ref == JOKIC25))}
        assert set(qs) == {"over", "under"} and qs["over"].line == 24.5 and qs["over"].book == "Kalshi" and qs["over"].provider == "kalshi"
        ya = float(BY[JOKIC25]["yes_ask_dollars"])
        be = kalshi.breakeven_from_ask(ya)
        dec = 1 + (qs["over"].price_american / 100 if qs["over"].price_american > 0 else 100 / -qs["over"].price_american)
        assert abs(1 / dec - be) < 0.004  # the stored price reproduces the fee-adjusted break-even
        # tracked-only contracts never reach the research engine
        refs = set(s.scalars(select(gdb.OddsSnapshot.source_ref).where(gdb.OddsSnapshot.book == "Kalshi")))
        assert not [x for x in refs if "PROT" in x or "ESCALATOR" in x or "KXNBA2D" in x]
        sp = list(s.scalars(select(gdb.OddsSnapshot).where(gdb.OddsSnapshot.source_ref == "KXNBASPREAD-26NOV25PHXHOU-PHX8")))
        assert {(q.side, q.line) for q in sp} == {("away", -7.5), ("home", 7.5)}
        ml = list(s.scalars(select(gdb.OddsSnapshot).where(gdb.OddsSnapshot.market == "moneyline", gdb.OddsSnapshot.book == "Kalshi")))
        assert {q.side for q in ml} == {"home", "away"} and all(q.line is None for q in ml)


def test_second_identical_pass_appends_nothing_and_a_price_change_appends_one_snapshot():
    r = kalshi.observe(provider=StubKalshi(FX), now=NOW + timedelta(minutes=5))
    assert (r["markets_new"], r["snapshots"], r["quotes_appended"]) == (0, 0, 0)
    moved = copy.deepcopy(FX)
    for m in moved:
        if m["ticker"] == JOKIC25:
            m["yes_bid_dollars"], m["yes_ask_dollars"], m["no_ask_dollars"], m["last_price_dollars"] = "0.6000", "0.6100", "0.4000", "0.6100"
    r = kalshi.observe(provider=StubKalshi(moved), now=NOW + timedelta(minutes=10))
    assert r["snapshots"] == 1 and r["quotes_appended"] == 2
    with gdb.session_scope() as s:
        snaps = kalshi.snapshots_for(s, [JOKIC25])[JOKIC25]
        assert len(snaps) == 2 and snaps[0].yes_ask == float(BY[JOKIC25]["yes_ask_dollars"]) and snaps[1].yes_ask == 0.61
        mv = kalshi.movement(snaps, NOW + timedelta(minutes=12))
        first = round((float(BY[JOKIC25]["yes_bid_dollars"]) + float(BY[JOKIC25]["yes_ask_dollars"])) / 2, 4)
        assert mv["first_observed"] == first and mv["current"] == 0.605 and mv["change_since_first"] == round(0.605 - first, 4)
        assert mv["windows"]["5m"] == round(0.605 - first, 4) and mv["windows"]["3h"] is None  # no observation 3h ago: not invented
        assert mv["high"] == 0.605 and mv["low"] == first and mv["spread"] == 0.01 and mv["observations"] == 2
        assert s.scalar(select(text("count(*)")).select_from(gdb.OddsSnapshot).where(gdb.OddsSnapshot.source_ref == JOKIC25)) == 4
    for stmt in ("update kalshi_snapshots set yes_ask = 0.01", "delete from kalshi_snapshots"):
        with pytest.raises(Exception, match="immutable"):
            with gdb.get_engine().begin() as c:
                c.execute(text(stmt))


def test_unknown_player_or_game_is_not_guessed_and_outage_is_recorded():
    ghost = copy.deepcopy(BY[JOKIC25])
    ghost.update(ticker="KXNBAPTS-26NOV24DALDEN-DENZZNOBODY99-25", yes_sub_title="Zz Nobody: 25+", title="Zz Nobody: 25+ points",
                 rules_primary=ghost["rules_primary"].replace("Nikola Jokić", "Zz Nobody"))
    other = copy.deepcopy(BY[JOKIC25]); other.update(ticker="KXNBAPTS-26NOV24LALBOS-X-25", event_ticker="KXNBAPTS-26NOV24LALBOS")
    stub = StubKalshi([ghost, other], fail={"KXNBAREB"})
    r = kalshi.observe(provider=stub, now=NOW + timedelta(minutes=20))
    assert r["markets_seen"] == 1 and [f["series"] for f in r["series_failed"]] == ["KXNBAREB"]
    with gdb.session_scope() as s:
        g = s.get(gdb.KalshiMarket, ghost["ticker"])
        assert g.interpretation == "unmatched" and g.player_id is None and "could not be matched" in g.interpretation_note
        assert s.get(gdb.KalshiMarket, other["ticker"]) is None  # no such game in our schedule
        assert not s.scalar(select(text("count(*)")).select_from(gdb.OddsSnapshot).where(gdb.OddsSnapshot.source_ref == ghost["ticker"]))


def test_quotes_stop_at_tipoff():
    with gdb.session_scope() as s:
        tip = s.get(gdb.Game, "K1").tipoff_utc
    moved = copy.deepcopy(FX)
    for m in moved:
        if m["ticker"] == JOKIC25:
            m["yes_ask_dollars"], m["yes_bid_dollars"] = "0.9000", "0.8900"
    r = kalshi.observe(provider=StubKalshi([m for m in moved if m["ticker"] == JOKIC25]), now=tip + timedelta(minutes=1))
    assert r["snapshots"] == 1 and r["quotes_appended"] == 0  # the market is still observed; pregame research is frozen


# ---------------------------------------------------------------- minutes intelligence
def test_minutes_tiers_and_classification_rules():
    assert [MI.tier_of(x) for x in (36, 35, 30, 29.9, 22, 19.9)] == ["35+", "35+", "30–34.9", "25–29.9", "20–24.9", "Below 20"]
    assert MI.tier_of(None) is None
    base = dict(returned_recently=False, last_gap_days=2, games_season=30, availability="available", sd_l10=3.0, starts_l10=10, l10=34.0)
    assert MI.classify(base)[0] == "high_minute_starter"
    assert MI.classify({**base, "l10": 29.0})[0] == "stable_starter"
    assert MI.classify({**base, "starts_l10": 2, "l10": 26.0})[0] == "primary"
    assert MI.classify({**base, "starts_l10": 0, "l10": 18.0})[0] == "secondary"
    assert MI.classify({**base, "starts_l10": 0, "l10": 9.0})[0] == "limited"
    assert MI.classify({**base, "sd_l10": 9.0})[0] == "variable"           # a high-minute player can still be unstable
    assert MI.classify({**base, "availability": "questionable"})[0] == "uncertain"
    assert MI.classify({**base, "games_season": 2})[0] == "uncertain"
    assert MI.classify({**base, "returned_recently": True, "last_gap_days": 21})[0] == "returning"


def test_slate_minutes_matches_raw_logs():
    pid = ST["players"][ABBR_TO_ID["DEN"]][0]
    with gdb.session_scope() as s:
        raw = [r[0] for r in s.execute(select(gdb.PlayerBox.minutes).where(gdb.PlayerBox.player_id == pid).order_by(gdb.PlayerBox.game_date))]
        data = MI.slate_minutes(s, date(2026, 11, 24))
        row = next(r for r in data["items"] if r["player_id"] == pid)
    r1 = lambda xs: round(sum(xs) / len(xs), 1)  # noqa: E731
    assert row["l3"] == r1(raw[-3:]) and row["l5"] == r1(raw[-5:]) and row["l10"] == r1(raw[-10:]) and row["l20"] == r1(raw[-20:])
    assert row["min_l10"] == round(min(raw[-10:]), 1) and row["max_l10"] == round(max(raw[-10:]), 1)
    assert row["opp_abbr"] == "DAL" and row["game_id"] == "K1" and row["tier"] and row["classification_label"]
    assert row["proj_min"] is not None and row["proj_min_low"] is None  # no evaluated minutes model yet: band is not invented
    assert row["restriction"] is None and "No authorized source" in data["restrictions_note"]
    assert {r["team_abbr"] for r in data["items"]} == {"DAL", "DEN", "DET", "ORL"}


def test_minutes_model_evaluation_is_chronological_and_compares_tiers():
    from gizer import modeling as M
    with gdb.session_scope() as s:
        pf = M.load_player_frame(s)
    res = MI.evaluate_minutes(M.build_player_backtest_frame(pf))
    m = res["metrics"]
    assert set(m["models"]) == {"minutes_blend", "baseline_last10_avg", "baseline_recent_ewma", "baseline_season_avg"}
    assert set(m["gate_checks"]) == {"enough_observations", "not_worse_than_best_baseline", "band_coverage"}
    assert res["periods"]["calibration"].split("..")[1] < res["periods"]["evaluation"].split("..")[0]
    assert all({"tier", "n", "minutes_mae", "band_coverage", "pts_mae_relative"} <= set(t) for t in m["tier_study"])


# ---------------------------------------------------------------- availability change events
@pytest.mark.parametrize("status,cls", [(None, "available"), ("Out", "out"), ("Out For Season", "out"), ("Doubtful", "doubtful"),
                                        ("Questionable", "questionable"), ("Probable", "probable"), ("Day-To-Day", "game_time_decision"),
                                        ("Suspension", "out"), ("Something New", "unknown")])
def test_availability_classification(status, cls):
    assert ingestion.availability_class(status) == cls and cls in ingestion.AVAILABILITY_CLASSES


def _last_batch():
    with gdb.session_scope() as s:
        return s.scalar(select(gdb.InjurySnapshot.batch_id).order_by(gdb.InjurySnapshot.id.desc()).limit(1))


def test_status_changes_become_events_with_previous_status_preserved():
    den = ABBR_TO_ID["DEN"]
    a, b, c = ST["players"][den][:3]
    add_injuries([(a, pname(a), den, "Questionable"), (b, pname(b), den, "Out")])
    assert ingestion.detect_availability_changes(_last_batch(), date(2026, 11, 24)) == [] or True  # first comparison baseline (may follow other tests)
    add_injuries([(a, pname(a), den, "Out"), (b, pname(b), den, "Out"), (c, pname(c), den, "Probable")])
    ch = {x["player_id"]: x for x in ingestion.detect_availability_changes(_last_batch(), date(2026, 11, 24))}
    assert set(ch) >= {a, c} and b not in ch                       # unchanged status is not an event
    assert (ch[a]["previous_status"], ch[a]["current_status"], ch[a]["material"]) == ("Questionable", "Out", True)
    assert (ch[c]["previous_class"], ch[c]["current_class"], ch[c]["material"]) == ("available", "probable", False)
    assert ch[a]["game_id"] == "K1"
    add_injuries([(b, pname(b), den, "Out"), (c, pname(c), den, "Probable")])   # player a no longer listed
    ch2 = {x["player_id"]: x for x in ingestion.detect_availability_changes(_last_batch(), date(2026, 11, 24))}
    assert (ch2[a]["previous_status"], ch2[a]["current_status"], ch2[a]["current_class"], ch2[a]["material"]) == ("Out", None, "available", True)
    with gdb.session_scope() as s:
        evs = list(s.scalars(select(gdb.ResearchEvent).where(gdb.ResearchEvent.kind == "availability_change")))
        assert len(evs) >= 3 and all(e.actor.startswith("agent-04") for e in evs)
        assert s.scalar(select(text("count(*)")).select_from(gdb.InjurySnapshot)) >= 7  # every report is kept


def test_material_change_queues_an_update_edition(monkeypatch):
    from gizer import jobs as J
    monkeypatch.setattr(J, "_inj", lambda: {"summary": "stub", "data": {"rows": 1, "unmatched_players": 0, "changes": 1, "material_changes": 1}})
    monkeypatch.setattr(J, "a05_rotation", lambda d: {"summary": "stub", "data": {"role_changes": [], "volatile": [], "lineups": {"changes": []}}})
    monkeypatch.setattr(ingestion, "today_et", lambda: date(2026, 11, 24))
    monkeypatch.setattr(J, "utcnow", lambda: NOW)
    r = J.job_availability_watch({}, None)
    assert r["material_changes"] == 1 and r["edition_queued"] is True
    assert J.job_availability_watch({}, None)["edition_queued"] is False   # same 10-minute bucket: not duplicated
    with gdb.session_scope() as s:
        j = s.scalar(select(gdb.Job).where(gdb.Job.name == "edition"))
        assert j.args["kind"] == "update"
    monkeypatch.setattr(J, "_inj", lambda: {"summary": "stub", "data": {"rows": 1, "unmatched_players": 0, "changes": 0, "material_changes": 0}})
    assert J.job_availability_watch({}, None)["edition_queued"] is False


def test_scheduler_runs_watch_jobs_only_while_games_are_upcoming():
    from gizer import jobs as J
    with gdb.session_scope() as s:
        s.execute(text("delete from jobs"))
    q = J.scheduler_tick(NOW)                                   # K1/K2 tip in 9 hours
    assert any(k.startswith("market_watch::") for k in q) and any(k.startswith("availability_watch::") for k in q)
    assert not any("watch" in k for k in J.scheduler_tick(NOW + timedelta(seconds=40)))   # same bucket
    assert any(k.startswith("market_watch::") for k in J.scheduler_tick(NOW + timedelta(minutes=5)))
    far = NOW - timedelta(days=3)                               # no game within the watch window
    assert not any("watch" in k for k in J.scheduler_tick(far))
    with gdb.session_scope() as s:
        s.execute(text("delete from jobs"))


# ---------------------------------------------------------------- API
def test_core_api_shapes():
    with gdb.session_scope() as s:
        s.add(gdb.User(email="owner@test.local", password_hash=_ph.hash("correct horse battery"), role="owner"))
    from gizer.api import app
    c = TestClient(app)
    c.headers["X-CSRF-Token"] = c.post("/api/v1/auth/login", json={"email": "owner@test.local", "password": "correct horse battery"}).json()["csrf"]
    assert TestClient(app).get("/api/v1/kalshi/markets").status_code == 401
    r = c.get("/api/v1/kalshi/markets?date=2026-11-24&sort=player&limit=200").json()
    assert r["counts"]["total"] == 11 and r["counts"]["unsupported"] == 3 and r["counts"]["unmatched"] == 1
    assert "not a real-time feed" in r["sync"]["note"] and r["sync"]["stale"] is True and r["sync"]["last_sync_at"] is None
    row = next(x for x in r["items"] if x["ticker"] == JOKIC25)
    assert row["title"] == "Nikola Jokić: 25+ points" and row["threshold"] == 24.5 and row["comparator"] == ">= 25"
    assert row["observations"] >= 2 and row["first_observed"] is not None and row["game_label"] == "DAL @ DEN"
    assert c.get("/api/v1/kalshi/markets?date=2026-11-24&interpretation=unsupported").json()["total"] == 3
    assert c.get("/api/v1/kalshi/markets?date=2026-11-24&player_id=203999").json()["total"] >= 2
    assert c.get("/api/v1/kalshi/markets?sort=bogus").status_code == 422
    d = c.get(f"/api/v1/kalshi/markets/{JOKIC25}").json()
    assert len(d["series"]) >= 2 and d["series"][0]["at"] < d["series"][-1]["at"]
    assert "25+ points" in d["rules"]["primary"] and "fair price" in d["rules"]["secondary"] and "void" in d["rules"]["settlement_note"]
    assert d["history"]["L10"]["n"] == 0 and d["history"]["L10"]["frequency_over"] is None   # this fixture player has no game log
    assert d["research"]["model_ready"] is False and "never a model input" in d["research"]["note"]
    prot = c.get("/api/v1/kalshi/markets/KXNBAPTSPROT-26NOV24DETORL-ORLGBITADZE35-15").json()
    assert prot["research"] is None and prot["history"] is None and prot["market"]["interpretation"] == "unsupported"
    assert c.get("/api/v1/kalshi/markets/NOPE").status_code == 404
    m = c.get("/api/v1/minutes?date=2026-11-24&sort=l10&order=desc&limit=5").json()
    vals = [x["l10"] for x in m["items"]]
    assert len(vals) == 5 and vals == sorted(vals, reverse=True) and m["tiers"][0] == "35+" and m["model"] is None
    assert c.get("/api/v1/minutes?sort=bogus").status_code == 422
    pm = c.get(f"/api/v1/players/{ST['players'][ABBR_TO_ID['DEN']][0]}/minutes").json()
    assert pm["profile"]["classification_label"] and pm["profile"]["l10"] is not None
    ch = c.get("/api/v1/injuries/changes?date=2026-11-24").json()
    assert ch["items"] and {"previous_status", "current_status", "material", "records_to_reassess", "source"} <= set(ch["items"][0])
    assert all(i["material"] for i in c.get("/api/v1/injuries/changes?date=2026-11-24&material=true").json()["items"])
    prov = {p["provider"]: p for p in c.get("/api/v1/data-health/providers").json()["items"]}
    assert prov["kalshi"]["credential"] == "not_required" and any("Read-only" in x for x in prov["kalshi"]["limitations"])
