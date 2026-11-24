# GIZER NBA — web

Owner-only front end for the GIZER NBA quantitative research terminal. **Research and paper testing only.**
There is no real-money execution path anywhere in this app.

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 3 · TanStack Query 5 · Recharts 3.
Built strictly against `docs/architecture/API-CONTRACT.md`. Information architecture and the component
inventory are in `docs/architecture/FRONTEND-IA.md`.

## Commands

```bash
npm ci
npm run dev          # http://localhost:3000 (expects the API on :8000)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm run build        # production build, output: "standalone"
npm run start        # serve the production build on :3000

npm run mock-api     # dev/test only: synthetic FIXTURE API on :8000
npm run smoke        # Playwright smoke test + screenshots (needs app + mock API running)
```

Local loop without the real backend:

```bash
npm run mock-api &                 # login: owner@fixture.test / fixture-password
npm run build && npm run start &
npm run smoke                      # screenshots land in e2e/screenshots/ (gitignored)
```

The smoke script uses the **globally installed** Playwright (`require('playwright')`); Playwright is deliberately
not a project dependency. `BASE_URL` overrides the app URL, `MOCK_API_PORT` the mock port.

## API access and auth

* Every call is same-origin: `fetch('/api/v1/...', { credentials: 'include' })` through `lib/api.ts`.
* `/api/v1/:path*` is proxied to `API_INTERNAL_URL` (default `http://localhost:8000`):
  * `next.config.mjs` `rewrites()` — evaluated at **build** time (Next freezes rewrites into the build manifest);
  * `middleware.ts` — rewrites the same paths using the **runtime** value of `API_INTERNAL_URL` when it is set,
    so one standalone image can be pointed at another API host through its environment.
* `POST /auth/login` returns `csrf`; it is held in module memory only, re-fetched from `/auth/me` after a reload,
  and sent as `X-CSRF-Token` on every POST.
* Any `401` redirects to `/login?next=…`. `middleware.ts` also redirects to `/login` when the `gizer_session`
  cookie is absent. That is UX only — the API is the enforcement point.

## Structure

```
app/
  layout.tsx, globals.css        root layout, query provider, base tokens
  login/                         sign-in page (outside the shell)
  (app)/                         everything behind the shell
    page.tsx                     Command Center
    games/ games/[id]/           slate, game research page
    picks/ props/                selection browsers
    parlays/ parlays/same-game/  combination research
    builder/ exposure/ tickets/  builder, shared-risk monitor, paper ledger
    results/ performance/        paper results, model registry + backtests
    research-lab/ research/daily/ agents/ injuries/ players/ teams/
    markets/ simulations/ backtesting/ data-health/ settings/ admin/
components/
  ui/                            local primitives (button, badge, panel, tabs, sheet, data-table, states…)
  shell/                         app shell, date selector, providers, notice text
  selection-card.tsx             the reusable selection row/card + evidence panel
  combo-card.tsx                 expandable combination card, pricing block
  game-card.tsx, ticket-card.tsx, charts.tsx, summary.tsx, …
lib/
  api.ts                         typed client, CSRF handling, 401 redirect
  types.ts                       contract types
  format.ts                      formatting helpers (return null for unavailable values)
  date.tsx                       ?date= context: useSelectedDate, useSetDate, DLink
  queries.ts, nav.ts, cn.ts, use-debounced.ts
middleware.ts                    session-cookie gate + runtime API proxy
e2e/
  mock-api.mjs                   dependency-free FIXTURE API (never imported by app code)
  smoke.mjs                      smoke test + screenshots
```

The application contains no fixture or mock data paths. With no API reachable every view shows its error state.

## Design tokens

Defined in `tailwind.config.ts`.

| Token | Value | Use |
|---|---|---|
| `bg` | `#05080f` | page background |
| `panel` | `#0a1020` | panels, cards, sidebar |
| `raised` | `#0f172b` | hover, skeletons, neutral badges |
| `line` / `line-strong` | `#1d2942` / `#2b3a5c` | 1px borders |
| `ink` | `#ffffff` | primary text, values |
| `soft` | `#cbd5e1` | body text |
| `muted` | `#94a3b8` | labels, secondary text (≥ 7:1 on `panel`) |
| `accent` (+`accent-dim`) | `#34d399` | research / qualified states, primary action, active nav |
| `warn` (+`warn-dim`) | `#fbbf24` | uncertainty, watchlist, stale |
| `bad` (+`bad-dim`) | `#f87171` | invalidated, failed, rejected |
| `info` (+`info-dim`) | `#7dd3fc` | evidence-quality meter, chart series, edition badge |

* Type scale: 11 / 12 / 13 / 14 px (`text-2xs` … `text-base`); body is 13 px.
* Numbers: class `num` → monospace with `font-variant-numeric: tabular-nums`.
* Radii 3–6 px, 1 px borders, no gradients, no glow, no animation except skeleton pulse and colour transitions
  (disabled under `prefers-reduced-motion`).
* Emerald never stands alone as a signal: every classification is a text-labelled badge. Evidence quality uses the
  sky `info` hue and an "Evidence n/100" label so it cannot be read as a probability. Charts use the `info` hue for
  data and neutral slate for reference lines; emerald / amber / red stay reserved for status.

## UI rules enforced in code

* `null` renders as `—` with `title` / `aria-label` "not available" (`components/ui/na.tsx`); never `0`.
* Every data view goes through `QueryView` (skeleton → error with retry → explicit empty state → content).
* Stale data is tagged amber (`StaleTag`): freshness items with `ok=false`, invalidated selections/combinations.
* Tables use `DataTable`, which becomes stacked label/value cards below the `md` breakpoint — no horizontal
  scrolling at 375 px.
* `reference_price` is always labelled "Arithmetic product of leg prices — not a sportsbook quote"; without an
  observed quote the pricing block says "No verified combined sportsbook quote — research only".
* Vocabulary that implies certainty is not used anywhere in UI copy; the smoke test scans every page for it.

## Docker

```bash
docker build -t gizer-web --build-arg API_INTERNAL_URL=http://api:8000 .
docker run -p 3000:3000 -e API_INTERNAL_URL=http://api:8000 gizer-web
```

Multi-stage `node:22-alpine`, standalone output, runs as the non-root `nextjs` user on port 3000.
