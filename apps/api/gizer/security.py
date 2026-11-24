"""Authentication, sessions, CSRF, roles, rate limiting, audit logging.

Owner-only by default. Sessions are server-side (only a SHA-256 of the token is stored). Passwords are
hashed with Argon2id. State-changing requests require the per-session CSRF token and a same-origin Origin.
"""
from __future__ import annotations

import hashlib
import secrets
import threading
import time
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request
from sqlalchemy import func, select

from .config import get_settings
from .db import AuditLog, SessionToken, User, session_scope, utcnow

COOKIE = "gizer_session"
_ph = PasswordHasher()
_DUMMY = _ph.hash("gizer-dummy-password-for-timing")


class ApiError(HTTPException):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(status_code=status, detail={"code": code, "message": message})


def audit(actor: str, action: str, detail: dict | None = None, ip: str | None = None):
    with session_scope() as s:
        s.add(AuditLog(actor=actor, action=action, detail=detail or {}, ip=ip))


def client_ip(request: Request) -> str:
    # Behind the single trusted reverse proxy the right-most X-Forwarded-For entry is the client.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]


def bootstrap_owner() -> str:
    cfg = get_settings()
    if not cfg.owner_email or not cfg.owner_password:
        return "GIZER_OWNER_EMAIL / GIZER_OWNER_PASSWORD not set; no owner created"
    if len(cfg.owner_password) < 12:
        return "refused: owner password must be at least 12 characters"
    with session_scope() as s:
        u = s.scalar(select(User).where(User.email == cfg.owner_email.lower()))
        if u is None:
            s.add(User(email=cfg.owner_email.lower(), password_hash=_ph.hash(cfg.owner_password), role="owner"))
            msg = "owner created"
        else:
            u.password_hash, u.role, u.active = _ph.hash(cfg.owner_password), "owner", True
            msg = "owner updated"
    audit("system", "bootstrap_owner", {"email": cfg.owner_email.lower()})
    return msg


def login(email: str, password: str, ip: str) -> tuple[str, dict]:
    cfg = get_settings()
    email = (email or "").strip().lower()[:160]
    with session_scope() as s:
        since = utcnow() - timedelta(minutes=15)
        fails = s.scalar(select(func.count()).select_from(AuditLog).where(
            AuditLog.action == "login_failed", AuditLog.ip == ip, AuditLog.created_at >= since)) or 0
        if fails >= cfg.login_max_attempts:
            raise ApiError(429, "rate_limited", "Too many failed sign-in attempts. Try again later.")
        u = s.scalar(select(User).where(User.email == email, User.active.is_(True)))
        ok = False
        try:
            ok = _ph.verify(u.password_hash if u else _DUMMY, password or "") and u is not None
        except VerifyMismatchError:
            ok = False
        except Exception:
            ok = False
        if not ok:
            s.add(AuditLog(actor=email or "unknown", action="login_failed", detail={}, ip=ip))
            s.commit()
            raise ApiError(401, "invalid_credentials", "Invalid email or password.")
        token, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(32)
        s.add(SessionToken(token_sha256=hashlib.sha256(token.encode()).hexdigest(), user_id=u.id, csrf=csrf,
                           expires_at=utcnow() + timedelta(hours=cfg.session_hours)))
        s.add(AuditLog(actor=email, action="login", detail={}, ip=ip))
        return token, {"user": {"email": u.email, "role": u.role}, "csrf": csrf}


def logout(token: str | None):
    if not token:
        return
    with session_scope() as s:
        row = s.get(SessionToken, hashlib.sha256(token.encode()).hexdigest())
        if row:
            s.delete(row)


class Principal:
    def __init__(self, email: str, role: str, csrf: str):
        self.email, self.role, self.csrf = email, role, csrf


def current_user(request: Request) -> Principal:
    token = request.cookies.get(COOKIE)
    if not token:
        raise ApiError(401, "unauthenticated", "Sign in required.")
    with session_scope() as s:
        row = s.get(SessionToken, hashlib.sha256(token.encode()).hexdigest())
        if row is None or row.expires_at <= utcnow():
            raise ApiError(401, "unauthenticated", "Session expired. Sign in again.")
        u = s.get(User, row.user_id)
        if u is None or not u.active:
            raise ApiError(401, "unauthenticated", "Sign in required.")
        p = Principal(u.email, u.role, row.csrf)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        sent = request.headers.get("x-csrf-token", "")
        if not secrets.compare_digest(sent, p.csrf):
            raise ApiError(403, "csrf", "Missing or invalid CSRF token.")
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") != get_settings().public_origin.rstrip("/"):
            raise ApiError(403, "bad_origin", "Cross-origin request rejected.")
    return p


def require_owner(p: Principal = Depends(current_user)) -> Principal:
    if p.role != "owner":
        raise ApiError(403, "forbidden", "Owner role required.")
    return p


class RateLimiter:
    """Per-process sliding-window limiter for general API traffic (login limiting is database-backed)."""

    def __init__(self, limit: int = 600, window_s: int = 60):
        self.limit, self.window, self.hits, self.lock = limit, window_s, {}, threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self.lock:
            q = [t for t in self.hits.get(key, []) if now - t < self.window]
            if len(q) >= self.limit:
                self.hits[key] = q
                return False
            q.append(now)
            self.hits[key] = q
            if len(self.hits) > 5000:
                self.hits = {k: v for k, v in self.hits.items() if v and now - v[-1] < self.window}
            return True


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store", "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    "X-Robots-Tag": "noindex, nofollow",
}
