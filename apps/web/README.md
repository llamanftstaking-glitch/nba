# GIZER NBA — web

Owner-only front end for the GIZER NBA quantitative research terminal. **Research and paper testing only.**
There is no real-money execution path anywhere in this app.

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 3 · TanStack Query 5 · Recharts 3 · lucide-react.
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
  layout.tsx, globals.css        root layout, self-hosted fonts, CSS-variable design tokens
  login/                         sign-in page (outside the shell)
  (app)/                         everything behind the shell — see docs/architecture/FRONTEND-IA.md
components/
  ui/                            local primitives (button, badge, panel, tabs, sheet, data-table, states…)
  shell/                         app shell, brand wordmark, date selector, providers, notice text
  game-card.tsx                  MatchupHeader, GameMatchupCard
  lineup-table.tsx               LineupTable
  props.tsx                      PropRow, PropCard, MarketTable, PropDrawer, ManualEntryForm
  player-history.tsx, charts.tsx PlayerHistory, HistoryBarChart and the other charts
  selection-card.tsx, combo-card.tsx, status.tsx, prob.tsx, player-avatar.tsx, …
lib/
  api.ts, types.ts               typed client and contract types
  format.ts, date.tsx, queries.ts, nav.ts, cn.ts, use-debounced.ts
middleware.ts                    session-cookie gate + runtime API proxy
e2e/
  mock-api.mjs                   dependency-free FIXTURE API (never imported by app code)
  smoke.mjs                      flow tests (1440x900, 390x844) + screenshot gallery at seven viewports
```

`SMOKE_ONLY=flows`, `SMOKE_ONLY=large` or `SMOKE_ONLY=gallery` runs one part of the smoke script. The large-slate
part switches the mock into its large mode (also available as `MOCK_LARGE=1 node e2e/mock-api.mjs`: ~1,600
selections, 68 combinations, 640 Kalshi contracts, 26 model evaluations) and fails any page taller than 12,000px at
1440 wide or 15,000px at 390 wide, or any unpaginated `/selections` request.

The application contains no fixture or mock data paths. With no API reachable every view shows its error state.

## JARVIS

`/jarvis` and the global side panel (top-bar launcher, Ctrl/Cmd+J) talk to the `/jarvis/*` API. Messages are sent
with `fetch` POST and the reply is read as `text/event-stream` from `response.body` (`lib/jarvis.ts`,
`streamMessage`); the interface shows only what the stream reports. Markdown answers are rendered by a local safe
renderer (`components/jarvis/markdown.tsx`) — no extra dependency and no HTML injection. `/admin/ai-budget` is the
owner-only spend and limits page. The API only allows GET and POST: deletes are `POST …/delete` and the budget
policy is updated with `POST /admin/ai-budget`.

The mock supports the stream, `/budget` (model `deterministic`), an error path (text containing
`trigger-budget-error`), a stream that ends early (`trigger-drop`), a `viewer@fixture.test` login and a switchable
provider state.

## Design system

Tokens, typography, breakpoints and every reusable component are documented in `docs/design/DESIGN-SYSTEM.md`.
In short: CSS variables in `app/globals.css` → Tailwind tokens in `tailwind.config.ts`; Barlow Condensed (headings)
and Inter (interface, tabular numerals) self-hosted via `@fontsource`; `lucide-react` icons; one border colour;
boxed badges only for classification, dot + label for status.

## UI rules enforced in code

* `null` renders as `—` with `title` / `aria-label` "not available" (`components/ui/na.tsx`); never `0`.
* Every data view goes through `QueryView` (skeleton → error with retry → explicit empty state → content).
* Stale data is tagged amber (`StaleTag`): freshness items with `ok=false`, invalidated selections/combinations.
* Tables use `DataTable`, which becomes stacked label/value cards below the `xl` breakpoint — no horizontal
  page scrolling at 390 or 430 px.
* Historical frequency is shown as a count ("7 of 10 over (L10)") and labelled descriptive; it never uses the
  probability component. Projected lineups are labelled "Projected — not official".
* `reference_price` is always labelled "Arithmetic product of leg prices — not a sportsbook quote"; without an
  observed quote the pricing block says "No verified combined sportsbook quote — research only".
* Vocabulary that implies certainty is not used anywhere in UI copy; the smoke test scans every page for it.

## Docker

```bash
docker build -t gizer-web --build-arg API_INTERNAL_URL=http://api:8000 .
docker run -p 3000:3000 -e API_INTERNAL_URL=http://api:8000 gizer-web
```

Multi-stage `node:22-alpine`, standalone output, runs as the non-root `nextjs` user on port 3000.
