"""JARVIS endpoints: conversations (SSE streaming), memory, briefings, events and the AI budget administration."""
from __future__ import annotations

import json
from typing import Literal

from fastapi import Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from . import ai_budget, jarvis
from . import jarvis_tools as T
from .api import ApiError, api
from .db import JarvisBriefing, JarvisConversation, JarvisEvent, JarvisMemory, JarvisMessage, JarvisToolCall, session_scope, utcnow
from .security import Principal, RateLimiter, audit, client_ip, current_user, require_owner

_chat_limiter = RateLimiter(limit=20, window_s=60)      # owner questions per minute, independent of the budget


class ContextBody(BaseModel):
    game_id: str | None = Field(None, max_length=24)
    player_id: int | None = None
    ticker: str | None = Field(None, max_length=80)
    selection_id: int | None = None
    combo_id: int | str | None = Field(None, max_length=40)
    date: str | None = Field(None, max_length=10)
    page: str | None = Field(None, max_length=60)


class NewConversation(BaseModel):
    context: ContextBody | None = None


class ImageIn(BaseModel):
    media_type: Literal["image/png", "image/jpeg", "image/webp", "image/gif"]
    data: str = Field(min_length=16, max_length=2_100_000)      # base64; about 1.5 MB of image


class SendBody(BaseModel):
    text: str = Field("", max_length=8000)
    images: list[ImageIn] = Field(default_factory=list, max_length=3)
    mode: Literal["quick", "standard", "deep"] = "standard"
    context: ContextBody | None = None


SUGGESTIONS = [
    {"label": "Morning read", "text": "Give me the read on today's slate: availability, lineup status, data completeness and what is still unknown."},
    {"label": "Minutes watch", "text": "Which players on today's slate have the most stable high-minute roles, and whose minutes are uncertain?"},
    {"label": "Market movers", "text": "Which Kalshi contracts moved most since first observation today, and did any availability news arrive around then?"},
    {"label": "Audit top research", "text": "Audit today's top-ranked research selections: model status, quote freshness, and anything that changed since verification."},
    {"label": "Model readiness", "text": "Which models are in production, which are candidates only, and what are their main limitations?"},
    {"label": "System health", "text": "/status"},
    {"label": "AI budget", "text": "/budget"},
]
CONTEXT_SUGGESTIONS = {
    "player": [{"label": "Full player read", "text": "Give me the full research read on this player for his next game."},
               {"label": "Minutes and usage", "text": "How stable are this player's minutes and usage over his last 10 and 20 games?"}],
    "game": [{"label": "Game read", "text": "Summarise this game: availability, lineups, minutes picture, markets and the research records that exist."}],
    "kalshi_market": [{"label": "Explain this contract", "text": "Explain this contract's exact rules, its observed price history today, and what the model says about it."}],
    "selection": [{"label": "Audit this record", "text": "Audit this research record and tell me what could invalidate it."}],
    "combination": [{"label": "Audit this combination", "text": "Audit this combination: legs, dependence assumptions, and anything that changed."}],
}


@api.get("/jarvis/state")
def jarvis_state():
    return jarvis.state()


@api.get("/jarvis/suggestions")
def jarvis_suggestions(game_id: str | None = None, player_id: int | None = None, ticker: str | None = None,
                       selection_id: int | None = None, combo_id: str | None = None):
    ctx = jarvis.resolve_context({"game_id": game_id, "player_id": player_id, "ticker": ticker, "selection_id": selection_id,
                                  "combo_id": combo_id})
    extra = [x for k in ctx for x in CONTEXT_SUGGESTIONS.get(k, [])]
    return {"context": ctx, "items": extra + SUGGESTIONS}


@api.get("/jarvis/tools")
def jarvis_tool_list():
    return {"items": [{"name": t.name, "label": t.label, "group": t.group, "description": t.description, "writes": t.writes}
                      for t in T.TOOLS], "total": len(T.TOOLS),
            "note": "This list is the assistant's entire capability. It has no SQL, shell, file, trading or settings tool."}


@api.get("/jarvis/conversations")
def jarvis_conversations(limit: int = Query(40, ge=1, le=100), p: Principal = Depends(current_user)):
    with session_scope() as s:
        # A conversation exists from the moment the panel opens; it is listed once something has been asked in it.
        rows = s.scalars(select(JarvisConversation).where(JarvisConversation.owner == p.email, JarvisConversation.deleted_at.is_(None),
                                                         JarvisConversation.title != "New conversation")
                         .order_by(JarvisConversation.updated_at.desc()).limit(limit))
        return {"items": [jarvis.conversation_dict(c) for c in rows]}


@api.post("/jarvis/conversations")
def jarvis_new_conversation(body: NewConversation, p: Principal = Depends(require_owner)):
    return jarvis.create_conversation(p.email, body.context.model_dump(exclude_none=True) if body.context else None)


def _conv(s, cid: int, p: Principal) -> JarvisConversation:
    c = s.get(JarvisConversation, cid)
    if c is None or c.owner != p.email or c.deleted_at is not None:
        raise ApiError(404, "not_found", "Conversation not found.")
    return c


@api.get("/jarvis/conversations/{conversation_id}")
def jarvis_conversation(conversation_id: int, p: Principal = Depends(current_user)):
    with session_scope() as s:
        c = _conv(s, conversation_id, p)
        msgs = [jarvis.message_dict(m) for m in s.scalars(select(JarvisMessage).where(JarvisMessage.conversation_id == c.id).order_by(JarvisMessage.id))]
        calls = [{"tool": t.tool, "label": T.BY_NAME[t.tool].label if t.tool in T.BY_NAME else t.tool, "args": t.args, "ok": t.ok,
                  "error": t.error, "ms": t.duration_ms, "truncated": t.truncated, "at": t.created_at}
                 for t in s.scalars(select(JarvisToolCall).where(JarvisToolCall.conversation_id == c.id).order_by(JarvisToolCall.id))]
        shown: list[dict] = []
        for m in msgs:          # one owner turn = one answer: fold the steps between tool calls into the final message
            if m["internal"]:
                continue
            if m["role"] == "assistant" and shown and shown[-1]["role"] == "assistant":
                prev = shown.pop()
                m = {**m, "text": "\n\n".join(t for t in (prev["text"], m["text"]) if t),
                     "tool_calls": prev["tool_calls"] + m["tool_calls"], "created_at": prev["created_at"]}
            shown.append(m)
        return {**jarvis.conversation_dict(c), "messages": shown, "tool_activity": calls}


@api.get("/jarvis/messages/{message_id}/images/{index}")
def jarvis_message_image(message_id: int, index: int, p: Principal = Depends(current_user)):
    """An image the owner attached to one of their own messages (for showing it again in the conversation)."""
    import base64

    from fastapi import Response
    with session_scope() as s:
        m = s.get(JarvisMessage, message_id)
        if m is None:
            raise ApiError(404, "not_found", "Image not found.")
        _conv(s, m.conversation_id, p)
        imgs = [b for b in (m.content or []) if isinstance(b, dict) and b.get("type") == "image"]
        if not 0 <= index < len(imgs):
            raise ApiError(404, "not_found", "Image not found.")
        src = imgs[index]["source"]
        return Response(content=base64.b64decode(src["data"]), media_type=src["media_type"],
                        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


@api.post("/jarvis/conversations/{conversation_id}/delete")
def jarvis_delete_conversation(conversation_id: int, request: Request, p: Principal = Depends(require_owner)):
    with session_scope() as s:
        _conv(s, conversation_id, p).deleted_at = utcnow()
    audit(p.email, "jarvis.conversation.delete", {"conversation_id": conversation_id}, client_ip(request))
    return {"deleted": True}


@api.post("/jarvis/conversations/{conversation_id}/messages")
def jarvis_send(conversation_id: int, body: SendBody, request: Request, p: Principal = Depends(require_owner)):
    """Server-sent events: one `data: {json}` line per event (status, tool_start, tool_end, text, usage, done, error)."""
    if not _chat_limiter.allow(p.email):
        raise ApiError(429, "rate_limited", "Too many questions in a minute. Wait a moment.")
    with session_scope() as s:
        _conv(s, conversation_id, p)
    ctx = body.context.model_dump(exclude_none=True) if body.context else None

    def gen():
        try:
            for ev in jarvis.send(conversation_id, p.email, body.text, body.mode, ctx, [i.model_dump() for i in body.images]):
                yield f"data: {json.dumps(ev, default=str)}\n\n"
        except Exception as e:  # never leak a traceback into the stream
            yield f"data: {json.dumps({'type': 'error', 'code': 'error', 'message': f'Unexpected failure ({type(e).__name__}).'})}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


class MemoryBody(BaseModel):
    category: Literal["research", "operational", "preference"]
    text: str = Field(min_length=4, max_length=600)
    status: Literal["verified", "hypothesis", "preference"] = "preference"
    subject_type: Literal["player", "team", "game", "market", "model", "system"] | None = None
    subject_id: str | None = Field(None, max_length=64)


@api.get("/jarvis/memory")
def jarvis_memory(category: str | None = None, q: str | None = None, limit: int = Query(100, ge=1, le=300)):
    with session_scope() as s:
        stmt = select(JarvisMemory).where(JarvisMemory.deleted_at.is_(None)).order_by(JarvisMemory.id.desc()).limit(limit)
        if category:
            stmt = stmt.where(JarvisMemory.category == category)
        if q:
            stmt = stmt.where(JarvisMemory.text.ilike(f"%{q[:60].replace('%', '')}%"))
        return {"items": [T.memory_dict(m) for m in s.scalars(stmt)]}


@api.post("/jarvis/memory")
def jarvis_memory_add(body: MemoryBody, request: Request, p: Principal = Depends(require_owner)):
    with session_scope() as s:
        m = JarvisMemory(category=body.category, status="preference" if body.category == "preference" else body.status,
                         subject_type=body.subject_type, subject_id=body.subject_id, text=body.text, sources=["owner"], created_by=p.email)
        s.add(m)
        s.flush()
        out = T.memory_dict(m)
    audit(p.email, "jarvis.memory.add", {"id": out["id"]}, client_ip(request))
    return out


@api.post("/jarvis/memory/{memory_id}/delete")
def jarvis_memory_delete(memory_id: int, request: Request, p: Principal = Depends(require_owner)):
    with session_scope() as s:
        m = s.get(JarvisMemory, memory_id)
        if m is None or m.deleted_at is not None:
            raise ApiError(404, "not_found", "Memory not found.")
        m.deleted_at = utcnow()
    audit(p.email, "jarvis.memory.delete", {"id": memory_id}, client_ip(request))
    return {"deleted": True}


@api.get("/jarvis/briefings")
def jarvis_briefings(kind: str | None = None, limit: int = Query(20, ge=1, le=60)):
    with session_scope() as s:
        stmt = select(JarvisBriefing).order_by(JarvisBriefing.id.desc()).limit(limit)
        if kind:
            stmt = stmt.where(JarvisBriefing.kind == kind)
        return {"items": [{"id": b.id, "kind": b.kind, "date": b.game_date, "text": b.text, "generator": b.generator,
                           "cost_usd": b.cost_usd, "created_at": b.created_at} for b in s.scalars(stmt)]}


class BriefingRun(BaseModel):
    kind: Literal["overnight", "morning", "midday", "pregame", "postgame"]


@api.post("/jarvis/briefings/run")
def jarvis_briefing_run(body: BriefingRun, request: Request, p: Principal = Depends(require_owner)):
    out = jarvis.run_briefing(body.kind)
    audit(p.email, "jarvis.briefing.run", {"kind": body.kind, **{k: v for k, v in out.items() if k != "text"}}, client_ip(request))
    return out


@api.get("/jarvis/events")
def jarvis_events(kind: str | None = None, limit: int = Query(50, ge=1, le=200)):
    with session_scope() as s:
        stmt = select(JarvisEvent).order_by(JarvisEvent.id.desc()).limit(limit)
        if kind:
            stmt = stmt.where(JarvisEvent.kind == kind)
        return {"items": [{"id": e.id, "kind": e.kind, "severity": e.severity, "title": e.title, "detail": e.detail,
                           "game_date": e.game_date, "occurred_at": e.occurred_at} for e in s.scalars(stmt)]}


class PolicyBody(BaseModel):
    lifetime_cap_usd: float | None = Field(None, ge=0)
    suspend_at_usd: float | None = Field(None, ge=0)
    daily_cap_usd: float | None = Field(None, ge=0)
    allocations: dict[str, float] | None = None
    per_request_cap_usd: dict[str, float] | None = None
    paused: bool | None = None
    buffer_released: bool | None = None
    notifications: bool | None = None


@api.get("/admin/ai-budget")
def ai_budget_view(_: Principal = Depends(require_owner)):
    return {**ai_budget.status(), "assistant": jarvis.state()}


@api.post("/admin/ai-budget")
def ai_budget_update(body: PolicyBody, request: Request, p: Principal = Depends(require_owner)):
    try:
        pol = ai_budget.update_policy(p.email, **body.model_dump(exclude_none=True))
    except ValueError as e:
        raise ApiError(422, "invalid_request", str(e))
    audit(p.email, "ai_budget.update", body.model_dump(exclude_none=True), client_ip(request))
    return pol


@api.get("/admin/ai-budget/requests")
def ai_budget_requests(limit: int = Query(50, ge=1, le=200), _: Principal = Depends(require_owner)):
    from .db import AiUsage
    with session_scope() as s:
        rows = s.scalars(select(AiUsage).order_by(AiUsage.id.desc()).limit(limit))
        return {"items": [{"id": r.id, "at": r.created_at, "status": r.status, "bucket": r.bucket, "model": r.model, "task": r.task,
                           "reserved_usd": r.reserved_usd, "actual_usd": r.actual_usd, "input_tokens": r.input_tokens,
                           "output_tokens": r.output_tokens, "cache_read_tokens": r.cache_read_tokens,
                           "cache_write_tokens": r.cache_write_tokens, "attempt": r.attempt, "routing": r.routing,
                           "error": r.error, "conversation_id": r.conversation_id} for r in rows]}
