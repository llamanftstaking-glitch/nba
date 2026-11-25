# GIZER NBA — front-end information architecture

Scope: `apps/web` (Next.js 15 App Router). The app is an owner-only research terminal in research /
paper-testing mode. It renders only what `API-CONTRACT.md` provides and contains no fixture data.

## 1. Navigation model (V3)

Desktop (≥ 1024px): left sidebar with four groups, collapsible to an icon rail.

| Group | Label | Route | API |
|---|---|---|---|
| Command Center | Overview (landing) | `/` | `/command-center`, `/player-props`, `/combos` |
| | Today's Games | `/games` | `/games` |
| | Top Picks | `/picks` | `/selections` |
| | Player Props | `/player-props` | `/player-props`, `/player-props/manual` (GET/POST/withdraw), `/players/{id}/threshold`, `/players/{id}/averages` |
| | Kalshi Markets | `/kalshi-intelligence`, `/kalshi-intelligence/[ticker]` | `/kalshi/markets`, `/kalshi/markets/{ticker}` |
| | Starting Lineups | `/lineups` | `/lineups`, `/games/{id}/lineup-history` |
| | Parlay Research | `/parlays` | `/combos`, `/selections` |
| | Same-Game Research | `/parlays/same-game` | `/combos?category=sgp`, `/games` |
| Player Intelligence | Player Explorer | `/players`, `/players/[id]` | `/players`, `/players/{id}` + `/averages`, `/threshold`, `/splits`, `/game-logs` |
| | Minutes Intelligence | `/minutes` | `/minutes` |
| | Player Comparison | `/players/compare?ids=` | `/players`, `/players/{id}`, `/averages`, `/threshold` |
| | Historical Performance | `/players/history` | `/players` (deep-links to `/players/[id]#history`) |
| | Matchup Intelligence | `/matchups` | `/games`, `/games/{id}` |
| | Injuries & Availability | `/injuries` | `/injuries` |
| My Research | Research Builder | `/builder` | `/selections`, `/combos`, `POST /builder/evaluate`, `POST /paper/tickets` |
| | Paper Tickets | `/tickets` | `/paper/tickets` |
| | Daily Editions | `/research/daily` | `/editions`, `/editions/{id}` |
| | Results | `/results` | `/results` (+ filter option sources) |
| | Strategy Performance | `/performance` | `/performance/strategies` |
| System | Research Lab | `/research-lab` | `/research-lab` |
| | Agent Operations | `/agents` | `/agents` |
| | Model Registry | `/models` | `/models`, `/backtests` |
| | Data Health | `/data-health` | `/data-health`, `/data-health/providers` |
| | Settings | `/settings` | `/settings` |

Reachable from Settings ("Operations and research tools"), the mobile "More" sheet and in-page links, but not in
the sidebar: `/admin`, `/exposure`, `/markets`, `/simulations`, `/backtesting`, `/teams`, `/teams/[id]`,
`/games/[id]`. `/login` is outside the shell.

Redirects: `/today` → `/`, `/research` → `/research/daily`, `/props` → `/player-props`.

Mobile and tablet (< 1024px): bottom navigation `Home | Games | Props | Parlays | More` (56px, safe-area padded).
"More" opens a sheet with all four groups plus the extra pages and Log out. The persistent notice sits under the
top bar; on desktop it is a fixed footer.

## 2. Global context

* **Date.** Top bar: previous/next-day arrows and a dropdown of `available_dates`. The selection lives in the URL
  (`?date=YYYY-MM-DD`); `DLink` carries it across pages. Historical dates show the original editions.
* **Auth.** `middleware.ts` redirects to `/login` without the `gizer_session` cookie (UX only); `lib/api.ts`
  redirects on any `401`; the CSRF token is kept in memory and restored through `/auth/me`.
* **Notice.** "Research and paper testing only. No outcome is guaranteed. No real-money execution." on every page.

## 3. Page composition

**Overview `/`** — branded heading → compact warnings banner (one line each) → eight summary tiles (games, markets
analyzed, qualified, combinations, lineups confirmed/projected, prop markets, latest refresh, edition) → game cards
(three across ≥ 1280) with per-team lineup status, completeness and ranked picks → player-prop research (top quoted
rows, or `props_summary.message` with a link to manual entry) · parlay category strip → High-confidence research
(honest empty state) → injury changes · paper-testing performance → operational status (agents, model readiness,
recent findings) last.

**Player Props `/player-props`** — quote-provider status → filters (search, game, team, market, lineup status,
model, quoted only) → market table (≥ 1280) or expandable cards → manual market entry (owner only) with the list of
manual entries and Withdraw. A row opens the research drawer (right drawer ≥ 768, bottom sheet below): today's
market, `PlayerHistory` with a free threshold, model projection, selection classification, "Add manual market"
(prefills the form).

**Starting Lineups `/lineups`** — per game: matchup header, lineup-history toggle, `LineupTable`.

**Player profile `/players/[id]`** — header (avatar, name, team/position/jersey, availability, lineup role and
status, next game) → averages strip (Season, L5, L10, L20 with sample sizes and small-sample flags) → today's
markets → Historical performance → distribution by window → splits → game log explorer (filters, sort, pagination,
missed games) → quantitative research (projections with intervals, forecast accuracy).

**Player Comparison** — pick 2–3 players (`?ids=`), averages for a chosen window with sample sizes, overlaid L10
values for a chosen stat. **Historical Performance** — search that deep-links to the profile history section.
**Matchup Intelligence** — per game: team form, environment, head to head.

**Game page `/games/[id]`** — A matchup header (completeness, environment, team form) → B starting lineups →
C player props (search + market filter, same drawer) → D recent player averages and projections (one compact row
per player) → E qualified research selections (≤ 5, each with a separate "Historical context (descriptive)" row;
all evaluated selections behind a toggle) → F same-game research → G reports, limitations, unresolved questions,
head to head.

**Injuries** — changes, then the feed grouped by game then team: avatar, status, previous status, source,
published and ingested times, stale tag. **Strategy Performance** — groups by market type, engine and structure
with n, settled, hit rate + CI, ROI where priced ("n=0 — no settled records" otherwise), forecast table, API
disclaimer. **Model Registry** — models and backtests. **Data Health** — warnings, freshness, provider
configuration center (status only; credentials live in the server `.env`), coverage.

Unchanged in structure, restyled: Today's Games, Top Picks, Parlay Research (eight tabs with counts), Same-Game
Research, Builder (three columns ≥ 1024, drawer below), Paper Tickets, Daily Editions (list, diff, full edition),
Results, Exposure, Research Lab, Agent Operations, Settings, Admin, Markets, Simulations, Backtesting, Teams.

**Kalshi Market Watch `/kalshi-intelligence`** — sync status (last sync, `sync.note`, stale tag) → tiles from
`counts` and `events` → filters (search, game, kind, stat/market, interpretation, sort; `?game_id=` presets the
game) → contract table (≥ 1280) or expandable cards → API notes. A row opens the market detail drawer; the same
view is routable at `/kalshi-intelligence/[ticker]`. **Market detail** — market data (title, threshold and
comparator, prices, volume, open interest, sync), price history chart with event markers and a Price / Spread /
Volume toggle ("Only one observation so far" below two points), chronological event list, contract rules verbatim,
historical results vs the threshold as counts; then, separated and labelled, independent model research
(projection, projected minutes, selections with classification / probability / break-even / rejection reasons).
Tracked-only contracts show their note and no model numbers.

**Minutes Intelligence `/minutes`** — header note (descriptive, model status, uncertainty, restrictions) → filters
(search, team, classification, sort) → table with server-side sort (≥ 1280) or expandable cards.

**Additions to existing pages** — Overview: a ninth tile "Kalshi markets" (contract count, last sync). Player
profile: "Minutes & role" and "Available Kalshi contracts" (threshold ladder per stat). Injuries is now the
Injury Intelligence Centre with a "Status changes" section (material-only toggle) above the availability feed.
Game page order: 1 matchup header · 2 game environment · 3 lineups · 4 player minutes · 5 player market
availability · 6 Kalshi market observations · 7 historical player performance · 8 injury & availability timeline ·
9 projections (expandable) · 10 research selections · 11 same-game research · 12 sources and limitations.

**Page-audit changes (2026-11-25).** Top Picks uses `GET /selections` server-side: default tab `ranked=true`
grouped by game (≤ 5 per game), then Qualified / Watchlist / Stale / Insufficient / Rejected tabs paged 25 at a
time with counts from `counts`, plus `q=` search and a game filter. Builder lists `classification=qualified` only
(grouped by game in collapsible groups, optional watchlist, `q=` search); researched combinations are collapsed and
capped. Daily Editions shows the edition list with capped change lists, the diff on the bounded edition data
(stated), and a full edition view with counts by classification, qualified rows grouped by game, a collapsed
watchlist, a 20-per-page not-qualified list with the total, and capped combinations. Models, Backtesting and
Research Lab show one compact card per item with "Details" collapsed. Comparison and History are never blank.
The injury feed is collapsed per game (slate games open, off-slate teams in one closed group). The game page
shows qualified and watchlist selections, then "+N more evaluated (not qualified)" from `selection_counts`;
Kalshi groups lead with each player's main-line contract.

## 4. Component inventory and 5. Design system

Both are maintained in `docs/design/DESIGN-SYSTEM.md` (tokens, typography, breakpoints, every reusable
component).

## 6. States

| State | Rendering |
|---|---|
| Loading | skeleton blocks (`role="status"`) |
| Empty | icon + one explicit sentence; never filler content |
| Error | red panel with the API message and HTTP status, plus Retry |
| Stale | amber dot + "stale" (freshness `ok=false`, `InjuryRow.stale`, invalidated selections/combinations) |
| Unavailable value | "—" with `title` / `aria-label` "not available" |
| Small sample | amber "Small sample" flag beside the averages it applies to |

## 7. Contract gaps and assumptions

Nothing was invented; where the contract is silent the UI degrades instead.

1. `/player-props` has no `lineup_status` or `model_ready` query parameter. Those two filters are applied
   client-side to the loaded page (50 rows), so with more than one page they do not filter the whole set.
2. `/players/{id}/game-logs` has no sort parameter. Column sorting applies to the rows on the current page only
   (stated under the table).
3. `/players/{id}/threshold` requires `line`. With no quoted line for a stat the default threshold is the L10 mean
   from `/averages`, rounded to the nearest 0.5 (labelled as such). The comparison page calls the same endpoint
   with `line=0` only to obtain the L10 game values; there is no plain "recent values" endpoint.
4. `/players` list items carry no `headshot_url`/`jersey`, so search results and the explorer show initials.
5. `PropRow` has no id. Rows are keyed by `player_id:market:game_id`.
6. `ManualEntry` → `PropRow` linkage is implicit; the UI refetches `/player-props` after create/withdraw.
7. Owner-only actions: the UI shows the manual entry form when `/auth/me` reports role `owner`. The contract does
   not list other role values.
8. `/injuries` rows without a `game_label` are grouped under "No game on this slate".
9. `/performance/strategies` has no filters; the page shows all-time groups.
10. `/data-health/providers` and `/data-health.providers` overlap. The configuration center uses the former;
    `/markets` still shows the latter's compact table.
11. `POST /builder/evaluate` now accepts one selection, but the builder still evaluates only from two legs (a
    single leg is offered as a single paper ticket instead).
12. Results filter options (seasons, model versions) still have no dedicated endpoint; they come from
    `/data-health.coverage` and `/models`.
13. The edition diff is still computed client-side from two `/editions/{id}` responses.
14. `stake_units` is never sent when saving a ticket; `observed_at` is never sent for manual entries (no field).
15. `/injuries/changes` has no `game_id` parameter; the game page filters the date's changes client-side.
16. `/minutes` has no `game_id` parameter; the game page requests the date (limit 200) and filters by `game_id`.
17. `/kalshi/markets` for one game can exceed any reasonable page (hundreds of contracts). The game page shows the
    200 highest-volume contracts grouped by stat and links to the market watch filtered by game. There is no
    grouped/summary endpoint.
18. The Kalshi "Stat / market" filter options are a fixed list of GIZER market keys; the response does not list
    the markets present.
19. `/kalshi/markets` `sort=spread` direction is unspecified; the UI sends it as-is.
20. The real `sync.note` currently contains the phrase "not a real-time feed". The UI shows the note verbatim as
    required; the phrase is a negation, but it is the one place that wording can appear.
21. `GET /players/{id}/minutes` returns 404 for an unknown player id (seen on the running backend); the profile
    block then shows the error state with Retry.
22. `GET /selections` has no "group by game" or per-game cap other than `ranked=true`; the Qualified tab is a flat
    paged list.
23. The builder needs both qualified and watchlist rows; `classification` takes one value, so the watchlist is a
    second request (limit 100). Selections beyond the first 200 qualified are reachable only through search.
24. `GET /editions/{id}` carries no per-game counts; the "qualified by game" view groups the ≤ 150 returned rows.
25. Model/backtest metric keys are free-form. Headline numbers are picked from a fixed priority list of known
    keys (`mae_ratio_vs_best_baseline`, `coverage_80`, `ece`, `brier`, …); an item with none of them shows only
    its sample size until "Details" is opened.
26. `InjuryRow.game_label` is matched against `GameCard.label` to decide which feed groups open by default.
