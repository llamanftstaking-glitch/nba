"""GIZER CORTEX: library validation and loading, retrieval, evidence-derived profiles, grading and budget discipline.

The shipped knowledge files are validated here too, so a malformed or rule-breaking record fails the build."""
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from conftest import SLATE, seed_synthetic
from gizer import cortex, ingestion
from gizer import db as gdb
from gizer import jarvis_tools as T
from gizer.security import _ph

ST = {}


def rec(slug, dept=17, kind="statistic", title=None, body=None, **kw):
    base = {"slug": slug, "department": dept, "kind": kind, "title": title or slug.replace("-", " ").title(),
            "summary": f"Summary of {slug}.", "body": body or ("Original explanatory text about " + slug.replace("-", " ") + ". ") * 14,
            "formula": None, "limitations": ["One limitation."], "when_not_to_use": None, "observable_in_our_data": [],
            "data_gaps": ["not observed"], "ruleset": "general", "season_note": None, "sources": [{"key": "gizer-internal", "note": "own derivation"}],
            "verification": "authored_not_checked", "related": [], "evaluation_questions": ["What is it?"]}
    base.update(kw)
    return base


@pytest.fixture(scope="module")
def app(db):
    ST.update(seed_synthetic())
    with gdb.session_scope() as s:
        s.add(gdb.User(email="owner@test.local", password_hash=_ph.hash("correct horse battery"), role="owner"))
        s.add(gdb.User(email="viewer@test.local", password_hash=_ph.hash("viewer password 123"), role="viewer"))
    from gizer.api import app as a
    return a


@pytest.fixture()
def library(app, tmp_path, monkeypatch):
    """A small library in a temporary directory, so these tests do not depend on the shipped content."""
    (tmp_path / "sources.json").write_text(json.dumps([
        {"key": "gizer-internal", "title": "GIZER derivations", "publisher": "Gizer", "url": None, "league": "NBA", "kind": "own work",
         "reliability": "internal", "permission": "own work", "accessed": None, "access_result": "not opened"},
        {"key": "nba-stats-glossary", "title": "NBA Stats Glossary", "publisher": "NBA", "url": "https://www.nba.com/stats/help/glossary",
         "league": "NBA", "kind": "official glossary", "reliability": "official", "permission": "cited by link " + "x" * 300,
         "accessed": "2026-11-26", "access_result": "opened and read"}]))
    (tmp_path / "dept_17.json").write_text(json.dumps([
        rec("true-shooting-percentage", title="True shooting percentage (TS%)", formula="PTS / (2 * (FGA + 0.44 * FTA))",
            body="True shooting percentage measures scoring efficiency including free throws and three-pointers. " * 12,
            sources=[{"key": "nba-stats-glossary", "note": "definition"}], verification="checked_against_source",
            related=["usage-percentage", "does-not-exist"]),
        rec("usage-percentage", title="Usage percentage (USG%)", body="Usage estimates the share of team possessions a player finishes while on the floor. " * 12),
        rec("bad-vocabulary", body="This is a guaranteed winner of a statistic. " * 20),
        rec("too-short", body="Short."),
        rec("true-shooting-percentage", title="Duplicate"),
        rec("unknown-source", sources=[{"key": "nope", "note": ""}]),
        rec("checked-without-source", sources=[], verification="checked_against_source"),
    ]))
    (tmp_path / "dept_03.json").write_text(json.dumps([
        rec("drop-coverage", dept=3, kind="defense", title="Drop coverage",
            body="In drop coverage the screener's defender retreats toward the paint to protect the rim against the pick-and-roll. " * 10,
            common_responses="Pull-up jumpers and pocket passes.", player_responsibilities="The big drops; the guard fights over."),
        rec("wrong-department", dept=99)]))
    (tmp_path / "benchmark.json").write_text(json.dumps([
        {"id": "STAT-001", "category": "advanced_statistics", "split": "dev", "type": "numeric", "question": "A player scores 24 points on 15 FGA and 6 FTA. What is his true shooting percentage?",
         "choices": None, "answer": 68.0, "tolerance": 0.3, "must_mention": [], "must_not_claim": [], "expected_concepts": ["true-shooting-percentage"], "expected_tools": [], "rationale": "24/(2*(15+2.64))", "reviewed": False},
        {"id": "DEF-001", "category": "defensive_tactics", "split": "held_out", "type": "multiple_choice", "question": "In drop coverage against a pick-and-roll, what does the screener's defender do?",
         "choices": ["A Switches", "B Retreats toward the paint", "C Traps the ball", "D Denies the pass"], "answer": "B", "tolerance": None, "must_mention": [], "must_not_claim": [],
         "expected_concepts": ["drop-coverage"], "expected_tools": [], "rationale": "definition", "reviewed": False},
        {"id": "INTEG-001", "category": "research_integrity", "split": "dev", "type": "abstain", "question": "What is the probability he scores 30 tonight?", "choices": None, "answer": "abstain",
         "tolerance": None, "must_mention": ["not available", "model"], "must_not_claim": ["probability is"], "expected_concepts": [], "expected_tools": [], "rationale": "no model output", "reviewed": False}]))
    monkeypatch.setattr(cortex, "DATA", tmp_path)
    monkeypatch.setattr(ingestion, "today_et", lambda: SLATE)
    with gdb.session_scope() as s:
        for m in (gdb.CortexConcept, gdb.CortexSource, gdb.CortexRetrievalLog, gdb.CortexBenchmarkRun):
            s.query(m).delete()
    return cortex.load_library()


def login(app, email="owner@test.local", pw="correct horse battery"):
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    c.headers["X-CSRF-Token"] = r.json()["csrf"]
    return c


def test_shipped_library_files_are_valid_and_follow_the_rules():
    sources, concepts, problems = cortex.read_files()
    assert problems == [], problems[:10]                                     # every shipped record passes validation
    slugs = [c["slug"] for c in concepts]
    assert len(slugs) == len(set(slugs))
    for c in concepts:
        assert c["department"] in cortex.DEPARTMENTS and c["kind"] in cortex.KINDS
        if c["verification"] == "checked_against_source":
            assert c["sources"], c["slug"]
        if c["kind"] == "statistic" and c["department"] == 17:
            assert c.get("formula") or "defined" in c["body"].lower() or "formula" in c["body"].lower(), c["slug"]
    for q in cortex.benchmark_questions():
        assert q["category"] in cortex.BENCH_CATEGORIES and q["type"] in ("multiple_choice", "numeric", "abstain", "short_answer"), q["id"]
        assert q.get("reviewed") in (False, True) and q.get("split") in ("dev", "held_out"), q["id"]
        if q["type"] == "multiple_choice":
            assert len(q["choices"]) == 4 and q["answer"] in ("A", "B", "C", "D"), q["id"]
        if q["type"] == "numeric":
            assert isinstance(q["answer"], (int, float)) and q.get("tolerance") is not None, q["id"]
    ids = [q["id"] for q in cortex.benchmark_questions()]
    assert len(ids) == len(set(ids))


def test_loader_rejects_bad_records_versions_changes_and_is_idempotent(library, tmp_path):
    assert library["concepts"] == 3 and library["added"] == 3 and library["problem_count"] == 6
    reasons = " | ".join(library["problems"])
    for needle in ("forbidden vocabulary", "body too short", "duplicate slug", "unknown source key", "checked record without a source", "bad department"):
        assert needle in reasons
    again = cortex.load_library()
    assert again["added"] == 0 and again["changed"] == 0                      # idempotent
    c = cortex.get_concept("true-shooting-percentage")
    assert c["version"] == 1 and c["formula"].startswith("PTS") and c["verification"] == "checked_against_source"
    assert [r["slug"] for r in c["related"]] == ["usage-percentage"]          # a related slug that does not exist is dropped
    assert c["sources"][0]["url"].startswith("https://www.nba.com") and c["sources"][0]["note"] == "definition"
    rows = json.loads((tmp_path / "dept_17.json").read_text())
    rows[0]["summary"] = "Edited summary."
    (tmp_path / "dept_17.json").write_text(json.dumps(rows[:2]))              # edit one, remove nothing valid
    third = cortex.load_library()
    assert third["changed"] == 1 and cortex.get_concept("true-shooting-percentage")["version"] == 2
    (tmp_path / "dept_03.json").write_text("[]")
    assert cortex.load_library()["removed"] == 1 and cortex.get_concept("drop-coverage") is None


def test_retrieval_ranks_titles_filters_logs_and_returns_nothing_for_nonsense(library):
    r = cortex.search("true shooting", caller="test")
    assert r["items"][0]["slug"] == "true-shooting-percentage" and r["method"] == "all_words" and "body" not in r["items"][0]
    assert cortex.search("what does the big man do in drop coverage", log=False)["items"][0]["slug"] == "drop-coverage"
    assert cortex.search("coverage", department=17, log=False)["items"] == []                       # department filter
    assert [i["slug"] for i in cortex.search("coverage", kind="defense", log=False)["items"]] == ["drop-coverage"]
    assert cortex.search("zzzz qqqq", log=False)["items"] == [] and cortex.search("", log=False)["items"] == []
    assert cortex.search("'; drop table cortex_concepts; --", log=False)["total"] >= 0             # hostile text is only text
    with gdb.session_scope() as s:
        log = s.scalars(select(gdb.CortexRetrievalLog).order_by(gdb.CortexRetrievalLog.id.desc())).first()
        assert log.query == "true shooting" and log.returned[0] == "true-shooting-percentage" and log.caller == "test"
        assert s.scalar(select(func.count()).select_from(gdb.CortexConcept)) == 3


def test_profiles_are_derived_from_stored_records_with_rules_shown(library):
    pid = ST["players"][ST["teams"][0]][0]
    d = cortex.player_dna(pid)
    assert d["available"] and d["season_line"]["games"] >= 8 and d["archetype_status"] == "derived"
    line = d["season_line"]
    with gdb.session_scope() as s:
        tot = s.execute(select(func.sum(gdb.PlayerBox.pts), func.sum(gdb.PlayerBox.minutes)).where(
            gdb.PlayerBox.player_id == pid, gdb.PlayerBox.season == d["season"], gdb.PlayerBox.minutes > 0)).one()
    assert line["pts36"] == pytest.approx(float(tot[0]) / float(tot[1]) * 36, abs=0.01)             # reproducible from the box scores
    for a in d["archetypes"]:
        assert a["rule"] and a["label"]                                                              # every label carries its rule
    assert d["tactical_profile"]["available"] is False and "height" in d["identity"]["not_held"]
    assert any("not predictions" in n for n in d["notes"])
    bench = ST["players"][ST["teams"][0]][-1]
    with gdb.session_scope() as s:
        s.add(gdb.Player(id=990777, name="Fixture No Games", name_key="fixturenogames", team_id=ST["teams"][0]))
    assert cortex.player_dna(990777)["available"] is False and cortex.player_dna(123456789) is None and cortex.player_dna(bench)
    t = cortex.team_dna(ST["teams"][0])
    assert t["available"] and t["record"]["wins"] + t["record"]["losses"] == t["record"]["games"]
    assert t["coach"]["identity"] is None and t["tactical_identity"]["available"] is False
    assert t["rotation"]["rotation_length_range"][0] <= t["rotation"]["players_10_plus_minutes_per_game"] <= t["rotation"]["rotation_length_range"][1]
    assert cortex.team_dna(987654) is None
    cov = cortex.coverage()
    assert cov["knowledge_records"] == 3 and cov["records_checked_against_a_source"] == 1 and cov["coaching_profiles_available"] == 0
    assert cov["player_profiles_available"] > 0 and cov["benchmark"]["questions"] == 3 and cov["benchmark"]["reviewed_by_a_person"] == 0
    assert "semantic (embedding) search: keyword search only" in cov["not_built"]


def test_grading_is_deterministic_and_retrieval_eval_costs_nothing(library, monkeypatch):
    qs = {q["id"]: q for q in cortex.benchmark_questions()}
    assert cortex.grade(qs["STAT-001"], "24 / (2 * (15 + 0.44*6)) = 0.680.\nAnswer: 68.0")["correct"]
    assert not cortex.grade(qs["STAT-001"], "Answer: 61.2")["correct"]
    assert cortex.grade(qs["DEF-001"], "The big retreats.\nAnswer: B")["correct"] and not cortex.grade(qs["DEF-001"], "Answer: C")["correct"]
    assert cortex.grade(qs["INTEG-001"], "That is not available here: only a registered model can give it, via the tools.")["correct"]
    assert not cortex.grade(qs["INTEG-001"], "The probability is 42%.")["correct"]                   # an invented number fails
    from gizer import ai_budget, jarvis
    with gdb.session_scope() as s:
        n0 = s.scalar(select(func.count()).select_from(gdb.AiUsage))
    ev = cortex.retrieval_eval()
    assert ev["n"] == 2 and ev["hit_rate_top5"] == 1.0, ev["misses"]
    with gdb.session_scope() as s:
        assert s.scalar(select(func.count()).select_from(gdb.AiUsage)) == n0                         # no paid request
        assert s.scalar(select(gdb.CortexBenchmarkRun.cost_usd).where(gdb.CortexBenchmarkRun.kind == "retrieval")) == 0.0
    monkeypatch.setattr(jarvis, "_client_factory", None)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert cortex.run_answers(5)["ran"] is False                                                     # no key: nothing runs
    ai_budget.update_policy("t", paused=True)
    monkeypatch.setattr(jarvis, "_client_factory", lambda: (_ for _ in ()).throw(AssertionError("must not be called")))
    out = cortex.run_answers(5)
    assert out["ran"] is False and "paused" in out["stopped_early"].lower()                          # the budget stops it before any call
    ai_budget.update_policy("t", paused=False)


def test_api_and_jarvis_tools(library, app):
    c = login(app)
    ov = c.get("/api/v1/cortex/overview").json()
    assert ov["knowledge_records"] == 3 and len(ov["departments"]) == 20
    assert c.get("/api/v1/cortex/concepts").json()["total"] == 3
    assert c.get("/api/v1/cortex/concepts", params={"q": "usage"}).json()["items"][0]["slug"] == "usage-percentage"
    assert c.get("/api/v1/cortex/concepts", params={"verification": "checked_against_source"}).json()["total"] == 1
    assert c.get("/api/v1/cortex/concepts/drop-coverage").json()["common_responses"] and c.get("/api/v1/cortex/concepts/nope").status_code == 404
    src = {x["key"]: x for x in c.get("/api/v1/cortex/sources").json()["items"]}
    assert src["nba-stats-glossary"]["records_citing"] == 1 and src["gizer-internal"]["access_result"] == "not opened"
    pid = ST["players"][ST["teams"][0]][0]
    assert c.get(f"/api/v1/cortex/players/{pid}/dna").json()["available"] and c.get("/api/v1/cortex/players/1/dna").status_code == 404
    assert len(c.get("/api/v1/cortex/teams").json()["items"]) >= 2 and c.get(f"/api/v1/cortex/teams/{ST['teams'][0]}/dna").json()["rotation"]
    assert c.get("/api/v1/cortex/players").json()["items"] and "items" in c.get("/api/v1/cortex/research").json()
    assert c.get("/api/v1/cortex/benchmark").json()["questions"] == 3
    assert login(app, "viewer@test.local", "viewer password 123").get("/api/v1/cortex/benchmark").status_code == 403
    assert TestClient(app).get("/api/v1/cortex/overview").status_code == 401
    names = {t.name for t in T.TOOLS if t.group == "cortex"}
    assert names == {"search_basketball_knowledge", "get_basketball_concept", "get_player_dna", "get_team_dna", "get_knowledge_coverage",
                     "get_knowledge_sources"} and not [t for t in T.TOOLS if t.group == "cortex" and t.writes]
    r = json.loads(T.execute("search_basketball_knowledge", {"query": "true shooting"}, {})["content"])
    assert r["items"][0]["slug"] == "true-shooting-percentage"
    assert json.loads(T.execute("get_basketball_concept", {"slug": "true-shooting-percentage"}, {})["content"])["formula"]
    assert T.execute("get_basketball_concept", {"slug": "missing"}, {})["ok"] is False
    assert T.execute("get_player_dna", {"player_id": pid}, {})["ok"] and T.execute("get_team_dna", {"team_id": ST["teams"][0]}, {})["ok"]
    from gizer import jarvis
    p = jarvis.SYSTEM_PROMPT.lower()
    assert "never evidence that a particular team or player does it" in p and "authored_not_checked" in p
