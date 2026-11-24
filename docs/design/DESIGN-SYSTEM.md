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

## 10. Vocabulary

Never used in UI copy: lock, guaranteed winner, free money, risk-free, can't lose, sure thing. The fixed notice
"Research and paper testing only. No outcome is guaranteed. No real-money execution." is on every page.
