"""Providers (contract + failure behaviour), scheduler (DST, dedupe, pause), queue (retry, dead-letter,
stale recovery), agents (schema-validated outputs)."""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import select, text

from gizer import db as gdb
from gizer import jobs as J
from gizer import providers as P
from gizer.config import get_settings

ET = ZoneInfo("America/New_York")
pytestmark = pytest.mark.usefixtures("db")

ESPN_SB = {"events": [{"id": "401", "date": "2026-11-25T00:00Z", "season": {"type": 2}, "competitions": [{
    "venue": {"fullName": "Test Arena"}, "status": {"type": {"name": "STATUS_SCHEDULED", "state": "pre", "completed": False}},
    "competitors": [{"homeAway": "home", "team": {"abbreviation": "NY"}, "score": "0"},
                    {"homeAway": "away", "team": {"abbreviation": "GS"}, "score": "0"}],
    "odds": [{"provider": {"name": "TestBook"}, "pointSpread": {"home": {"close": {"line": "-2.5", "odds": "-110"}},
                                                               "away": {"close": {"line": "+2.5", "odds": "-110"}}},
              "total": {"over": {"close": {"line": "o220.5", "odds": "-105"}}, "under": {"close": {"line": "u220.5", "odds": "EVEN"}}},
              "moneyline": {"home": {"close": {"odds": "-140"}}, "away": {"close": {"odds": "+120"}}}}]}]}]}
PBP_GAMES = {"results": [{"GameId": "0022600001", "Date": "2026-10-20", "HomeTeamId": "1610612765", "AwayTeamId": "1610612738",
                          "HomePoints": 121, "AwayPoints": 113, "HomePossessions": 99, "AwayPossessions": 99}]}


def _pl(i, pts):
    return {"EntityId": str(1000 + i), "Name": f"Fixture Player {i}", "Minutes": "30:30", "Points": pts, "Rebounds": 4,
            "Assists": 3, "FG2A": 8, "FG3A": 4, "FG3M": 1, "FTA": 2}


PBP_BOX = {"home_team_id": "1610612765", "away_team_id": "1610612738", "stats": {
    "Home": {"FullGame": [{"EntityId": "0", "Name": "Team"}] + [_pl(i, 10 + i) for i in range(6)]},
    "Away": {"FullGame": [_pl(i, 9) for i in range(10, 16)] + [{"EntityId": "77", "Name": "DNP", "Minutes": "00:00"}]}}}
ODDS_EVENT = {"home_team": "New York Knicks", "away_team": "Golden State Warriors", "commence_time": "2026-11-25T00:00:00Z",
              "bookmakers": [{"title": "TestBook", "markets": [{"key": "player_points", "last_update": "2026-11-24T20:00:00Z",
                                                                "outcomes": [{"name": "Over", "description": "Fixture Player 1", "point": 24.5, "price": -115},
                                                                             {"name": "Under", "description": "Fixture Player 1", "point": 24.5, "price": -105}]}]}]}


def client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_espn_contract_and_normalisation():
    p = P.EspnProvider(client=client(lambda r: httpx.Response(200, json=ESPN_SB)), sleep=lambda s: None)
    games, odds = p.scoreboard(date(2026, 11, 24))
    g = games[0]
    assert g.game_date == date(2026, 11, 24)  # 00:00Z is the previous evening in New York
    assert (g.home_team_id, g.away_team_id) == (P.ABBR_TO_ID["NYK"], P.ABBR_TO_ID["GSW"])
    by = {(o.market, o.side): o for o in odds}
    assert by[("spread", "home")].line == -2.5 and by[("total", "over")].line == 220.5
    assert by[("total", "under")].price_american == 100 and by[("moneyline", "away")].price_american == 120
    assert all(o.book == "TestBook" and o.provider == "espn" for o in odds)


def test_pbpstats_contract():
    def h(r):
        return httpx.Response(200, json=PBP_GAMES if "get-games" in r.url.path else PBP_BOX)
    p = P.PbpStatsProvider(client=client(h), sleep=lambda s: None)
    assert p.games("2026-27")[0].home_points == 121
    box = p.player_box("0022600001")
    assert len(box) == 12 and box[0].minutes == 30.5 and box[0].fga == 12
    assert all(b.player_id not in (0, 77) for b in box)  # team row and DNP excluded


def test_oddsapi_contract_and_disabled_without_key():
    recs = P.OddsApiProvider(sleep=lambda s: None).parse_props(ODDS_EVENT)
    assert len(recs) == 2 and recs[0].market == "player_pts" and recs[0].line == 24.5 and recs[0].side == "over"
    with pytest.raises(P.ProviderDisabled):
        P.OddsApiProvider(sleep=lambda s: None).events()
    from gizer import ingestion
    assert ingestion.ingest_player_props(date(2026, 11, 24)) == {"available": False, "reason": "GIZER_ODDS_API_KEY is not configured"}


def test_provider_outage_retries_then_raises_and_is_logged():
    calls = []
    def h(r):
        calls.append(1)
        return httpx.Response(503)
    p = P.PbpStatsProvider(client=client(h), sleep=lambda s: None)
    with pytest.raises(P.ProviderError):
        p.games("2026-27")
    assert len(calls) == p.max_retries + 1
    with gdb.session_scope() as s:
        n = s.scalar(select(text("count(*)")).select_from(gdb.ProviderCall).where(gdb.ProviderCall.provider == "pbpstats", gdb.ProviderCall.ok.is_(False)))
        assert n == len(calls)
        assert s.scalar(select(text("count(*)")).select_from(gdb.Game)) == 0  # nothing substituted


def test_invalid_source_data_is_rejected_not_guessed():
    p = P.PbpStatsProvider(client=client(lambda r: httpx.Response(200, json={"results": [{"GameId": "1"}]})), sleep=lambda s: None)
    with pytest.raises(P.ProviderError, match="schema"):
        p.games("2026-27")
    short = {**PBP_BOX, "stats": {"Home": {"FullGame": [_pl(1, 5)]}, "Away": {"FullGame": [_pl(2, 5)]}}}
    p2 = P.PbpStatsProvider(client=client(lambda r: httpx.Response(200, json=short)), sleep=lambda s: None)
    with pytest.raises(P.ProviderError, match="invalid"):
        p2.player_box("x")
    p3 = P.EspnProvider(client=client(lambda r: httpx.Response(200, text="<html>")), sleep=lambda s: None)
    with pytest.raises(P.ProviderError):
        p3.injuries()


def test_odds_quota_is_a_hard_cap(monkeypatch):
    monkeypatch.setenv("GIZER_ODDS_API_KEY", "test-key-not-real")
    monkeypatch.setenv("GIZER_ODDS_API_MONTHLY_QUOTA", "3")
    get_settings.cache_clear()
    try:
        hits = []
        p = P.OddsApiProvider(client=client(lambda r: (hits.append(1), httpx.Response(200, json=ODDS_EVENT))[1]), sleep=lambda s: None)
        p.player_props("e1", markets=("player_points", "player_rebounds"))
        with pytest.raises(P.QuotaExceeded):
            p.player_props("e2", markets=("player_points", "player_rebounds"))
        assert len(hits) == 1
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_ingestion_is_idempotent_and_merges_providers():
    from gizer import ingestion
    ingestion.seed_reference()
    def h(r):
        return httpx.Response(200, json=PBP_GAMES if "get-games" in r.url.path else PBP_BOX)
    for _ in range(2):
        r = ingestion.ingest_results("2026-27", provider=P.PbpStatsProvider(client=client(h), sleep=lambda s: None))
    assert r["boxes_ingested"] == 0 and r["boxes_pending"] == 0
    espn = P.EspnProvider(client=client(lambda r: httpx.Response(200, json=ESPN_SB)), sleep=lambda s: None)
    a = ingestion.ingest_slate(date(2026, 11, 24), provider=espn)
    b = ingestion.ingest_slate(date(2026, 11, 24), provider=espn)
    assert a["odds_rows_appended"] == 6 and b["odds_rows_appended"] == 0  # unchanged quotes are not duplicated
    with gdb.session_scope() as s:
        assert s.scalar(select(text("count(*)")).select_from(gdb.Game)) == 2
        assert s.scalar(select(text("count(*)")).select_from(gdb.PlayerBox)) == 12
        assert s.scalar(select(text("count(*)")).select_from(gdb.OddsSnapshot)) == 6


# ---------------------------------------------------------------- scheduler
def test_schedule_follows_new_york_time_across_dst():
    winter = datetime(2026, 12, 1, 15, 0, 30, tzinfo=timezone.utc)   # 10:00 EST
    summer = datetime(2027, 3, 15, 14, 0, 30, tzinfo=timezone.utc)   # 10:00 EDT (after 14 Mar 2027)
    for now in (winter, summer):
        keys = [k for _, _, k in J.due_occurrences(now)]
        assert any(k.startswith("edition:morning:") and k.endswith("T1000") for k in keys), keys
    assert not any("edition:morning" in k for _, _, k in J.due_occurrences(datetime(2026, 12, 1, 14, 0, 30, tzinfo=timezone.utc)))
    fall_back = datetime(2026, 11, 1, 9, 0, 10, tzinfo=timezone.utc)  # 04:00 EST on the day clocks change
    assert any(k.startswith("settlement:") for _, _, k in J.due_occurrences(fall_back))
    nxt = J.next_run("weekly_evaluation", {}, winter)
    assert nxt.weekday() == 0 and nxt.astimezone(ET).hour == 5


def test_scheduler_tick_dedupes_and_respects_pause():
    now = datetime(2026, 12, 1, 15, 0, 30, tzinfo=timezone.utc)
    first = J.scheduler_tick(now)
    assert any("edition:morning" in k for k in first)
    assert J.scheduler_tick(now + timedelta(seconds=30)) == []  # duplicate execution prevention
    with gdb.session_scope() as s:
        gdb.set_setting(s, "paused", {"paused": True})
    assert J.scheduler_tick(datetime(2026, 12, 1, 17, 0, 30, tzinfo=timezone.utc)) == []
    with gdb.session_scope() as s:
        gdb.set_setting(s, "paused", {"paused": False})
        s.execute(text("delete from jobs"))


def test_pregame_checkpoints_follow_actual_tipoff():
    from gizer.research import due_pregame_checks
    tip = datetime(2026, 12, 2, 0, 40, tzinfo=timezone.utc)
    with gdb.session_scope() as s:
        s.add(gdb.Game(id="PG1", season="2026-27", game_date=date(2026, 12, 1), home_team_id=P.TEAMS[0][0],
                       away_team_id=P.TEAMS[1][0], status="scheduled", provider="synthetic", tipoff_utc=tip))
    with gdb.session_scope() as s:
        assert due_pregame_checks(s, tip - timedelta(minutes=88)) == [("PG1", 90)]
        assert due_pregame_checks(s, tip - timedelta(minutes=58)) == [("PG1", 60)]
        assert due_pregame_checks(s, tip - timedelta(minutes=120)) == []
        assert due_pregame_checks(s, tip + timedelta(minutes=1)) == []
    q = J.scheduler_tick(tip - timedelta(minutes=29))
    assert any(k.startswith("edition:pregame:") for k in q)
    with gdb.session_scope() as s:
        s.get(gdb.Game, "PG1").status = "postponed"
    assert not any("pregame" in k for k in J.scheduler_tick(tip - timedelta(minutes=9)))
    with gdb.session_scope() as s:
        s.execute(text("delete from jobs"))


def test_queue_retry_backoff_dead_letter_and_recovery(monkeypatch):
    calls = {"n": 0}
    def flaky(args, job_id=None):
        calls["n"] += 1
        raise RuntimeError("provider outage")
    monkeypatch.setitem(J.HANDLERS, "flaky", flaky)
    monkeypatch.setitem(J.HANDLERS, "fine", lambda a, j=None: {"ok": True, "at": datetime.now(timezone.utc)})
    assert J.enqueue("flaky", {}, "flaky:1") and not J.enqueue("flaky", {}, "flaky:1")
    jid = J.claim("w1")
    assert J.claim("w2") is None  # nothing else queued; the running job is not handed out twice
    assert J.execute(jid, use_alarm=False) == "queued"
    with gdb.session_scope() as s:
        j = s.get(gdb.Job, jid)
        assert j.attempts == 1 and j.run_after > gdb.utcnow() + timedelta(seconds=60) and "outage" in j.error
        j.run_after = gdb.utcnow() - timedelta(seconds=1)
    for _ in range(3):
        jid2 = J.claim("w1")
        st = J.execute(jid2, use_alarm=False)
        with gdb.session_scope() as s:
            s.get(gdb.Job, jid).run_after = gdb.utcnow() - timedelta(seconds=1)
    assert st == "dead" and calls["n"] == 4  # max attempts, then dead-letter
    assert J.operations_status()["dead_letter"] == 1
    J.enqueue("fine", {}, "fine:1")
    jid3 = J.claim("w1")
    with gdb.session_scope() as s:
        s.get(gdb.Job, jid3).locked_at = gdb.utcnow() - timedelta(hours=3)  # simulate a crashed worker
    assert J.recover_stale() == 1
    jid4 = J.claim("w2")
    assert jid4 == jid3 and J.execute(jid4, use_alarm=False) == "done"
    J.enqueue("nope", {}, "nope:1")
    assert J.execute(J.claim("w1"), use_alarm=False) == "dead"  # unknown job never loops


def test_job_timeout_is_enforced(monkeypatch):
    import time
    monkeypatch.setitem(J.HANDLERS, "slow", lambda a, j=None: time.sleep(5))
    J.enqueue("slow", {}, "slow:1", timeout_s=1)
    jid = J.claim("w1")
    t0 = time.monotonic()
    assert J.execute(jid) == "queued" and time.monotonic() - t0 < 3
    with gdb.session_scope() as s:
        assert "JobTimeout" in s.get(gdb.Job, jid).error


# ---------------------------------------------------------------- agents
def test_eighteen_agents_declared_with_triggers_and_schemas():
    assert [a.number for a in J.AGENTS] == list(range(1, 19))
    assert len({a.id for a in J.AGENTS}) == 18
    assert all(a.trigger and a.required and a.on_failure for a in J.AGENTS)
    st = J.agents_status()
    assert len(st) == 18 and all(a["next_run_at"] is not None for a in st)


def test_agent_output_validation_and_honest_status():
    with pytest.raises(RuntimeError, match="schema validation"):
        J.run_agent(9, lambda: {"summary": "x", "data": {"wrong": 1}})
    with pytest.raises(RuntimeError, match="forbidden"):
        J.run_agent(9, lambda: {"summary": "a guaranteed result", "data": {"coverage": []}})
    out = J.run_agent(9, J.a09_history)
    assert "coverage" in out["data"]
    by = {a["number"]: a for a in J.agents_status()}
    assert by[9]["status"] == "ok" and by[9]["last_success_at"] is not None
    assert by[3]["status"] == "never_run" and by[3]["last_execution_at"] is None  # no fabricated activity
    with gdb.session_scope() as s:
        assert s.scalar(select(text("count(*)")).select_from(gdb.AgentExecution).where(gdb.AgentExecution.status == "failed")) == 2
