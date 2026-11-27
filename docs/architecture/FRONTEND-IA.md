# GIZER NBA — front-end information architecture

Scope: `apps/web` (Next.js 15 App Router). The app is an owner-only research terminal in research /
paper-testing mode. It renders only what `API-CONTRACT.md` provides and contains no fixture data.

## 1. Navigation model (Courtside shell)

Source of truth: `apps/web/lib/nav-destinations.json` (read by `lib/nav.ts`, the shell, the All pages menu, the
phone More sheet, global search and `e2e/smoke.mjs`). **36 destinations in six groups.** Every destination that
existed in the previous shell (27 sidebar links and the 9 pages that were reachable only from Settings or the More
sheet) is in this list with the same label and the same URL; the smoke test compares the list with
`git show main:apps/web/lib/nav.ts` and clicks every one of them.

**Desktop (≥ 1024px).** A top bar: wordmark (home), the five workspaces `Today | Games | Players | Markets |
Research`, global search (`/` or Ctrl/Cmd+K), `All pages`, `Ask JARVIS` (Ctrl/Cmd+J) and the account control
(email, role, Settings, Log out). Under it, a workspace row that lists **every page of the current workspace** as
links and holds the slate date control; the current page carries `aria-current="page"`. Pages of the sixth group,
Intelligence & System, are opened from `All pages` (or search); once on one of them the workspace row lists that
whole group. Under the row sits the scoreboard strip. The `All pages` menu is a dialog with all six groups and
every page; it opens from the keyboard and holds focus.

**Phone and tablet (< 1024px).** A bottom tab bar with five items: `Today | Games | Players | Research | More`.
`More` opens a sheet with the same grouped list of every page, plus the signed-in email and Log out. The top bar
keeps the wordmark, search and `Ask`. The workspace row and the date control stay under the top bar.

**Detail pages** (`/games/[id]`, `/players/[id]`, `/teams/[id]`, `/kalshi-intelligence/[ticker]`,
`/cortex/[slug]`) show a breadcrumb `Workspace / Page / this record`, and the workspace row marks their parent.
`/login` is outside the shell.

**Titles.** Every route sets `document.title`: `Top Picks · Research · GIZER NBA`; a detail page uses its own
heading (`Detroit Pistons at Orlando Magic · Today's Games · GIZER NBA`).

**Skip link.** "Skip to content" is the first Tab stop on every page and moves focus to `<main id="main">`.

| Workspace | Label | Route | Where it was before | API |
|---|---|---|---|---|
| Today | Overview | `/` | sidebar: Command Center | `/command-center`, `/live/scoreboard`, `/player-props`, `/combos`, `/kalshi/markets?limit=1` |
|  | Daily Editions | `/research/daily` | sidebar: My Research | `/editions`, `/editions/{id}` |
| Games | Today's Games | `/games` | sidebar: Command Center | `/games` |
|  | Live Games | `/live` | sidebar: Command Center | `/live/scoreboard`, `/live/games/{id}` (leaders) |
|  | Starting Lineups | `/lineups` | sidebar: Command Center | `/lineups`, `/games/{id}/lineup-history` |
|  | Matchup Intelligence | `/matchups` | sidebar: Player Intelligence | `/games`, `/games/{id}` |
|  | Injuries & Availability | `/injuries` | sidebar: Player Intelligence | `/injuries` |
|  | My Following | `/live/following` | hidden: Settings and More sheet | `/live/watchlist` (+ `follow`, `unfollow`), `/live/milestones` |
|  | Research Tracker | `/live/research-tracker` | hidden: Settings and More sheet | `/live/research-tracker` |
| Players | Player Explorer | `/players` | sidebar: Player Intelligence | `/players`; `/players/[id]`: `/players/{id}` + `/averages`, `/threshold`, `/splits`, `/game-logs` |
|  | Player Props | `/player-props` | sidebar: Command Center | `/player-props`, `/player-props/manual`, `/players/{id}/threshold` |
|  | Minutes Intelligence | `/minutes` | sidebar: Player Intelligence | `/minutes` |
|  | Player Comparison | `/players/compare` | sidebar: Player Intelligence | `/players`, `/players/{id}`, `/averages`, `/threshold` |
|  | Historical Performance | `/players/history` | sidebar: Player Intelligence | `/players` |
|  | Teams | `/teams` | hidden: Settings and More sheet | `/teams`; `/teams/[id]`: `/teams/{id}` |
| Markets | Kalshi Markets | `/kalshi-intelligence` | sidebar: Command Center | `/kalshi/markets`; `/kalshi-intelligence/[ticker]`: `/kalshi/markets/{ticker}` |
|  | Markets | `/markets` | hidden: Settings and More sheet | `/markets` |
|  | Shared-Risk Monitor | `/exposure` | hidden: Settings and More sheet | `/exposure` |
| Research | Top Picks | `/picks` | sidebar: Command Center | `/selections` |
|  | Parlay Research | `/parlays` | sidebar: Command Center | `/combos`, `/selections` |
|  | Same-Game Research | `/parlays/same-game` | sidebar: Command Center | `/combos?category=sgp`, `/games` |
|  | Research Builder | `/builder` | sidebar: My Research | `/selections`, `/combos`, `POST /builder/evaluate`, `POST /paper/tickets` |
|  | Paper Tickets | `/tickets` | sidebar: My Research | `/paper/tickets` |
|  | Results | `/results` | sidebar: My Research | `/results` |
|  | Strategy Performance | `/performance` | sidebar: My Research | `/performance/strategies` |
|  | Simulations | `/simulations` | hidden: Settings and More sheet | `/combos` |
|  | Backtesting | `/backtesting` | hidden: Settings and More sheet | `/backtests` |
| Intelligence & System | JARVIS | `/jarvis` | sidebar: Command Center | `/jarvis/*` (`?c=`, `?tab=memory|briefings|events`) |
|  | CORTEX | `/cortex` | sidebar: Command Center | `/cortex/*` (`?tab=`); `/cortex/[slug]`: `/cortex/concepts/{slug}` |
|  | Research Lab | `/research-lab` | sidebar: System | `/research-lab` |
|  | Agent Operations | `/agents` | sidebar: System | `/agents` |
|  | Model Registry | `/models` | sidebar: System | `/models`, `/backtests` |
|  | Data Health | `/data-health` | sidebar: System | `/data-health`, `/data-health/providers` |
|  | Settings | `/settings` | sidebar: System | `/settings` |
|  | Operations Admin | `/admin` | hidden: Settings and More sheet | `/admin/*` |
|  | AI Budget | `/admin/ai-budget` | hidden: Settings and More sheet | `/admin/ai-budget` |

Shortcut (not a separate page): `JARVIS Briefings` → `/jarvis?tab=briefings`, listed under Today.

Redirects (unchanged): `/today` → `/`, `/research` → `/research/daily`, `/props` → `/player-props`. No URL was
renamed or removed in this stage.

The research notice ("Research and paper testing only. No outcome is guaranteed. No real-money execution.") is in
the page footer on every page.

## 2. Global context

* **Date.** Workspace row: previous/next-day arrows and a dropdown of `available_dates`. The selection lives in the URL
  (`?date=YYYY-MM-DD`); `DLink` carries it across pages. Historical dates show the original editions.
* **Auth.** `middleware.ts` redirects to `/login` without the `gizer_session` cookie (UX only); `lib/api.ts`
  redirects on any `401`; the CSRF token is kept in memory and restored through `/auth/me`.
* **Notice.** "Research and paper testing only. No outcome is guaranteed. No real-money execution." on every page.

## 3. Page composition

> Courtside stage one re-laid out `/`, `/live`, `/games/[id]`, `/picks`, `/kalshi-intelligence` and `/jarvis`
> (see `docs/design/aesthetic/07-APP-INTEGRATION.md` §3). The data, endpoints, query parameters and behaviours
> described below are unchanged; where a paragraph says "card", "tile" or "sidebar", read it as the ruled row,
> the typographic stat or the workspace row that replaced it. Visual rules are in `docs/design/DESIGN-SYSTEM.md`.

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

**JARVIS `/jarvis`** — status bar (mark, state pill, server message) → three columns ≥ 1024: left (new
conversation, history with confirm-delete, suggested commands, links to Memory / Briefings / Events / AI budget),
centre (Conversation · Memory · Briefings · Events tabs; conversation with streamed answers, tool activity,
model / cost / sources, composer with the deep-review toggle), right (resolved research context, this turn's tool
activity, data freshness, models, budget readout). Below 1024 the side columns open as drawers from two buttons in
the status bar. **Global assistant** — a launcher in the top bar and Ctrl/Cmd+J open a 420px right panel
(full-screen below 768px) holding the same conversation component; it creates a conversation with context from the
route (`/games/[id]`, `/players/[id]`, `/kalshi-intelligence/[ticker]`, plus page and date), reuses it while the
context is unchanged, and "Ask JARVIS" on selection and combination cards opens it with that record.
**AI Budget `/admin/ai-budget`** (owner only; linked from JARVIS, Admin and Settings) — lifetime bar with suspend
line and checkpoints, today vs daily cap, controls (emergency pause, proactive briefings, safety buffer),
allocations with an "Edit limits" form, daily spend chart, tables by model / task / agent, price table and notes,
recent requests.

**Scoreboard strip (every page, in the shell above the page content)** — "Scores" (links to `/live`) with the
count in progress, Yesterday · Today · Tomorrow, a collapse control remembered per browser
(`localStorage gizer.scoreboard.collapsed`), then one compact card per game: two team rows (logo, abbreviation,
score or "—"), status (pulsing LIVE with period and clock only for `live`/`overtime`; Halftime, End Q1, Final,
Delayed, Postponed as plain text; tipoff in ET when scheduled), a short freshness mark and a star when followed.
A card opens `/games/[id]?tab=live`. Horizontal scroll inside its own box (snap carousel on a phone). Polls
`/live/scoreboard` every 15 s while `live_count > 0`, otherwise every 60 s, and not at all while the tab is hidden.

**Live Games `/live`** — header with the date, count in progress and Previous day · Today · Next day (opens on the
date selected in the top bar when there is one) → sub-navigation (Live games · My following · Research tracker) →
sections Following, Live, Upcoming, Other (delayed / postponed), Final. Each card: status, freshness, follow
toggle, team rows with scores, line score, points leader per team when published, venue and "Game centre". The
server's `poll_note` is shown once at the foot. Empty states: no games on the date; no game has started yet.
**My following `/live/following`** — followed games, followed players with their observed line and tracking
thresholds, the threshold form (player search, statistic, value, notify), favourite teams, and the browser
notification setting (off by default; works only while the app is open). **Research tracker
`/live/research-tracker`** — paper tickets for the date, six per page; each leg shows line, current observed value
and difference, the game state and when it was observed. A leg has no outcome wording or colour until its ticket is
settled; a settled ticket shows the recorded settlement.

**Game centre `/games/[id]`** — sticky score header (teams, scores, status, freshness or "Reconnecting…", line
score, follow) → tabs `Overview | Box Score | Plays | Rotations | Research | JARVIS`, kept in `?tab=`
(`?tab=live` or no tab selects Overview once the game has started and Research before tipoff). Overview: leaders,
last plays (source wording), team comparison bars with the list of statistics the source has not published, score
progression chart with lead changes / ties / largest lead / runs, stored summaries. Box Score: one table per team
at ≥ 1024 (sticky player column, sortable headers, starters first, did-not-play rows, team totals, optional
pregame projection columns), player cards below 1024 (four main numbers, tap for the full line). Plays: filter
(All · Scoring · Fouls · Substitutions), team and player selects, grouped by period, 40 at a time with "more";
new plays are fetched with `after_sequence` when the game version changes. Rotations: per-team stint timeline and
a minutes table (per period, fouls, projected minutes, difference); a team whose stints cannot be derived shows the
server's note and no chart. Research: the pregame research page, unchanged. JARVIS: the assistant with the game
as context and four suggested questions. The header is fed by `GET /live/games/{id}/stream` (EventSource, with
credentials): on a failure it retries after 1, 2, 5, 10 s showing "Reconnecting…", falls back to reading
`/live/games/{id}` every 15 s if a stream never opens, and reconnects quietly on the server's `end` event. A higher
`version` invalidates the tab queries. While a game is in progress the row is also re-read every 30 s as a safety
net for a stream that is open but silent.

**Player page** — a "Live now" block above Averages when `/live/players/{id}` returns a game: status, link to the
game centre, the observed line, freshness, the player's tracking thresholds and a follow toggle.

**PWA** — `public/manifest.webmanifest` (name "GIZER NBA", `start_url` `/live`, standalone) and static PNG icons;
iOS home-screen meta in the root layout. There is no service worker and nothing is cached for offline use.

**CORTEX `/cortex`** — a reference library, read-only. Rule for every view: the system must never look more capable
than it is. Every count is an API value, verification status is shown on every record, and "not built" / "not
available" lists are shown in full. Header → eleven section tabs kept in `?tab=` (the row scrolls sideways on a
phone and keeps the selected tab in view).
*Overview*: eight tiles (knowledge records; sources indexed with the number opened by the author; player profiles;
team profiles; coaching profiles with the server's `coaching_note`; research findings by status; unresolved
hypotheses; last knowledge update with the number of logged library searches) → verification as one two-part bar
with both exact counts → records by kind → the 20 departments as cards (number, name, record count; a card opens
the Encyclopedia with `department=`) → the "Not built" list.
*Encyclopedia*: debounced keyword search (`q`), department / kind / verification filters, 30 rows per page; the
count line states the search method the server used (every word / any word / none). A row is the title, department,
kind · ruleset · verification chips and the summary, and links to `/cortex/[slug]`.
*Playbook*: two lists (Offense, Defense), 12 per page each, two columns from 1280px. *Statistics*: two lists
(Statistics, Methods), 10 per page each; each row shows the record's formula.
*Player DNA*: search plus the 60 players with the most minutes → profile in `?player=`: identity with what is not
held, team history, season line (per-36 values labelled "per 36"), recent 10, archetype chips each with its rule
(or the `archetype_status` text), usage with/without teammates with a small-sample marker, the tactical profile
panel ("Not available" + reason), `not_available`, notes, link to `/players/[id]`. `/players/[id]` links back with
"Profile (CORTEX)".
*Team DNA*: grid of the teams with "Profile available" / "No profile yet" → profile in `?team=`: record, ratings
(or "Not available"), shot volume, rotation block, tactical identity ("Not available" + reason), `not_available`,
notes. *Coach DNA*: the same grid; the profile shows the `coach.note` in a warning panel and only the rotation
block under "Rotation tendencies (coach not identified)".
*Research Journal*: the endpoint `note`, status filter in `?status=`, one card per finding (hypothesis, status,
sample size, supporting vs contradicting, proposed experiment, result, limitations). *Sources*: table at ≥ 1280px,
cards below; the access result is a status with "opened and read" in the normal tone and anything else in amber.
*Coverage*: department bars, by-kind bars, verification split, profile counts, "Not built"; it states that no
library-wide "observable in our data" summary is published. *Evaluations* (owner; a viewer sees the server's 403
message): "Reviewed by a person: N of M" with the `note` first, benchmark size against the target, by category /
type / split, runs (score as a percentage, cost, date, expandable misses), recent library searches, sample
questions, and `how_to_run` in a code block. Nothing on the page starts a run.
**Knowledge record `/cortex/[slug]`** — department line, title, chips, version and update time, summary, "Ask
JARVIS about this" (opens the panel with `{page}` and the question prefilled in the composer, not sent), body
paragraphs, formula block, season note, player responsibilities / common responses when present, Limitations and
When not to use, "What our data can show" beside "What we cannot see", evaluation questions, related records,
sources (external link + note). An unknown slug shows the server's not-found message.

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
27. JARVIS context `combo_id`: the UI sends the combination `uid` (the only id a `Combo` carries) and
    `selection_id` = `Selection.id`. The contract does not say which identifier `combo_id` expects.
28. The conversation list has no message count. Conversations the side panel created but that were never used
    have a null `title`; the history hides those rather than listing "Untitled" rows.
29. There is no data-freshness field in `/jarvis/state`; the right column shows `/command-center.latest_refresh_at`.
30. `GET /jarvis/tools` is not used by the UI (tool labels arrive on the stream).
31. `per_request_cap_usd` keys are not enumerated in the contract; the limits form renders whatever keys arrive.
32. Image attachments: whether a turn rejected with `invalid_image` is stored (and so appears after reload) is
    not stated; the UI shows whatever `GET /jarvis/conversations/{id}` returns.
33. `GET /jarvis/messages/{id}/images/{index}` is used directly as an `<img src>`; a failed load shows the browser's
    broken-image state (there is no error payload to display).

GIZER LIVE (added 2026-11-26):

34. Live game rows carry no team logo URL. The UI maps `abbr` to the logo from `GET /teams`; a team that is not in
    that list shows its abbreviation only.
35. `GameRow` has no per-game "next poll" or interval field. The strip uses 15 s / 60 s as the brief states and shows
    `observed_at` age; it does not claim when the next observation will arrive.
36. The stream's keep-alive is an SSE comment, which `EventSource` does not expose, so the browser cannot tell an
    open-but-silent stream from a quiet game. The UI re-reads `/live/games/{id}` every 30 s while a game is in
    progress as a safety net.
37. `tipoff_utc` arrives with a space instead of `T` in stream frames (and with `T` elsewhere); the UI parses both.
38. `GET /live/games/{id}` returns `team_stats` as a raw provider dictionary; the UI ignores it and uses
    `/team-stats` (`items`, `not_published`).
39. `on_court` stays `true` for players after a game is final. The UI shows the on-court marker only while the game
    is in progress.
40. Linescores list `0` for a period that has started but has no points yet, and the contract does not say whether a
    period that has not started is omitted or `0`; the UI renders what it is given.
41. `/live/watchlist`, `/live/milestones` and `/live/research-tracker` take `date`; a milestone's `game_date`
    defaults to the server's day. The threshold form does not offer a date.
42. Notifications: `/jarvis/events?kind=milestone_reached` has no "since" cursor; the UI keeps the last 200 shown
    event ids in `localStorage` so an event is shown once per browser.
43. `POST /live/watchlist/follow` for a viewer returns 403; the message is shown inline beside the control. The
    control is not hidden for viewers because `/auth/me` role checks are not duplicated on every card.
44. The research tracker returns every ticket for the date in one response (no `limit`/`offset`); the UI pages it
    six at a time in the browser.
45. Stream frames (`/live/games/{id}/stream`) carry `followed: false` and `favorite_team: null` for every viewer,
    while `/live/games/{id}` and the scoreboard carry the viewer's own flags. The UI takes score, clock and
    freshness from the newest frame and the follow flags from the fetched object.

GIZER CORTEX (added 2026-11-26):

46. `ConceptShort` has no `formula`, so the Statistics tab reads each visible record (`/cortex/concepts/{slug}`,
    up to 20 requests per view, cached) to show the formula in the row.
47. `kind` on `/cortex/concepts` takes one value (a comma list returns nothing), so Playbook and Statistics are two
    independent paged lists each rather than one merged list.
48. `limit` above 200 is rejected (`invalid_request`) on `/cortex/concepts` and `/cortex/players`; the contract does
    not state the bound. `/cortex/players` has no `offset`, so the list shows the top 60 by minutes and relies on
    search for everyone else.
49. `access_result` is free text. The UI treats a value starting with "opened and read" as read and anything else
    (including a missing value) as not read; a parenthetical qualifier is shown under the status.
50. `player_responsibilities`, `common_responses` and a finding's `limitations` are a string in some records and
    could be a list; the UI accepts both.
51. The overview has no library-wide count of records with a non-empty `observable_in_our_data`; the Coverage tab
    says so instead of computing one.
52. `archetype_status` is free text ("derived" observed). With `derived` and an empty `archetypes` list the UI says
    the rules matched none; any other value is shown as the reason the labels were not derived.
53. `benchmark.runs[].misses` and `by_category` have no documented shape; misses are printed as text (objects as
    JSON) and `by_category` of a run is not shown.
54. The JARVIS context for a record is `{page: "/cortex/<slug>"}` only; there is no `concept` context key, so the
    panel's "looking at" chips show the page.
55. Record text is the library's own wording. A record that contains a word from the forbidden product vocabulary
    in its basketball sense (for example a defensive term) would be shown as written; the UI does not filter it.
