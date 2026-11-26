# GIZER NBA — design system (V3)

Implementation: `apps/web/app/globals.css` (CSS variables), `apps/web/tailwind.config.ts` (Tailwind tokens that
resolve to those variables), `apps/web/components/ui/*` (primitives) and `apps/web/components/*` (domain components).
The visual reference is the owner-approved Command Center mock: dark arena palette, italic condensed headings,
icon-led stat tiles, three-across game cards, one restrained emerald accent.

## 1. Principles

1. **Basketball first, diagnostics last.** Slate, lineups, props and research lead every page; agents and model
   plumbing sit at the bottom or under *System*.
2. **Hierarchy through type and surface, not boxes.** One border colour, used sparingly; sections are separated by
   surface elevation and spacing.
3. **Neutral data.** Ordinary numbers are white/slate. Emerald marks brand, the active location and the primary
   action — it never implies that an outcome is certain.
4. **Three kinds of number, never mixed.** *Model probability* (bold percentage + bracketed interval),
   *evidence quality* (0–100 meter in the data hue, labelled "Evidence") and *descriptive history* (counts such as
   "7 of 10 over (L10)", labelled descriptive). History is never rendered as a percentage or with the probability
   component.
5. **Honest states.** `null` → "—" (`aria-label="not available"`); empty → one plain sentence; projected lineups are
   never labelled confirmed; owner-entered and hypothetical quotes always carry their origin.

## 2. Colour tokens

| CSS variable | Hex | Tailwind | Use |
|---|---|---|---|
| `--bg` | `#060A10` | `bg` | page background |
| `--bg-2` | `#0A1119` | `bg2` | sidebar, top bar, sheets |
| `--card` | `#0D1720` | `card` / `panel` | cards and panels |
| `--elevated` | `#121F2B` | `raised` | inner surfaces, hover, inputs' neighbours |
| `--border` | `#22313E` | `line` | the one border colour (usually at 40–60% as a 1px inset ring) |
| `--text` | `#F3F6FA` | `ink` | primary text and values |
| `--text-soft` | `#C7D1DD` | `soft` | long-form body text (derived step between text and secondary) |
| `--text-2` | `#94A3B8` | `muted` | secondary text, labels, metadata |
| `--text-3` | `#64748B` | `faint` | placeholders, disabled, inactive icons, separators — never body copy |
| `--accent` | `#00E5A0` | `accent` | brand mark, active nav, primary button, links, "confirmed/ready" dots |
| `--teal` | `#00BFA6` | `teal` | "over" bars in history charts, supporting-evidence bullets |
| `--warn` | `#F5B942` | `warn` | uncertainty: projected, stale, watchlist, non-provider quote origin |
| `--error` | `#F05252` | `bad` | invalidated, failed, rejected, out |
| `--data` | `#7DC4F0` | `info` | neutral data hue: evidence meter, single-series charts (derived) |

`accent-dim`, `warn-dim`, `error-dim`, `data-dim` exist for legacy tints; new code uses `/10` opacity fills with a
`/40` inset ring. Status colours are never used as chart series colours.

**Glow.** One shadow token, `shadow-accent`, on the active navigation item and the primary button only. The page
has a single faint teal wash behind the header; there are no other gradients.

## 3. Typography

| Role | Family | Size / weight |
|---|---|---|
| Wordmark, page title | Barlow Condensed 700 italic, uppercase | 30px mobile / 34px desktop |
| Panel and section headings, matchup codes, combo names | Barlow Condensed 600, uppercase | 17–22px |
| Interface and body | Inter 400–700 | 15px mobile / 14px desktop (`--fs-body`, classes `text-sm` / `text-base`) |
| Metadata | Inter | 12px (`text-xs`) |
| Micro labels (uppercase) | Inter 600 | 11px (`text-2xs`) — the floor; nothing is smaller |
| Statistics | Inter with `font-variant-numeric: tabular-nums` (class `num`) | inherits |

Monospace is not used for ordinary numbers. A `font-mono` stack (Geist Mono → system mono) exists for the rare
aligned-code case and is currently unused. Fonts are self-hosted through `@fontsource/inter` and
`@fontsource/barlow-condensed` (latin subsets, imported in `app/layout.tsx`); the build makes no font network
request. The smoke test asserts that no visible text renders below 11px.

## 4. Shape, spacing, borders

* Radii: 6px controls (`rounded`), 8px inner surfaces (`rounded-md`), 12px cards (`rounded-lg`).
* Cards: `bg-card` + `ring-1 ring-inset ring-line/60`. Inner groups: `bg-raised/40–50`, no border.
* Dividers: `border-line/40–50`, 1px. No double borders, no dashed boxes.
* Spacing: 16px card padding, 16–20px between cards, 12px grid gaps.
* Touch targets: buttons, tabs, chips, nav items and inputs are ≥ 44px tall below the `md` breakpoint.
* Safe areas: top bar and bottom navigation pad with `env(safe-area-inset-*)`.

## 5. Icons and brand

* Icons: `lucide-react` (pinned). Used in stat tiles, panel/section headers, navigation, buttons with a clear
  action. 18px in headers, 20px in tiles, emerald when they lead a section, `faint` when inactive.
* Brand: `Brand` (`components/shell/brand.tsx`) — double-slash emerald mark (`SlashMark`, inline SVG), italic
  "GIZER **NBA**" wordmark and the caption "PARLAY COMMAND CENTER". No raster assets. The slash mark also prefixes
  page titles and the footer notice.

## 6. Badges and status

* **Boxed badge** (`Badge`) — only for *classification* (High confidence, Standard, Watchlist, Insufficient
  evidence, Rejected, Invalidated). Always a text label.
* **Status** (`StatusDot`) — small coloured dot + text for everything else: game status, agent status, model
  readiness, provider status, lineup status, availability.
* Engine, structure, leg counts, families and similar metadata are plain text.

## 7. Layout and breakpoints

| Width | Shell | Notes |
|---|---|---|
| ≥ 1024 (`lg`) | 252px sidebar (collapsible to 60px), top bar, fixed footer notice | lineups away/left, home/right |
| ≥ 1280 (`xl`) | same | real tables (`DataTable`, `MarketTable`, game log); game cards three across |
| ≥ 1536 (`2xl`) | same | prop table gains Model and Updated columns |
| < 1024 | top bar + notice strip, bottom navigation `Home · Games · Props · Parlays · More` | "More" sheet lists all four groups; builder combination becomes a drawer |
| < 1280 | — | tables become stacked label/value cards; prop markets become expandable `PropCard`s |

Content is capped at 1640px. No page scrolls horizontally at 390 or 430px; stat/window chip rows may swipe
horizontally inside their own container.

## 8. Components

### Primitives (`components/ui`)

| Component | Purpose |
|---|---|
| `Button`, `linkButton`, `textLink` | primary (emerald, glow) / outline / ghost / danger; 44px on touch |
| `Badge`, `StatusDot`, `StaleTag` | see §6 |
| `Panel`, `PageHeader`, `SectionTitle`, `Label`, `Metric`, `BulletList`, `SlashMark` | page scaffolding |
| `Tabs` | tab/chip list; `scroll` makes it swipeable, `size="sm"` for chips |
| `Sheet` | bottom sheet; `side="auto"` is a right-hand drawer from `md` |
| `DataTable` | table ≥ xl, stacked cards below; `hideOnMobile` per column |
| `Field`, `Input`, `Select`, `Pagination`, `Meter`, `ShareBar` | forms and meters |
| `NA`, `Val` | explicit "not available" |
| `Skeleton`, `LoadingState` | loading |
| `EmptyState` | icon + one honest sentence (+ optional note/action) |
| `ErrorState` | API message, HTTP status, Retry |
| `QueryView` | applies loading → error → empty → content to a query |

### Domain components (`components`)

| Component | File | Notes |
|---|---|---|
| `MatchupHeader` | `game-card.tsx` | away @ home, logos, names, tipoff (ET), status dot, score when final |
| `GameMatchupCard` | `game-card.tsx` | completeness, per-team lineup status, environment, ranked picks or `no_picks_reason` |
| `TeamLogo` | `team-logo.tsx` | `logo_url` with abbreviation fallback |
| `PlayerAvatar` | `player-avatar.tsx` | `headshot_url` with initials fallback (missing or failed load) |
| `LineupTable`, `TeamLineupPanel` | `lineup-table.tsx` | away left / home right; team tabs below `lg`; starters never padded; "No lineup information available" when empty; bench and unavailable groups |
| `LineupHistoryList` | `lineup-history.tsx` | `/games/{id}/lineup-history` |
| `PropRow` | `props.tsx` | compact one-line market (overview, profile) |
| `PropCard` | `props.tsx` | expandable market card below `xl` |
| `MarketTable` | `props.tsx` | prop market table ≥ xl + `PropCard`s below; row opens the drawer |
| `PropDrawer` | `props.tsx` | market, history, projection, selection, "Add manual market" |
| `ManualEntryForm`, `ManualEntries` | `props.tsx` | owner-only entry with explicit origin; list with Withdraw |
| `HistFrequency` | `props.tsx` | "7 of 10 over (L10)" — count, never a percentage |
| `HistoryBarChart` | `charts.tsx` | one bar per game oldest → newest, coloured over/under/equal against a dashed threshold line; tooltip with date, opponent, home/away, minutes, value |
| `PlayerHistory` | `player-history.tsx` | stat chips, window chips, venue/role filters, threshold input, chart ⇄ table toggle, summary line, Measurement B |
| `OverlayLineChart`, `CalibrationChart`, `EquityChart` | `charts.tsx` | comparison overlay, results charts |
| `ComboCard`, `ComboDetail`, `PricingBlock` | `combo-card.tsx` | keeps "No verified combined sportsbook quote — research only" and "Arithmetic product of leg prices — not a sportsbook quote" |
| `SelectionCard`, `HistoricalContext`, `EvidencePanel` | `selection-card.tsx` | model numbers first; separate "Historical context (descriptive)" row; quote origin |
| `AvailabilityStatus` | `status.tsx` | "Available" neutral; injury text verbatim with severity dot |
| `LineupStatusLabel` | `status.tsx` | Confirmed · "Projected — not official" · "Awaiting confirmation" |
| `FreshnessIndicator` | `status.tsx` | clock + time in ET, amber "stale" when the API flags it |
| `OriginTag` | `status.tsx` | Provider · Owner-entered · Hypothetical (non-provider origins in amber) |
| `ProbabilityDisplay` | `prob.tsx` | probability + interval; registered-model output only |
| `EvidenceMeter` | `prob.tsx` | "Evidence n/100" in the data hue |
| `Tile`, `SummaryTiles` | `summary.tsx` | icon stat tile; paper-testing summary |
| `TeamFormComparison` | `team-form.tsx` | `TeamForm` side by side; empty state for `{}` |
| `PlayerSearch` | `player-search.tsx` | `/players?q=` search with a per-result action |
| `Brand`, `AppShell`, `DateSelector` | `shell/` | wordmark, navigation, global date |

## 9. Charts

* One axis per chart; recessive grid (`#1A2732`); 11px slate ticks; hover tooltip on every chart.
* Single-series charts use the data hue `#7DC4F0`; reference lines are white/slate dashes.
* `HistoryBarChart`: over `#00BFA6`, under `#5B6B7E`, equal `#F5B942`, with a legend and a table alternative, so
  the category never depends on colour alone. These are descriptive categories, not status colours.
* `OverlayLineChart` (≤ 3 players): `#3B9AE6`, `#BF8A12`, `#A866DC` — checked with the dataviz palette validator
  for the dark surface (lightness band, chroma, CVD and normal-vision separation, contrast: all pass).

## 9a. Core Intelligence V1 components

| Component | File | Notes |
|---|---|---|
| `KalshiSyncStatus` | `kalshi.tsx` | last sync time (ET), age, poll interval, the API `sync.note`, amber "Stale" dot when `sync.stale` |
| `PriceMove` | `kalshi.tsx` | movement in cents with a sign and an arrow; up = data hue `#7DC4F0`, down = slate. Never green/red: a price move is not good or bad |
| `TrackedOnlyTag` | `kalshi.tsx` | "Tracked only" for `unsupported` / `unmatched` contracts, `interpretation_note` as the tooltip; such rows are dimmed and never show model numbers |
| `KalshiTable` / `KalshiCard` | `kalshi.tsx` | contract table ≥ xl, expandable cards below; always shows the original `title` and the comparator |
| `KalshiCompactList` | `kalshi.tsx` | grouped compact rows (game page) or a threshold ladder (player profile); 5 rows per group (3 on phones) with "Show all" |
| `KalshiDetailView`, `KalshiDrawer` | `kalshi.tsx` | market data block first (label "Market data · Kalshi", data hue), then "Independent model research · GIZER" (emerald label), separated by a rule |
| `KalshiPriceChart` | `charts.tsx` | price line in cents, bid–ask band at 14% opacity, vertical event markers: availability amber, lineup teal, market status slate; the contract's own player is a solid 2px line, others dashed. Price / Spread / Volume toggle (one axis at a time) |
| `MinutesTable` / cards, `MinutesCompact`, `MinutesProfile` | `minutes.tsx` | projected minutes with `[low–high]` band, L3–season, ±SD and min–max, starts, classification (dot + label, reason in tooltip and expanded row), tier, flags |
| `MinutesNotes` | `minutes.tsx` | "descriptive context, not qualification rules", model name/version/status ("… — did not pass validation" unless production), `uncertainty`, `restrictions_note` |
| `InjuryChangeList` | `injury-changes.tsx` | previous → current status, Material badge, affected game, lineup changes, "N research records to reassess (M qualified)", source and times |

Number formats: Kalshi prices are shown in cents (`56.5¢`), moves as `+4¢` / `−2.5¢` / `0¢`. A Kalshi price is always
labelled "Market price" and a GIZER figure "Model probability"; the two never share a component. Kalshi data is
described as polled / observed, with the last sync time — never with wording that implies a continuous feed.

Classification labels (badge and text): Validated research · Standard research · Watchlist · Insufficient
information · Stale (amber) · Invalidated · Rejected.

Long lists are capped with an explicit "Show all N" control (game-page markets, minutes, history, Kalshi groups;
splits and distribution cards on phones) because a real slate carries hundreds of contracts per game.

## 9b. Bounded lists (page-audit rules, 2026-11-25)

A production slate carries thousands of evaluated selections and Kalshi contracts. No page may render an
unbounded list; the smoke suite fails any page taller than 12,000px at 1440 wide (15,000px at 390) on a large
synthetic slate.

| Pattern | Component | Use |
|---|---|---|
| Server-side paging | `Pagination` + `limit`/`offset` | `/picks` tabs, player props, Kalshi watch, minutes, tickets, results. Every `/selections` request carries a `limit` ≤ 1000 |
| Compact row that expands in place | `SelectionRow`, `SelectionsByGame` (`selection-row.tsx`) | long selection lists: one line per selection (rank, label, classification, model probability + interval, price, edge, evidence); the full `SelectionCard` opens on demand. At most five per game until "Show all" |
| Disclosure block | `Collapsible` (`ui/collapsible.tsx`) | watchlist, technical model details, per-game injury feed, "load a combination", extra qualified rows |
| "Show all N" cap | inline button | Kalshi groups, minutes, history, combinations, change lists, correlation pairs, backtests; `DataTable mobileLimit` for stacked cards |
| Headline + details | `ModelsTable`, `BacktestsTable`, `MetricsDetails` (`registry-tables.tsx`) | one compact card per model/backtest with sample size and up to five headline metrics; everything else behind "Details", where nested metrics render as key/value rows and small tables (calibration as a table), never as JSON |
| Defaults instead of blank pages | `useQuickPlayers` (`slate-players.tsx`) | comparison preselects the slate's two highest projected-minute players and offers chips; history lists slate players as quick links |

When a list is cut, the cut is stated ("Showing 200 of 590", "N not qualified in total — showing the 200 most
relevant") and the full set is one click away or on its own paged page.

## 9c. JARVIS (assistant)

JARVIS is the owner's intelligence officer, not a chat toy: it answers through real tool calls over platform
records, and the interface only ever shows what the server reports.

| Element | Component | Rules |
|---|---|---|
| Mark | `JarvisMark` (`components/jarvis/mark.tsx`) | Original geometry: solid emerald core, broken teal inner ring, four outer arcs, twelve tick marks. Inline SVG, emerald/teal only. `active` rotates the outer arcs slowly (6s) **only while a request is in flight**; the global reduced-motion rule disables it |
| Status pill | `JarvisPill` (`status.tsx`) | Ready (emerald dot) · Processing (data-hue dot, only while a stream is open) · Provider unavailable / Budget limited / Paused (amber) · Error (red). Label always present; the server `message` is the tooltip and secondary text |
| Conversation | `JarvisConversationView` (`conversation.tsx`) | Owner messages right-aligned on an elevated surface; answers left with the mark. Under each answer: model id, or "Answered from stored data, no model" for `deterministic`; cost as `$0.0000`; expandable Sources (tool label, tool name, args) |
| Tool activity | `ToolActivity` | One line per real `tool_start`: spinner → check or cross on `tool_end`, with ms. No invented progress text |
| Markdown | `Markdown` (`markdown.tsx`) | Local safe renderer (headings, lists, tables, bold, italic, inline code, fenced code, http/in-app links). Builds React elements; model text is never injected as HTML |
| Composer | in `JarvisConversationView` | Multiline; Enter sends, Shift+Enter adds a line; Send becomes Stop while a request is in flight; "Deep review (Opus, costs more)" is off by default and resets after every send |
| Context chips | `ContextChips` | Resolved game / player / market / record / page / date; game, player and market link to their pages |
| Panel | `JarvisPanelProvider`, `JarvisLauncher`, `AskJarvisButton` (`panel.tsx`) | Top-bar launcher and Ctrl/Cmd+J. 420px right panel from `md`, full-screen below. Shows "JARVIS is looking at" with the resolved context |
| Budget bars | `/admin/ai-budget` | Data hue for spend, lighter tint for pending, amber line at the suspend amount, checkpoint ticks; risky switches need a second explicit click |

**Image attachments (composer).**

| Element | Rules |
|---|---|
| Attach button | 44px square, `ImagePlus` icon, label "Attach images"; the hint "Attach a parlay or pick slip screenshot" sits under the composer. File input accepts PNG / JPEG / WebP / GIF, `multiple`, no `capture` (phones offer library and camera) |
| Pending thumbnails | 64px squares above the textarea, `object-cover`, 1px inset ring; a 28px round remove button at the top-right with the label "Remove attachment N: name"; a spinner tile while an image is being prepared |
| Inline refusals | red text under the thumbnails (not an image, more than three, unreadable); never a browser dialog |
| Drop target | while files are dragged over the conversation: a dashed 2px emerald border inset 8px, page-colour wash at 85%, "Drop images to attach (up to 3)". Removed on leave or drop |
| Message images | 96px thumbnails above the owner's text, right-aligned; each is a button |
| Image overlay | full-viewport black at 85%, image contained, 44px close button top-right; Esc or the close button dismisses it and focus returns to the thumbnail |

Images are downscaled in the browser (longest side ≤ 1568px, JPEG 0.85 on a white background, stepping quality
then size down until under ~1.4 MB) before upload. A failed send puts the attachments and text back in the composer.

Destructive or risky actions (delete a conversation or memory, emergency pause, releasing the safety buffer) use
an inline two-step confirm, never a browser dialog.

## 9d. GIZER LIVE (observed in-game data)

Files: `components/live/*`, `lib/live.ts`. The live views should read as a sports product: scores in
`font-display`, team logos, short labels. Every live value is an observation with a time; nothing here is a forecast.

| Component | Spec |
|---|---|
| Live indicator (`LiveDot`) | 8px emerald dot with a `ping` halo (`motion-reduce` stops the animation) followed by "LIVE" in emerald 12px semibold. Used **only** when `status` is `live` or `overtime`. Halftime, End Q*n*, Final are plain soft text; Delayed and Postponed are amber text. Never a boxed badge. |
| Freshness mark | `updated 9s ago` in muted tabular 12px; when `stale` is true it becomes amber "Delayed" (strip) or "Delayed — last update HH:MM:SS ET" (score header, cards). Scheduled games show none. |
| Scoreboard strip | Full-width band under the top bar, `bg-bg2/80`, bottom border. Header row 24–44px: "Scores" (display 15px), count, day buttons (the active one on `raised`), chevron to collapse. Cards 168px wide (190px when followed), `card` surface, 1px inset line ring, emerald ring on hover: two team rows (20px logo, abbreviation 14px semibold, score display 20px right-aligned), then status and freshness on one line, a filled emerald star when followed. Scrolls horizontally inside its own box with `snap-x`; collapsed height 3.25rem, expanded 9.5rem (exposed as `--strip-h` for full-height pages). |
| Score header | Sticky under the top bar (`top-14`, `bg-bg2/95` with blur, bottom border). Scores in display 44px (52px ≥ md); team logo 36px with the abbreviation beside it (stacked under it below 640px so three-digit scores fit at 390px); status and freshness between the scores; "Reconnecting…" in amber replaces the freshness mark while the stream is down. Line score and the follow control sit on the right (second row below 640px). The page's `h1` is inside it, visually hidden. |
| Line score | Compact table, 11–12px tabular: `TEAM`, one column per period, `T` in bold. Abbreviations only. |
| Follow control | 44px (36px ≥ md) outline button with a star; filled emerald star and emerald ring when on. A refusal from the server appears as red text beside it. |
| Stat table (box score) | ≥ 1024px: one table per team inside a card; 11px uppercase headers that are buttons (first click descending, second ascending, third back to "starters first"; `aria-sort` set; missing values always last); sticky first column on the card colour; 2px line above the first bench player; did-not-play rows at 50% opacity with "Did not play"; totals row in bold; on-court = 6px emerald dot before the name (only while the game is in progress); foul marker = amber "FOULS" 11px on `warn/10`. Optional pregame projection columns have amber headers and muted values. The table scrolls inside its own box. Below 1024px: one row per player as a 44px button (32px avatar, name, MIN · PTS · REB · AST), expanding to a five-column definition grid with a "Player page" link. A value the source has not published is "—", never 0. |
| Timeline (plays) | Rows grouped under a period heading (display 15px): clock (muted tabular, 52px column), team logo 20px, the source's text unchanged, running score right-aligned on scoring plays (semibold row), an amber 11px "CORRECTED" tag when the source revised the play. Filters are the small `Tabs`; team and player are selects. 40 rows per page with a "more" button; new plays are prepended. |
| Team comparison bars | Label centred in muted 12px, the two values in tabular semibold at the sides, then a 6px split bar (away `info` from the centre leftwards, home `teal` rightwards) on a `line/60` track. When either side is not published the values show "—" and no bar is drawn. Statistics the source does not publish are listed in one muted sentence. |
| Score progression | Recharts line chart, 224px: one `info` line for the score margin (home minus away) against elapsed game time, zero line marked, period boundaries as vertical reference lines, a legend sentence saying which side of zero is which team, tooltip with period and both scores. Facts beside it: lead changes, ties, largest lead per team, scoring runs. The server's note that no win probability is computed is always shown. Fewer than two scoring events → an empty state instead of a chart. |
| Rotation chart | One row per player: name (140px column, 6px emerald dot when on court during a game in progress), then a track spanning the game with period dividers; stints are 12px bars, starters `info`, bench `teal`. Legend below. Under it a minutes table (total, per period, fouls, projected, difference in muted). A team with `determinable: false` shows the server's note in a `raised/40` box and no chart. |
| Tracking threshold row | Player statistic and threshold, then "current · remaining" in tabular figures and one status sentence ("Tracking" or "Threshold reached at N · time"). Neutral colours only; it is an observation, not an estimate. Delete is a 44px icon button. |
| Research tracker leg | Label and game state on the left; Line · Current · Difference as three labelled figures; the observation sentence ("Not started", "In progress", "Game final — awaiting settlement") in soft text with the basis and time. No green/red, no outcome wording, until the ticket's settlement is recorded. |
| Toast (reached threshold) | Bottom-right stack (above the bottom navigation on a phone), `raised` surface, 1px line ring, 14px text, dismiss button; at most four. Shown only when the browser notification setting is on. |

Rules: null → "—"; no pulsing indicator unless the provider reports the game live; show the observation time
wherever a live number is shown; polled data is described as delayed observations; no in-game probability, no
wagering wording, and a paper leg is never worded or coloured as an outcome before settlement.

## 9e. GIZER CORTEX (knowledge library)

Files: `components/cortex/*`, `lib/cortex.ts`, `app/(app)/cortex`. A reference library: plain surfaces, long-form
text at a readable measure, no decoration that suggests capability. Copy never calls the system "AI-powered",
"intelligent" or "smart"; counts are API values; anything missing is named as missing.

| Component | Spec |
|---|---|
| Verification chip | Boxed `Badge` (11px uppercase semibold). `checked_against_source` → "CHECKED AGAINST SOURCE", emerald text on `accent/10` with an emerald ring. `authored_not_checked` → "NOT CHECKED", amber text on `warn/10` with an amber ring. Present on every list row and on the record header; never abbreviated to an icon. |
| Kind and ruleset chips | Kind: neutral `Badge` (`raised` surface, muted text). Ruleset: `info` tone for NBA / FIBA, neutral for "General". Order is always kind · ruleset · verification. |
| Record row | Whole row is a link, 12px padding, `raised/50` on hover: title 15px semibold with the department name right-aligned in muted 12px, the chip row, then the summary in 14px soft text. Rows are separated by a `line/30` rule inside one card. On the Statistics tab the formula block follows the summary. |
| Knowledge record layout | Single column, max width 920px, centred. Order: department line (12px muted) → title (page-title style) → chips with version and update time → summary 17px/28px in `ink` → "Ask JARVIS about this" (outline button) → body paragraphs 15px/28px in `soft` → formula → season note (`raised/40` box) → player responsibilities / common responses (only when present) → Limitations and When not to use as two cards → "What our data can show" (emerald ring, eye icon) beside "What we cannot see" (amber ring, crossed-eye icon), stacked below 768px → evaluation questions → related records as chips → sources (title as an external link with the icon, note beneath). Section headings are display 17px uppercase. An empty list is stated ("None recorded."), never dropped. |
| Formula block | `<pre>` in the monospace stack, 13px/20px, `info` text on the page background with a 1px line ring, 12px × 8px padding; wraps rather than scrolling the page. The text is the record's string, unchanged. |
| Two-part verification bar | 10px rounded bar: emerald segment (checked) then amber segment (not checked), widths in proportion; beneath it both exact counts with a colour key. No percentage is shown without the counts. |
| Department card | 64px min height, `card` surface: two-digit department number in display 20px muted, name 14px medium, record count in tabular 18px with "RECORDS" beneath (a zero count is muted, not hidden). Emerald ring on hover. |
| Archetype chip with rule | A `raised/40` box holding an `info` `Badge` with the label and, directly beneath, the rule in 12px monospace (`usage ≥ 26% and assists per 36 ≥ 5.5`). The rule is always visible; there is no tooltip-only form. When labels were not derived the box is replaced by one sentence carrying the server's status text. |
| "Not available" panel | A normal card with a muted prohibition icon and the capability name as the heading, then "NOT AVAILABLE" in amber 14px semibold uppercase and the server's reason in 14px soft text. Used for the tactical profile, tactical identity and unavailable profiles. It keeps the same size and position as a panel with content so the absence is as visible as data would be. |
| Stat grid | Definition grid: 11px uppercase label, value in tabular 15px semibold, optional 12px muted sub-line carrying the sample ("17 games", "sd 6.9"). Null is "—". Per-36 values carry "PER 36" in the label. |
| Small-sample marker | "SMALL SAMPLE" in amber 11px semibold uppercase beside the teammate's name. |
| Source access status | `StatusDot`: emerald dot + "Opened and read" in the normal tone; anything else an amber dot with amber semibold text ("Not opened", "Not reachable"). A parenthetical qualifier from the server is shown beneath in muted 12px. |
| Finding card | Hypothesis 15px semibold with a status `Badge` (open = amber "OPEN HYPOTHESIS", supported = emerald, rejected = red, inconclusive = neutral), sample size line, Supporting and Contradicting lists side by side with counts, then proposed experiment, result and limitations. |
| Reviewed-by-a-person banner | First element of Evaluations: amber-ringed card, "REVIEWED BY A PERSON: N OF M" in display 17px amber, the server's note beneath, verbatim. |

## 10. Vocabulary

Never used in UI copy: lock, guaranteed winner, free money, risk-free, can't lose, sure thing; and for market data:
sharp money, smart money, insiders, "confirms the projection", or wording that calls polled data continuous.
There are no buy / sell / trade / order controls anywhere. The fixed notice
"Research and paper testing only. No outcome is guaranteed. No real-money execution." is on every page.

## LineupCard (`components/lineup-card.tsx`)
Compact lineup board card used as the default view on `/lineups`: tipoff time header, two team columns
(logo, abbreviation, status bar and label, five starters, "May not play"), footer with the observed game line.
Status colours: confirmed = accent, projected = warn with the words "not official", unknown = muted
("Awaiting Lineup", never placeholder players). Availability tags are text (Q, D, DTD, P, OUT) with a tooltip
carrying the full status and detail. The layout convention is common to lineup boards; all data, wording and
styling are GIZER's own and no third-party content is used.
