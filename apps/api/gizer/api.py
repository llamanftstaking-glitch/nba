"""Versioned HTTP API (see docs/architecture/API-CONTRACT.md). Read-mostly; the only mutations are
login/logout, saving virtual paper tickets and the owner's pause switch."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import ingestion, jobs
from . import modeling as M
from .config import ET, get_settings
from .db import (AgentExecution, Combo, Edition, Game, Heartbeat, InjurySnapshot, ModelEvaluation, ModelVersion,
                 OddsSnapshot, PaperSettlement, PaperTicket, Player, PlayerBox, Prediction, ResearchEvent, ResearchFinding, Selection, Team, get_setting, session_scope, set_setting, utcnow)
from .ledger import ALL_ENGINES, LedgerError, create_ticket, exposure_report, results_report, summarize
from .research import (ENGINES, MARKET_STAT, QUALIFIED, RISK_POLICY, evaluate_combo, leg_summary)
from .providers import season_for_date
from .security import (COOKIE, SECURITY_HEADERS, ApiError, Principal, RateLimiter, audit, client_ip, current_user,
                       login, logout, require_owner)
from .simulation import seed_for

cfg = get_settings()
_docs = cfg.env != "production"
app = FastAPI(title="GIZER NBA API", version="1.0.0", docs_url="/api/v1/docs" if _docs else None, redoc_url=None,
              openapi_url="/api/v1/openapi.json" if _docs else None)
pub = APIRouter(prefix="/api/v1")
api = APIRouter(prefix="/api/v1", dependencies=[Depends(current_user)])
_limiter = RateLimiter()


@app.middleware("http")
async def _mw(request: Request, call_next):
    if not _limiter.allow(client_ip(request)):
        resp = JSONResponse({"error": {"code": "rate_limited", "message": "Too many requests."}}, status_code=429)
    else:
        resp = await call_next(request)
    for k, v in SECURITY_HEADERS.items():
        resp.headers.setdefault(k, v)
    return resp


@app.exception_handler(StarletteHTTPException)
async def _http_exc(_, exc: StarletteHTTPException):
    d = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
    return JSONResponse({"error": d}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def _val_exc(_, exc: RequestValidationError):
    return JSONResponse({"error": {"code": "invalid_request", "message": "Request validation failed."}}, status_code=422)


@app.exception_handler(Exception)
async def _any_exc(_, exc: Exception):
    return JSONResponse({"error": {"code": "internal", "message": "Internal error."}}, status_code=500)


def _date(v: str | None) -> date:
    if not v:
        return ingestion.today_et()
    try:
        return date.fromisoformat(v)
    except ValueError:
        raise ApiError(422, "invalid_request", "date must be YYYY-MM-DD")


# ---------------------------------------------------------------- serialisers
def team_ref(t: Team | None) -> dict | None:
    return None if t is None else {"id": t.id, "abbr": t.abbr, "name": t.name, "logo_url": t.logo_url}


def edition_ref(e: Edition | None) -> dict | None:
    return None if e is None else {"id": e.id, "key": e.key, "kind": e.kind, "version": e.version,
                                   "published_at": e.published_at}


_SEL_CACHE: dict[tuple, list] = {}   # (game id, edition id, edition key) -> immutable selection rows


def data_stamp(s) -> tuple:
    """Cheap fingerprint of everything read-side results depend on. Research tables are append-only, so the
    highest ids (plus row counts for the few mutable tables) change exactly when a cached result is out of date."""
    return tuple(s.execute(text(
        "select (select max(id) from odds_snapshots), (select max(id) from predictions), (select max(id) from selections),"
        " (select max(id) from research_events), (select max(id) from lineup_snapshots), (select max(id) from injury_snapshots),"
        " (select count(*) from player_box), (select max(lineup_ingested_at) from games), (select max(id) from editions),"
        " (select string_agg(id || ':' || status, ',' order by id) from model_versions), (select max(id) from paper_tickets),"
        " (select max(id) from paper_settlements), (select max(id) from kalshi_snapshots), (select max(id) from combos)")).one())


_STAMP_CACHE: dict[tuple, object] = {}


def stamp_cached(s, key: tuple, build):
    """Reuse a deterministic read-side result until the data it was built from changes (see data_stamp).
    Callers must not mutate the returned value."""
    ck = (*key, data_stamp(s))
    if ck not in _STAMP_CACHE:
        val = build()
        while len(_STAMP_CACHE) >= 48:
            _STAMP_CACHE.pop(next(iter(_STAMP_CACHE)), None)
        _STAMP_CACHE[ck] = val
    return _STAMP_CACHE[ck]


def clear_caches() -> None:
    """Drop every process-level read cache (tests reset the database and reuse ids)."""
    import sys
    v3, core = sys.modules[__package__ + ".api_v3"], sys.modules[__package__ + ".api_core"]
    for c in (_SEL_CACHE, _STAMP_CACHE, v3._PROP_CACHE, core._KALSHI_ROWS):
        c.clear()


class View:
    """Per-request lookup caches for a date."""

    def __init__(self, s, d: date):
        self.s, self.date = s, d
        self.teams = {t.id: t for t in s.scalars(select(Team))}
        self.models = {m.id: m for m in s.scalars(select(ModelVersion))}
        self.games = list(s.scalars(select(Game).where(Game.game_date == d).order_by(Game.tipoff_utc, Game.id)))
        self.editions = list(s.scalars(select(Edition).where(Edition.game_date == d).order_by(Edition.version)))
        inv = s.execute(select(ResearchEvent.ref_type, ResearchEvent.ref_id, ResearchEvent.detail).where(
            ResearchEvent.kind == "invalidated", ResearchEvent.game_date == d)).all()
        self.inv_sel = {int(r[1]): r[2].get("reason") for r in inv if r[0] == "selection"}
        self.inv_combo = {r[1]: r[2].get("reason") for r in inv if r[0] == "combo"}
        # the forecast of record for each game is its latest evaluation (frozen at tipoff)
        # one index lookup per game (ix_selections_game_edition); a group-by over the date scanned every edition's rows
        self.game_edition = {}
        for g in self.games:
            eid = s.scalar(select(func.max(Selection.edition_id)).where(Selection.game_id == g.id,
                                                                    Selection.game_date == d))
            if eid is not None:
                self.game_edition[g.id] = eid
        self._sels = None
        self._heads: dict[int, str | None] | None = None

    def headshot(self, pid: int | None) -> str | None:
        """Player photo URLs for the players in this date's selections (one query per request)."""
        if pid is None:
            return None
        if self._heads is None:
            ids = {x.subject_id for x in self.selections() if x.subject_type == "player" and x.subject_id is not None}
            self._heads = dict(self.s.execute(select(Player.id, Player.headshot_url).where(Player.id.in_(ids))).all()) if ids else {}
        if pid not in self._heads:  # a selection from outside this date's current editions
            p = self.s.get(Player, pid)
            self._heads[pid] = p.headshot_url if p else None
        return self._heads[pid]

    def lineup_snaps(self) -> dict:
        if getattr(self, "_lus", None) is None:
            from .lineups import lineup_status_map
            self._lus = lineup_status_map(self.s, [g.id for g in self.games])
        return self._lus

    @property
    def latest(self) -> Edition | None:
        return self.editions[-1] if self.editions else None

    def selections(self) -> list[Selection]:
        """Selections of record for the date. Rows are immutable, so each (game, edition) block is loaded once
        per process and reused read-only (detached from the session) by later requests."""
        if self._sels is None:
            ekey = {e.id: e.key for e in self.editions}
            out = []
            for gid, eid in self.game_edition.items():
                ck = (gid, eid, ekey.get(eid))
                rows = _SEL_CACHE.get(ck) if ck[2] else None
                if rows is None:
                    rows = list(self.s.scalars(select(Selection).where(Selection.game_id == gid, Selection.edition_id == eid)))
                    if ck[2]:
                        for x in rows:
                            self.s.expunge(x)
                        while len(_SEL_CACHE) >= 32:  # about three slates; full rows are large
                            _SEL_CACHE.pop(next(iter(_SEL_CACHE)), None)
                        _SEL_CACHE[ck] = rows
                out += rows
            self._sels = out
        return self._sels

    def game_label(self, g: Game) -> str:
        return f"{self.teams[g.away_team_id].abbr} @ {self.teams[g.home_team_id].abbr}"

    def sel(self, x: Selection) -> dict:
        m = self.models.get(x.model_version_id)
        ev = x.evidence or {}
        t = self.teams.get(x.team_id)
        return {"id": x.id, "key": x.key, "edition_id": x.edition_id, "game_id": x.game_id,
                "game_label": ev.get("game_label"), "market": x.market, "market_label": ev.get("market_label"),
                "subject_type": x.subject_type, "subject_id": x.subject_id, "subject_name": x.subject_name,
                "team_abbr": t.abbr if t else None, "team_logo_url": t.logo_url if t else None,
                "headshot_url": self.headshot(x.subject_id) if x.subject_type == "player" else None, "side": x.side, "line": x.line, "price_american": x.price_american,
                "book": x.book, "quote_at": ev.get("quote_at"), "projection": x.projection, "prob": x.prob,
                "prob_low": x.prob_low, "prob_high": x.prob_high, "breakeven": x.breakeven, "edge": x.edge,
                "sample_size": x.sample_size, "evidence_score": x.evidence_score,
                "evidence": {"components": ev.get("components", []), "supporting": ev.get("supporting", []),
                             "opposing": ev.get("opposing", [])},
                "classification": "invalidated" if x.id in self.inv_sel else x.classification,
                "rejection_reasons": x.rejection_reasons or [], "rank_in_game": x.rank_in_game,
                "main_line": ev.get("main_line"),
                "model": {"id": m.id, "name": m.name, "version": m.version, "status": m.status} if m else None,
                "verified_at": x.verified_at, "invalidated": x.id in self.inv_sel,
                "invalidation_reason": self.inv_sel.get(x.id),
                "context": ev.get("context"), "origin": ev.get("origin") or "provider"}

    def combo(self, c: Combo) -> dict:
        d = combo_dict(c, self.inv_combo)  # legs are fresh dicts (_leg), so the stored row is never touched
        for leg in d["legs"]:
            leg["headshot_url"] = self.headshot(leg.get("subject_id")) if leg.get("subject_type") == "player" else None
        return d

    def current_combos(self) -> list[Combo]:
        cur = {x.id for x in self.selections()}
        out = [c for c in self.s.scalars(select(Combo).where(Combo.game_date == self.date).order_by(Combo.id))
               if set(c.leg_selection_ids) <= cur]
        return out

    def injuries_for(self, as_of: datetime | None = None) -> dict[int, list[dict]]:
        out: dict[int, list[dict]] = {}
        for i in ingestion.latest_injuries(self.s, as_of):
            out.setdefault(i.team_id, []).append(injury_row(i, self.teams))
        return out


def injury_row(i: InjurySnapshot, teams: dict, extra: dict | None = None) -> dict:
    t = teams.get(i.team_id)
    stale = (utcnow() - i.ingested_at).total_seconds() > RISK_POLICY["max_injury_age_hours"] * 3600
    return {"player_id": i.player_id, "player_name": i.player_name, "team_abbr": t.abbr if t else None,
            "status": i.status, "detail": i.detail, "comment": i.comment, "source": i.provider,
            "source_published_at": i.source_published_at, "ingested_at": i.ingested_at,
            "headshot_url": None, "game_label": None, "previous_status": None, "stale": stale, **(extra or {})}


def _leg(leg: dict) -> dict:
    keep = ("selection_id", "label", "game_id", "game_label", "market", "subject_name", "subject_id", "subject_type", "side", "line", "price_american",
            "prob", "prob_low", "prob_high", "classification", "evidence_score", "sample_size", "supporting", "opposing")
    return {k: leg.get(k) for k in keep}


def combo_dict(c: Combo, inv: dict) -> dict:
    return {"uid": c.uid, "engine": c.engine, "n_legs": c.n_legs, "structure": c.structure,
            "name": f"GIZER {c.engine} #{int(c.uid.rsplit('-', 1)[-1])}", "legs": [_leg(x) for x in c.legs],
            "joint_prob": c.joint_prob, "joint_low": c.joint_low, "joint_high": c.joint_high,
            "independent_prob": c.independent_prob, "correlation": c.correlation, "observed_quote": c.observed_quote,
            "reference_price": c.reference_price, "evidence_score": c.evidence_score,
            "weakest_assumption": c.weakest_assumption,
            "classification": "invalidated" if c.uid in inv else c.classification, "designation": c.designation,
            "rejection_reasons": c.rejection_reasons or [], "invalidation_conditions": c.invalidation_conditions or [],
            "created_at": c.created_at, "validated_at": c.validated_at, "invalidated": c.uid in inv,
            "invalidation_reason": inv.get(c.uid)}


def ticket_dict(t: PaperTicket, st: PaperSettlement | None) -> dict:
    return {"id": t.id, "kind": t.kind, "engine": t.engine, "structure": t.structure, "source": t.source,
            "game_date": t.game_date, "combo_uid": t.combo_uid, "legs": [_leg(x) for x in t.legs],
            "model_prob": t.model_prob, "prob_low": t.prob_low, "prob_high": t.prob_high,
            "price_decimal": t.price_decimal, "price_basis": t.price_basis, "classification": t.classification,
            "stake_units": t.stake_units, "created_at": t.created_at,
            "settlement": None if st is None else {
                "result": st.result, "pnl_units": st.pnl_units, "settled_at": st.settled_at,
                "leg_results": [{"label": x["label"], "result": x["result"], "actual": x.get("actual")} for x in st.leg_results],
                "forensic": {"verdict": (st.forensic or {}).get("verdict", ""), "findings": (st.forensic or {}).get("findings", [])}}}


def game_card(v: View, g: Game, inj: dict[int, list[dict]], with_picks: bool = True) -> dict:
    s = v.s
    eid = v.game_edition.get(g.id)
    ed = next((e for e in v.editions if e.id == eid), None)
    sels = [x for x in v.selections() if x.game_id == g.id] if with_picks else []
    picks = sorted([x for x in sels if x.rank_in_game and x.classification in QUALIFIED and x.id not in v.inv_sel],
                   key=lambda x: x.rank_in_game)
    env = ((ed.summary or {}).get("environments") or {}).get(g.id) if ed else None
    qrows = s.scalars(select(OddsSnapshot).where(OddsSnapshot.game_id == g.id, OddsSnapshot.subject_type != "player")
                      .order_by(OddsSnapshot.id.desc())).all()
    # Latest quote per (market, side, book, line); then, where a book lists several thresholds (Kalshi), keep the
    # main line: the threshold whose price is closest to even.
    latest: dict[tuple, OddsSnapshot] = {}
    for q in qrows:
        latest.setdefault((q.market, q.side, q.book, q.line), q)
    main: dict[tuple, OddsSnapshot] = {}
    for (mkt, side, book, _line), q in latest.items():
        cur = main.get((mkt, side, book))
        dist = lambda x: abs(abs(x.price_american) - 100) if x.price_american is not None else 10 ** 6  # noqa: E731
        if cur is None or dist(q) < dist(cur):
            main[(mkt, side, book)] = q
    # the two sides of one spread/total must describe the same threshold
    for mkt, a_side, b_side in (("spread", "home", "away"), ("total", "over", "under")):
        for book in {k[2] for k in main if k[0] == mkt}:
            a_q, b_q = main.get((mkt, a_side, book)), main.get((mkt, b_side, book))
            if a_q is not None and b_q is not None and a_q.line is not None and b_q.line is not None:
                want = -a_q.line if mkt == "spread" else a_q.line
                if b_q.line != want and (mkt, b_side, book, want) in latest:
                    main[(mkt, b_side, book)] = latest[(mkt, b_side, book, want)]
    quotes = [{"market": q.market, "side": q.side, "line": q.line, "price_american": q.price_american, "book": q.book,
               "at": q.ingested_at} for q in sorted(main.values(), key=lambda q: (q.book != "Kalshi", q.market, q.side))]
    lus = v.lineup_snaps()
    lineup = {side: {"status": (lus[(g.id, tid)].status if (g.id, tid) in lus else "unknown"),
                     "verified_at": lus[(g.id, tid)].verified_at if (g.id, tid) in lus else None}
              for side, tid in (("home", g.home_team_id), ("away", g.away_team_id))}
    n_prop_q = s.scalar(select(func.count(func.distinct(OddsSnapshot.subject_id.op("||")(OddsSnapshot.market)))).where(
        OddsSnapshot.game_id == g.id, OddsSnapshot.subject_type == "player", OddsSnapshot.origin != "hypothetical")) or 0
    n_proj = s.scalar(select(func.count(func.distinct(Prediction.subject_id))).where(
        Prediction.game_id == g.id, Prediction.subject_type == "player")) or 0
    items = [
        {"name": "Schedule", "ok": True, "note": "tipoff time known" if g.tipoff_utc else "tipoff time unknown"},
        {"name": "Research edition", "ok": ed is not None, "note": ed.key if ed else "not evaluated yet"},
        {"name": "Team model", "ok": bool(env and env.get("model_status") == "production"),
         "note": "validated production model" if env and env.get("model_status") == "production" else "no validated model"},
        {"name": "Game quotes", "ok": bool(quotes), "note": f"{len(quotes)} quotes" if quotes else "no verified quote"},
        {"name": "Player prop quotes", "ok": n_prop_q > 0, "note": f"{n_prop_q} quoted player markets" if n_prop_q else "no prop odds provider configured and no owner-entered markets"},
        {"name": "Injury report", "ok": bool(inj), "note": "snapshot available" if inj else "no snapshot"},
        {"name": "Starting lineups", "ok": lineup["home"]["status"] == "confirmed" and lineup["away"]["status"] == "confirmed",
         "note": "confirmed by box score" if lineup["home"]["status"] == "confirmed" and lineup["away"]["status"] == "confirmed"
         else "projected, not official" if "projected" in (lineup["home"]["status"], lineup["away"]["status"]) else "no lineup information"},
    ]
    n_rej = sum(1 for x in sels if x.classification not in QUALIFIED)
    reason = None
    if not picks:
        if g.status == "final" and not sels:
            reason = "This game was not evaluated before it started."
        elif ed is None:
            reason = "No research edition has evaluated this game yet."
        elif not sels:
            reason = "No verified market quotes were available, so no selection could be evaluated."
        else:
            reason = (f"No qualified picks: {len(sels)} quoted markets were evaluated and none met the qualification "
                      "criteria. This is a valid research outcome.")
    if env:
        env = {**{k: env[k] for k in ("proj_home_points", "proj_away_points", "proj_total", "proj_margin", "proj_pace",
                                      "total_p10", "total_p90")},
               "notes": [] if env.get("model_status") == "production" else ["Team model is not validated; shown for context only."]}
    return {"id": g.id, "date": g.game_date, "tipoff_utc": g.tipoff_utc, "status": g.status,
            "home": team_ref(v.teams[g.home_team_id]), "away": team_ref(v.teams[g.away_team_id]),
            "home_points": g.home_points, "away_points": g.away_points, "venue": g.venue, "label": v.game_label(g),
            "injuries": {"home": inj.get(g.home_team_id, []), "away": inj.get(g.away_team_id, [])},
            "lineup_status": ("Starting lineups confirmed" if all(x["status"] == "confirmed" for x in lineup.values()) else
                              "Starting lineups projected — not official" if any(x["status"] == "projected" for x in lineup.values())
                              else "Starting lineups: awaiting information"),
            "lineup": lineup, "props": {"quoted_markets": int(n_prop_q), "players_projected": int(n_proj)},
            "research_completeness": {"score": round(100 * sum(i["ok"] for i in items) / len(items)), "items": items},
            "environment": env, "quotes": quotes, "top_picks": [v.sel(x) for x in picks[:5]],
            "n_evaluated": len(sels), "n_rejected": n_rej, "no_picks_reason": reason}


# ---------------------------------------------------------------- public + auth
@pub.get("/health")
def health():
    return {"status": "ok"}


@pub.get("/health/ready")
def ready(response: Response):
    checks = {"database": False, "worker": False, "scheduler": False}
    try:
        with session_scope() as s:
            s.execute(text("select 1"))
            checks["database"] = True
            now = utcnow()
            for h in s.scalars(select(Heartbeat)):
                if (now - h.beat_at).total_seconds() < 120:
                    checks[h.role] = True
    except Exception:
        pass
    ok = all(checks.values())
    if not checks["database"]:
        response.status_code = 503
    return {"status": "ready" if ok else "degraded", "checks": checks}


class LoginBody(BaseModel):
    email: str = Field(max_length=160)
    password: str = Field(max_length=256)


@pub.post("/auth/login")
def auth_login(body: LoginBody, request: Request, response: Response):
    token, out = login(body.email, body.password, client_ip(request))
    response.set_cookie(COOKIE, token, httponly=True, secure=cfg.cookie_secure, samesite="strict",
                        max_age=cfg.session_hours * 3600, path="/")
    return out


@pub.post("/auth/logout")
def auth_logout(request: Request, response: Response):
    logout(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@api.get("/auth/me")
def auth_me(p: Principal = Depends(current_user)):
    return {"user": {"email": p.email, "role": p.role}, "csrf": p.csrf}


# ---------------------------------------------------------------- command center, games
def _model_readiness(s) -> list[dict]:
    out = []
    for fam in ["team_game", *[f"player_{x}" for x in M.PLAYER_STATS]]:
        mv = M.production_model(s, fam) or s.scalar(select(ModelVersion).where(ModelVersion.family == fam)
                                                    .order_by(ModelVersion.id.desc()).limit(1))
        if mv is None:
            out.append({"family": fam, "name": "—", "version": "—", "status": "missing", "ready": False,
                        "note": "no model registered; selections in this family are rejected"})
        else:
            out.append({"family": fam, "name": mv.name, "version": mv.version, "status": mv.status,
                        "ready": mv.status == "production",
                        "note": "passed walk-forward promotion gate" if mv.status == "production"
                        else "did not pass the promotion gate; selections in this family are rejected"})
    return out


def _prop_source_message(quoted: int) -> str:
    if cfg.kalshi_enabled and quoted:
        return f"{quoted} player contracts quoted on Kalshi for this slate (polled, not real-time)."
    if cfg.kalshi_enabled:
        return ("Kalshi is the player-market source, but no player contracts have been observed for this slate yet. "
                "They usually appear on game day; thresholds can also be entered manually.")
    if cfg.odds_api_key:
        return "Prop odds provider configured."
    return ("No player-market source is enabled; lines and prices are unavailable unless entered manually. "
            "Averages, projections and lineups are still shown.")


def _warnings(s, v: View) -> list[str]:
    w = []
    for p in ingestion.provider_status(s):
        if p["provider"] == "oddsapi" and cfg.kalshi_enabled:
            continue  # optional second source; Kalshi already supplies player markets
        if p["status"] == "not_configured":
            w.append(f"Provider '{p['provider']}' is not configured; dependent research is unavailable.")
        elif p["status"] in ("degraded", "never_called"):
            w.append(f"Provider '{p['provider']}' status: {p['status']}.")
    alive = {h.role for h in s.scalars(select(Heartbeat)) if (utcnow() - h.beat_at).total_seconds() < 120}
    for role in ("worker", "scheduler"):
        if role not in alive:
            w.append(f"No live {role} heartbeat: scheduled research is not running.")
    if (get_setting(s, "paused", {}) or {}).get("paused"):
        w.append("Scheduled jobs are paused by the administrator.")
    if v.date == ingestion.today_et() and v.games and not v.editions:
        w.append("No research edition has been published for today yet.")
    return w


@api.get("/command-center")
def command_center(date: str | None = None):
    d = _date(date)
    with session_scope() as s:
        v = View(s, d)
        inj = v.injuries_for(v.latest.published_at if v.latest and d < ingestion.today_et() else None)
        cards = [game_card(v, g, inj) for g in v.games]
        sels = v.selections()
        combos = v.current_combos()
        hc = [v.sel(x) for x in sels if x.classification == "high_confidence" and x.rank_in_game and x.id not in v.inv_sel]
        dates = set(s.scalars(select(Edition.game_date).distinct()))
        dates |= set(s.scalars(select(Game.game_date).where(
            Game.game_date >= ingestion.today_et() - timedelta(days=3),
            Game.game_date <= ingestion.today_et() + timedelta(days=7)).distinct()))
        tick = list(s.scalars(select(PaperTicket)))
        cur = {st.ticket_id: st for st in s.scalars(select(PaperSettlement).where(PaperSettlement.id.in_(
            select(func.max(PaperSettlement.id)).group_by(PaperSettlement.ticket_id))))}
        ag = jobs.agents_status()
        changes = [c for e in v.editions for c in (e.changes or []) if c.get("type") == "injury"][-12:]
        last_ref = s.scalar(text("select max(called_at) from provider_calls where ok"))
        return {
            "date": d, "is_today": d == ingestion.today_et(), "available_dates": sorted(dates, reverse=True)[:120],
            "edition": edition_ref(v.latest), "editions": [edition_ref(e) for e in v.editions],
            "slate": {"n_games": len(cards), "games": cards},
            "counts": {"markets_analyzed": len(sels),
                       "qualified_selections": sum(1 for x in sels if x.classification in QUALIFIED and x.rank_in_game and x.id not in v.inv_sel),
                       "combinations": len(combos), "high_confidence": len(hc),
                       "rejected": sum(1 for x in sels if x.classification not in QUALIFIED)},
            "high_confidence": hc,
            "injury_changes": [{"text": c["text"], "at": v.latest.published_at if v.latest else None} for c in changes],
            "latest_refresh_at": last_ref, "model_readiness": _model_readiness(s),
            "paper_performance": summarize([(t, cur.get(t.id)) for t in tick]),
            "agents": {"ok": sum(a["status"] in ("ok", "abstained") for a in ag),
                       "failed": sum(a["status"] == "failed" for a in ag),
                       "never_run": sum(a["status"] == "never_run" for a in ag)},
            "findings": [{"finding_uid": f.finding_uid, "hypothesis": f.hypothesis, "status": f.status}
                         for f in s.scalars(select(ResearchFinding).order_by(ResearchFinding.id.desc()).limit(5))],
            "lineups_summary": {k: sum(1 for c in cards for x in c["lineup"].values() if x["status"] == k)
                                for k in ("confirmed", "projected", "unknown")},
            "props_summary": {"provider_configured": bool(cfg.odds_api_key) or cfg.kalshi_enabled,
                              "quoted_markets": sum(c["props"]["quoted_markets"] for c in cards),
                              "manual_entries": int(s.scalar(select(func.count()).select_from(OddsSnapshot).join(
                                  Game, Game.id == OddsSnapshot.game_id).where(Game.game_date == d, OddsSnapshot.provider == "manual")) or 0),
                              "players_projected": sum(c["props"]["players_projected"] for c in cards),
                              "message": _prop_source_message(sum(c["props"]["quoted_markets"] for c in cards))},
            "warnings": _warnings(s, v)}


@api.get("/games")
def games_list(date: str | None = None):
    d = _date(date)
    with session_scope() as s:
        v = View(s, d)
        inj = v.injuries_for()
        return {"date": d, "games": [game_card(v, g, inj) for g in v.games]}


def _team_form(s, tid: int, before: date) -> dict:
    rows = s.execute(text(
        "select game_date, home_team_id, away_team_id, home_points, away_points, home_poss, away_poss from games "
        "where status='final' and home_points is not null and (home_team_id=:t or away_team_id=:t) and game_date < :d "
        "and season = :sn order by game_date desc"), {"t": tid, "d": before, "sn": season_for_date(before)}).all()
    def agg(rs):
        if not rs:
            return None
        w = pts = opp = poss = 0
        for r in rs:
            home = r[1] == tid
            p, o = (r[3], r[4]) if home else (r[4], r[3])
            w += p > o; pts += p; opp += o; poss += ((r[5] or 0) + (r[6] or 0)) / 2
        n = len(rs)
        return {"games": n, "wins": w, "losses": n - w, "ppg": pts / n, "opp_ppg": opp / n,
                "off_rtg": 100 * pts / poss if poss else None, "def_rtg": 100 * opp / poss if poss else None,
                "pace": poss / n if poss else None}
    sn, l10 = agg(rows) or {}, agg(rows[:10]) or {}
    r1 = lambda x: None if x is None else round(x, 1)  # noqa: E731
    if not sn:
        return {}
    return {"record": f"{sn['wins']}-{sn['losses']}", "last_10": f"{l10['wins']}-{l10['losses']}",
            "points_per_game": r1(sn["ppg"]), "opp_points_per_game": r1(sn["opp_ppg"]),
            "off_rating": r1(sn["off_rtg"]), "def_rating": r1(sn["def_rtg"]), "pace": r1(sn["pace"]),
            "last_10_points_per_game": r1(l10["ppg"]), "last_10_opp_points_per_game": r1(l10["opp_ppg"]),
            "games_in_sample": sn["games"], "_season": sn}


@api.get("/games/{game_id}")
def game_detail(game_id: str):
    with session_scope() as s:
        g = s.get(Game, game_id)
        if g is None:
            raise ApiError(404, "not_found", "Game not found.")
        v = View(s, g.game_date)
        card = game_card(v, g, v.injuries_for())
        sels = [x for x in v.selections() if x.game_id == g.id]
        eid = v.game_edition.get(g.id)
        ek = next((e.key for e in v.editions if e.id == eid), None)
        players = {p.id: p for p in s.scalars(select(Player).where(Player.team_id.in_((g.home_team_id, g.away_team_id))))}
        proj = []
        if ek is None:
            ek = s.scalar(select(Prediction.edition_key).where(Prediction.game_id == g.id).order_by(Prediction.id.desc()).limit(1))
        for p in s.scalars(select(Prediction).where(Prediction.game_id == g.id, Prediction.edition_key == ek,
                                                    Prediction.subject_type == "player")):
            pl = players.get(p.subject_id) or s.get(Player, p.subject_id)
            proj.append({"player_id": p.subject_id, "player_name": pl.name if pl else str(p.subject_id),
                         "team_abbr": v.teams[p.features["team_id"]].abbr if p.features.get("team_id") in v.teams else None,
                         "stat": p.stat, "mean": round(p.mean, 1), "p10": p.p10, "p50": p.p50, "p90": p.p90,
                         "proj_min": round(p.features.get("proj_min") or 0, 1), "n_games": p.features.get("n_games"),
                         "injury_status": p.features.get("injury_status")})
        order = {s_: i for i, s_ in enumerate(M.PLAYER_STATS)}
        proj.sort(key=lambda r: (-(r["proj_min"] or 0), r["player_name"], order.get(r["stat"], 9)))
        h2h = s.execute(text(
            "select game_date, home_team_id, away_team_id, home_points, away_points from games where status='final' "
            "and home_points is not null and ((home_team_id=:h and away_team_id=:a) or (home_team_id=:a and away_team_id=:h)) "
            "and game_date < :d order by game_date desc limit 8"), {"h": g.home_team_id, "a": g.away_team_id, "d": g.game_date}).all()
        reports = []
        for ex in s.scalars(select(AgentExecution).where(AgentExecution.started_at >= utcnow() - timedelta(days=2),
                                                         AgentExecution.status == "ok").order_by(AgentExecution.id.desc()).limit(200)):
            rows = (ex.output or {}).get("data", {}).get("games")
            hit = [r for r in rows if isinstance(r, dict) and r.get("game_id") == g.id] if isinstance(rows, list) else []
            if hit and not any(r["agent"] == jobs.AGENT_BY_ID[ex.agent].name for r in reports):
                reports.append({"agent": jobs.AGENT_BY_ID[ex.agent].name, "at": ex.finished_at,
                                "summary": "; ".join(f"{k} {val}" for k, val in hit[0].items() if k != "game_id")})
        ed = next((e for e in v.editions if e.id == eid), None)
        unresolved = list((ed.summary or {}).get("unresolved", [])) if ed else []
        for side in ("home", "away"):
            for i in card["injuries"][side]:
                if any(k in i["status"].lower() for k in RISK_POLICY["uncertain_statuses"]):
                    unresolved.append(f"{i['player_name']} ({i['team_abbr']}) is listed {i['status']}.")
        return {"game": card,
                "team_form": {k: {kk: vv for kk, vv in _team_form(s, tid, g.game_date).items() if kk != "_season"}
                              for k, tid in (("home", g.home_team_id), ("away", g.away_team_id))},
                "player_projections": proj,
                "selections": [v.sel(x) for x in (
                    sorted([x for x in sels if x.classification in ("high_confidence", "standard", "watchlist")],
                           key=lambda x: (x.rank_in_game or 99, x.classification, x.market))
                    + sorted([x for x in sels if x.classification not in ("high_confidence", "standard", "watchlist")],
                             key=lambda x: -(x.edge if x.edge is not None else -9))[:60])],
                "selection_counts": {k: sum(1 for x in sels if x.classification == k) for k in {x.classification for x in sels}},
                "sgp": [v.combo(c) for c in v.current_combos() if c.structure == "SGP" and c.legs[0]["game_id"] == g.id],
                "h2h": [{"date": r[0], "home_abbr": v.teams[r[1]].abbr, "away_abbr": v.teams[r[2]].abbr,
                         "home_points": r[3], "away_points": r[4]} for r in h2h],
                "agent_reports": reports, "unresolved": unresolved[:20]}


@api.get("/selections")
def selections(date: str | None = None, classification: str | None = None, market: str | None = None,
               game_id: str | None = None, ranked: bool | None = None, q: str | None = None,
               limit: int = Query(200, ge=1, le=1000), offset: int = Query(0, ge=0)):
    d = _date(date)
    with session_scope() as s:
        v = View(s, d)
        rows = v.selections()
        counts: dict[str, int] = {}
        for x in rows:
            c = "invalidated" if x.id in v.inv_sel else x.classification
            counts[c] = counts.get(c, 0) + 1
        counts["ranked"] = sum(1 for x in rows if x.rank_in_game and x.classification in QUALIFIED and x.id not in v.inv_sel)
        if classification == "qualified":
            rows = [x for x in rows if x.classification in QUALIFIED and x.id not in v.inv_sel]
        elif classification:
            rows = [x for x in rows if ("invalidated" if x.id in v.inv_sel else x.classification) == classification]
        if ranked:
            rows = [x for x in rows if x.rank_in_game]
        if market == "player":
            rows = [x for x in rows if x.market in MARKET_STAT]
        elif market:
            rows = [x for x in rows if x.market == market]
        if game_id:
            rows = [x for x in rows if x.game_id == game_id]
        if q:
            ql = q.lower()[:60]
            rows = [x for x in rows if ql in (x.subject_name or "").lower() or ql in (x.evidence.get("market_label") or "").lower()]
        order = {"high_confidence": 0, "standard": 1, "watchlist": 2, "stale": 3, "insufficient_evidence": 4, "rejected": 5}
        rows.sort(key=lambda x: (9 if x.id in v.inv_sel else order.get(x.classification, 8), x.rank_in_game is None,
                                 x.game_id, x.rank_in_game or 99, -(x.edge if x.edge is not None else -9)))
        return {"edition": edition_ref(v.latest), "items": [v.sel(x) for x in rows[offset:offset + limit]], "total": len(rows),
                "counts": counts}


CATS = {"double": ("engine", "DOUBLE"), "triple": ("engine", "TRIPLE"), "quad": ("engine", "QUAD"),
        "five": ("engine", "FIVE"), "six": ("engine", "SIX"), "sgp": ("structure", "SGP"), "cross": ("structure", "CROSS")}


@api.get("/combos")
def combos(date: str | None = None, category: str = "double"):
    if category not in CATS:
        raise ApiError(422, "invalid_request", f"category must be one of {sorted(CATS)}")
    d = _date(date)
    with session_scope() as s:
        v = View(s, d)
        cs = v.current_combos()
        counts = {k: sum(1 for c in cs if getattr(c, f) == val) for k, (f, val) in CATS.items()}
        f, val = CATS[category]
        items = sorted((c for c in cs if getattr(c, f) == val), key=lambda c: -(c.joint_low if c.joint_low is not None else -1))
        return {"edition": edition_ref(v.latest), "category": category, "counts": counts,
                "items": [v.combo(c) for c in items[:60]]}


def _edition_counts(e: Edition) -> dict:
    return {k: v for k, v in ((e.summary or {}).get("counts") or {}).items() if isinstance(v, int)}


@api.get("/editions")
def editions(date: str | None = None):
    d = _date(date)
    with session_scope() as s:
        rows = s.scalars(select(Edition).where(Edition.game_date == d).order_by(Edition.version.desc()))
        return {"items": [{**edition_ref(e), "counts": _edition_counts(e), "changes": e.changes or []} for e in rows]}


@api.get("/editions/{edition_id}")
def edition_detail(edition_id: int):
    with session_scope() as s:
        e = s.get(Edition, edition_id)
        if e is None:
            raise ApiError(404, "not_found", "Edition not found.")
        v = View(s, e.game_date)
        sm = e.summary or {}
        return {**edition_ref(e), "game_date": e.game_date,
                "summary": {"slate": sm.get("slate"), "narrative": sm.get("narrative", []),
                            "limitations": sm.get("limitations", []), "unresolved": sm.get("unresolved", []),
                            "rejected": sm.get("rejected", []), "counts": _edition_counts(e)},
                "changes": e.changes or [], "content_sha256": e.content_sha256,
                "selections": [v.sel(x) for x in s.scalars(select(Selection).where(
                    Selection.edition_id == e.id, Selection.classification.in_(("high_confidence", "standard", "watchlist")))
                    .order_by(Selection.classification, Selection.game_id, Selection.rank_in_game, Selection.id).limit(150))],
                "selection_counts": dict(s.execute(select(Selection.classification, func.count()).where(
                    Selection.edition_id == e.id).group_by(Selection.classification)).all()),
                "combos": [v.combo(c) for c in s.scalars(select(Combo).where(Combo.edition_id == e.id).order_by(Combo.id))]}


# ---------------------------------------------------------------- builder + paper ledger
class BuilderBody(BaseModel):
    selection_ids: list[int] = Field(min_length=1, max_length=6)


def _load_sels(s, ids: list[int]) -> list[Selection]:
    if len(set(ids)) != len(ids):
        raise ApiError(422, "invalid_request", "Duplicate selections.")
    sels = [s.get(Selection, i) for i in ids]
    if any(x is None for x in sels):
        raise ApiError(404, "not_found", "Selection not found.")
    return sels


def _corr_and_team(s):
    ce = s.scalar(select(ModelEvaluation).where(ModelEvaluation.kind == "correlation").order_by(ModelEvaluation.id.desc()).limit(1))
    tm = M.production_model(s, "team_game")
    return (ce.metrics if ce else None), (tm.params if tm else None)


@api.post("/builder/evaluate")
def builder_evaluate(body: BuilderBody):
    with session_scope() as s:
        sels = _load_sels(s, body.selection_ids)
        games = {g.id: g for g in s.scalars(select(Game).where(Game.id.in_({x.game_id for x in sels})))}
        corr, tp = _corr_and_team(s)
        n = len(sels)
        now = utcnow()
        base = {"uid": "BUILDER", "engine": ENGINES.get(n, "SINGLE"), "n_legs": n, "name": "Builder combination",
                "legs": [_leg(leg_summary(x)) for x in sels], "observed_quote": None, "created_at": now,
                "validated_at": now, "invalidated": False, "invalidation_reason": None, "designation": "research_only",
                "invalidation_conditions": [], "rejection_reasons": []}
        warnings = []
        for x in sels:
            if x.classification not in QUALIFIED:
                warnings.append(f"'{x.evidence.get('market_label')}' is classified {x.classification}; it did not qualify.")
        if n == 1:
            x = sels[0]
            return {**base, "structure": "SGP", "joint_prob": x.prob, "joint_low": x.prob_low, "joint_high": x.prob_high,
                    "independent_prob": x.prob, "evidence_score": x.evidence_score, "weakest_assumption": None,
                    "correlation": {"method": "single selection", "seed": None, "draws": None, "mc_se": None,
                                    "assessment": "Single selection; no dependence to model.", "pairwise": [], "shared_risks": []},
                    "reference_price": None, "classification": x.classification, "warnings": warnings,
                    "reliable": x.prob is not None and x.prob_low is not None}
        ev = evaluate_combo(sels, games, corr, tp, cfg.sim_draws, seed_for("builder", *sorted(x.key for x in sels)))
        warnings += ev.get("warnings", [])
        jp = ev.get("joint")
        if not jp:
            return {**base, "structure": "MIXED", "joint_prob": None, "joint_low": None, "joint_high": None,
                    "independent_prob": None, "evidence_score": None, "weakest_assumption": None,
                    "correlation": {"method": "unavailable", "seed": None, "draws": None, "mc_se": None,
                                    "assessment": "Joint probability cannot be estimated.", "pairwise": [], "shared_risks": []},
                    "reference_price": None, "classification": "insufficient_evidence", "warnings": warnings, "reliable": False}
        ok = ev["reliable"] and all(x.classification in QUALIFIED for x in sels)
        return {**base, "structure": ev["structure"], "joint_prob": jp["joint"], "joint_low": jp["low"],
                "joint_high": jp["high"], "independent_prob": jp["independent"], "evidence_score": ev["evidence_score"],
                "weakest_assumption": ev["weakest_assumption"],
                "correlation": {"method": jp["method"], "seed": jp["seed"], "draws": jp["draws"], "mc_se": jp["mc_se"],
                                "assessment": ev["assessment"], "pairwise": ev["pairwise"], "shared_risks": ev["shared_risks"]},
                "reference_price": ev["reference_price"], "classification": "standard" if ok else "watchlist",
                "warnings": warnings, "reliable": ev["reliable"]}


class TicketBody(BaseModel):
    combo_uid: str | None = Field(default=None, max_length=40)
    selection_ids: list[int] | None = Field(default=None, max_length=6)
    stake_units: float | None = Field(default=None, gt=0, le=100)


@api.post("/paper/tickets")
def paper_create(body: TicketBody, request: Request, p: Principal = Depends(require_owner)):
    with session_scope() as s:
        combo = None
        if body.combo_uid:
            combo = s.scalar(select(Combo).where(Combo.uid == body.combo_uid))
            if combo is None:
                raise ApiError(404, "not_found", "Combination not found.")
            sels = _load_sels(s, list(combo.leg_selection_ids))
        elif body.selection_ids:
            sels = _load_sels(s, body.selection_ids)
        else:
            raise ApiError(422, "invalid_request", "Provide combo_uid or selection_ids.")
        try:
            t = create_ticket(s, sels, source="owner" if combo else "builder", created_by=p.email, combo=combo,
                              stake_units=body.stake_units)
        except LedgerError as e:
            raise ApiError(409, "not_allowed", str(e))
        out = ticket_dict(t, None)
    audit(p.email, "paper_ticket_created", {"ticket_id": out["id"]}, client_ip(request))
    return out


@api.get("/paper/tickets")
def paper_list(status: str | None = None, engine: str | None = None, date_from: str | None = None,
               date_to: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    with session_scope() as s:
        q = select(PaperTicket)
        if engine:
            q = q.where(PaperTicket.engine == engine.upper())
        if date_from:
            q = q.where(PaperTicket.game_date >= _date(date_from))
        if date_to:
            q = q.where(PaperTicket.game_date <= _date(date_to))
        ts = list(s.scalars(q.order_by(PaperTicket.id.desc())))
        cur = {st.ticket_id: st for st in s.scalars(select(PaperSettlement).where(PaperSettlement.id.in_(
            select(func.max(PaperSettlement.id)).group_by(PaperSettlement.ticket_id))))}
        done = lambda t: cur.get(t.id) is not None and cur[t.id].result != "unresolved"  # noqa: E731
        if status == "open":
            ts = [t for t in ts if not done(t)]
        elif status == "settled":
            ts = [t for t in ts if done(t)]
        return {"items": [ticket_dict(t, cur.get(t.id)) for t in ts[offset:offset + limit]], "total": len(ts)}


@api.get("/results")
def results(date_from: str | None = None, date_to: str | None = None, season: str | None = None,
            engine: str | None = None, market: str | None = None, classification: str | None = None,
            model_version_id: int | None = None, team: str | None = None, player_id: int | None = None,
            limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    f = []
    if date_from:
        f.append(PaperTicket.game_date >= _date(date_from))
    if date_to:
        f.append(PaperTicket.game_date <= _date(date_to))
    if season:
        y = int(season[:4])
        f += [PaperTicket.game_date >= date(y, 8, 1), PaperTicket.game_date < date(y + 1, 8, 1)]
    if engine:
        if engine.upper() not in ALL_ENGINES:
            raise ApiError(422, "invalid_request", f"engine must be one of {ALL_ENGINES}")
        f.append(PaperTicket.engine == engine.upper())
    if classification:
        f.append(PaperTicket.classification == classification)
    js = lambda obj: __import__("json").dumps([obj])  # noqa: E731
    if market:
        f.append(text("legs @> cast(:m as jsonb)").bindparams(m=js({"market": market})))
    if model_version_id:
        f.append(text("legs @> cast(:mv as jsonb)").bindparams(mv=js({"model_version_id": model_version_id})))
    if player_id:
        f.append(text("legs @> cast(:pl as jsonb)").bindparams(pl=js({"subject_type": "player", "subject_id": player_id})))
    with session_scope() as s:
        if team:
            t = s.scalar(select(Team).where(Team.abbr == team.upper()))
            if t is None:
                raise ApiError(404, "not_found", "Team not found.")
            f.append(text("legs @> cast(:tm as jsonb)").bindparams(tm=js({"team_id": t.id})))
        rep = results_report(s, f, limit, offset)
        rep["items"] = [ticket_dict(t, st) for t, st in rep.pop("rows")]
        return rep


@api.get("/exposure")
def exposure(date: str | None = None):
    d = _date(date)
    with session_scope() as s:
        def build():
            corr, tp = _corr_and_team(s)
            return exposure_report(s, d, corr, tp)
        return stamp_cached(s, ("exposure", d), build)


# ---------------------------------------------------------------- players, teams, injuries
@api.get("/players")
def players(q: str | None = None, team: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    season = cfg.season_list[-1]
    with session_scope() as s:
        teams = {t.id: t for t in s.scalars(select(Team))}
        stmt = (select(Player, func.count(PlayerBox.game_id), func.avg(PlayerBox.minutes), func.avg(PlayerBox.pts),
                       func.avg(PlayerBox.reb), func.avg(PlayerBox.ast), func.avg(PlayerBox.fg3m))
                .join(PlayerBox, (PlayerBox.player_id == Player.id) & (PlayerBox.season == season)).group_by(Player.id))
        if q:
            from .providers import name_key
            key = name_key(q[:60])  # accent- and punctuation-insensitive ("Jokic" finds "Jokić")
            stmt = stmt.where(Player.name_key.like(f"%{key}%") if key else Player.name.ilike(f"%{q[:60]}%"))
        if team:
            t = next((x for x in teams.values() if x.abbr == team.upper()), None)
            stmt = stmt.where(Player.team_id == (t.id if t else -1))
        rows = s.execute(stmt.order_by(func.avg(PlayerBox.minutes).desc())).all()
        r1 = lambda x: None if x is None else round(float(x), 1)  # noqa: E731
        return {"items": [{"id": p.id, "name": p.name, "team_abbr": teams[p.team_id].abbr if p.team_id in teams else None,
                           "position": p.position, "jersey": p.jersey, "headshot_url": p.headshot_url, "games": n, "min": r1(mn), "pts": r1(pts), "reb": r1(reb),
                           "ast": r1(ast), "fg3m": r1(f3), "last_game_date": p.last_game_date}
                          for p, n, mn, pts, reb, ast, f3 in rows[offset:offset + limit]], "total": len(rows)}


@api.get("/players/{player_id}")
def player_detail(player_id: int):
    with session_scope() as s:
        p = s.get(Player, player_id)
        if p is None:
            raise ApiError(404, "not_found", "Player not found.")
        teams = {t.id: t for t in s.scalars(select(Team))}
        rows = list(s.scalars(select(PlayerBox).where(PlayerBox.player_id == player_id).order_by(PlayerBox.game_date.desc())))
        cols = ("pts", "reb", "ast", "fg3m", "stl", "blk", "tov")

        def split(label, rs):
            n = len(rs)
            d = {"label": label, "games": n, "min": round(sum(r.minutes for r in rs) / n, 1) if n else None}
            for c in cols:
                d[c] = round(sum(getattr(r, c) for r in rs) / n, 1) if n else None
            return d
        cur = [r for r in rows if r.season == cfg.season_list[-1]]
        splits = [split("Season", cur), split("Last 5", rows[:5]), split("Last 10", rows[:10]), split("Last 20", rows[:20]),
                  split("Home (season)", [r for r in cur if r.is_home]), split("Away (season)", [r for r in cur if not r.is_home]),
                  split("All ingested", rows)]
        allp = s.execute(select(Prediction, Game).join(Game, Game.id == Prediction.game_id).where(
            Prediction.subject_type == "player", Prediction.subject_id == player_id).order_by(Prediction.id.desc()).limit(400)).all()
        seen_p, preds = set(), []
        for pr, g in allp:  # only the latest forecast per game and stat (the forecast of record)
            if (pr.game_id, pr.stat) not in seen_p:
                seen_p.add((pr.game_id, pr.stat)); preds.append((pr, g))
        preds = preds[:44]
        models = {m.id: m for m in s.scalars(select(ModelVersion))}
        acc = s.execute(text(
            "select o.stat, count(*), avg(abs(o.error)), avg(case when o.in_80 then 1.0 else 0.0 end) from prediction_outcomes o "
            "join predictions p on p.id=o.prediction_id where p.subject_type='player' and p.subject_id=:p and o.actual is not null "
            "group by 1"), {"p": player_id}).all()
        inj = next((i for i in ingestion.latest_injuries(s) if i.player_id == player_id), None)
        today = ingestion.today_et()
        ng = s.scalar(select(Game).where(Game.game_date >= today, Game.status == "scheduled",
                                         (Game.home_team_id == p.team_id) | (Game.away_team_id == p.team_id))
                      .order_by(Game.game_date, Game.tipoff_utc).limit(1))
        next_game, lineup, markets = None, None, []
        if ng is not None:
            from .api_v3 import prop_rows
            from .lineups import lineup_status_map
            home = ng.home_team_id == p.team_id
            opp = teams[ng.away_team_id if home else ng.home_team_id]
            next_game = {"game_id": ng.id, "label": f"{teams[ng.away_team_id].abbr} @ {teams[ng.home_team_id].abbr}",
                         "date": ng.game_date, "tipoff_utc": ng.tipoff_utc, "opp_abbr": opp.abbr, "is_home": home}
            snap = lineup_status_map(s, [ng.id]).get((ng.id, p.team_id))
            if snap is not None:
                role = next((("starter" if x["role"] == "starter" else "bench") for x in snap.players
                             if x["player_id"] == p.id and x["role"] != "unavailable"), None)
                lineup = {"role": role, "status": snap.status}
            markets = prop_rows(s, View(s, ng.game_date), ng.id, p.id)
        return {"player": {"id": p.id, "name": p.name, "team_abbr": teams[p.team_id].abbr if p.team_id in teams else None,
                           "position": p.position, "jersey": p.jersey, "headshot_url": p.headshot_url},
                "next_game": next_game, "lineup": lineup, "markets": markets,
                "sample": {"games": len(rows)}, "splits": splits,
                "game_log": [{"date": r.game_date, "opp_abbr": teams[r.opp_team_id].abbr if r.opp_team_id in teams else None,
                              "is_home": r.is_home, "min": r.minutes, **{c: getattr(r, c) for c in cols}} for r in rows[:120]],
                "projections": [{"stat": pr.stat, "mean": pr.mean, "p10": pr.p10, "p50": pr.p50, "p90": pr.p90,
                                 "game_label": f"{teams[g.away_team_id].abbr} @ {teams[g.home_team_id].abbr} {g.game_date}",
                                 "model_version": f"{models[pr.model_version_id].name} {models[pr.model_version_id].version}",
                                 "created_at": pr.created_at} for pr, g in preds],
                "forecast_accuracy": [{"stat": a[0], "n": a[1], "mae": float(a[2]), "coverage_80": float(a[3])} for a in acc],
                "injury": injury_row(inj, teams) if inj else None}


def _team_row(s, t: Team) -> dict:
    form = _team_form(s, t.id, ingestion.today_et() + timedelta(days=1)).get("_season") or {}
    return {**team_ref(t), "games": form.get("games", 0), "wins": form.get("wins", 0), "losses": form.get("losses", 0),
            "off_rtg": form.get("off_rtg"), "def_rtg": form.get("def_rtg"), "pace": form.get("pace")}


@api.get("/teams")
def teams_list():
    with session_scope() as s:
        return {"items": [_team_row(s, t) for t in s.scalars(select(Team).order_by(Team.name))]}


@api.get("/teams/{team_id}")
def team_detail(team_id: int):
    with session_scope() as s:
        t = s.get(Team, team_id)
        if t is None:
            raise ApiError(404, "not_found", "Team not found.")
        teams = {x.id: x for x in s.scalars(select(Team))}
        rec = s.scalars(select(Game).where(Game.status == "final", Game.home_points.is_not(None),
                                           (Game.home_team_id == team_id) | (Game.away_team_id == team_id))
                        .order_by(Game.game_date.desc()).limit(15))
        season = cfg.season_list[-1]
        roster = s.execute(select(Player, func.count(PlayerBox.game_id), func.avg(PlayerBox.minutes), func.avg(PlayerBox.pts),
                                  func.avg(PlayerBox.reb), func.avg(PlayerBox.ast))
                           .join(PlayerBox, (PlayerBox.player_id == Player.id) & (PlayerBox.season == season) & (PlayerBox.team_id == team_id))
                           .where(Player.team_id == team_id).group_by(Player.id).order_by(func.avg(PlayerBox.minutes).desc())).all()
        r1 = lambda x: None if x is None else round(float(x), 1)  # noqa: E731
        return {"team": _team_row(s, t),
                "recent": [{"date": g.game_date, "is_home": g.home_team_id == team_id,
                            "opp_abbr": teams[g.away_team_id if g.home_team_id == team_id else g.home_team_id].abbr,
                            "points": g.home_points if g.home_team_id == team_id else g.away_points,
                            "opp_points": g.away_points if g.home_team_id == team_id else g.home_points} for g in rec],
                "roster": [{"id": p.id, "name": p.name, "position": p.position, "games": n, "min": r1(mn), "pts": r1(pts),
                            "reb": r1(rb), "ast": r1(a)} for p, n, mn, pts, rb, a in roster],
                "injuries": [injury_row(i, teams) for i in ingestion.latest_injuries(s) if i.team_id == team_id]}


@api.get("/injuries")
def injuries():
    with session_scope() as s:
        teams = {t.id: t for t in s.scalars(select(Team))}
        cur = ingestion.latest_injuries(s)
        as_of = max((i.ingested_at for i in cur), default=None)
        changes = []
        if as_of:
            prev = ingestion.latest_injuries(s, as_of - timedelta(hours=6))
            pm = {i.player_name: i.status for i in prev}
            if prev:
                for i in cur:
                    if pm.get(i.player_name) != i.status:
                        changes.append({"text": f"{i.player_name}: {pm.get(i.player_name, 'not listed')} → {i.status}", "at": i.ingested_at})
                now_names = {i.player_name for i in cur}
                changes += [{"text": f"{n}: {st} → no longer listed", "at": as_of} for n, st in pm.items() if n not in now_names]
        heads = {p.id: p.headshot_url for p in s.scalars(select(Player).where(Player.id.in_([i.player_id for i in cur if i.player_id])))}
        today = ingestion.today_et()
        glabel = {}
        for g in s.scalars(select(Game).where(Game.game_date >= today, Game.game_date <= today + timedelta(days=1)).order_by(Game.game_date.desc())):
            lab = f"{teams[g.away_team_id].abbr} @ {teams[g.home_team_id].abbr} · {g.game_date}"
            glabel[g.home_team_id] = glabel[g.away_team_id] = lab
        prevm = {}
        if as_of:
            for i in ingestion.latest_injuries(s, as_of - timedelta(hours=6)):
                prevm[i.player_name] = i.status
        return {"as_of": as_of, "source": "ESPN public injuries feed (unofficial); see DATA-SOURCES.md",
                "items": [injury_row(i, teams, {"headshot_url": heads.get(i.player_id), "game_label": glabel.get(i.team_id),
                                                "previous_status": prevm.get(i.player_name) if prevm.get(i.player_name) != i.status else None})
                          for i in sorted(cur, key=lambda i: (glabel.get(i.team_id) is None, glabel.get(i.team_id) or "", i.team_id or 0, i.player_name))],
                "changes": changes[:60]}


# ---------------------------------------------------------------- models, research, operations
def _slim(metrics: dict) -> dict:
    return {k: v for k, v in (metrics or {}).items() if isinstance(v, (int, float, str, bool)) or v is None}


@api.get("/models")
def models():
    with session_scope() as s:
        out = []
        for m in s.scalars(select(ModelVersion).order_by(ModelVersion.family, ModelVersion.id.desc())):
            ev = M.latest_evaluation(s, m.id)
            out.append({"id": m.id, "family": m.family, "name": m.name, "version": m.version, "status": m.status,
                        "training_period": m.training_period, "calibration_period": m.calibration_period,
                        "evaluation_period": m.evaluation_period, "limitations": m.limitations,
                        "promoted_by": m.promoted_by, "promoted_at": m.promoted_at,
                        "latest_evaluation": {"n_obs": ev.n_obs, "metrics": _slim(ev.metrics), "passed": ev.passed} if ev else None})
        return {"items": out}


def _eval_row(e: ModelEvaluation) -> dict:
    return {"id": e.id, "family": e.family, "model_name": e.model_name, "kind": e.kind, "period": e.period,
            "n_obs": e.n_obs, "metrics": {k: v for k, v in (e.metrics or {}).items() if k not in ("pairs",)},
            "passed": e.passed, "notes": e.notes, "created_at": e.created_at}


@api.get("/backtests")
def backtests():
    with session_scope() as s:
        return {"items": [_eval_row(e) for e in s.scalars(select(ModelEvaluation).order_by(ModelEvaluation.id.desc()).limit(60))]}


@api.get("/research-lab")
def research_lab():
    with session_scope() as s:
        ce = s.scalar(select(ModelEvaluation).where(ModelEvaluation.kind == "correlation").order_by(ModelEvaluation.id.desc()).limit(1))
        return {"findings": [{"finding_uid": f.finding_uid, "hypothesis": f.hypothesis, "supporting": f.supporting,
                              "contradicting": f.contradicting, "sample_size": f.sample_size,
                              "proposed_experiment": f.proposed_experiment, "result": f.result,
                              "limitations": f.limitations, "status": f.status, "created_at": f.created_at}
                             for f in s.scalars(select(ResearchFinding).order_by(ResearchFinding.id.desc()).limit(100))],
                "experiments": [_eval_row(e) for e in s.scalars(select(ModelEvaluation).order_by(ModelEvaluation.id.desc()).limit(40))],
                "correlation": {"pairs": ce.metrics.get("pairs", []), "notes": ce.metrics.get("notes", [])} if ce else None}


@api.get("/agents")
def agents():
    return {"items": jobs.agents_status()}


@api.get("/data-health")
def data_health():
    now = utcnow()
    with session_scope() as s:
        prov = ingestion.provider_status(s)
        cov = s.execute(text(
            "select g.season, count(*), count(g.box_ingested_at), (select count(*) from player_box b where b.season=g.season), "
            "min(g.game_date), max(g.game_date) from games g where g.status='final' group by g.season order by 1")).all()
        fr = []
        def add(name, at, max_min):
            age = None if at is None else (now - at).total_seconds() / 60
            fr.append({"name": name, "at": at, "age_minutes": None if age is None else round(age), "max_age_minutes": max_min,
                       "ok": age is not None and age <= max_min})
        add("Injury report snapshot", s.scalar(select(func.max(InjurySnapshot.ingested_at))), RISK_POLICY["max_injury_age_hours"] * 60)
        add("Market quotes verified", s.scalar(text("select max(called_at) from provider_calls where ok and provider in ('kalshi','espn','oddsapi')")),
            RISK_POLICY["max_quote_age_hours"] * 60)
        add("Box scores ingested", s.scalar(select(func.max(Game.box_ingested_at))), 36 * 60)
        add("Latest research edition", s.scalar(select(func.max(Edition.published_at))), 26 * 60)
        v = View(s, ingestion.today_et())
        return {"providers": prov, "coverage": [{"season": r[0], "games": r[1], "games_with_box": r[2], "player_rows": r[3],
                                                 "first_date": r[4], "last_date": r[5]} for r in cov],
                "freshness": fr, "warnings": _warnings(s, v)}


@api.get("/operations")
def operations(_: Principal = Depends(require_owner)):
    return jobs.operations_status()


class PauseBody(BaseModel):
    paused: bool


@api.post("/operations/pause")
def pause(body: PauseBody, request: Request, p: Principal = Depends(require_owner)):
    with session_scope() as s:
        set_setting(s, "paused", {"paused": body.paused, "by": p.email, "at": utcnow().isoformat()})
    audit(p.email, "pause" if body.paused else "resume", {}, client_ip(request))
    return {"paused": body.paused}


@api.get("/settings")
def settings_view():
    return {"timezone": str(ET), "paper_unit": cfg.paper_unit, "risk_policy": RISK_POLICY,
            "providers_configured": {"pbpstats": cfg.pbpstats_enabled, "espn": cfg.espn_enabled, "oddsapi": bool(cfg.odds_api_key)},
            "llm_enabled": bool(cfg.llm_provider), "env": cfg.env}


from . import api_v3  # noqa: E402,F401  (registers the V3 routes on `api` before it is mounted)
from . import api_core  # noqa: E402,F401  (Kalshi intelligence, minutes intelligence, availability events)
from . import api_jarvis  # noqa: E402,F401  (JARVIS assistant, memory, briefings, AI budget)
from . import api_live  # noqa: E402,F401  (GIZER LIVE: scoreboard, game centre, watchlist, research tracker)
from . import api_cortex  # noqa: E402,F401  (GIZER CORTEX: knowledge library, profiles, benchmark)

app.include_router(pub)
app.include_router(api)
