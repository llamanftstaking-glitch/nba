"""API tests: authentication, CSRF, roles, rate limiting, headers, contract shapes, fail-safe behaviour."""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from conftest import SLATE, add_injuries, model_aware_quotes, seed_synthetic
from gizer import db as gdb
from gizer import modeling as M
from gizer import research as R
from gizer.security import _ph

D = SLATE.isoformat()
ST = {}


@pytest.fixture(scope="module")
def app(db):
    st = seed_synthetic()
    M.run_all_backtests(register=True)
    now = gdb.utcnow()
    with gdb.session_scope() as s:  # move the synthetic slate into the future so tickets can be created
        for g in s.scalars(select(gdb.Game).where(gdb.Game.game_date == SLATE)):
            g.tipoff_utc = now + timedelta(hours=6)
        s.add(gdb.User(email="owner@test.local", password_hash=_ph.hash("correct horse battery"), role="owner"))
        s.add(gdb.User(email="viewer@test.local", password_hash=_ph.hash("viewer password 123"), role="viewer"))
    model_aware_quotes([f"S{i}" for i in range(4)], now - timedelta(minutes=20))
    add_injuries([(st["players"][st["teams"][0]][7], "Synthetic Bench", st["teams"][0], "Day-To-Day")], at=now - timedelta(minutes=5))
    ST["edition"] = R.publish_edition(SLATE, "morning", now=now)
    from gizer.api import app as a
    return a


def login(app, email="owner@test.local", pw="correct horse battery"):
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    c.headers["X-CSRF-Token"] = r.json()["csrf"]
    return c


PROTECTED = ["/command-center", "/games", "/selections", "/combos", "/editions", "/paper/tickets", "/results", "/exposure",
             "/players", "/teams", "/injuries", "/models", "/backtests", "/research-lab", "/agents", "/data-health",
             "/operations", "/settings", "/auth/me"]


def test_health_is_public_and_minimal(app):
    c = TestClient(app)
    assert c.get("/api/v1/health").json() == {"status": "ok"}
    r = c.get("/api/v1/health/ready")
    assert r.json()["checks"]["database"] is True and r.json()["status"] == "degraded"  # no worker heartbeat: reported honestly
    assert set(r.json()) == {"status", "checks"}


@pytest.mark.parametrize("path", PROTECTED)
def test_everything_else_requires_authentication(app, path):
    r = TestClient(app).get("/api/v1" + path)
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthenticated"


def test_login_failure_cookie_flags_and_headers(app):
    c = TestClient(app)
    r = c.post("/api/v1/auth/login", json={"email": "owner@test.local", "password": "wrong"})
    assert r.status_code == 401 and "set-cookie" not in r.headers
    assert c.post("/api/v1/auth/login", json={"email": "nobody@test.local", "password": "x"}).status_code == 401
    r = c.post("/api/v1/auth/login", json={"email": "OWNER@test.local", "password": "correct horse battery"})
    ck = r.headers["set-cookie"].lower()
    assert "httponly" in ck and "samesite=strict" in ck
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert "no-store" in r.headers["cache-control"]
    with gdb.session_scope() as s:
        u = s.scalar(select(gdb.User).where(gdb.User.email == "owner@test.local"))
        assert u.password_hash.startswith("$argon2id$")
        tok = s.scalar(select(gdb.SessionToken))
        assert c.cookies["gizer_session"] not in (tok.token_sha256,)  # only a hash of the token is stored


def test_csrf_origin_and_roles(app):
    c = login(app)
    with gdb.session_scope() as s:
        sel = s.scalar(select(gdb.Selection).where(gdb.Selection.classification == "standard"))
        sid = sel.id
    body = {"selection_ids": [sid]}
    no_csrf = TestClient(app, cookies=dict(c.cookies))
    assert no_csrf.post("/api/v1/paper/tickets", json=body).status_code == 403
    assert c.post("/api/v1/paper/tickets", json=body, headers={"Origin": "https://evil.example"}).status_code == 403
    r = c.post("/api/v1/paper/tickets", json=body)
    assert r.status_code == 200 and r.json()["engine"] == "SINGLE" and r.json()["price_basis"] == "observed_quote"
    v = login(app, "viewer@test.local", "viewer password 123")
    assert v.post("/api/v1/paper/tickets", json=body).status_code == 403
    assert v.get("/api/v1/operations").status_code == 403
    assert v.post("/api/v1/operations/pause", json={"paused": True}).status_code == 403
    assert v.get("/api/v1/command-center").status_code == 200
    with gdb.session_scope() as s:
        assert s.scalar(select(text("count(*)")).select_from(gdb.AuditLog).where(gdb.AuditLog.action == "paper_ticket_created")) == 1


def test_logout_invalidates_session(app):
    c = login(app)
    assert c.get("/api/v1/auth/me").status_code == 200
    cookies = dict(c.cookies)
    c.post("/api/v1/auth/logout")
    assert TestClient(app, cookies=cookies).get("/api/v1/auth/me").status_code == 401


def test_expired_session_rejected(app):
    c = login(app)
    with gdb.session_scope() as s:
        s.execute(text("update sessions set expires_at = now() - interval '1 minute'"))
    assert c.get("/api/v1/auth/me").status_code == 401


def test_command_center_contract(app):
    c = login(app)
    j = c.get(f"/api/v1/command-center?date={D}").json()
    assert j["slate"]["n_games"] == 4 and j["edition"]["kind"] == "morning"
    assert j["high_confidence"] == [] and j["counts"]["high_confidence"] == 0  # allowed to be empty
    assert j["counts"]["markets_analyzed"] == 24 and D in j["available_dates"]
    assert any("worker" in w for w in j["warnings"])  # no fake operational status
    assert j["agents"]["never_run"] == 18
    g = j["slate"]["games"][0]
    assert {"home", "away", "top_picks", "research_completeness", "environment", "quotes", "no_picks_reason", "injuries"} <= set(g)
    assert len(g["top_picks"]) <= 5 and [p["rank_in_game"] for p in g["top_picks"]] == list(range(1, len(g["top_picks"]) + 1))
    for card in j["slate"]["games"]:
        assert card["top_picks"] or card["no_picks_reason"]
        for p in card["top_picks"]:
            assert p["classification"] in ("standard", "high_confidence") and p["model"]["status"] == "production"
            assert p["prob_low"] <= p["prob"] <= p["prob_high"] or abs(p["prob"] - p["prob_low"]) < 0.2
            assert isinstance(p["evidence_score"], int) and p["evidence"]["components"]
    assert any(i["name"] == "Starting lineups" and not i["ok"] for i in g["research_completeness"]["items"])
    empty = c.get("/api/v1/command-center?date=2031-01-01").json()
    assert empty["slate"]["n_games"] == 0 and empty["edition"] is None and empty["counts"]["combinations"] == 0


def test_selections_combos_editions_and_builder(app):
    c = login(app)
    sel = c.get(f"/api/v1/selections?date={D}").json()["items"]
    assert len(sel) == 24 and all(x["rejection_reasons"] for x in sel if x["classification"] == "rejected")
    q = c.get(f"/api/v1/selections?date={D}&classification=qualified").json()["items"]
    assert q and all(x["classification"] in ("standard", "high_confidence") for x in q)
    cm = c.get(f"/api/v1/combos?date={D}&category=double").json()
    assert set(cm["counts"]) == {"double", "triple", "quad", "five", "six", "sgp", "cross"} and cm["items"]
    for x in cm["items"]:
        assert x["observed_quote"] is None and x["n_legs"] == 2 and x["joint_low"] <= x["joint_prob"] <= x["joint_high"]
        if x["reference_price"]:
            assert "not a sportsbook quote" in x["reference_price"]["note"]
    assert c.get(f"/api/v1/combos?date={D}&category=bogus").status_code == 422
    eds = c.get(f"/api/v1/editions?date={D}").json()["items"]
    full = c.get(f"/api/v1/editions/{eds[0]['id']}").json()
    assert len(full["content_sha256"]) == 64 and full["summary"]["narrative"] and full["summary"]["limitations"]
    assert len(full["summary"]["rejected"]) == sum(1 for x in sel if x["classification"] not in ("standard", "high_confidence"))
    two = [q[0]["id"], next(x["id"] for x in q if x["game_id"] != q[0]["game_id"])]
    ev = c.post("/api/v1/builder/evaluate", json={"selection_ids": two}).json()
    assert ev["structure"] == "CROSS" and ev["reliable"] and abs(ev["joint_prob"] - ev["independent_prob"]) < 0.02
    ev2 = c.post("/api/v1/builder/evaluate", json={"selection_ids": two}).json()
    assert ev2["joint_prob"] == ev["joint_prob"]  # deterministic
    g0 = [x for x in sel if x["game_id"] == q[0]["game_id"] and x["market"] == "total"]
    bad = c.post("/api/v1/builder/evaluate", json={"selection_ids": [g0[0]["id"], g0[1]["id"]]}).json()
    assert not bad["reliable"] and bad["warnings"] and bad["joint_prob"] < 0.01
    assert c.post("/api/v1/builder/evaluate", json={"selection_ids": []}).status_code == 422
    assert c.post("/api/v1/builder/evaluate", json={"selection_ids": [999999]}).status_code == 404
    t = c.post("/api/v1/paper/tickets", json={"combo_uid": cm["items"][0]["uid"]}).json()
    assert t["engine"] == "DOUBLE" and t["combo_uid"] == cm["items"][0]["uid"] and t["settlement"] is None


def test_remaining_read_endpoints_return_contract_shapes(app):
    c = login(app)
    gid = c.get(f"/api/v1/games?date={D}").json()["games"][0]["id"]
    gd = c.get(f"/api/v1/games/{gid}").json()
    assert {"game", "team_form", "player_projections", "selections", "sgp", "h2h", "agent_reports", "unresolved"} <= set(gd)
    pp = gd["player_projections"][0]
    assert pp["stat"] == "pts" and pp["p10"] <= pp["mean"] <= pp["p90"] and pp["n_games"] > 0 and pp["player_name"]
    assert gd["team_form"]["home"]["record"] and "_season" not in gd["team_form"]["home"]
    assert c.get("/api/v1/games/NOPE").status_code == 404
    res = c.get("/api/v1/results").json()
    assert len(res["by_engine"]) == 6 and res["summary"]["tickets"] >= 2 and res["disclaimer"]
    assert c.get("/api/v1/results?engine=DOUBLE").json()["summary"]["tickets"] >= 1
    assert c.get("/api/v1/results?market=spread&season=2025-26").status_code == 200
    ex = c.get(f"/api/v1/exposure?date={D}").json()
    assert ex["n_tickets"] >= 2 and ex["notes"]
    tk = c.get("/api/v1/paper/tickets?status=open").json()
    assert tk["total"] >= 2 and all(t["settlement"] is None or t["settlement"]["result"] == "unresolved" for t in tk["items"])
    pl = c.get("/api/v1/players?q=Synthetic&limit=5").json()
    assert pl["total"] == 240 and len(pl["items"]) == 5
    pd_ = c.get(f"/api/v1/players/{pl['items'][0]['id']}").json()
    assert pd_["sample"]["games"] > 0 and pd_["splits"][0]["label"] == "Season" and pd_["game_log"]
    assert len(c.get("/api/v1/teams").json()["items"]) == 30
    tid = c.get("/api/v1/teams").json()["items"][0]["id"]
    assert c.get(f"/api/v1/teams/{tid}").json()["roster"]
    inj = c.get("/api/v1/injuries").json()
    assert inj["items"][0]["status"] == "Day-To-Day" and inj["items"][0]["source"] == "synthetic" and inj["as_of"]
    ms = c.get("/api/v1/models").json()["items"]
    assert any(m["status"] == "production" and m["promoted_by"] == M.AUDITOR for m in ms)
    assert c.get("/api/v1/backtests").json()["items"] and c.get("/api/v1/research-lab").json()["correlation"]["pairs"]
    assert len(c.get("/api/v1/agents").json()["items"]) == 18
    dh = c.get("/api/v1/data-health").json()
    assert {p["provider"] for p in dh["providers"]} == {"pbpstats", "espn", "oddsapi"}
    assert next(p for p in dh["providers"] if p["provider"] == "oddsapi")["status"] == "not_configured"
    st = c.get("/api/v1/settings").json()
    assert st["timezone"] == "America/New_York" and st["risk_policy"]["version"]
    assert "password" not in str(st).lower() and "secret" not in str(st).lower()
    ops = c.get("/api/v1/operations").json()
    assert ops["paused"] is False and ops["schedule"]
    assert c.post("/api/v1/operations/pause", json={"paused": True}).json() == {"paused": True}
    assert c.get("/api/v1/operations").json()["paused"] is True
    c.post("/api/v1/operations/pause", json={"paused": False})


def test_ticket_refused_after_tipoff_and_errors_are_consistent(app):
    c = login(app)
    with gdb.session_scope() as s:
        sel = s.scalar(select(gdb.Selection).where(gdb.Selection.classification == "standard"))
        sid, gid = sel.id, sel.game_id
        s.get(gdb.Game, gid).tipoff_utc = gdb.utcnow() - timedelta(minutes=1)
    r = c.post("/api/v1/paper/tickets", json={"selection_ids": [sid]})
    assert r.status_code == 409 and set(r.json()["error"]) == {"code", "message"}
    assert c.get("/api/v1/command-center?date=not-a-date").status_code == 422
    assert c.get("/api/v1/nope").status_code == 404 and "error" in c.get("/api/v1/nope").json()
    assert c.post("/api/v1/paper/tickets", json={"selection_ids": [sid], "stake_units": 1e9}).status_code == 422


def test_no_real_money_surface(app):
    paths = {r.path for r in app.routes}
    banned = ("deposit", "withdraw", "wager", "place", "sportsbook", "credential", "fund", "bet/")
    assert not [p for p in paths if any(b in p.lower() for b in banned)]
    mutating = sorted(p for r in app.routes for p in [r.path] if getattr(r, "methods", None) and "POST" in r.methods)
    assert mutating == ["/api/v1/auth/login", "/api/v1/auth/logout", "/api/v1/builder/evaluate",
                        "/api/v1/operations/pause", "/api/v1/paper/tickets"]


def test_login_rate_limit_last(app):
    c = TestClient(app)
    codes = [c.post("/api/v1/auth/login", json={"email": "owner@test.local", "password": "bad"}).status_code for _ in range(12)]
    assert 429 in codes
    assert c.post("/api/v1/auth/login", json={"email": "owner@test.local", "password": "correct horse battery"}).status_code == 429
