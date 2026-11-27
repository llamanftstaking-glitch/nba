# PROJECT AESTHETIC 04 — Component architecture for the redesign

Date: 2026-11-27. Status: PROPOSAL. Nothing here is implemented. It defines the permanent component library the
redesign should produce, independent of which of the three visual prototypes the owner chooses: the prototypes
decide the look (palette, typefaces, layout character); this document fixes the structure, the contracts and the
rules every option has to satisfy.

Inputs: `01-FRONTEND-AUDIT.md` (what is wrong and what to keep), `02-REPOSITORY-COMPARISON.md` (library choices),
`09-ACCESSIBILITY-FINDINGS.md` (requirements), `docs/design/DESIGN-SYSTEM.md` (current system), `CLAUDE.md`.

## 0. Principles (each one is checkable)

1. **A table is a table, a list is a list, a figure is a figure.** A bordered box is used only for something that
   floats (popover, dialog, toast) or that the user can pick up as a unit (a paper ticket, a combination). Page
   sections are separated by space and a heading, not by a frame. Check: no page has a framed container inside a
   framed container.
2. **Three text sizes do most of the work** (body, table, secondary), and nothing informative is below 12px.
   Check: at least 80% of visible characters at body or table size on the five main pages.
3. **Labels are words in sentence case.** Uppercase is reserved for abbreviations that are uppercase anyway (team
   codes, PTS/REB/AST column heads). Check: uppercase share of visible characters under 5%.
4. **One accent, used for interaction only** (links, the primary action, the current location, focus). It is never
   a decoration, never a section icon colour, never a glow.
5. **Numbers are the content.** Statistics are set in the body face with tabular figures, right-aligned in
   columns, with units and sample sizes beside them at the same size or one step down, not as 11px footnotes.
6. **The three kinds of number stay visibly different** (model probability with interval, evidence quality,
   descriptive history as counts): this is a product rule, see `DESIGN-SYSTEM.md` §1.4.
7. **Every state is designed:** loading, empty, error, stale, not available, partial. No component ships without
   them in the gallery.
8. **Accessibility is in the primitives,** so page authors cannot get it wrong (doc 09, §4).

## 1. Design tokens

Tokens live in CSS custom properties in `app/globals.css`, exposed to Tailwind in `tailwind.config.ts`, as now.
Components use semantic names only; raw hex values and arbitrary `text-[Npx]` classes are not allowed outside the
token file (enforced by a lint step, §6).

### 1.1 Colour roles

Values are set by the chosen prototype. The contract each value must meet is fixed here and verified by a script
that computes ratios from the token file.

| Role | Token | Contract |
|---|---|---|
| Page | `--surface-page` | the base |
| Raised surface | `--surface-raised` | sticky bars, table header band, selected row |
| Sunken surface | `--surface-sunken` | inputs, code, chart plot area |
| Overlay surface | `--surface-overlay` | popover, dialog, toast, menu |
| Primary text | `--text-primary` | ≥ 12:1 on page |
| Secondary text | `--text-secondary` | ≥ 7:1 on every surface |
| Tertiary text | `--text-tertiary` | ≥ 4.5:1 on every surface (replaces `faint` for text) |
| Disabled text | `--text-disabled` | ≥ 3:1; only on disabled controls |
| Control border | `--border-control` | ≥ 3:1 against the surface it sits on (inputs, buttons, checkboxes) |
| Divider | `--border-divider` | ≥ 1.6:1 against page; one weight, 1px; table rules and section rules only |
| Accent | `--accent` | ≥ 4.5:1 as text on page; `--accent-contrast` ≥ 4.5:1 on accent |
| Focus | `--focus` | ≥ 3:1 against every surface and against `--accent` |
| Caution | `--status-caution` (+ `-subtle` fill) | projected, stale, watchlist, unverified origin; ≥ 4.5:1 as text |
| Critical | `--status-critical` (+ `-subtle`) | out, failed, rejected, invalidated; ≥ 4.5:1 as text on its own subtle fill |
| Confirmed | `--status-confirmed` | confirmed lineup, healthy service. May equal the accent only if the accent is not green-for-good; it must not read as "this outcome is likely" |
| Data series | `--data-1` … `--data-4`, `--data-threshold`, `--data-over`, `--data-under`, `--data-equal` | ≥ 3:1 on the plot area; distinguishable in greyscale by lightness, not only hue |

Rules: status colours are never chart series colours (existing rule, kept). No gradients. No team colours unless
they come from stored data; we hold logos, not colours, and must not invent them. The token structure must allow a
light theme later by swapping values under a `[data-theme]` attribute; only one theme is built now.

### 1.2 Type scale

All sizes in `rem` (root 16px) so the browser's font-size preference is respected. Families are chosen by the
prototype; the scale is fixed. At most two families; if two, the second is for headings and figures only.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `text-caption` | 0.75rem / 1rem (12 / 16) | 400–500 | timestamps, footnotes, axis ticks. The floor |
| `text-meta` | 0.8125rem / 1.125rem (13 / 18) | 400 | secondary lines under a primary line, table sub-rows |
| `text-table` | 0.875rem / 1.25rem (14 / 20) | 400, 500 for the key column | all table cells and column heads, dense lists |
| `text-body` | 0.9375rem / 1.375rem (15 / 22); 1rem / 1.5rem (16 / 24) below 768px | 400 | prose, descriptions, assistant answers, form inputs |
| `text-heading-sm` | 1rem / 1.375rem (16 / 22) | 600 | subsection, card title, dialog title |
| `text-heading-md` | 1.125rem / 1.5rem (18 / 24) | 600 | section heading |
| `text-heading-lg` | 1.375rem / 1.75rem (22 / 28) | 600 | page title inside a workspace |
| `text-title` | 1.75rem / 2.125rem (28 / 34) | 600–700 | entity title: player name, matchup |
| `text-figure` | 2.25rem / 2.5rem (36 / 40) | 700, tabular | one hero number per view: the score, the headline average |

Nine steps replace the fourteen in use. No 11px. Tabular figures (`font-variant-numeric: tabular-nums`) on every
numeric column and figure. Letter-spacing is the typeface default; no tracking utilities. Italic only for
quotations of source text (for example verbatim contract rules), never for headings. Maximum line length for prose
70 characters (`max-w-[70ch]`), which the current full-width panels ignore.

### 1.3 Spacing

A 4px base, nine named steps, and three tiers of meaning:

| Step | px | Tier |
|---|---|---|
| `space-0.5` / `1` / `2` | 2 / 4 / 8 | inside a unit: icon to label, label to value, cell padding |
| `space-3` / `4` | 12 / 16 | between units in a group: form fields, list items, card padding |
| `space-6` | 24 | between groups |
| `space-8` / `12` | 32 / 48 | between sections of a page |
| `space-16` | 64 | page top and bottom, between major regions on wide screens |

Half steps (6, 10, 14px) are not part of the scale. Layout dimensions: table row 36px (default) or 32px (compact)
on pointer devices, 44px on touch layouts; control height 32px desktop, 44px touch; content column for prose
70ch; data pages use the full width with a 24px gutter (16px on phones), and the 1640px cap is removed in favour
of per-layout maximums.

### 1.4 Radius policy

| Value | Applies to |
|---|---|
| 0 | page regions, sections, tables, table rows, charts, the navigation, banners |
| 4px | controls: buttons, inputs, selects, tags, toggle items, tooltips |
| 8px | floating surfaces only: popover, menu, dialog, toast |
| 50% | avatars, status dots |

Nothing uses 12px. A component may not choose its own radius.

### 1.5 Elevation

| Level | Treatment | Applies to |
|---|---|---|
| 0 | none | everything in the page flow |
| 1 | divider on the trailing edge, `--surface-raised` | sticky top bar, sticky table header, sticky first column |
| 2 | 1px `--border-control` + `0 8px 24px rgb(0 0 0 / 0.40)` | popover, menu, tooltip, toast |
| 3 | level 2 plus a scrim that produces at least a 1.5:1 change against the page | dialog, drawer, command palette |

No coloured shadows. The glow token (`shadow-accent`) is deleted.

### 1.6 Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion-fast` | 100ms | linear | hover and press feedback, colour changes |
| `motion-base` | 160ms | `cubic-bezier(0.2, 0, 0, 1)` | popover, tooltip, menu, row expand, tab indicator |
| `motion-slow` | 240ms enter, 160ms exit | same curve, reversed for exit | drawer, dialog |

Only `transform` and `opacity` animate. No entrance animation on page content, no hover transitions on cards, no
looping animation except the loading placeholder and the live indicator while a game is live. Everything is
removed under `prefers-reduced-motion` (existing rule, kept; scripted scrolling must check the preference too).
CSS only; no animation library.

### 1.7 Icons

`lucide-react` stays (already installed, no new dependency). Icons are allowed where they are the control (close,
search, sort direction, expand, external link, previous/next day) or a status that is also stated in words.
Navigation, section headings, tiles and empty states carry no icon. The double-slash mark appears once, in the
brand.

## 2. Stack: one primitive set, one table engine, one chart library

| Layer | Choice | Version seen | Why this one |
|---|---|---|---|
| Behaviour primitives | **Radix Primitives** (`radix-ui`, MIT) | 1.8.1, peers React 16.8–19 | Unstyled, so it imposes no look; implements dialog focus management, tabs, menus, popovers and tooltips correctly, which the three hand-written overlays do not (doc 09 A1, A8, A12). One package, pinned |
| Table state | **TanStack Table** (`@tanstack/react-table`, MIT) | 9.3.1, peer React ≥ 18 | Headless: our markup and our semantics. Sorting, column visibility, pinning, row expansion and server-driven sort/pagination in one model instead of four hand-written tables. Same vendor as the query library already in use. `@tanstack/react-virtual` only if a table renders more than about 200 rows at once |
| Charts | **Recharts** (already installed, 3.11.1, MIT) | peers React 16.8–19 | Already in the bundle and already wrapped in `components/charts.tsx` with text alternatives. Every chart in the inventory is a bar, line, area or scatter with at most a few hundred points. A second chart library would mean a second theme and more client JavaScript |
| Styling | Tailwind CSS 3.4 (unchanged) with the tokens above | — | No Tailwind major upgrade inside this project; it is orthogonal and risky |
| Motion | CSS transitions | — | §1.6 |
| Icons | `lucide-react` (unchanged) | — | §1.7 |
| Tests / screenshots | Playwright (as used by `e2e/smoke.mjs`) | 1.65.1 seen on npm | Already the project's test tool |

Rejected for the build: ReUI, Tremor, Spectrum UI and shadcn-registry blocks (a second visual language each),
Lightweight Charts (attribution requirement, second chart stack), ECharts (size, second chart stack), Motion
(not needed), Storybook (§5). Reasons in doc 02.

New runtime dependencies this implies: `radix-ui` and `@tanstack/react-table` (two). Each needs an entry in
`docs/DECISIONS.md` and exact version pinning, per project practice.

## 3. Library layout

```
apps/web/components/
  ds/            design-system primitives: no data fetching, no domain types
    tokens.md    (generated table of tokens and their measured contrast)
    button.tsx  field.tsx  select.tsx  checkbox.tsx  toggle-group.tsx  tabs.tsx
    dialog.tsx  drawer.tsx  popover.tsx  tooltip.tsx  menu.tsx  command.tsx
    table.tsx   (DataTable on TanStack Table)   pagination.tsx
    section.tsx  page-header.tsx  breadcrumb.tsx  definition-list.tsx
    tag.tsx  status.tsx  value.tsx (NA / Val)  meter.tsx  figure.tsx
    states.tsx  (Loading, Empty, ErrorState, Stale, QueryBoundary)
    chart/      frame.tsx  bar-history.tsx  line-series.tsx  distribution.tsx
  domain/        components that know GIZER types (lib/types.ts), built only from ds/
    game/  player/  lineup/  market/  research/  assistant/  nav/
```

Rules: `ds/` never imports from `domain/` or `lib/api`. `domain/` components take data as props; pages own the
queries. A page file is composition and query wiring only; today `players/[id]/page.tsx` (522 lines) and
`games/[id]/page.tsx` (592 lines) mix both.

## 4. Component inventory

Props are sketches (TypeScript-like) to fix responsibilities, not final signatures. "Replaces" names what exists
today.

### 4.1 Scoreboards

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `ScoreStrip` | The date's games as a compact row; one line per game; links to the game. Shows observed time; pulses only while the provider says live | `games: LiveGame[]; date; onDateChange; collapsed; onToggle; observedAt; stale: boolean` | `components/live/scoreboard-strip.tsx` |
| `ScoreLine` | One game: two team rows, score or dash, status text, freshness | `game: LiveGame; density: "strip" \| "list"; followed?: boolean` | the card inside the strip; the cards on `/live` |
| `GameScoreHeader` | The sticky header of the game page: teams, `text-figure` scores, period and clock, line score, freshness or "Reconnecting…" | `game; lineScore; connection: "live" \| "reconnecting" \| "polling"; observedAt` | header in `components/live/game-center.tsx` |
| `LineScore` | Points by period as a small table with headers | `periods: {label; away; home}[]; totals` | inline markup in `game-center.tsx` |

Rules carried over: a score that is not published is a dash; status wording comes from the provider; "live" is
never called real-time; observed time is always present.

### 4.2 Game cards

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `GameRow` | The slate as a **list row**, not a card: matchup, tip-off or status, lineup status per team, research completeness as a count with a short bar, number of qualified selections, link | `game: GameCard; showPicks?: number` | `GameMatchupCard` (`components/game-card.tsx`) on `/`, `/games`; the per-game blocks of `/matchups` |
| `MatchupTitle` | Away at home with logos and names at `text-title`; used once per game page | `away; home; tipoff; status; venue?` | `MatchupHeader` (`game-card.tsx`) |
| `GameSummaryPanel` | The optional expanded view of one game on the slate: top selections and what is missing, in a definition list | `game; selections; missing: string[]` | the lower half of `GameMatchupCard`, `components/lineup-card.tsx` summary parts |

Research completeness stays a count of real inputs shown as "7 of 9 inputs" plus the missing ones by name; its
calculation is not touched.

### 4.3 Player profiles

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `PlayerHeader` | Photo, name (`text-title`), team, position, number, availability with source and time, lineup role and status, next game | `player: PlayerDetail; availability; lineup; nextGame` | header block of `app/(app)/players/[id]/page.tsx` |
| `AveragesTable` | Season / L5 / L10 / L20 as a real table: rows are windows, columns are stats, first column includes n; small samples flagged in words | `windows: AveragesResponse; stats: StatKey[]` | the "averages strip" of tiles on the player page |
| `PlayerSubnav` | Section navigation for the profile as links | `playerId; active` | long single-page scroll with anchor links |
| `PlayerLiveLine` | The observed line while the player's game is in progress | `line; game; observedAt; thresholds` | "Live now" block |
| `PlayerIdentity` | Avatar + name + team as one inline unit for use in tables and lists | `player: {id; name; team; headshot_url?}; size` | `PlayerAvatar` + ad hoc markup, `components/slate-players.tsx` |

Not available stays not available: no height, age or shot-zone fields appear, not even as empty placeholders.

### 4.4 Player stat tables

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `DataTable<T>` | The one table: caption, scoped headers, `aria-sort`, sticky header, optional pinned first column, client or server sort and pagination, row expansion, column visibility, density, footer row, loading rows, empty row, per-column "not available" | `columns: ColumnDef<T>[]; data: T[]; caption; getRowId; sort?: {state; onChange; manual}; pagination?: {...; manual}; pinFirst?; density?: "default" \| "compact"; expand?: (row) => ReactNode; rowHref?: (row) => string; state?: "loading" \| "error" \| "ready"` | `components/ui/data-table.tsx`, and the hand-written tables in `components/kalshi.tsx`, `components/props.tsx`, `components/minutes.tsx`, `components/registry-tables.tsx`, the game log in `players/[id]/page.tsx`, the box score in `components/live/game-center.tsx` |
| `BoxScoreTable` | `DataTable` preset: starters first, did-not-play rows as text with the reason, team totals footer, optional projection columns | `team; rows; totals; showProjection` | box-score table and its mobile cards in `game-center.tsx` |
| `GameLogTable` | `DataTable` preset: one row per game, missed games as rows that say why, filters above | `logs: GameLogsResponse; filters; onFilters` | game log explorer on the player page |
| `MinutesTable` | `DataTable` preset with server sort | `rows; sort; onSort` | table in `components/minutes.tsx` |

Small screens: a table stays a table. It keeps the identifying column pinned and scrolls horizontally inside its
own region with a visible scroll affordance, and offers a column chooser. The current behaviour (every row becomes
a card of 11px label/value pairs below 1280px, `data-table.tsx:80-110`) is the largest single source of boxes and
tiny text and is retired. A row's action is a link in the first cell (`rowHref`), never `role="button"` on the row.

### 4.5 Historical charts

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `ChartFrame` | Title, one-sentence description (also the accessible name), legend, the plot, "View as table" toggle, states (loading, empty, one-point) | `title; description; legend?; table: {columns; rows}; state; children` | the repeated `role="img"` wrappers in `components/charts.tsx` |
| `HistoryBars` | One bar per game oldest to newest against a threshold line; over / under / equal distinguished by fill **and** by position relative to the line; missed games shown as gaps with a label, never as zero | `games: {date; opp; home; min; value \| null}[]; threshold?: number; stat` | `HistoryBarChart` |
| `Distribution` | Histogram of a stat over a window with n stated | `values: number[]; binSize; n; window` | distribution block on the player page |
| `SeriesLines` | 1–3 series over games or time, direct end labels instead of a separate legend when there are ≤ 3 | `series: {name; points}[]; yLabel` | `OverlayLineChart`, `EquityChart` |
| `CalibrationPlot` | Predicted against observed with the diagonal and n per bin | `bins` | `CalibrationChart` |
| `HistoryControls` | Stat, window, venue and role filters and the threshold input as one toolbar | `value; onChange; stats; windows` | chip rows in `components/player-history.tsx` |
| `HistorySummary` | The sentence "7 of 10 over (L10)" as counts | `n; over; under; equal; window` | `HistFrequency` (`components/props.tsx`) |

History is descriptive: counts and sample sizes always shown, never a percentage styled like a probability.

### 4.6 Lineup comparisons

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `LineupComparison` | Away and home side by side as two aligned columns of five rows by slot; status per team stated in words above each column ("Projected — not official" / "Confirmed from box score"); never pads to five | `away: TeamLineup; home: TeamLineup` | `LineupTable`, `TeamLineupPanel` (`components/lineup-table.tsx`), `components/lineup-card.tsx` |
| `LineupRow` | Player identity, position, availability, projected minutes if present | `player; role; availability; minutes?` | row markup in the above |
| `LineupChanges` | Chronological list of lineup snapshots with what changed | `history: LineupHistory` | `LineupHistoryList` (`components/lineup-history.tsx`) |
| `AvailabilityList` | Bench and unavailable groups with status, source, published and ingested time | `players; group` | `components/injury-list.tsx`, `components/injury-changes.tsx` |

### 4.7 Market history displays

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `ContractTable` | `DataTable` preset for Kalshi contracts: contract, threshold, first observed, price, move, 15/60 min, bid/ask, spread, volume, updated; "tracked only" as a word in the row, with the reason in a popover | `rows: KalshiMarketRow[]; sort; pagination; state` | `KalshiTable`, `KalshiCard` (`components/kalshi.tsx`) |
| `PriceHistory` | Observed price over time as a step line (a price holds until the next observation), event markers on the time axis, last value labelled at the right edge, gaps left as gaps; toggle price / spread / volume; states for zero and one observation | `points: {at; price; bid; ask; volume}[]; events: TimelineEvent[]; metric` | `KalshiPriceChart` (`components/charts.tsx`) |
| `MarketFacts` | Definition list: threshold and comparator, bid/ask, spread, volume, open interest, first observed (with the "not an opening price" note), last observed, sync status | `market; sync` | `Stat` grid in the Kalshi detail |
| `EventTimeline` | Chronological events with type, text, source and time; states that order is not cause | `events` | timeline list in the Kalshi detail |
| `ContractRules` | Verbatim rule text, visibly quoted | `primary; secondary; settlementNote` | rules block |
| `ModelResearchPanel` | Clearly separated from market data: projection, interval, selections with classification; absent for tracked-only contracts, with the reason | `research \| null; reason?` | "independent model research" block |
| `PropMarketTable` | `DataTable` preset for prop markets with origin shown as a word per quote | `rows; filters; state` | `MarketTable`, `PropCard`, `PropRow` (`components/props.tsx`) |
| `MoveValue` | A signed price move with an arrow; neutral colours | `cents: number \| null` | `PriceMove` |

Market rules kept: a price is an observation with a time; "first observed" is never called an opening price; a
market price is never shown as, or beside, a model probability without a label on each.

### 4.8 Search

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `CommandSearch` | Global search dialog (Ctrl/Cmd+K, `/`, and a visible field in the top bar): grouped results for players, teams, today's games, Kalshi contracts, pages, library records; keyboard navigable; recent items | `open; onOpenChange; sources: SearchSource[]` | nothing (new) |
| `SearchField` | An inline search input with clear button and result count announced | `value; onChange; label; resultCount?` | ad hoc `Input type="search"` uses |
| `EntityPicker` | Choose a player (or team) inside a form | `kind; value; onSelect` | `components/player-search.tsx` |

Built on Radix Dialog with a filtered list; sources call existing endpoints (`/players?q=`, `/kalshi/markets?q=`,
`/cortex/concepts?q=`, `/games`). No new backend is required for a first version; a combined endpoint can follow.

### 4.9 Navigation

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `AppFrame` | Skip link, primary navigation, top bar (search, date, assistant, account), main region, notice | `children` | `components/shell/app-shell.tsx` |
| `PrimaryNav` | Six workspaces; current one marked with `aria-current` | `items: Workspace[]` | sidebar built from `lib/nav.ts` (27 items) |
| `SecondaryNav` | Up to seven links under the workspace title | `items; active` | `components/live/live-nav.tsx`, parts of `Tabs` |
| `Breadcrumb` | Path from workspace to the current page | `trail: {label; href}[]` | hand-placed back links |
| `PageHeader` | Title (`h1`), one-line description, primary action, and the route's `document.title` | `title; description?; action?; meta?` | `PageHeader` (`components/ui/panel.tsx`) |
| `DateControl` | Global slate date; hidden on workspaces it does not affect | `value; available; onChange` | `components/shell/date-selector.tsx` |
| `MobileNav` | Five bottom items; "More" is a short menu, not a 36-link sheet | `items` | bottom nav + More sheet in `app-shell.tsx` |
| `Tabs` (true tabs) | In-page panels with arrow-key support | Radix Tabs API | `components/ui/tabs.tsx` where it switches panels |
| `FilterGroup` | Single- or multi-select filter chips | `options; value; onChange; label` | `components/ui/tabs.tsx` where it filters |

`lib/nav.ts` becomes the single description of workspaces, secondary items, titles and legacy redirects, and the
breadcrumb and page titles are derived from it.

### 4.10 Research details

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `SelectionRow` | One evaluated selection as a table row: subject, market and line, side, model probability with interval, break-even, classification as a word, origin of the quote | `selection: Selection` | `components/selection-row.tsx`, `components/selection-card.tsx` (list use) |
| `SelectionDetail` | The full record: probability and interval, evidence for and against as two lists, historical context as counts (labelled descriptive), rejection reasons verbatim, model and version, timestamps | `selection; history?` | `components/selection-card.tsx` (expanded) |
| `ProbabilityValue` | Bold percentage with the bracketed interval at the same size | `p; low; high` | `ProbabilityDisplay` (`components/prob.tsx`) |
| `EvidenceMeter` | 0–100 evidence quality, labelled "Evidence" | `value` | `Meter` (`components/ui/meter.tsx`) |
| `ClassificationTag` | The six classifications as words with a status colour; the only boxed tag in the system | `value` | `ClassificationBadge`, `Badge` |
| `CombinationSummary` / `CombinationDetail` | Legs as a table, combined model probability, pricing statement ("No verified combined sportsbook quote — research only" kept verbatim), simulation metadata, shared-risk notes | `combo: Combo` | `ComboCard`, `ComboDetail`, `PricingBlock` (`components/combo-card.tsx`); pages `/simulations`, `/exposure` |
| `TicketSummary` | A paper ticket: legs, state, settlement as recorded; no outcome wording before settlement | `ticket: Ticket` | `components/ticket-card.tsx` |
| `EditionDiff` | What changed between two editions as added / removed / changed lists | `a; b` | diff block in `app/(app)/research/daily/page.tsx` |
| `KeyFigures` | Two to five figures in one definition list on a single line, for a real summary such as settled / hit rate / ROI with CI and n | `items: {label; value; note?}[]` | `Tile`, `SummaryTiles` (`components/summary.tsx`) |

`KeyFigures` is deliberately the only "stat tile" successor, and it is a row of text, not a grid of boxes. A page
gets at most one.

### 4.11 Assistant responses

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `AssistantThread` | Message list with a live region that announces completion; scroll anchoring | `messages; streaming` | `components/jarvis/conversation.tsx` (list part) |
| `AssistantMessage` | Prose at `text-body`, max 70ch; verified records rendered with domain components (a selection is a `SelectionRow`, not a paragraph about it) | `message` | message rendering + `components/jarvis/markdown.tsx` |
| `ToolActivity` | Which tools ran, in plain words, collapsed by default | `calls: ToolCall[]` | tool activity block |
| `SourceList` | The records and sources an answer used, as links | `sources` | sources block |
| `AnswerMeta` | Model, cost and time in one caption line | `model; costUsd; at` | meta line |
| `Composer` | Text area, attachments, send, deep-review toggle; states: sending, budget paused, error | `onSend; disabled; budget` | composer in `conversation.tsx` |
| `AssistantDrawer` | The side panel as a non-modal Radix dialog with correct focus handling | `open; context` | `components/jarvis/panel.tsx` |
| `BudgetNotice` | The server's budget state in words | `state` | `components/jarvis/status.tsx` |

JARVIS rules unchanged: it explains verified records and never shows a number that is not a stored record; the
interface must make "this is a stored record" visually distinct from "this is the assistant's wording".

### 4.12 Loading, empty and error states

| Component | Responsibility | Props sketch | Replaces |
|---|---|---|---|
| `QueryBoundary<T>` | Maps a query to the states below, with staged timing: placeholder immediately, a sentence after about 4 s, error at the request deadline; keeps previous data visible and marked while refetching | `query; children; loading?: ReactNode; empty?: {...}; isEmpty?` | `QueryView` (`components/ui/states.tsx`) |
| `TableSkeleton`, `LinesSkeleton`, `ChartSkeleton` | Placeholders shaped like what will arrive (header plus n rows at real row height; n text lines; a plot area) | `rows?; columns?` | `LoadingState`, `Skeleton` |
| `EmptyNote` | One sentence in the flow of the page, optional action. No box, no icon | `children; action?` | `EmptyState` (113 call sites) |
| `ErrorNote` | What failed, the status, what to do; Retry; `role="alert"` | `error; onRetry` | `ErrorState` |
| `StaleNote` | "Last verified …" with the time, in the caution colour, wherever data is older than its threshold | `at; threshold` | `StaleTag`, `FreshnessIndicator` (`components/status.tsx`) |
| `NotAvailable` / `Value` | The dash with an accessible label; never a zero | `value; format?` | `NA`, `Val` (`components/ui/na.tsx`) — kept as is |
| `UpdatedAt` | Observation or ingestion time in ET, relative and absolute | `at; label?` | `FreshnessIndicator` |

A section with nothing to show collapses to its heading and one `EmptyNote` line; it does not keep a frame.

## 5. Storybook or a lighter gallery page

**Recommendation: no Storybook. Build one gallery route in the app and photograph it with the Playwright script the
project already has.**

Facts considered:

* CI for the frontend today is `npm ci`, `npm run typecheck`, `npm run build`, `npm audit` (`.github/workflows/ci.yml`).
  There is no browser in CI; the smoke test runs locally against the mock API.
* `apps/web` has 8 runtime and 10 development dependencies. `storybook` 10.6.9 is 22.3 MB unpacked with 17 direct
  dependencies, and `@storybook/nextjs` adds 33 more plus a `webpack ^5` peer (npm registry, this session). A v11
  release candidate was published on 2026-11-26.
* Storybook brings its own bundler configuration that has to reproduce Next's (App Router, path aliases, fonts,
  Tailwind). Every Next upgrade becomes two upgrades.
* The library is about 70 components maintained by one team for one owner. Storybook's strengths (many
  contributors, design-developer hand-off, published documentation, visual review services) are not the
  constraint here; the constraint is a low-memory server, a short CI and a rule against unreviewed dependencies.

The gallery:

* Route `app/(dev)/ui/[[...slug]]/page.tsx`, returning `notFound()` unless `NEXT_PUBLIC_UI_GALLERY=1` at build
  time, so it is absent from the production image by default and behind sign-in when present.
* One section per component, rendering **every state** from typed fixtures in `components/ds/__fixtures__/`
  (loading, empty, error, stale, one row, many rows, longest plausible name, not-available values). Fixtures are
  labelled "FIXTURE" on screen, as the mock API already does.
* `e2e/gallery.mjs` (Playwright, same global install as `e2e/smoke.mjs`): screenshot every section at the seven
  viewports the smoke test uses, and run the checks from doc 09 §4 (contrast, names, focus, target size, text
  size). Screenshots under `docs/design/aesthetic/screenshots/components/` are the review artefact.
* Cost: no new dependency, no CI time unless the owner later chooses to run the script in CI.

Revisit Storybook only if the component count or the number of contributors grows substantially.

## 6. Guard rails (so the old patterns cannot return)

A small script run by `npm run lint` (plain Node, no dependency) that fails on, outside `components/ds/`:

* arbitrary sizes `text-[…px]`, and `text-2xs`;
* `uppercase` and `tracking-*` utilities;
* `rounded-lg`, `rounded-xl`, and any `ring-*` or `shadow-*` utility;
* `opacity-*` on elements that contain text;
* `role="button"` on `tr`; `title=` used without a visible or popover equivalent;
* raw hex colours.

Plus the existing smoke-test assertions, with the minimum text size raised from 11px to 12px and the new checks
from doc 09 §4.

## 7. Migration order (production keeps working at every step)

`main` receives all work; `production` is promoted only from verified, green commits (existing release rule). Each
step below is a separate, shippable change with the smoke test green, a `CHANGELOG.md` entry and
`PROJECT-STATE.md` updated.

| Step | Change | Risk to production | Verification |
|---|---|---|---|
| 0 | **Independent fixes first:** Kalshi endpoint and page states (doc 05, B1–B2 and F1–F5); the level-A accessibility defects that need no redesign — skip link, per-route titles, remove the global `outline: none`, tertiary text colour (doc 09 A2–A5) | Low; small and local | Backend tests with a large slate; smoke test; the measurements in doc 09 repeated |
| 1 | **Decisions recorded:** chosen prototype, the two new dependencies, the navigation model, font changes if any (`docs/DECISIONS.md`) | None | — |
| 2 | **Tokens v2 added beside v1** under new names; `components/ds/` created; gallery route; guard-rail script in warning mode | None: nothing existing uses them | Token contrast script; gallery screenshots |
| 3 | **Primitives:** `ds/dialog`, `drawer`, `popover`, `tooltip`, `tabs`, `button`, `field`, `states`. Then re-point the **existing** `ui/sheet.tsx`, `ui/tabs.tsx` and `QueryView` at them without changing their props | Medium: every overlay changes behaviour at once | Dialog focus checks from doc 09 on the Kalshi drawer, prop drawer, More sheet and JARVIS panel; smoke test |
| 4 | **`DataTable` v2** in the gallery, then one table at a time: Kalshi contracts → minutes → prop markets → game log → box score → registry tables | Low per table | Screenshot before/after per table; smoke test rows and sort |
| 5 | **Shell and navigation:** `AppFrame`, six workspaces, breadcrumbs, search, titles; legacy URLs redirected (doc 01 §4.1). Built behind `NEXT_PUBLIC_SHELL=v2`, default off, so the same commit can be promoted with the old shell | Medium: every page | Smoke test run in both modes; every old URL resolves; Tab stops before main ≤ 7 |
| 6 | **Pages, one workspace per release,** each rebuilt from `domain/` components: Markets (Kalshi first, then props) → Today (slate, scores, lineups, injuries) → Game → Players (profile, compare, minutes) → Research (picks, combinations, builder, editions, tickets, performance) → Assistant and Library → System | Low per release: old and new pages never share a route | Smoke test; gallery; owner review of screenshots at 1440 and 390 |
| 7 | **Switch the shell flag on,** then remove it | Medium | Full smoke test; production smoke script after promotion |
| 8 | **Delete v1:** `components/ui/*` not re-pointed, old tokens, `shadow-accent`, the 11px size, retired pages; guard-rail script to error mode; rewrite `docs/design/DESIGN-SYSTEM.md` and `docs/architecture/FRONTEND-IA.md` | Low | Typecheck (unused imports), build, smoke test, `grep` counts from doc 01 §5 re-run and recorded |

Order rationale: step 0 delivers the owner's most visible defect (the Kalshi skeleton) and the level-A failures
without waiting for design decisions; step 3 fixes all overlays in one move because they share one component; the
table comes before the shell because tables are where the content is; the shell flag lets the navigation change be
reviewed on real pages without committing production to it.

## 8. Open decisions for the owner

1. Which prototype sets the colour values and typefaces (this document is neutral on both).
2. Whether URLs change as proposed in doc 01 §4.1 or only the navigation changes.
3. Approval of two new runtime dependencies: `radix-ui`, `@tanstack/react-table`.
4. Tables on phones: horizontally scrolling tables with a pinned column (recommended) or keeping stacked cards.
5. Whether a light theme is wanted later (the token structure allows it; nothing more is built now).
6. Whether the smoke and gallery scripts should run in CI, which would mean adding Playwright as a development
   dependency and a browser download to the workflow.

## 9. Not verified

No component in this document has been built or measured. Version numbers and peer ranges are as seen on the npm
registry on 2026-11-27. The claim that TanStack Table v9 covers all four existing hand-written tables is a design
judgement from its documented feature set, not a test.
