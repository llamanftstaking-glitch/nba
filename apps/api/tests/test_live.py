"""GIZER LIVE: parsing of real provider payloads, idempotent ingestion, corrections, derived rotations and
score progression, freshness, watchlist, milestones, paper research tracker and research immutability.

Fixtures are real ESPN payloads captured on 2026-11-25 (trimmed). They prove our handling of that shape; live
behaviour during a game is verified separately (docs/operations/LIVE-VALIDATION.md)."""
import copy
import json
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from conftest import seed_synthetic
from gizer import db as gdb
from gizer import jarvis_tools as T
from gizer import live as L
from gizer.providers import ESPN_ABBR_TO_ID
from gizer.security import _ph

FX = Path(__file__).parent / "fixtures"
SB = json.loads((FX / "espn_live_scoreboard.json").read_text())
SUM = json.loads((FX / "espn_live_summary.json").read_text())
EVENT = SUM["header"]["id"]
ST = {}


@pytest.fixture(scope="module")
def app(db):
    ST.update(seed_synthetic())
    comp = SUM["header"]["competitions"][0]
    side = {c["homeAway"]: ESPN_ABBR_TO_ID[c["team"]["abbreviation"]] for c in comp["competitors"]}
    now = gdb.utcnow()
    with gdb.session_scope() as s:
        for tid, abbr in ((side["home"], "HOM"), (side["away"], "AWY")):
            if s.get(gdb.Team, tid) is None:
                s.add(gdb.Team(id=tid, abbr=abbr, name=f"Fixture {abbr}"))
        s.flush()
        s.add(gdb.Game(id="LIVE1", season="2026-27", game_date=L.today_et(now), tipoff_utc=now - timedelta(hours=1), home_team_id=side["home"],
                       away_team_id=side["away"], status="scheduled", espn_event_id=EVENT, provider="espn"))
        # an event id we hold but for DIFFERENT teams: must never receive this game's data
        other = next(e for e in SB["events"] if e["id"] != EVENT)
        s.add(gdb.Game(id="WRONG1", season="2026-27", game_date=L.today_et(now), tipoff_utc=now, home_team_id=ST["teams"][0],
                       away_team_id=ST["teams"][1], status="scheduled", espn_event_id=other["id"], provider="espn"))
        s.add(gdb.User(email="owner@test.local", password_hash=_ph.hash("correct horse battery"), role="owner"))
        s.add(gdb.User(email="viewer@test.local", password_hash=_ph.hash("viewer password 123"), role="viewer"))
    ST["side"] = side
    from gizer.api import app as a
    return a


def login(app, email="owner@test.local", pw="correct horse battery"):
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    c.headers["X-CSRF-Token"] = r.json()["csrf"]
    return c


class FakeEspn:
    def __init__(self, sb=SB, summary=SUM, fail=()):
        self.sb, self.summary, self.fail, self.calls = sb, summary, set(fail), []

    def get_json(self, path, params=None, **kw):
        self.calls.append(path)
        if path in self.fail:
            raise L.ProviderError("provider down")
        return self.sb if path == "/scoreboard" else self.summary


# ------------------------------------------------------------------ pure parsing
def test_status_mapping_never_marks_a_scheduled_game_live():
    def st(name, state, completed=False):
        return {"type": {"name": name, "state": state, "completed": completed}}
    assert L.map_status(st("STATUS_SCHEDULED", "pre"), 0) == "scheduled"
    assert L.map_status(st("STATUS_IN_PROGRESS", "in"), 2) == "live"
    assert L.map_status(st("STATUS_IN_PROGRESS", "in"), 5) == "overtime"
    assert L.map_status(st("STATUS_HALFTIME", "in"), 2) == "halftime"
    assert L.map_status(st("STATUS_END_PERIOD", "in"), 1) == "end_period"
    assert L.map_status(st("STATUS_FINAL", "post", True), 4) == "final"
    assert L.map_status(st("STATUS_POSTPONED", "post"), 0) == "postponed"
    assert L.map_status(st("STATUS_CANCELED", "post"), 0) == "cancelled"
    assert L.map_status(st("STATUS_SUSPENDED", "in"), 2) == "suspended"
    assert L.map_status(st("STATUS_DELAYED", "pre"), 0) == "delayed"
    assert L.map_status(st("STATUS_SOMETHING_NEW", "pre"), 0) == "scheduled"            # unknown is never assumed live
    assert [L.period_label(p, "live") for p in (1, 4, 5, 6)] == ["Q1", "Q4", "OT", "2OT"] and L.period_label(0, "scheduled") == ""
    assert L.elapsed_seconds(1, "12:00") == 0 and L.elapsed_seconds(2, "6:00") == 1080 and L.elapsed_seconds(5, "2:30.0") == 2880 + 150
    assert L.elapsed_seconds(1, None) is None and L.clock_seconds("28.1") == 28.1


def test_real_payloads_parse_into_typed_rows_without_inventing_values():
    rows = L.parse_scoreboard(SB)
    assert len(rows) == len(SB["events"]) and {r["status"] for r in rows} >= {"live", "scheduled", "final"}
    sched = next(r for r in rows if r["status"] == "scheduled")
    assert sched["home_score"] is None and sched["clock"] is None and sched["linescores"] == {}      # nothing shown before tipoff
    live = next(r for r in rows if r["espn_event_id"] == EVENT)
    assert live["status"] == "live" and live["period"] == 3 and live["clock"] and len(live["linescores"]["home"]) == 3
    p = L.parse_summary(SUM)
    assert set(p["team_stats"]) == {"home", "away"} and "fieldGoalPct" in p["team_stats"]["home"]
    assert len(p["players"]) >= 20 and sum(1 for x in p["players"] if x["starter"]) == 10
    star = max(p["players"], key=lambda x: x["pts"] or 0)
    assert star["fgm"] is not None and star["fga"] >= star["fgm"] and star["minutes"] > 0
    dnp = [x for x in p["players"] if x["dnp"]]
    assert all(x["pts"] is None and x["minutes"] is None for x in dnp)                                 # a DNP is missing, not zero
    kinds = {x["kind"] for x in p["plays"]}
    assert {"made", "missed", "rebound", "foul", "substitution", "free_throw", "turnover", "timeout", "period"} <= kinds
    assert len({x["event_id"] for x in p["plays"]}) == len(p["plays"])
    assert L.parse_summary({}) == {"team_stats": {}, "players": [], "plays": []}                       # an empty payload is empty, not an error
    assert L.parse_scoreboard({"events": [{"id": "x"}, SB["events"][0]]})[0]["espn_event_id"] == SB["events"][0]["id"]   # one bad event is skipped


def test_rotations_are_derived_only_when_the_substitution_chain_is_consistent():
    p = L.parse_summary(SUM)
    rot = L.rotations(p["players"], p["plays"])
    assert len(rot) == 2 and all(t["determinable"] for t in rot.values())
    for t in rot.values():
        on = [r for r in t["players"] if r["on_court"]]
        assert len(on) == 5                                                                            # exactly five on the floor
        for r in t["players"]:
            derived = sum(r["minutes_by_period"].values())
            if r["minutes"]:
                assert abs(derived - r["minutes"]) <= 1.6                                              # agrees with the published minutes
    broken = [x for x in p["plays"] if not (x["kind"] == "substitution" and x["sequence"] == min(
        y["sequence"] for y in p["plays"] if y["kind"] == "substitution"))]
    rot2 = L.rotations(p["players"], broken)                                                           # one missing substitution
    bad = [t for t in rot2.values() if not t["determinable"]]
    assert bad and all(r["on_court"] is None and r["stints"] == [] for t in bad for r in t["players"]) # unknown, never guessed
    four = [dict(x, starter=False) if i == 0 else x for i, x in enumerate(sorted(p["players"], key=lambda x: not x["starter"]))]
    assert any(not t["determinable"] for t in L.rotations(four, p["plays"]).values())                   # four starters: not derivable


def test_score_progression_is_descriptive_and_matches_the_plays():
    p = L.parse_summary(SUM)
    side = {ST.get("side", {}).get("home"): "home", ST.get("side", {}).get("away"): "away"}
    plays = [dict(x, team_side=side.get(x["team_id"])) for x in p["plays"]]
    m = L.momentum(plays)
    last = m["points"][-1]
    comp = {c["homeAway"]: int(c["score"]) for c in SUM["header"]["competitions"][0]["competitors"]}
    assert (last["home"], last["away"]) == (comp["home"], comp["away"])
    assert m["largest_lead"]["home"] == max(max(x["diff"] for x in m["points"]), 0)
    assert m["largest_lead"]["away"] == max(-min(x["diff"] for x in m["points"]), 0)
    assert all(r["points"] >= 8 for r in m["runs"]) and "win probability" in m["note"] and "probab" not in json.dumps({k: v for k, v in m.items() if k != "note"})
    assert L.momentum([])["points"] == []


# ------------------------------------------------------------------ ingestion
def test_poll_is_idempotent_maps_only_verified_games_and_survives_provider_failure(app):
    now = gdb.utcnow()
    with gdb.session_scope() as s:
        n_pred = s.scalar(select(func.count()).select_from(gdb.Prediction))
    r1 = L.poll(now, FakeEspn())
    assert r1["errors"] == [] and r1["scoreboard"]["games"] == 1 and r1["scoreboard"]["not_in_schedule"] == len(SB["events"]) - 1
    with gdb.session_scope() as s:
        assert s.get(gdb.LiveGame, "WRONG1") is None                                                   # teams did not match: nothing attached
        lg = s.get(gdb.LiveGame, "LIVE1")
        v1, plays1 = lg.version, s.scalar(select(func.count()).select_from(gdb.LivePlay))
        assert lg.status == "live" and lg.home_score is not None and plays1 == len(SUM["plays"]) and lg.provider_updated_at is not None
        assert s.get(gdb.Game, "LIVE1").status == "live"
        assert s.scalar(select(func.count()).select_from(gdb.LivePlayerBox).where(gdb.LivePlayerBox.on_court.is_(True))) == 10
    L.poll(now + timedelta(seconds=15), FakeEspn())                                                    # same payload again
    with gdb.session_scope() as s:
        lg = s.get(gdb.LiveGame, "LIVE1")
        assert s.scalar(select(func.count()).select_from(gdb.LivePlay)) == plays1 and lg.version == v1  # no duplicates, no false change
        assert lg.observed_at == now + timedelta(seconds=15)
    down = L.poll(now + timedelta(seconds=30), FakeEspn(fail={"/scoreboard", "/summary"}))
    assert down["errors"] and "scoreboard" not in down
    with gdb.session_scope() as s:
        lg = s.get(gdb.LiveGame, "LIVE1")
        assert lg.home_score is not None and lg.observed_at == now + timedelta(seconds=15)             # last verified observation kept
        assert s.scalar(select(func.count()).select_from(gdb.Prediction)) == n_pred                    # research untouched


def test_provider_corrections_keep_history_and_out_of_order_events_are_ordered(app):
    now = gdb.utcnow()
    changed = copy.deepcopy(SUM)
    target = next(p for p in changed["plays"] if p.get("scoringPlay"))
    old_text = target["text"]
    target["text"] = old_text + " (corrected by scorer)"
    extra = copy.deepcopy(changed["plays"][10])
    extra.update(id="LATE-EVENT-1", sequenceNumber=str(int(changed["plays"][10]["sequenceNumber"])), text="Late-arriving event")
    changed["plays"].append(extra)                                                                     # arrives last, belongs early
    L.poll(now + timedelta(seconds=45), FakeEspn(summary=changed))
    with gdb.session_scope() as s:
        row = s.scalar(select(gdb.LivePlay).where(gdb.LivePlay.game_id == "LIVE1", gdb.LivePlay.event_id == str(target["id"])))
        assert row.revision == 1 and row.text.endswith("(corrected by scorer)") and row.corrections[0]["text"] == old_text
        assert s.scalar(select(func.count()).select_from(gdb.LivePlay).where(gdb.LivePlay.game_id == "LIVE1")) == len(SUM["plays"]) + 1
    c = login(app)
    plays = c.get("/api/v1/live/games/LIVE1/play-by-play", params={"order": "asc", "limit": 500}).json()["items"]
    assert [p["sequence"] for p in plays] == sorted(p["sequence"] for p in plays)
    assert any(p["corrected"] for p in plays) and any(p["text"] == "Late-arriving event" for p in plays[:20])
    inc = c.get("/api/v1/live/games/LIVE1/play-by-play", params={"after_sequence": plays[-3]["sequence"], "order": "asc"}).json()
    assert inc["total"] == 2
    assert all(p["kind"] == "foul" for p in c.get("/api/v1/live/games/LIVE1/play-by-play", params={"filter": "fouls"}).json()["items"])


# ------------------------------------------------------------------ API
def test_game_centre_endpoints_freshness_and_stale_labelling(app):
    c = login(app)
    sb = c.get("/api/v1/live/scoreboard").json()
    row = next(g for g in sb["games"] if g["game_id"] == "LIVE1")
    assert row["status"] == "live" and row["period_label"] == "Q3" and row["clock"] and row["stale"] is False and sb["live_count"] == 1
    assert "not a real-time feed" in sb["poll_note"] and row["home"]["linescores"]
    wrong = next(g for g in sb["games"] if g["game_id"] == "WRONG1")
    assert wrong["status"] == "scheduled" and wrong["home"]["score"] is None and wrong["feed"] == "not_started"
    g = c.get("/api/v1/live/games/LIVE1").json()
    assert g["mode"] == "live" and g["leaders"]["home"]["pts"]["value"] > 0 and len(g["last_plays"]) == 8 and g["momentum"]["points"] > 20
    box = c.get("/api/v1/live/games/LIVE1/boxscore").json()
    star = max(box["home"]["players"], key=lambda r: r["pts"] or 0)
    assert star["pra"] == star["pts"] + star["reb"] + star["ast"] and star["on_court"] in (True, False) and star["pregame"] is None
    assert sum(r["on_court"] is True for r in box["home"]["players"]) == 5 and box["home"]["totals"]["pts"] == row["home"]["score"]
    assert any("not estimated" in n for n in box["notes"])
    rot = c.get("/api/v1/live/games/LIVE1/rotations").json()
    assert rot["home"]["determinable"] and rot["home"]["players"][0]["stints"] and rot["home"]["players"][0]["minutes_by_period"]
    ts = c.get("/api/v1/live/games/LIVE1/team-stats").json()
    assert ts["available"] and {i["label"] for i in ts["items"]} >= {"Field goals", "Rebounds", "Assists", "Turnovers"} and ts["not_published"] == ["Bench points"]
    assert c.get("/api/v1/live/games/LIVE1/momentum").json()["points"]
    assert c.get("/api/v1/live/games/NOPE").status_code == 404
    with gdb.session_scope() as s:                       # the feed stops: the last values stay, labelled stale
        s.get(gdb.LiveGame, "LIVE1").observed_at = gdb.utcnow() - timedelta(minutes=6)
    stale = c.get("/api/v1/live/games/LIVE1").json()
    assert stale["stale"] is True and stale["feed"] == "stale" and stale["age_s"] > 300 and stale["home"]["score"] == row["home"]["score"]
    with c.stream("GET", "/api/v1/live/games/LIVE1/stream") as r:
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        first = next(line for line in r.iter_lines() if line.startswith("data: "))
        assert json.loads(first[6:])["game_id"] == "LIVE1"
    assert TestClient(app).get("/api/v1/live/scoreboard").status_code == 401


def test_watchlist_milestones_and_period_summaries(app):
    c = login(app)
    with gdb.session_scope() as s:
        b = s.scalars(select(gdb.LivePlayerBox).where(gdb.LivePlayerBox.game_id == "LIVE1", gdb.LivePlayerBox.pts >= 10)).first()
        pid = 880001
        s.add(gdb.Player(id=pid, name=b.name, name_key="livefixtureplayer", team_id=b.team_id, espn_id=b.espn_athlete_id))
        pts = b.pts
    L.poll(gdb.utcnow(), FakeEspn())                                                                   # now matched to the canonical player
    assert c.post("/api/v1/live/watchlist/follow", json={"kind": "game", "ref_id": "LIVE1"}).json()["following"] is True
    assert c.post("/api/v1/live/watchlist/follow", json={"kind": "game", "ref_id": "LIVE1"}).status_code == 200   # idempotent
    assert c.post("/api/v1/live/watchlist/follow", json={"kind": "player", "ref_id": str(pid)}).status_code == 200
    assert c.post("/api/v1/live/watchlist/follow", json={"kind": "game", "ref_id": "NOPE"}).status_code == 404
    w = login(app).get("/api/v1/live/watchlist").json()                                                 # persists across sessions
    assert w["counts"] == {"games": 1, "players": 1, "teams": 0} and w["players"][0]["live"]["line"]["pts"] == pts
    assert login(app).get("/api/v1/live/scoreboard").json()["games"][0]["game_id"] == "LIVE1"           # followed game first
    reached = c.post("/api/v1/live/milestones", json={"player_id": pid, "stat": "pts", "threshold": pts}).json()
    ahead = c.post("/api/v1/live/milestones", json={"player_id": pid, "stat": "pts", "threshold": pts + 15}).json()
    assert ahead["current"] == pts and ahead["remaining"] == 15 and ahead["reached"] is False and "says nothing about the final result" in ahead["note"]
    L.poll(gdb.utcnow(), FakeEspn())
    ms = {m["id"]: m for m in c.get("/api/v1/live/milestones").json()["items"]}
    assert ms[reached["id"]]["reached"] is True and ms[ahead["id"]]["reached"] is False
    with gdb.session_scope() as s:
        ev = list(s.scalars(select(gdb.JarvisEvent).where(gdb.JarvisEvent.kind == "milestone_reached")))
        assert len(ev) == 1 and ev[0].detail["milestone_id"] == reached["id"]
    L.poll(gdb.utcnow(), FakeEspn())
    with gdb.session_scope() as s:
        assert s.scalar(select(func.count()).select_from(gdb.JarvisEvent).where(gdb.JarvisEvent.kind == "milestone_reached")) == 1   # once
    assert c.post(f"/api/v1/live/milestones/{ahead['id']}/delete").json() == {"deleted": True}
    viewer = login(app, "viewer@test.local", "viewer password 123")
    assert viewer.post("/api/v1/live/watchlist/follow", json={"kind": "game", "ref_id": "LIVE1"}).status_code == 403
    assert c.post("/api/v1/live/watchlist/unfollow", json={"kind": "game", "ref_id": "LIVE1"}).json()["following"] is False
    half = copy.deepcopy(SB)
    ev = next(e for e in half["events"] if e["id"] == EVENT)
    ev["competitions"][0]["status"] = {"period": 2, "displayClock": "0.0", "type": {"name": "STATUS_HALFTIME", "state": "in", "completed": False}}
    L.poll(gdb.utcnow(), FakeEspn(sb=half))
    L.poll(gdb.utcnow(), FakeEspn(sb=half))
    g = c.get("/api/v1/live/games/LIVE1").json()
    assert g["status"] == "halftime" and g["clock"] is None and [x["kind"] for x in g["summaries"]] == ["half"]   # once, deterministic
    assert g["summaries"][0]["text"].startswith("Halftime:")
    with gdb.session_scope() as s:
        assert s.scalar(select(gdb.JarvisBriefing.generator).where(gdb.JarvisBriefing.kind == "live_half")) == "deterministic"


def test_research_tracker_observes_without_calling_outcomes_and_jarvis_tools_read_live_data(app):
    c = login(app)
    with gdb.session_scope() as s:
        b = s.scalars(select(gdb.LivePlayerBox).where(gdb.LivePlayerBox.game_id == "LIVE1", gdb.LivePlayerBox.player_id.is_not(None))).first()
        s.add(gdb.PaperTicket(kind="single", engine="SINGLE", structure="SINGLE", source="owner", game_date=L.today_et(), legs=[
            {"label": f"{b.name} Over 40.5 PTS", "market": "player_pts", "side": "over", "line": 40.5, "game_id": "LIVE1",
             "game_label": "AWY @ HOM", "subject_id": b.player_id}], price_basis="none", classification="standard", stake_units=1.0,
            created_by="test"))
        pts, pid = b.pts, b.player_id
    t = c.get("/api/v1/live/research-tracker").json()
    leg = t["items"][0]["legs"][0]
    assert leg["current"] == pts and leg["difference_to_line"] == round(pts - 40.5, 1) and leg["observation"] == "in_progress"
    assert t["items"][0]["status"] == "pending" and t["items"][0]["settlement"] is None
    blob = json.dumps(t).lower()
    assert not any(w in blob for w in ('"won"', '"lost"', "winning", "losing", "hit", "cashed"))          # observation, not outcome
    ctx = {"owner": "owner@test.local"}
    names = {x.name for x in T.TOOLS if x.group == "live"}
    assert names >= {"get_live_scoreboard", "get_live_game_state", "get_live_boxscore", "get_live_player_statistics", "get_live_play_by_play",
                     "get_live_rotation_history", "get_live_team_statistics", "get_followed_games", "get_followed_players",
                     "get_pregame_projection_comparison", "get_paper_research_progress"}
    for name, args in (("get_live_scoreboard", {}), ("get_live_game_state", {"game_id": "LIVE1"}), ("get_live_boxscore", {"game_id": "LIVE1"}),
                       ("get_live_player_statistics", {"player_id": pid}), ("get_live_play_by_play", {"game_id": "LIVE1", "period": 3}),
                       ("get_live_rotation_history", {"game_id": "LIVE1"}), ("get_live_team_statistics", {"game_id": "LIVE1"}),
                       ("get_followed_games", {}), ("get_pregame_projection_comparison", {"game_id": "LIVE1"}), ("get_paper_research_progress", {})):
        r = T.execute(name, args, ctx)
        assert r["ok"], (name, r["error"])
    fouls = json.loads(T.execute("get_live_boxscore", {"game_id": "LIVE1", "min_fouls": 3}, ctx)["content"])
    assert all(p["pf"] >= 3 for side in ("home", "away") for p in fouls[side]["players"])
    on = json.loads(T.execute("get_live_boxscore", {"game_id": "LIVE1", "on_court_only": True}, ctx)["content"])
    assert len(on["home"]["players"]) <= 5
    q3 = json.loads(T.execute("get_live_play_by_play", {"game_id": "LIVE1", "period": 3, "filter": "scoring"}, ctx)["content"])
    assert q3["items"] and all(p["period"] == 3 and p["scoring"] for p in q3["items"])
    assert not [x.name for x in T.TOOLS if x.group == "live" and x.writes]                                # live tools are read-only
