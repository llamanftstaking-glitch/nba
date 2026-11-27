# PROJECT AESTHETIC 01 — Frontend audit (current state)

Date: 2026-11-27 · Branch: `feature/project-aesthetic` · Scope: `apps/web` at commit `5db7bb8` (read only).

**How this was produced.** From the code (`app/`, `components/`, `lib/nav.ts`, `app/globals.css`,
`tailwind.config.ts`, `docs/design/DESIGN-SYSTEM.md`, `docs/architecture/FRONTEND-IA.md`) and from a production
build run locally against the fixture API (`e2e/mock-api.mjs`), measured with Playwright at 1440×900 and 390×844 on
28 routes. Numbers marked *measured* come from that run. The fixture slate has 3 games and 7 Kalshi contracts, so
density and page length on production data (about 5,500 contracts per slate) are **not verified** here. Class
counts are `grep` counts over `app/` and `components/` (112 files, 18,019 lines).

Status words: everything below is an observation of code that exists (VERIFIED from source or measured locally)
unless it says NOT VERIFIED.

---

## 1. Verdict in six sentences

1. The interface is one component repeated: a 12px-radius dark box with a 1px inset ring (`Panel`, `Tile`, and 58
   hand-written copies of the same class string), holding an 11px uppercase label over a value. The overview page
   renders 35 such boxes on desktop, 13 of them nested inside another box (*measured*).
2. Half of everything on screen is 11–12px text: 51.5% of visible characters on desktop and 62.1% on mobile
   (*measured*). The design system calls 11px "the floor"; in practice it is the default.
3. Uppercase is used as structure. 16.4% of visible characters on desktop and 20.0% on mobile are rendered
   uppercase (*measured*); `uppercase` appears 212 times in the source and `tracking-wide` 139 times.
4. Navigation is a flat list of 27 permanent sidebar links plus 9 more pages that are reachable only from Settings
   or the mobile "More" sheet. At least six of those destinations are different lists of the same games.
5. There is no search, no breadcrumb, and every page has the same browser title, "GIZER NBA".
6. The data honesty layer underneath (explicit "not available", origin tags, counts instead of percentages for
   history, real loading/empty/error states, table semantics) is good and must survive the redesign.

Compared with the Anthropic `frontend-design` skill's list of generated-interface traits (installed at
`.claude/skills/frontend-design/SKILL.md`), the current UI matches three of the five clusters it names: "a
near-black background with a single bright acid-green … accent" (`#060A10` + `#00E5A0`), "the SaaS-card kit:
content chopped into identical rounded cards, one border-radius on everything regardless of hierarchy", and
"a tracked-out ALL-CAPS eyebrow label above every heading; meta strings joined with middle dots". That is the
concrete meaning of "looks AI-generated" for this codebase.

---

## 2. Route inventory

42 pages: 41 inside the shell (`app/(app)`) and `/login`. "Nav" = where the link lives today.

| # | Route | Page title shown | Nav today | Purpose (from the code) |
|---|---|---|---|---|
| 1 | `/` | Command Center | Sidebar "Overview" | Slate landing: warnings, 9 stat tiles, game cards, prop rows, parlay strip, injuries, paper performance, system status |
| 2 | `/live` | Live Games | Sidebar | Observed scores for a date, grouped Following / Live / Upcoming / Other / Final |
| 3 | `/live/following` | My Following | Sub-nav on `/live`, More sheet | Followed games, player watchlist with thresholds, favourite teams, notification setting |
| 4 | `/live/research-tracker` | Research Tracker | Sub-nav on `/live`, More sheet | Open paper tickets beside observed values per leg |
| 5 | `/jarvis` | (sr-only h1) | Sidebar | Assistant: conversation, memory, briefings, events (`?tab=`) |
| 6 | `/cortex` | CORTEX | Sidebar | Knowledge library with 11 tabs (`?tab=`) |
| 7 | `/cortex/[slug]` | record title | from `/cortex` | One knowledge record |
| 8 | `/games` | Today's Games | Sidebar | The slate again as detailed game cards |
| 9 | `/games/[id]` | matchup | from any game card | Game centre: Overview, Box Score, Plays, Rotations, Research, JARVIS (`?tab=`) |
| 10 | `/picks` | Top Picks | Sidebar | Selections: ranked, qualified, watchlist, stale, insufficient, rejected |
| 11 | `/player-props` | Player Props | Sidebar | Prop market table, research drawer, manual entry |
| 12 | `/kalshi-intelligence` | Kalshi Market Watch | Sidebar "Kalshi Markets" | Kalshi contract table with filters and detail drawer |
| 13 | `/kalshi-intelligence/[ticker]` | (sr-only h1) | from the table | The drawer content as a page |
| 14 | `/lineups` | Starting Lineups | Sidebar | Lineup table per game |
| 15 | `/parlays` | Parlay Research | Sidebar | Combinations in 8 tabs, the first of which is individual picks again |
| 16 | `/parlays/same-game` | Same-Game Research | Sidebar | The `sgp` category of `/parlays`, grouped by game |
| 17 | `/players` | Players | Sidebar "Player Explorer" | Player directory with averages |
| 18 | `/players/[id]` | player name | from lists | Profile: averages, markets, history, distribution, splits, game log, research, minutes, Kalshi ladder |
| 19 | `/players/compare` | Player Comparison | Sidebar | 2–3 players side by side |
| 20 | `/players/history` | Historical Performance | Sidebar | A search box that links to `/players/[id]#history` |
| 21 | `/minutes` | Minutes Intelligence | Sidebar | Slate minutes table |
| 22 | `/matchups` | Matchup Intelligence | Sidebar | Per game: team form, environment, head to head |
| 23 | `/injuries` | Injury Intelligence Centre | Sidebar "Injuries & Availability" | Status changes and the availability feed |
| 24 | `/builder` | Research Builder | Sidebar | Assemble and evaluate a combination; save as paper ticket |
| 25 | `/tickets` | My Paper Tickets | Sidebar "Paper Tickets" | Saved paper tickets |
| 26 | `/research/daily` | Daily Research Editions | Sidebar "Daily Editions" | Editions for the date, diff, full edition |
| 27 | `/results` | Results | Sidebar | Settled tickets, calibration and equity charts |
| 28 | `/performance` | Strategy Performance | Sidebar | Hit rate / ROI by market, engine, structure |
| 29 | `/research-lab` | Research Lab | Sidebar | Hypotheses, experiments, correlations |
| 30 | `/agents` | Agent Operations | Sidebar | Job/agent status |
| 31 | `/models` | Model Registry | Sidebar | Models and their backtests |
| 32 | `/data-health` | Data Health | Sidebar | Providers, freshness, coverage |
| 33 | `/settings` | Settings | Sidebar | Read-only server configuration and links to hidden pages |
| 34 | `/admin` | Operations Admin | Settings, More sheet | Owner controls (pause jobs), readiness |
| 35 | `/admin/ai-budget` | AI Budget | JARVIS, Admin, Settings | Lifetime AI budget, allocations, spend |
| 36 | `/exposure` | Shared-Risk Monitor | Settings, More sheet | Shared risk across combinations |
| 37 | `/markets` | Markets | Settings, More sheet | Verified quotes per game and provider status |
| 38 | `/simulations` | Simulations | Settings, More sheet | Simulation metadata per combination |
| 39 | `/backtesting` | Backtesting | Settings, More sheet | Backtest runs (also shown inside `/models`) |
| 40 | `/teams` | Teams | Settings, More sheet | Team list |
| 41 | `/teams/[id]` | team name | from `/teams` | Team detail |
| 42 | `/login` | — (no h1) | outside the shell | Sign-in |

Redirects in `next.config.mjs`: `/today` → `/`, `/research` → `/research/daily`, `/props` → `/player-props`.

---

## 3. Navigation as it is

Source: `apps/web/lib/nav.ts`, `apps/web/components/shell/app-shell.tsx`.

* **27 permanent sidebar destinations** in four groups: Command Center 11, Player Intelligence 6, My Research 5,
  System 5. At 1440×900 the list does not fit: the sidebar scrolls (`overflow-y-auto` with the scrollbar hidden by
  `no-scrollbar`, `app-shell.tsx:116`), so the last groups are below the fold with no visual hint that more exists.
* **9 further pages** (`EXTRA_PAGES`) are not in the sidebar. On desktop the only way to reach `/exposure`,
  `/markets`, `/simulations`, `/backtesting`, `/teams` is the link list at the bottom of Settings.
* **Mobile:** 4 fixed tabs (Home, Games, Props, Parlays) and "More", which opens a sheet with **36 links** in a
  two-column grid (*measured*: 36 anchors in the sheet).
* **Keyboard:** 43 Tab presses are needed to get from the top of the page to the first control in the main content
  at desktop width (*measured* on `/player-props`). There is no skip link.
* **No search.** `components/player-search.tsx` is a player picker used inside three pages; nothing searches pages,
  games, teams or contracts.
* **No breadcrumbs.** Detail pages have at most a hand-placed back link (`kalshi-intelligence/[ticker]/page.tsx:15`).
* **Every page title is "GIZER NBA".** `app/layout.tsx:16` defines a title template, but every page is a client
  component and none sets a title (*measured*: one distinct `document.title` across 28 routes). Browser history and
  tabs are unusable for orientation.
* **Names disagree with themselves.** Sidebar "Overview" opens a page titled "Command Center"; the group that
  contains it is also "Command Center"; the brand caption is "Parlay Command Center". "Kalshi Markets" → "Kalshi
  Market Watch" → URL `kalshi-intelligence`. "Injuries & Availability" → "Injury Intelligence Centre".
  "Paper Tickets" → "My Paper Tickets". "Player Explorer" → "Players". Five destinations carry the word
  "Intelligence" and three carry "Research", which stops either word from distinguishing anything.
* **Order is by build date, not by use.** The first three sidebar items are the three most recently built features
  (Live, JARVIS, CORTEX); the landing page is fourth.

### 3.1 Pages that are views of the same thing

| The underlying thing | Destinations that list it today | Count |
|---|---|---|
| The slate's games | scoreboard strip (every page), `/` game cards, `/games` (same `GameMatchupCard`), `/matchups`, `/lineups`, `/live` | 6 |
| One game | `/games/[id]` with 6 tabs; "Research" tab is the old page; `/matchups` and `/lineups` show slices of it | 1 page + 2 slices |
| Evaluated selections | `/picks`, `/parlays` tab "Individual Picks", `/builder` qualified list, `/research/daily` edition body, game page | 5 |
| Combinations | `/parlays` (8 tabs), `/parlays/same-game` (= the `sgp` tab), `/simulations` (their metadata), `/exposure` (their shared risk) | 4 |
| A player | `/players`, `/players/[id]`, `/players/history` (a search box only), `/players/compare`, `/minutes`, CORTEX "Player DNA" | 6 |
| Market prices | `/player-props`, `/kalshi-intelligence`, `/markets` | 3 |
| Paper tickets | `/tickets` (open), `/results` (settled), `/performance` (aggregated), `/live/research-tracker` (in progress) | 4 |
| Models | `/models`, `/backtesting` (already embedded in `/models`), `/research-lab` | 3 |
| Operations | `/agents`, `/admin`, `/data-health`, `/settings`, `/admin/ai-budget` | 5 |

37 of the 41 shell pages fall into nine subjects. That is the navigation: nine subjects, not 36 links.

---

## 4. Proposed navigation architecture

Six workspaces in the primary navigation. Each has a secondary navigation (a tab row under the page title, kept in
the URL path), a breadcrumb on any page deeper than a workspace root, and one global search. Nothing is removed;
every current route keeps working through a redirect.

| Workspace | Root | Secondary navigation | What it answers |
|---|---|---|---|
| **Today** | `/` | Slate · Scores · Lineups · Injuries | What is happening on this date |
| **Players** | `/players` | Directory · Minutes · Compare | Who is this player and what has he done |
| **Markets** | `/markets` | Player props · Kalshi · Quotes and providers | What is listed and at what observed price |
| **Research** | `/research` | Picks · Combinations · Builder · Editions · Tickets · Performance | What did the models conclude and how has it done |
| **Assistant** | `/jarvis` | Conversation · Memory · Briefings · Events · Library (CORTEX) | Ask, and look things up |
| **System** | `/system` | Operations · Models · Data health · AI budget · Settings | Is the machinery healthy |

Rules:

* **Primary navigation** = six items. Desktop: a narrow left rail or a top bar (the prototypes decide which); either
  way all six are visible without scrolling. Mobile: bottom bar `Today · Players · Markets · Research · More`, where
  "More" holds Assistant, System and Log out (5 items, not 36).
* **Secondary navigation** = links (`<a>`, each a real URL), not client-state tabs, so that the back button,
  reload and deep links work. Maximum seven items.
* **Detail pages** keep an in-page tab row for their own sections (game: Overview · Box score · Plays · Rotations ·
  Research; player: Overview · History · Game log · Minutes · Markets · Profile).
* **Breadcrumb** on every page below a workspace root: `Today / LAL @ DEN / Box score`, `Markets / Kalshi /
  KXNBA-…`, `Players / Name / History`. It replaces the hand-placed back links.
* **Search** (`/` or Ctrl/Cmd+K, plus a visible field in the top bar): players (existing `/players?q=`), teams,
  today's games, Kalshi contracts (existing `/kalshi/markets?q=`), pages by name, CORTEX records (existing
  `/cortex/concepts?q=`). All of these endpoints exist; search needs no new backend for a first version.
  Ctrl/Cmd+J stays the JARVIS shortcut.
* **Date** stays global in the top bar and in the URL (`?date=`), as now. It applies to Today, Markets and
  Research; Players, Assistant and System ignore it and should not show it as if it filtered them.
* **Page titles:** every route sets `document.title` (`Kalshi · Markets · GIZER NBA`).
* **One name per thing.** The label in the navigation, the page heading, the breadcrumb and the URL segment are the
  same word.

### 4.1 Full mapping: old route → new place

Proposed URLs are a recommendation; if the owner prefers to keep current URLs, the grouping still applies and only
the navigation changes. "Redirect" means a non-permanent entry in `next.config.mjs` so that bookmarks, JARVIS deep
links and the smoke test's old paths keep resolving.

| Old route | New place | Proposed URL | Change |
|---|---|---|---|
| `/` | Today › Slate | `/` | Keeps the slate, lineup status, top picks per game. Loses the 9 tiles and the system-status block (moved to System › Operations) |
| `/games` | Today › Slate | `/` | Merged: it is the same card list. Redirect |
| `/live` | Today › Scores | `/scores` | Redirect from `/live` |
| `/live/following` | Today › Scores › Following | `/scores/following` | Redirect |
| `/live/research-tracker` | Research › Tickets › In progress | `/research/tickets/live` | Redirect; it is about tickets, not about scores |
| `/games/[id]` | Today › game | `/games/[id]` | Unchanged URL; breadcrumb added; `?tab=` kept |
| `/matchups` | Game › Overview (per game) and Today › Slate (team form column) | — | Page retired; its three blocks already exist on the game page. Redirect to `/` |
| `/lineups` | Today › Lineups | `/lineups` | Unchanged URL |
| `/injuries` | Today › Injuries | `/injuries` | Unchanged URL; heading becomes "Injuries" |
| `/players` | Players › Directory | `/players` | Unchanged |
| `/players/[id]` | Players › player | `/players/[id]` | Unchanged; sections become tabs with URLs (`/players/[id]/history` …) |
| `/players/history` | Players › player › History | — | Page retired (it is only a search box); global search covers it. Redirect to `/players` |
| `/players/compare` | Players › Compare | `/players/compare` | Unchanged; also reachable from a "Compare" action on a profile |
| `/minutes` | Players › Minutes | `/players/minutes` | Redirect |
| `/teams`, `/teams/[id]` | Players › Teams (fourth secondary item, or search only) | `/teams`, `/teams/[id]` | Unchanged URL; finally linked from navigation |
| `/player-props` | Markets › Player props | `/markets/props` | Redirect (also the existing `/props` redirect) |
| `/kalshi-intelligence` | Markets › Kalshi | `/markets/kalshi` | Redirect |
| `/kalshi-intelligence/[ticker]` | Markets › Kalshi › contract | `/markets/kalshi/[ticker]` | Redirect |
| `/markets` | Markets › Quotes and providers | `/markets/quotes` | Redirect; `/markets` becomes the workspace root (props by default) |
| `/picks` | Research › Picks | `/research/picks` | Redirect |
| `/parlays` | Research › Combinations | `/research/combinations` | Redirect; the "Individual Picks" tab is dropped (it is Picks) |
| `/parlays/same-game` | Research › Combinations, filter "same game" | `/research/combinations?category=sgp` | Redirect |
| `/simulations` | Research › Combinations › a combination › "Simulation" section | — | Page retired as a destination; content shown where the combination is. Redirect to combinations |
| `/exposure` | Research › Combinations › Shared risk | `/research/combinations/shared-risk` | Redirect |
| `/builder` | Research › Builder | `/research/builder` | Redirect |
| `/research/daily` | Research › Editions | `/research/editions` | Redirect (and `/research` → picks instead of editions) |
| `/tickets` | Research › Tickets › Open | `/research/tickets` | Redirect |
| `/results` | Research › Tickets › Settled | `/research/tickets/settled` | Redirect |
| `/performance` | Research › Performance | `/research/performance` | Redirect; the calibration and equity charts from `/results` move here |
| `/jarvis` | Assistant | `/jarvis` | Unchanged; `?tab=` becomes path segments |
| `/cortex`, `/cortex/[slug]` | Assistant › Library | `/library`, `/library/[slug]` | Redirect; 11 tabs regrouped to at most 7 (Sources, Coverage, Evaluations fold under "About the library") |
| `/agents` | System › Operations | `/system` | Redirect |
| `/admin` | System › Operations (owner controls section) | `/system` | Merged with agents: same subject, two pages. Redirect |
| `/models` | System › Models | `/system/models` | Redirect |
| `/backtesting` | System › Models › Backtests | `/system/models#backtests` | Merged (already embedded). Redirect |
| `/research-lab` | System › Models › Research lab | `/system/models/lab` | Redirect |
| `/data-health` | System › Data health | `/system/data` | Redirect |
| `/admin/ai-budget` | System › AI budget | `/system/ai-budget` | Redirect; still linked from the assistant |
| `/settings` | System › Settings | `/system/settings` | Redirect; the "Operations and research tools" link list disappears because nothing is hidden any more |
| `/login` | outside | `/login` | Unchanged |

Result: 27 sidebar links + 9 hidden pages → 6 primary + at most 7 secondary per workspace. Four pages stop being
destinations (`/games` list, `/matchups`, `/players/history`, `/simulations`) because their content already lives
elsewhere; no capability is lost. Checks to carry out during migration: the smoke test's `NAV` and `OTHER` arrays
(`e2e/smoke.mjs:47-48`), JARVIS deep links produced by `gizer/jarvis_tools.py` (NOT VERIFIED which paths the tools
emit), and `FRONTEND-IA.md`.

---

## 5. Where the owner's prohibited patterns occur

Counts are source occurrences unless marked *measured*.

### 5.1 Endless identical cards

* `Panel` (`components/ui/panel.tsx:15-50`) is used **129 times**. Its class string
  `rounded-lg bg-card ring-1 ring-inset ring-line/60` is additionally written by hand in **58** places (lines
  combining `bg-card` with `ring-1` outside `panel.tsx`), e.g. `components/summary.tsx:11` (`Tile`), `components/kalshi.tsx:97` (`KalshiCard`),
  `app/(app)/kalshi-intelligence/page.tsx:57` (filter bar), `app/(app)/players/page.tsx:56`,
  `app/login/page.tsx:77`.
* `Tile` (`components/summary.tsx:9`): icon + 11px uppercase label + 22px number + 12px sub-line. Nine in a 3×3
  grid at the top of `/` (`app/(app)/page.tsx:127-190`), four on `/kalshi-intelligence` (`page.tsx:47-54`), seven
  on `/results` (`summary.tsx:53-76`), eight on CORTEX overview (`components/cortex/overview.tsx`). On `/` the
  nine tiles occupy the first 280px below the heading and three of them restate the navigation ("Games 3",
  "Combinations 5", "Kalshi markets 7 contracts").
* *Measured* boxes (radius ≥ 6px, with fill or ring, larger than 120×40px) per page, desktop / mobile: `/` 35 / 37,
  `/cortex` 34 / 36, `/results` 22 / 48, `/players/[id]` 21 / 49, `/games/[id]` 20 / 30, `/admin/ai-budget`
  19 / 36, `/player-props` 8 / 35. Below 1280px every table row becomes its own box
  (`components/ui/data-table.tsx:82`), which is why mobile counts are higher.
* Boxes inside boxes (*measured*, mobile): `/players/[id]` 31, `/results` 30, `/player-props` 28,
  `/admin/ai-budget` 19, `/research/daily` 15. Source: `bg-raised` inner surfaces, 147 occurrences.

### 5.2 Excessive rounded containers and borders

* 271 `rounded*` classes: `rounded-md` 135, `rounded-lg` 62, `rounded-full` 42, `rounded` 18, others 14.
* 118 `ring-1` and 90 `border*` classes. The design system says "One border colour, used sparingly"
  (`DESIGN-SYSTEM.md` §1); it is one colour, but it is on almost every container.
* Heaviest files: `components/live/game-center.tsx` (18 rounded), `components/jarvis/conversation.tsx` (18),
  `components/cortex/reference.tsx` (13), `app/(app)/jarvis/page.tsx` (12), `components/kalshi.tsx` (10).
* The borders do not even do their job: the ring colour against a card is **1.19:1** at the `/60` opacity used
  (see `09-ACCESSIBILITY-FINDINGS.md`), and card against page is 1.10:1. Structure is drawn with lines that are
  nearly invisible, so more of them were added.

### 5.3 Glowing green outlines

* The glow token: `tailwind.config.ts:48` `boxShadow.accent = 0 0 0 1px accent/0.35, 0 0 18px -6px accent/0.55`.
* Used on the active sidebar item (`components/shell/app-shell.tsx:35`), every primary button
  (`components/ui/button.tsx:8`), the overview call to action (`app/(app)/page.tsx:104`), and the JARVIS send
  button (`components/jarvis/conversation.tsx:452`). *Measured*: 40 glowing elements across 56 page renders, i.e.
  at least one on every page (the active nav item).
* Green outlines without glow: active tab `ring-accent/50` (`components/ui/tabs.tsx:38`), accent badge
  `ring-accent/40` (`components/ui/badge.tsx:8`), accent panel `ring-accent/35` (`components/ui/panel.tsx:34`),
  followed-game chip (`components/live/common.tsx:101`), scoreboard card (`components/live/scoreboard-strip.tsx:16`),
  CORTEX selection cards (`components/cortex/overview.tsx:109`, `profiles.tsx:246`, `283`), the active mobile "More"
  item (`app-shell.tsx:218`). 16 `ring-accent` + 2 `border-accent` in total.
* Accent is also the colour of 49 files' worth of leading icons (`Panel` icon default `text-accent`,
  `panel.tsx:35`; `Tile` icon, `summary.tsx:12`; the double-slash mark before every page title and section,
  `panel.tsx:6`, `57`, `72`). The design system's "one restrained emerald accent" is, in practice, on screen 15–30
  times per page.

### 5.4 Uppercase micro-metadata

* `uppercase` 212 occurrences; with `text-2xs` (11px) 159; with `tracking-wide` 139; `tracking-[0.12em]` 4.
* It is built into the primitives, so it cannot be avoided by page authors: `Label` (`panel.tsx:106`), `Metric`
  (`panel.tsx:84`), `Field` label (`field.tsx:10`), `Badge` (`badge.tsx:20`), `DataTable` header and mobile `dt`
  (`data-table.tsx:55`, `95`), `Panel` and `SectionTitle` headings (`panel.tsx:40`, `71`), `PageHeader`
  (`panel.tsx:56`, uppercase *italic*), `Sheet` title (`sheet.tsx:51`), sidebar group titles (`app-shell.tsx:122`).
* Heaviest files: `components/live/game-center.tsx` 26, `components/props.tsx` 16, `components/minutes.tsx` 14,
  `app/(app)/players/[id]/page.tsx` 13, `components/cortex/reference.tsx` 11.
* *Measured* share of visible characters that are uppercase: `/performance` mobile 44%, `/results` mobile 33%,
  `/admin/ai-budget` mobile 32%, `/agents` mobile 31%, `/players` mobile 29%; average 16% desktop, 20% mobile.

### 5.5 Monospace overuse

* **Not present.** 4 `font-mono` uses, all for genuinely code-like text in CORTEX
  (`components/cortex/reference.tsx:307`, `409`; `common.tsx:107`; `profiles.tsx:47`). Numbers use Inter with
  tabular figures (`.num`, `globals.css:51`; 383 uses). *Measured*: 96% of characters are Inter, 4% Barlow
  Condensed, 0% monospace on the 28 routes. Keep this.
* Related problem that *is* present: the declared mono family "Geist Mono" (`tailwind.config.ts:36`) is not
  installed or self-hosted, so those four places fall back to the system monospace.

### 5.6 Tiny type

* *Measured* distribution of visible characters by computed size:

  | Size | Desktop | Mobile |
  |---|---|---|
  | 11px | 14.3% | 23.1% |
  | 12px | 37.2% | 39.0% |
  | 14px (desktop body) / 15px (mobile body) | 44.1% | 33.4% |
  | 16–22px | 3.6% | 3.8% |
  | 26px and up | 0.8% | 0.6% |

  More than half of the text is below the body size, and nothing sits between 22px and the 30–34px page title: there
  is no usable middle of the scale.
* Source: `text-xs` (12px) 419 uses is the single most used size class, ahead of `text-sm` (378). `text-2xs` (11px)
  159, plus 10 literal `text-[11px]`.
* Body text is 14px on desktop (`globals.css:26-32`), smaller than on mobile (15px). On a 1440–1920px display the
  primary reading size is the smallest it ever gets.
* The smoke test asserts that nothing renders below 11px (`DESIGN-SYSTEM.md` §3). The assertion protects the floor
  and has become the target.

### 5.7 Unnecessary badges and icons

* Icons: 49 files import `lucide-react`; 32 distinct icons in `lib/nav.ts` alone, one per navigation link. Every
  `Panel` title, `SectionTitle`, `Tile` and `EmptyState` takes an icon. *Measured* visible SVGs per desktop page:
  68 on `/`, 65 on `/games/[id]`, 56 on `/kalshi-intelligence`, minimum 37 (the shell alone contributes about 35:
  27 nav icons, brand mark, date arrows, JARVIS mark, log out, footer mark).
* None of the navigation icons is conventional enough to be read without its label (e.g. `Swords` for matchups,
  `Wrench` for the builder, `Boxes` for models, and `Radio` reused for three different pages). They are
  decoration that costs a 252px sidebar.
* Badges are more restrained than the icons: `Badge` 28 uses and `StatusDot` 25 uses in source, reserved for
  classification as the design system says. *Measured* pill-like elements: 9 on `/`, 23 on `/research/daily`.
  The issue is not the count but that all six classifications use the same boxed uppercase 11px pill, and that
  "Tracked only" (`components/kalshi.tsx:59-71`) repeats on every unsupported row.
* The brand double-slash (`SlashMark`) appears before the wordmark, before every page title, before every
  icon-less section title and in the footer: four to eight times per page.

### 5.8 Large empty boxes

* `EmptyState` (`components/ui/states.tsx:26-34`) is a centred 24px-padded filled box with an icon; 113 call sites.
  A section with no data therefore keeps its full card, its heading, its icon and a second box inside it that says
  nothing is there. *Measured* on the fixture: present on `/`, `/games/[id]?tab=boxscore`, `/builder`.
* `LoadingState` (`states.tsx:14-23`) draws grey bars of fixed 40px height in a fixed 1-1-⅔ width pattern
  regardless of what will load, so the skeleton never matches the content that replaces it; on the Kalshi page it
  is the only thing below the filter bar until the request returns (see `05-KALSHI-PAGE-DIAGNOSIS.md`).
* Tiles with one short value stretch to a third of the content width (`app/(app)/page.tsx:127`: "Games 3" occupies
  a box of about 375×86px at 1440px, read off a screenshot).
* Content is capped at 1640px (`app-shell.tsx:159`) but most pages are a single column of full-width panels, so at
  1920px a panel holding three lines of text is 1,600px wide.
* On production volumes several of these would invert (too much, not too little). NOT VERIFIED here.

---

## 6. Typography and spacing actually in use

### Type

| Token / class | Size / line height | Uses | Role in practice |
|---|---|---|---|
| `text-2xs`, `text-[11px]` | 11 / 15 | 169 | labels, table headers, badges, nav group titles, disclaimer |
| `text-xs` | 12 / 17 | 419 | metadata, sub-lines, pagination, notes, most secondary text |
| `text-[13px]` | 13 | 2 | CORTEX code blocks |
| `text-sm`, `text-base` | `--fs-body` 14 desktop / 15 mobile, 1.45–1.5 | 396 | body, table cells, controls |
| `text-[15px]` | 15 | 15 | one-off emphasis |
| `text-lg` | 16 / 23 | 24 | card titles |
| `text-[17px]` | 17 | 14 | panel and section headings (Barlow Condensed) |
| `text-xl` … `text-[26px]` | 20, 22, 24, 26 | ~22 | tile values, scores |
| `text-[30px]` / `text-[34px]` | 30 / 34 | 3 each | page title |
| `text-[44px]` / `text-[52px]` | 44 / 52 | 2 each | live score header |

14 distinct sizes; 55 arbitrary `text-[Npx]` values bypass the scale. Two families: Inter (400/500/600/700) and
Barlow Condensed (600/700, upright and italic) for headings, always uppercase. Weights in source: `font-semibold`
309, `font-medium` 171, `font-normal` 14, `font-bold` 7 — semibold is the default emphasis and therefore emphasises
nothing.

### Spacing

Tailwind's 4px base with half steps. Most used: `gap-2` 121, `py-2` 104, `mt-2` 86, `gap-3` 85, `px-3` 80,
`px-2` 69, `mt-1` 59, `gap-1.5` 55, `py-1.5` 49, `mt-3` 49, `gap-4` 47, `p-4` 45, `p-3` 39, `space-y-4` 39.
In pixels the working set is 2, 4, 6, 8, 10, 12, 14, 16, 20. Six of those nine values are within 8px of each other,
so there is one spacing rhythm ("a bit") and no distinction between "inside a group", "between groups" and
"between sections". Page sections are separated by `space-y-5` (20px) while cards are padded 16px: the gap between
unrelated sections is almost the same as the padding inside one.

### Shape and colour

Radii 6 / 8 / 12px plus full. One shadow (the glow). 14 colour tokens, of which the page uses, in order of area:
five near-identical dark navy surfaces (`#060A10`, `#0A1119`, `#0D1720`, `#121F2B`, border `#22313E`; maximum
contrast between any two adjacent surfaces is 1.10:1), four text greys, and four signal colours.

---

## 7. What is good and should be kept

1. **Explicit "not available".** `NA` / `Val` (`components/ui/na.tsx`) render a dash with an accessible label
   instead of a zero or a blank; used everywhere a value can be null. This is a hard project rule and the
   implementation is correct.
2. **Uniform query states.** `QueryView` (`states.tsx:60-77`) gives every data block loading, error (with HTTP
   status and Retry) and empty handling. The pattern stays; its visuals change.
3. **Three kinds of number kept apart.** `ProbabilityDisplay` (`components/prob.tsx`), `Meter` for evidence
   (`ui/meter.tsx`), `HistFrequency` as counts (`components/props.tsx`). The redesign must keep three visibly
   different treatments.
4. **Origin and status labelling.** `OriginTag`, `LineupStatusLabel` ("Projected — not official"),
   `FreshnessIndicator`, `StaleTag` (`components/status.tsx`). Text carries the meaning, colour only supports it.
5. **Tabular figures without monospace** (`.num`).
6. **Real tables.** `DataTable` and the hand-written tables have `<caption>`, `<th scope>`, and `aria-sort` where
   sortable (`players/[id]/page.tsx:148`, `minutes.tsx:200`). *Measured*: every visible table has a caption and
   scoped headers.
7. **Charts with text alternatives.** Each chart wrapper is `role="img"` with a sentence and a table elsewhere on
   the page (`components/charts.tsx:74`, `114`, `143`, `199`, `243`, `299`).
8. **Tokens in one place.** CSS variables in `globals.css`, mapped once in `tailwind.config.ts`. A new palette is a
   change to one file plus the removal of hard-coded sizes.
9. **Self-hosted fonts, no network at build** (`app/layout.tsx:4-12`).
10. **Global date in the URL** (`lib/date.tsx`, `DLink`) and filters as query parameters on several pages.
11. **Touch targets on mobile.** Buttons, tabs, inputs and sheet controls grow to 44px below `md`
    (`button.tsx:15-18`, `field.tsx:5`). *Measured* on mobile: 3–14 controls per page under 44px, mostly inline
    text links.
12. **Reduced motion honoured globally** (`globals.css:80-85`; *measured*: 0 running animations and 0 transitions
    with the preference set).
13. **No horizontal page scroll** at 390px or 1440px on any of the 28 routes (*measured*).
14. **Visible keyboard focus** on links and buttons (2px accent outline, `globals.css:56-59`).
15. **Honest product copy.** Notes such as "First observed is this system's first observation today, not an
    official opening price" and "Polled periodically — not a continuous feed" are specific and true. Keep the
    sentences; stop setting them in 11–12px grey.
16. **The smoke test** (`e2e/smoke.mjs`, 2,894 checks per PROJECT-STATE) including the forbidden-vocabulary scan.
    It is the safety net for the migration and should be extended, not replaced.

---

## 8. Not verified

* Appearance and density with production data volumes (5,500 Kalshi contracts, thousands of selections).
* Any authenticated page on Server M; nothing here was observed in production.
* Behaviour between 391px and 1439px other than what the code states.
* Which deep links JARVIS tools generate, and therefore which redirects they depend on.
