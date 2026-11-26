"""AI spending control for JARVIS. Enforced here, in backend code, for every paid request.

Flow for one API request:  reserve() -> call the provider -> settle() with the usage the provider reported
(or release() when the request was rejected before it could be billed, or assume() when the outcome is unknown).
A reservation is the conservative maximum the request can cost, taken atomically under a row lock, so concurrent
workers can never jointly exceed a limit. Unknown model prices mean the cost cannot be determined: the request is
refused rather than guessed.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta

from sqlalchemy import func, select, text

from .config import ET, get_settings
from .db import AiBudgetPolicy, AiUsage, JarvisEvent, session_scope, utcnow

# USD per million tokens. Source: Anthropic published first-party prices as of 2026-11-03 (docs/jarvis/BUDGET-POLICY.md).
# "long" applies to the whole request when its input exceeds `long_over` tokens.
PRICES = {
    "claude-sonnet-5-5": {"in": 2.00, "out": 10.00, "cache_read": 0.10, "cache_write": 2.50},
    "claude-haiku-5-5": {"in": 0.10, "out": 0.50, "cache_read": 0.01, "cache_write": 0.125,
                         "long_over": 100_000, "long": {"in": 0.50, "out": 2.50, "cache_read": 0.05, "cache_write": 0.625}},
    "claude-opus-5-5": {"in": 4.00, "out": 20.00, "cache_read": 0.20, "cache_write": 5.00},
}
BUCKETS = ("sonnet", "haiku", "opus", "dev")
DEFAULT_ALLOCATIONS = {"sonnet": 55.0, "haiku": 15.0, "opus": 20.0, "dev": 10.0}
DEFAULT_REQUEST_CAPS = {"sonnet": 0.40, "haiku": 0.05, "opus": 1.00, "dev": 0.25}
CHECKPOINTS = (25, 50, 75, 90, 95)
STALE_AFTER = timedelta(minutes=15)
COUNTED = ("reserved", "settled", "assumed")


class BudgetDenied(Exception):
    """A paid request was refused by the budget controller. `code` is stable; `message` is owner-readable."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


def estimate_tokens(payload) -> int:
    """Deliberately high estimate of input tokens for a request body (about 2.5 bytes per token)."""
    raw = payload if isinstance(payload, (str, bytes)) else json.dumps(payload, default=str)
    n = len(raw.encode() if isinstance(raw, str) else raw)
    return int(math.ceil(n / 2.5)) + 64


def _rates(model: str, input_tokens: int) -> dict:
    p = PRICES.get(model)
    if p is None:
        raise BudgetDenied("unknown_price", f"No verified price is recorded for model '{model}'; paid execution is paused for it.")
    if p.get("long_over") and input_tokens > p["long_over"]:
        return p["long"]
    return p


def max_cost(model: str, est_input_tokens: int, max_tokens: int) -> float:
    """Upper bound: every input token billed as a cache write (the most expensive input rate), full output."""
    r = _rates(model, est_input_tokens)
    return round((est_input_tokens * max(r["in"], r["cache_write"]) + max_tokens * r["out"]) / 1e6, 6)


def actual_cost(model: str, input_tokens: int, output_tokens: int, cache_read: int, cache_write: int) -> float:
    r = _rates(model, input_tokens + cache_read + cache_write)
    return round((input_tokens * r["in"] + cache_read * r["cache_read"] + cache_write * r["cache_write"]
                  + output_tokens * r["out"]) / 1e6, 6)


def ensure_policy(s) -> AiBudgetPolicy:
    pol = s.get(AiBudgetPolicy, 1)
    if pol is None:
        cfg = get_settings()
        s.execute(text(
            "insert into ai_budget_policy (id, lifetime_cap_usd, suspend_at_usd, daily_cap_usd, allocations, per_request_cap_usd,"
            " paused, buffer_released, notifications, updated_at, updated_by) values (1, :cap, :sus, :day, cast(:al as jsonb),"
            " cast(:rq as jsonb), false, false, true, now(), 'system') on conflict (id) do nothing"),
            {"cap": cfg.jarvis_lifetime_cap_usd, "sus": cfg.jarvis_suspend_at_usd, "day": cfg.jarvis_daily_cap_usd,
             "al": json.dumps(DEFAULT_ALLOCATIONS), "rq": json.dumps(DEFAULT_REQUEST_CAPS)})
        s.flush()
        pol = s.get(AiBudgetPolicy, 1)
    return pol


def _day_start(now: datetime) -> datetime:
    return now.astimezone(ET).replace(hour=0, minute=0, second=0, microsecond=0)


def _sum(s, *where) -> float:
    q = select(func.coalesce(func.sum(func.coalesce(AiUsage.actual_usd, AiUsage.reserved_usd)), 0.0)).where(
        AiUsage.status.in_(COUNTED), *where)
    return float(s.scalar(q) or 0.0)


def reserve(bucket: str, model: str, task: str, est_input_tokens: int, max_tokens: int, *, conversation_id: int | None = None,
            routing: dict | None = None, attempt: int = 1, agent: str = "jarvis") -> int:
    """Atomically set aside the maximum this request can cost. Raises BudgetDenied; returns the ai_usage id."""
    if bucket not in BUCKETS:
        raise BudgetDenied("unknown_bucket", f"Unknown budget bucket '{bucket}'.")
    need = max_cost(model, est_input_tokens, max_tokens)
    now = utcnow()
    with session_scope() as s:
        ensure_policy(s)
        pol = s.execute(select(AiBudgetPolicy).where(AiBudgetPolicy.id == 1).with_for_update()).scalar_one()
        if pol.paused:
            raise BudgetDenied("paused", "AI requests are paused by the owner (emergency pause).")
        cap_one = float((pol.per_request_cap_usd or {}).get(bucket, 0))
        if need > cap_one:
            raise BudgetDenied("request_too_large", f"This request could cost up to ${need:.2f}, above the ${cap_one:.2f} "
                                                    f"per-request limit for {bucket}.")
        total = _sum(s)
        ceiling = pol.lifetime_cap_usd if pol.buffer_released else min(pol.suspend_at_usd, pol.lifetime_cap_usd)
        if total + need > ceiling:
            raise BudgetDenied("lifetime_cap", f"Lifetime AI budget reached: ${total:.2f} committed of "
                                               f"${pol.lifetime_cap_usd:.2f} (ordinary requests stop at ${ceiling:.2f}).")
        alloc = float((pol.allocations or {}).get(bucket, 0))
        used_b = _sum(s, AiUsage.bucket == bucket)
        if used_b + need > alloc:
            raise BudgetDenied("allocation", f"The {bucket} allocation is used up (${used_b:.2f} of ${alloc:.2f}).")
        today = _sum(s, AiUsage.created_at >= _day_start(now))
        if today + need > pol.daily_cap_usd:
            raise BudgetDenied("daily_cap", f"Daily AI limit reached (${today:.2f} of ${pol.daily_cap_usd:.2f} today, ET).")
        row = AiUsage(status="reserved", bucket=bucket, model=model, task=task, agent=agent, conversation_id=conversation_id,
                      attempt=attempt, reserved_usd=need, routing=routing or {}, created_at=now)
        s.add(row)
        s.flush()
        return row.id


def settle(usage_id: int, usage, request_id: str | None = None) -> float:
    """Replace the reservation with the cost of the usage the provider reported. Returns the actual USD."""
    def g(name):
        v = usage.get(name) if isinstance(usage, dict) else getattr(usage, name, None)
        return int(v or 0)
    with session_scope() as s:
        row = s.get(AiUsage, usage_id)
        inp, out, cr, cw = g("input_tokens"), g("output_tokens"), g("cache_read_input_tokens"), g("cache_creation_input_tokens")
        cost = actual_cost(row.model, inp, out, cr, cw)
        row.status, row.actual_usd, row.settled_at, row.request_id = "settled", cost, utcnow(), (request_id or "")[:64] or None
        row.input_tokens, row.output_tokens, row.cache_read_tokens, row.cache_write_tokens = inp, out, cr, cw
        if cost > row.reserved_usd + 1e-9:
            row.error = f"actual ${cost:.4f} exceeded reservation ${row.reserved_usd:.4f}"
    _checkpoints()
    return cost


def release(usage_id: int, error: str) -> None:
    """The request was rejected before any billable work (e.g. 4xx/5xx with no response): free the reservation."""
    with session_scope() as s:
        row = s.get(AiUsage, usage_id)
        if row is not None and row.status == "reserved":
            row.status, row.actual_usd, row.settled_at, row.error = "released", 0.0, utcnow(), error[:200]


def assume(usage_id: int, error: str) -> None:
    """The outcome is unknown (timeout, dropped stream): count the full reservation as spent."""
    with session_scope() as s:
        row = s.get(AiUsage, usage_id)
        if row is not None and row.status == "reserved":
            row.status, row.actual_usd, row.settled_at, row.error = "assumed", row.reserved_usd, utcnow(), error[:200]
    _checkpoints()


def expire_stale(now: datetime | None = None) -> int:
    """Reservations whose request never reported back (crash, restart) are counted as fully spent."""
    now = now or utcnow()
    with session_scope() as s:
        rows = list(s.scalars(select(AiUsage).where(AiUsage.status == "reserved", AiUsage.created_at < now - STALE_AFTER)))
        for r in rows:
            r.status, r.actual_usd, r.settled_at, r.error = "assumed", r.reserved_usd, now, "no result reported; assumed spent"
        n = len(rows)
    if n:
        _checkpoints()
    return n


def _checkpoints() -> None:
    with session_scope() as s:
        pol = ensure_policy(s)
        spent = _sum(s, AiUsage.status.in_(("settled", "assumed")))
        for cp in CHECKPOINTS:
            level = pol.lifetime_cap_usd * cp / 100.0
            if spent >= level:
                s.execute(text(
                    "insert into jarvis_events (kind, dedupe_key, severity, title, detail, occurred_at) values "
                    "('budget_checkpoint', :k, :sev, :t, cast(:d as jsonb), now()) on conflict (dedupe_key) do nothing"),
                    {"k": f"budget:checkpoint:{cp}", "sev": "alert" if cp >= 90 else "notice",
                     "t": f"AI budget checkpoint: ${level:.0f} of ${pol.lifetime_cap_usd:.0f} consumed",
                     "d": json.dumps({"checkpoint_pct": cp, "spent_usd": round(spent, 4)})})


def status() -> dict:
    """Everything /admin/ai-budget shows. Pure read."""
    now = utcnow()
    with session_scope() as s:
        pol = ensure_policy(s)
        spent = _sum(s, AiUsage.status.in_(("settled", "assumed")))
        pending = float(s.scalar(select(func.coalesce(func.sum(AiUsage.reserved_usd), 0.0)).where(AiUsage.status == "reserved")) or 0)
        today = _sum(s, AiUsage.created_at >= _day_start(now))
        month0 = now.astimezone(ET).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month = _sum(s, AiUsage.created_at >= month0)

        def group(col):
            rows = s.execute(select(col, func.count(), func.coalesce(func.sum(func.coalesce(AiUsage.actual_usd, AiUsage.reserved_usd)), 0.0),
                                    func.coalesce(func.sum(AiUsage.input_tokens), 0), func.coalesce(func.sum(AiUsage.output_tokens), 0),
                                    func.coalesce(func.sum(AiUsage.cache_read_tokens), 0), func.coalesce(func.sum(AiUsage.cache_write_tokens), 0))
                             .where(AiUsage.status.in_(COUNTED)).group_by(col).order_by(col)).all()
            return [{"key": r[0], "requests": int(r[1]), "usd": round(float(r[2]), 4), "input_tokens": int(r[3]),
                     "output_tokens": int(r[4]), "cache_read_tokens": int(r[5]), "cache_write_tokens": int(r[6])} for r in rows]
        by_model, by_task, by_bucket, by_agent = group(AiUsage.model), group(AiUsage.task), group(AiUsage.bucket), group(AiUsage.agent)
        savings = 0.0
        for m in by_model:
            p = PRICES.get(m["key"])
            if p:
                savings += m["cache_read_tokens"] * (p["in"] - p["cache_read"]) / 1e6
        first = s.scalar(select(func.min(AiUsage.created_at)).where(AiUsage.status.in_(("settled", "assumed"))))
        days = max(1.0, (now - first).total_seconds() / 86400) if first else None
        per_day = spent / days if days else None
        ceiling = pol.lifetime_cap_usd if pol.buffer_released else min(pol.suspend_at_usd, pol.lifetime_cap_usd)
        remaining = max(0.0, pol.lifetime_cap_usd - spent - pending)
        usable = max(0.0, ceiling - spent - pending)
        daily = s.execute(text(
            "select (created_at at time zone 'America/New_York')::date d, count(*), "
            "coalesce(sum(coalesce(actual_usd, reserved_usd)), 0) from ai_usage where status in ('reserved','settled','assumed') "
            "group by 1 order by 1 desc limit 30")).all()
        totals = s.execute(select(func.count(), func.coalesce(func.sum(AiUsage.input_tokens), 0), func.coalesce(func.sum(AiUsage.output_tokens), 0),
                                  func.coalesce(func.sum(AiUsage.cache_read_tokens), 0), func.coalesce(func.sum(AiUsage.cache_write_tokens), 0))
                           .where(AiUsage.status.in_(COUNTED))).one()
        allocs = pol.allocations or {}
        return {
            "policy": {"lifetime_cap_usd": pol.lifetime_cap_usd, "suspend_at_usd": pol.suspend_at_usd, "daily_cap_usd": pol.daily_cap_usd,
                       "allocations": allocs, "per_request_cap_usd": pol.per_request_cap_usd, "paused": pol.paused,
                       "buffer_released": pol.buffer_released, "notifications": pol.notifications,
                       "updated_at": pol.updated_at, "updated_by": pol.updated_by},
            "spent_usd": round(spent, 4), "pending_usd": round(pending, 4), "remaining_usd": round(remaining, 4),
            "usable_usd": round(usable, 4), "today_usd": round(today, 4), "month_usd": round(month, 4),
            "state": ("paused" if pol.paused else "budget_limited" if usable <= 0.01 or today >= pol.daily_cap_usd else "ok"),
            "checkpoints": [{"pct": cp, "usd": round(pol.lifetime_cap_usd * cp / 100, 2),
                             "reached": spent >= pol.lifetime_cap_usd * cp / 100} for cp in CHECKPOINTS],
            "buckets": [{"bucket": b, "allocation_usd": float(allocs.get(b, 0)),
                         "used_usd": next((x["usd"] for x in by_bucket if x["key"] == b), 0.0)} for b in BUCKETS],
            "by_model": by_model, "by_task": by_task, "by_agent": by_agent,
            "requests": int(totals[0]), "input_tokens": int(totals[1]), "output_tokens": int(totals[2]),
            "cache_read_tokens": int(totals[3]), "cache_write_tokens": int(totals[4]),
            "cache_savings_usd": round(savings, 4),
            "avg_usd_per_day": None if per_day is None else round(per_day, 4),
            "est_days_remaining": None if not per_day else round(usable / per_day, 1),
            "daily": [{"date": r[0], "requests": int(r[1]), "usd": round(float(r[2]), 4)} for r in daily],
            "prices": {m: {k: v for k, v in p.items() if k != "long"} for m, p in PRICES.items()},
            "notes": ["Costs are computed from the token usage each response reports, at the recorded price table.",
                      "Local accounting is not reconciled against the provider's billing report: that needs an Admin API "
                      "key, which this deployment does not hold. Compare with the Anthropic Console periodically.",
                      "A request whose outcome is unknown is counted at its full reserved maximum."],
        }


def update_policy(actor: str, **changes) -> dict:
    """Owner-only edits. The lifetime cap can be lowered but never raised above the configured authorisation."""
    cfg = get_settings()
    with session_scope() as s:
        ensure_policy(s)
        pol = s.execute(select(AiBudgetPolicy).where(AiBudgetPolicy.id == 1).with_for_update()).scalar_one()
        if "lifetime_cap_usd" in changes and changes["lifetime_cap_usd"] is not None:
            v = float(changes["lifetime_cap_usd"])
            if not 0 <= v <= cfg.jarvis_lifetime_cap_usd:
                raise ValueError(f"lifetime cap must be between 0 and the authorised ${cfg.jarvis_lifetime_cap_usd:.0f}")
            pol.lifetime_cap_usd = v
            pol.suspend_at_usd = min(pol.suspend_at_usd, v)
        if changes.get("suspend_at_usd") is not None:
            pol.suspend_at_usd = max(0.0, min(float(changes["suspend_at_usd"]), pol.lifetime_cap_usd))
        if changes.get("daily_cap_usd") is not None:
            pol.daily_cap_usd = max(0.0, min(float(changes["daily_cap_usd"]), pol.lifetime_cap_usd))
        if changes.get("allocations") is not None:
            al = {b: max(0.0, float(changes["allocations"].get(b, (pol.allocations or {}).get(b, 0)))) for b in BUCKETS}
            if sum(al.values()) > cfg.jarvis_lifetime_cap_usd + 1e-9:   # ceilings inside the authorisation
                raise ValueError("allocations add up to more than the authorised lifetime budget")
            pol.allocations = al
        if changes.get("per_request_cap_usd") is not None:
            pol.per_request_cap_usd = {b: max(0.0, min(5.0, float(changes["per_request_cap_usd"].get(
                b, (pol.per_request_cap_usd or {}).get(b, 0))))) for b in BUCKETS}
        for flag in ("paused", "buffer_released", "notifications"):
            if changes.get(flag) is not None:
                setattr(pol, flag, bool(changes[flag]))
        pol.updated_at, pol.updated_by = utcnow(), actor[:64]
    return status()["policy"]


def record_event(kind: str, dedupe_key: str, title: str, detail: dict | None = None, severity: str = "info", game_date=None) -> bool:
    with session_scope() as s:
        r = s.execute(text(
            "insert into jarvis_events (kind, dedupe_key, game_date, severity, title, detail, occurred_at) values "
            "(:kind, :k, :gd, :sev, :t, cast(:d as jsonb), now()) on conflict (dedupe_key) do nothing"),
            {"kind": kind[:32], "k": dedupe_key[:160], "gd": game_date, "sev": severity, "t": title[:200],
             "d": json.dumps(detail or {}, default=str)})
        return r.rowcount == 1


__all__ = ["BudgetDenied", "JarvisEvent", "PRICES", "actual_cost", "assume", "estimate_tokens", "ensure_policy", "expire_stale",
           "max_cost", "record_event", "release", "reserve", "settle", "status", "update_policy"]
