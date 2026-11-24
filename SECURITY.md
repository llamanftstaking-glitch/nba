# Security

## Posture
Owner-only private application. No public registration, no public pages except `/login` and the two health
probes. Public exposure requires a separate owner decision (licensing, age restrictions, legal review).

## Controls (implemented and tested)
* **Authentication**: Argon2id password hashes; server-side sessions — only the SHA-256 of the session token is
  stored; `HttpOnly`, `SameSite=Strict`, `Secure` cookie; 12-hour expiry; logout deletes the session.
* **Authorization**: roles `owner` and `viewer`. Only the owner can create paper tickets, view operations, or pause jobs.
* **CSRF**: per-session token required in `X-CSRF-Token` on every mutation, plus an Origin check.
* **Rate limiting**: database-backed login limiter (8 failures / 15 min / client); per-process request limiter.
* **Headers**: HSTS, `X-Frame-Options: DENY`, `nosniff`, restrictive CSP on API responses, `no-store`, `noindex`.
* **Input validation**: pydantic on all bodies and bounded query parameters; uniform error envelope; stack traces never returned.
* **Audit log**: logins, failed logins, ticket creation, pause/resume — append-only.
* **Secrets**: only in `.env` on the server (git-ignored). `/settings` exposes booleans, never values. OpenAPI/docs are disabled in production.
* **Containers**: non-root user, read-only root filesystem, all capabilities dropped, `no-new-privileges`; the
  database has no published port and sits on an internal-only network; only the web container binds a loopback port.
* **Integrity**: append-only ledger enforced by database triggers; editions carry a SHA-256 of their content.
* **Supply chain**: exact pins + lock file; CI runs `pip-audit`, `npm audit` and gitleaks.

## Threat model (summary)

| Threat | Mitigation | Residual risk |
|---|---|---|
| Credential stuffing | Argon2id, login limiter, generic errors | Single factor. Add TOTP or put the site behind the proxy's access control / VPN. |
| Session theft | HttpOnly + Secure + SameSite=Strict, short expiry | Compromised owner device. |
| CSRF / clickjacking | Token + Origin + SameSite; frame denial | — |
| Injection | ORM parameterisation; JSON filters bound as parameters | — |
| Malicious provider payload | Schema validation; payloads are data, never executed or rendered as HTML | Stored comment text is displayed as plain text by the UI. |
| Prompt injection via external text | No LLM in any decision path; external text cannot trigger actions | Revisit if an LLM narrator is added. |
| History rewriting (insider or bug) | DB triggers, superseding rows, content hashes | A database superuser can drop triggers; restrict DB access and keep off-host backups. |
| Runaway spend | Hard quota cap, no paid provider enabled | — |
| Forged client IP for rate limiting | Proxy overwrites `X-Forwarded-For` (single hop) | Misconfigured proxy weakens the limiter. |
| Backup exposure | Backups in a Docker volume on the host | **Not encrypted, not off-host yet** — see ROADMAP. |

## Not yet done
Second factor; off-host encrypted backups; external dependency scan results (CI is defined but has not run on
GitHub yet); penetration/load testing; review of Server M host hardening (no access during this build).

Report issues privately to the owner. Do not open public issues for vulnerabilities.
