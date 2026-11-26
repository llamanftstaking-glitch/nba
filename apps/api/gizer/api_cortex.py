"""GIZER CORTEX endpoints: knowledge library, sources, player and team profiles, coverage and benchmark."""
from __future__ import annotations

from fastapi import Depends, Query
from sqlalchemy import func, select

from . import cortex
from .api import ApiError, api, stamp_cached
from .db import (CortexBenchmarkRun, CortexConcept, CortexRetrievalLog, CortexSource, Player, PlayerBox, ResearchFinding, Team,
                 session_scope)
from .security import Principal, require_owner


@api.get("/cortex/overview")
def cortex_overview():
    return cortex.coverage()


@api.get("/cortex/concepts")
def cortex_concepts(q: str | None = None, department: int | None = Query(None, ge=1, le=20), kind: str | None = None,
                    verification: str | None = None, limit: int = Query(60, ge=1, le=200), offset: int = Query(0, ge=0)):
    if q and q.strip():
        res = cortex.search(q, department, kind if kind in cortex.KINDS else None, 12, caller="api")
        return {"mode": "search", "query": res["query"], "method": res["method"], "items": res["items"], "total": res["total"]}
    with session_scope() as s:
        stmt = select(CortexConcept)
        if department:
            stmt = stmt.where(CortexConcept.department == department)
        if kind:
            stmt = stmt.where(CortexConcept.kind == kind)
        if verification:
            stmt = stmt.where(CortexConcept.verification == verification)
        total = s.scalar(select(func.count()).select_from(stmt.subquery()))
        rows = s.scalars(stmt.order_by(CortexConcept.department, CortexConcept.title).limit(limit).offset(offset))
        return {"mode": "browse", "items": [cortex.concept_dict(c, full=False) for c in rows], "total": total}


@api.get("/cortex/concepts/{slug}")
def cortex_concept(slug: str):
    c = cortex.get_concept(slug)
    if c is None:
        raise ApiError(404, "not_found", "Knowledge record not found.")
    return c


@api.get("/cortex/sources")
def cortex_sources():
    with session_scope() as s:
        used: dict = {}
        for keys in s.scalars(select(CortexConcept.source_keys)):
            for k in keys or []:
                used[k] = used.get(k, 0) + 1
        return {"items": [{"key": x.key, "title": x.title, "publisher": x.publisher, "url": x.url, "league": x.league, "kind": x.kind,
                           "reliability": x.reliability, "permission": x.permission, "accessed": x.accessed,
                           "access_result": x.access_result, "records_citing": int(used.get(x.key, 0))}
                          for x in s.scalars(select(CortexSource).order_by(CortexSource.key))]}


@api.get("/cortex/players")
def cortex_players(q: str | None = None, limit: int = Query(40, ge=1, le=100)):
    """Players with a profile this season (most minutes first), for the Player DNA browser."""
    season = cortex._season()
    with session_scope() as s:
        teams = {t.id: t.abbr for t in s.scalars(select(Team))}
        stmt = (select(Player, func.count(PlayerBox.game_id), func.sum(PlayerBox.minutes))
                .join(PlayerBox, (PlayerBox.player_id == Player.id) & (PlayerBox.season == season)).group_by(Player.id))
        if q:
            stmt = stmt.where(Player.name.ilike(f"%{q[:60].replace('%', '')}%"))
        rows = s.execute(stmt.order_by(func.sum(PlayerBox.minutes).desc()).limit(limit)).all()
        return {"season": season, "items": [{"player_id": p.id, "name": p.name, "team_abbr": teams.get(p.team_id), "position": p.position,
                                             "headshot_url": p.headshot_url, "games": int(n), "minutes": round(float(m or 0))}
                                            for p, n, m in rows]}


@api.get("/cortex/players/{player_id}/dna")
def cortex_player_dna(player_id: int):
    with session_scope() as s:
        d = stamp_cached(s, ("player_dna", player_id), lambda: cortex.player_dna(player_id))
    if d is None:
        raise ApiError(404, "not_found", "Player not found.")
    return d


@api.get("/cortex/teams")
def cortex_teams():
    season = cortex._season()
    with session_scope() as s:
        have = set(s.scalars(select(func.distinct(PlayerBox.team_id)).where(PlayerBox.season == season)))
        return {"season": season, "items": [{"team_id": t.id, "abbr": t.abbr, "name": t.name, "profile_available": t.id in have}
                                            for t in s.scalars(select(Team).order_by(Team.name))]}


@api.get("/cortex/teams/{team_id}/dna")
def cortex_team_dna(team_id: int):
    with session_scope() as s:
        d = stamp_cached(s, ("team_dna", team_id), lambda: cortex.team_dna(team_id))
    if d is None:
        raise ApiError(404, "not_found", "Team not found.")
    return d


@api.get("/cortex/research")
def cortex_research(status: str | None = None, limit: int = Query(60, ge=1, le=200)):
    with session_scope() as s:
        stmt = select(ResearchFinding).order_by(ResearchFinding.id.desc()).limit(limit)
        if status:
            stmt = stmt.where(ResearchFinding.status == status)
        return {"items": [{"uid": f.finding_uid, "hypothesis": f.hypothesis, "supporting": f.supporting, "contradicting": f.contradicting,
                           "sample_size": f.sample_size, "proposed_experiment": f.proposed_experiment, "result": f.result,
                           "limitations": f.limitations, "status": f.status, "source": f.source} for f in s.scalars(stmt)],
                "note": "Findings come from the research agents and experiments. A finding marked open is a hypothesis, not knowledge."}


@api.get("/cortex/benchmark")
def cortex_benchmark(_: Principal = Depends(require_owner)):
    with session_scope() as s:
        runs = [{"id": r.id, "kind": r.kind, "split": r.split, "model": r.model, "n": r.n, "score": r.score, "by_category": r.by_category,
                 "cost_usd": r.cost_usd, "created_at": r.created_at, "misses": (r.details or [])[:20]}
                for r in s.scalars(select(CortexBenchmarkRun).order_by(CortexBenchmarkRun.id.desc()).limit(12))]
        recent = [{"query": r.query, "returned": r.returned, "method": r.method, "ms": r.duration_ms, "caller": r.caller, "at": r.created_at}
                  for r in s.scalars(select(CortexRetrievalLog).order_by(CortexRetrievalLog.id.desc()).limit(25))]
    qs = cortex.benchmark_questions()
    return {**cortex.benchmark_summary(), "runs": runs, "recent_retrievals": recent,
            "sample_questions": [{k: q.get(k) for k in ("id", "category", "type", "question", "choices")} for q in qs if q.get("split") == "dev"][:12],
            "how_to_run": "Retrieval check (free): `gizer cortex-eval`. Answer run (paid, development allocation): "
                          "`gizer cortex-benchmark --limit 20`."}
