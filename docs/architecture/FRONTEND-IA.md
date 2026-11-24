# GIZER NBA — front-end information architecture

Scope: `apps/web` (Next.js 15 App Router). The app is an owner-only research terminal in research /
paper-testing mode. It renders only what `API-CONTRACT.md` provides and contains no fixture data.

## 1. Navigation model (parlay-first)

Primary navigation — desktop left sidebar (collapsible to an icon rail, state kept in `localStorage`):

| # | Label | Route | API |
|---|---|---|---|
| 1 | Command Center (landing) | `/` | `/command-center` |
| 2 | Today's Games | `/games` | `/games` |
| 3 | Top Picks | `/picks` | `/selections` |
| 4 | Parlay Research | `/parlays` | `/combos`, `/selections` |
| 5 | Same-Game Research | `/parlays/same-game` | `/combos?category=sgp`, `/games` |
| 6 | Player Props | `/props` | `/selections` |
| 7 | My Paper Tickets | `/tickets` | `/paper/tickets` |
| 8 | Results | `/results` | `/results` (+ `/models`, `/teams`, `/players`, `/data-health` for filter options) |
| 9 | Performance | `/performance` | `/models`, `/backtests` |
| 10 | Research Lab | `/research-lab` | `/research-lab` |
| 11 | Agent Operations | `/agents` | `/agents` |
| 12 | Settings | `/settings` | `/settings` |

Secondary pages — sidebar "More" group, the mobile "More" sheet, the Settings page and in-page links:

| Route | Purpose | API |
|---|---|---|
| `/games/[id]` | Game research page | `/games/{id}` |
| `/builder` | Parlay research builder | `/selections`, `/combos`, `POST /builder/evaluate`, `POST /paper/tickets` |
| `/exposure` | Shared-risk monitor | `/exposure` |
| `/research/daily` | Editions list, diff, full edition | `/editions`, `/editions/{id}` |
| `/injuries` | Injury report + changes | `/injuries` |
| `/players`, `/players/[id]` | Search/table, detail (log, splits, charts) | `/players`, `/players/{id}` |
| `/teams`, `/teams/[id]` | Table, detail | `/teams`, `/teams/{id}` |
| `/markets` | Quotes per game + provider status | `/games`, `/data-health` |
| `/simulations` | Simulation metadata per combination | `/combos` |
| `/backtesting` | Backtest runs | `/backtests` |
| `/data-health` | Freshness, providers, coverage | `/data-health` |
| `/admin` | Pause toggle, readiness, heartbeats, schedule, jobs | `/operations`, `POST /operations/pause`, `/health/ready` |
| `/login` | Sign in (outside the shell) | `POST /auth/login` |

Redirects: `/today` → `/`, `/research` → `/research/daily`.

Mobile (< 768 px): sticky bottom navigation `Home | Games | Parlays | Results | More`. "More" opens a bottom
sheet with every other page and the log-out button. The persistent notice sits under the top bar on mobile and
in a fixed footer on desktop.

## 2. Global context

* **Date.** The top bar holds previous/next-day arrows and a dropdown of `available_dates` from
  `/command-center`. The selection lives in the URL (`?date=YYYY-MM-DD`); `DLink` carries it across pages and
  date-aware queries include it in their keys. Without the parameter the API decides what "today" is. Historical
  dates show the editions as originally published and are flagged in the header.
* **Auth.** `middleware.ts` redirects to `/login` when `gizer_session` is absent (UX only). `lib/api.ts`
  redirects on any `401`. The CSRF token is kept in memory and restored through `/auth/me`.
* **Notice.** "Research and paper testing only. No outcome is guaranteed. No real-money execution." is on every
  page, including `/login`.

## 3. Page composition

**Command Center** — warnings → stat strip (games, markets analyzed, qualified selections, combinations, latest
refresh, edition badge) → High-confidence research (accent-bordered; explicit message when empty) → matchup
cards → injury changes · model readiness → paper-testing summary → agent status · recent findings.

**Matchup card** — logos + abbreviations, tipoff in ET, status, research-completeness meter with missing items,
injury counts, lineup status, environment (pace / total with p10–p90 / margin / score), up to five ranked picks
or the API's `no_picks_reason`, link to the game page.

**Parlay Research** — tabs: Individual Picks · 2-Leg · 3-Leg · 4-Leg · 5-Leg · 6-Leg Experimental · Same-Game ·
Cross-Game, each with its count from `counts` (individual picks: number of qualified selections). The tab is in
the URL (`?tab=`). Empty categories render an explicit empty state.

**Builder** — desktop three columns: available selections grouped by game + "load a researched combination" ·
focused selection with evidence · current combination with live evaluation (debounced 350 ms). `reliable: false`
raises a red banner; API `warnings` are listed. On < 1024 px the third column becomes an expandable drawer fixed
above the bottom navigation. `?legs=1,2,3` preloads legs ("Open in builder" on combination cards).

**Game page** — header + completeness + environment → team comparison · lineup and injuries → top picks →
player projections → all evaluated selections (collapsed; rejected ones show their reasons) → same-game
combinations → head-to-head · quotes → agent reports · unresolved questions → injury detail.

**Results** — filter bar (date range, season, engine/size, market, classification, model version, team, player)
→ summary tiles → per-engine table (always SINGLE…SIX; "n=0 — no settled records" for empty rows) → per-structure
table → calibration chart + bucket table · equity curve → paginated ticket list (wins and losses rendered
identically) → API `disclaimer`.

**Exposure** — overlap notice → four share-bar panels (player / team / game / selection) → simulation block
placing P(at least one ticket wins) beside expected aggregate P&L → pairwise ticket dependency · shared
assumptions → API notes. Copy never describes overlapping tickets as unrelated; `independent_p_at_least_one` is
labelled "Naive figure ignoring overlap — comparison only".

## 4. Component inventory

`components/ui` (local primitives, no UI library):

| Component | Role |
|---|---|
| `Button` | primary / outline / ghost / danger, sm / md |
| `Badge`, `StaleTag` | text-labelled status chips (neutral, accent, accent-solid, warn, bad, info) |
| `Panel`, `PageHeader`, `Metric`, `BulletList` | page scaffolding |
| `DataTable` | table ≥ md, stacked label/value cards < md |
| `Tabs` | wrapping tab list with counts |
| `Sheet` | mobile bottom sheet |
| `Field`, `Input`, `Select` | form controls |
| `Pagination` | offset/limit pager |
| `Meter`, `ShareBar` | thin meters and share bars |
| `NA`, `Val` | explicit "not available" rendering |
| `Skeleton`, `LoadingState`, `EmptyState`, `ErrorState`, `QueryView` | the four data states |

Domain components:

| Component | Role |
|---|---|
| `SelectionCard`, `SelectionList`, `EvidencePanel` | the reusable selection row/card |
| `SelectionBrowser` | filterable selection list (Top Picks, Player Props) |
| `ComboCard`, `ComboDetail`, `PricingBlock` | combination research card |
| `GameMatchupCard`, `Matchup`, `EnvironmentSummary` | slate and game headers |
| `TicketCard` | paper ticket with leg results and forensic report |
| `SaveTicketButton` | `POST /paper/tickets` with inline confirmation / 409 message |
| `ClassificationBadge`, `StatusBadge` | classification and generic status labels |
| `ProbInterval`, `EvidenceMeter` | probability with interval; evidence quality 0–100 |
| `SummaryTiles`, `Tile` | summary statistics |
| `CalibrationChart`, `EquityChart`, `TrendChart` | Recharts wrappers |
| `ModelsTable`, `BacktestsTable`, `MetricsInline` | registry views |
| `ProvidersTable`, `FreshnessTable` | data health |
| `InjuryTable`, `TeamLogo` | shared bits |
| `AppShell`, `DateSelector`, `Providers`, `DisclaimerText` | shell |

## 5. Design system summary

Bloomberg-terminal density with NBA-analytics clarity.

* Surfaces `#05080f` (page) / `#0a1020` (panel) / `#0f172b` (raised); 1 px borders `#1d2942` / `#2b3a5c`.
* Text white / `#cbd5e1` / `#94a3b8`. All pass WCAG AA on the panel surface.
* Emerald `#34d399` = research / qualified / primary action. Amber `#fbbf24` = uncertainty, watchlist, stale.
  Red `#f87171` = invalidated, failed, rejected. Sky `#7dd3fc` = evidence quality and chart data.
* Colour is never the only carrier: classifications are text badges; meters have text values; charts have a
  legend and a table of the same values.
* Evidence quality (0–100, sky meter, "Evidence n/100") is visually separate from probability (bold percentage
  with a bracketed interval) because it is not a probability.
* 11–14 px type, tabular monospace numerals, 3–6 px radii, no gradients, glow, emoji or decorative animation.
* Charts: one axis, one data hue, 2 px lines, recessive grid, hover tooltip, neutral dashed reference lines.

## 6. States

| State | Rendering |
|---|---|
| Loading | skeleton blocks (`role="status"`) |
| Empty | dashed box with an explicit sentence; never filler content |
| Error | red box with the API message and HTTP status, plus Retry |
| Stale | amber tag (freshness `ok=false`, invalidated selections/combinations, missing injury timestamp) |
| Unavailable value | `—` with `title` / `aria-label` "not available" |

## 7. Contract gaps and assumptions

Nothing was invented; where the contract is silent the UI degrades instead.

1. `TeamForm` and `PlayerProj` (`GET /games/{id}`) are named but not defined. Team form is rendered as a generic
   metric-by-team table over whatever keys arrive. Player projections expect rows shaped like the
   `/players/{id}` projections (`player_name`/`name`, `team_abbr`, `stat`, `mean`, `p10`, `p50`, `p90`) and fall
   back to a generic table if `mean` is absent.
2. `research_completeness.score` has no stated unit. It is treated as 0–100; a fractional value in (0, 1) is
   scaled by 100.
3. `/teams/{id}` `team` is `TeamRef & {...}`; assumed to equal a `/teams` item.
4. `/combos`: whether `category` is required and which keys `counts` uses are not stated. The UI always sends a
   category and reads `counts` by the category names (`double` … `cross`). There is no count for individual
   picks, so that tab counts qualified selections client-side.
5. No endpoint lists valid seasons or model versions for the Results filters. Seasons come from
   `/data-health.coverage`, model versions from `/models` (assuming `id` is the `model_version_id`).
6. Nullability is unspecified for most list/detail fields (players, teams, models, agents, data health). They are
   typed nullable and rendered with the unavailable marker.
7. `GET /builder/evaluate` behaviour for fewer than two legs is unspecified; the UI evaluates only with ≥ 2 legs
   and offers a single-selection paper ticket for one leg. A six-leg cap is applied client-side.
8. The diff between editions is computed client-side from two `/editions/{id}` responses (selections matched by
   `key`, combinations by their set of leg labels) and shown beside the API's own `changes` list.
9. Exposure covers one date; there is no all-open-tickets view because the endpoint is date-scoped.
10. `stake_units` is never sent when saving a ticket (server default applies); there is no stake input.
