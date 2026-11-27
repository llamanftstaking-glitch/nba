# GIZER NBA design system — Courtside

Status: IMPLEMENTED in `apps/web` (stage one, 2026-11-27). Approved direction: Concept A "Courtside"
(`docs/design/aesthetic/06-CONCEPT-COURTSIDE.md`). This file replaces the dark emerald system. Where this
file and a design skill disagree, this file wins; where this file and `CLAUDE.md` disagree, `CLAUDE.md` wins.

Sources of truth in code: `apps/web/app/globals.css` (CSS variables, type classes, table base),
`apps/web/tailwind.config.ts` (the Tailwind theme mapped onto those variables), `apps/web/components/ui/*`
(primitives), `apps/web/lib/nav-destinations.json` (navigation), `apps/web/lib/team-colors.ts` (team colours).

## 1. The idea

The product is a box score that grew a research desk. Scores, teams and players are set like a broadcast
scoreboard on a printed stat sheet; the analysis sits one layer down on the same ruled sheet.

Three rules hold everything else up:

1. **Ink is observed, orange is estimated.** Anything a GIZER model estimates (a probability, a projection, a
   pregame column) is the only thing allowed to carry the accent. Nothing observed (a score, a market price, a
   box-score line) is ever orange. Orange also marks a game in progress (the live dot and the word LIVE).
2. **Rules, not boxes.** Structure comes from two rule weights and alignment. A section is a heading on a 2px ink
   rule with its content set directly on the page.
3. **Honesty lives in the status slot.** "Final", "Live", "Delayed", "Stale", "Projected, not official", "Model
   estimate" and "Paper research only" are set in the same small capitals in the place a scoreboard puts "Final".
   No warning boxes.

Light theme only.

## 2. Colour tokens

Contrast is the WCAG 2.1 ratio, computed from the hex values. Text needs 4.5:1; graphics and control boundaries 3:1.

| CSS variable | Tailwind name | Hex | Role | on paper | on sheet | on band |
|---|---|---|---|---|---|---|
| `--bg` | `bg`, `paper`, `card`, `panel` | `#F5F5F1` | page ground; a section has no fill of its own | | | |
| `--bg-2` | `bg2`, `sheet` | `#FFFFFF` | top bar, dialogs, sheets, inputs, outline buttons | | | |
| `--elevated` | `raised`, `band` | `#ECEDE8` | table head band, selected row, hover | | | |
| `--text` | `ink`, `accent` | `#12161A` | scores, names, body, strong rules, primary buttons, links | 16.63 | 18.18 | 15.45 |
| `--text-soft` | `soft` | `#2A3037` | long-form body | 12.19 | 13.32 | 11.32 |
| `--text-2` | `muted` | `#454C53` | secondary text | 7.97 | 8.71 | 7.40 |
| `--text-3` | `faint` | `#646B72` | tertiary text, never below 13px | 4.94 | 5.40 | 4.59 |
| `--border` | `line` | `#D5D7D1` | hairlines (decorative; never the only carrier of meaning) | 1.33 | 1.45 | 1.23 |
| `--rule-2` | `rule-2` | `#B4B8B1` | the rule under a table head | 1.84 | 2.01 | 1.71 |
| `--border-strong` | `line-strong` | `#646B72` | input, select and outline-button boundaries | 4.94 | 5.40 | 4.59 |
| `--model` | `model` | `#E8471C` | rim orange, graphics only: the estimate tick, the live dot | 3.59 | 3.93 | 3.34 |
| `--model-text` | `model-text`, class `.model` | `#B5330B` | the same hue for text | 5.58 | 6.10 | 5.18 |
| `--warn` | `warn` | `#8A5200` | caution text and its 4px left rule: stale, projected, missing | 5.84 | 6.39 | 5.43 |
| `--error` | `bad` | `#A8162B` | failure text and its left rule | 6.83 | 7.46 | 6.34 |
| `--data` | `info` | `#1F4E79` | neutral data hue: evidence meter, a single chart series | 7.93 | 8.66 | 7.36 |
| `--teal` | `teal` | `#5F6B76` | second neutral series | 4.99 | 5.45 | 4.63 |

White on ink (primary button) is 18.18:1.

**`accent` is ink.** The token name is kept so older class names (`bg-accent`, `text-accent`) keep working: they
now mean "emphasis", which is ink. The estimate colour has its own names (`model`, `model-text`) and must be asked
for on purpose.

**Status colours are not accents.** `warn` and `bad` appear as text plus a 4px left rule, always with the words.
There is no green: "ok", "ready" and "confirmed" are ink.

**Team colours** (`lib/team-colors.ts`, public brand colours, design tokens rather than data) appear only as the
bar at the start of a scoreboard row, in a box-score team heading, and on the leading side of a team-comparison
bar. An unknown team gets ink.

**Price moves** are signed ink with an arrow. Never green, red or orange.

## 3. Type

One family across its width axis: **Archivo Variable** (weight 100–900, width 62–125), self-hosted from
`@fontsource-variable/archivo/wdth.css`. Normal width for text; condensed and heavy for scores, names and
headings. No second family. Monospace is used only for formulas and code in CORTEX.

Sizes are in `rem`. **Nothing renders below 13px** (asserted on every route by the smoke test).

| Step | Class | Size / line | Width, weight | Used for |
|---|---|---|---|---|
| Score, hero | `.score` + size | 72 (phone 52) / 0.9 | 62, 800 | the featured game's totals on Today |
| Score, header | `.score` | 44 (phone 36) | 62, 800 | the game page header |
| Score, row | `.score` | 32 | 62, 800 | scoreboard rows, leaders |
| Team name | `.team-name` | 44 hero, 28 header, 22 row | 62, 800, uppercase | team names and abbreviations on scoreboards |
| Page title | `.h-page` | 40 (phone 30) / 1.0 | 70, 750 | one `h1` per page |
| Section | `.h-section` | 24 (phone 22) / 1.2 | 80, 700 | `Panel` and `SectionTitle` headings |
| Sub | `.h-sub` | 18 / 1.3 | 92, 650 | row titles, contract names |
| Body | `text-base` | 16 / 1.5 | 100, 400 | prose, inputs on phones |
| Dense | `text-sm` | 15 / 1.4 | 100 | table cells and controls on desktop |
| Secondary | `text-xs` | 14 / 1.25 | 100 | captions, notes, the workspace row on desktop |
| Small | `text-2xs` | 13 / 1.125 | 100 | the floor: intervals, units, sub-labels |
| Scoreboard label | `.slot`, `thead th` | 13 / 1.2 | 100, 650–700, uppercase, +0.05–0.06em | table column heads and the status slot only |

Numbers use tabular figures (`.num`, and every `<table>`). Uppercase is limited to table column heads, the
status slot and team names. Labels above fields and values are sentence case.

## 4. Space, grid, shape

* Content width 1320px; gutters `--gutter` 16px (phone), 24px (≥ 768), 32px (≥ 1100).
* Spacing steps 4, 8, 12, 16, 24, 32, 48, 72. Sections on a page are separated by 36–56px; columns of unboxed
  content by 48px.
* Two rule weights: 2px ink opens a section or closes a scoreboard; 1px hairline separates rows.
* Radius **4px** on anything that has a box (controls, inputs, image masks, dialogs). Dots stay round.
* Shadows only on overlays (`shadow-overlay`, `shadow-sheet`).
* Motion: the live dot pulse, the loading bar, dialog transitions. All stop under `prefers-reduced-motion`.

## 5. Components

| Component | File | Rule |
|---|---|---|
| `Panel`, `SectionTitle` | `ui/panel.tsx` | A heading on a 2px ink rule, content on the page. Not a box. `aria-labelledby` from the heading. `tone` colours the heading word, never a frame. Never nested. |
| `PageHeader` | `ui/panel.tsx` | One `h1` (`.h-page`), a lede, optional right slot. |
| `Tile`, `Metric`, `SummaryTiles` | `summary.tsx`, `ui/panel.tsx` | Typographic stats: a condensed figure with a plain label under it. No box, no icon. The label precedes the value in the document. |
| `Badge` | `ui/badge.tsx` | A weighted word in a tone. Only the top research tier (`accent-solid`) keeps a small ink box. |
| `StatusDot` | `ui/badge.tsx` | A 6px mark plus the word; neutral is a hollow ring. |
| `StatusChip`, `FreshnessMark`, `LiveDot` | `live/common.tsx` | The status slot. LIVE is orange with a pulsing dot; Final is ink; anything abnormal is amber. |
| `StackedBoard` | `live/board.tsx` | The scoreboard at three sizes: `hero` (Today), `header` (game page, more compact), `row` (/live). Away over home, periods, total; team-colour bar; the trailing side is lighter in weight as well as tone. |
| Scoreboard strip | `live/scoreboard-strip.tsx` | The bug size: one unboxed cell per game on hairlines, snap-scrolling, collapsible. |
| Tables | `globals.css` base, `ui/data-table.tsx` | Band behind the head, uppercase 13px heads, hairline rows, right-aligned tabular figures, `.sticky-col` first column, `aria-sort` and a bolder head on the sorted column, the sorted cells on the band. A table that can be wide scrolls inside a labelled, focusable region. |
| `ProbabilityDisplay`, `ProbScale` | `prob.tsx` | The estimate in orange with its interval; the scale shows the estimate tick, the interval wash and the price break-even notch on one 0–100 rule. |
| `Button`, `linkButton`, `textLink` | `ui/button.tsx` | Primary is ink; outline is a sheet with a 5.4:1 boundary; links are ink with an underline (class `.link`). 44px tall on touch, 36–40px on a pointer. |
| `Field`, `Input`, `Select` | `ui/field.tsx` | Sentence-case label, sheet fill, 5.4:1 boundary, 16px text on phones. |
| `Tabs` | `ui/tabs.tsx` | Underline tabs. Roving tabindex; arrow keys, Home and End move between tabs. |
| `Sheet` | `ui/sheet.tsx` | Radix Dialog: focus in, trapped, returned; Escape and the scrim close it. Bottom sheet on phones, right drawer from 768px. |
| `Collapsible` | `ui/collapsible.tsx` | Native `<details>` on a hairline. |
| `Meter`, `ShareBar` | `ui/meter.tsx` | A 4px bar on a rule, always with a label and a value. |
| Shell | `shell/app-shell.tsx`, `all-pages.tsx`, `search-dialog.tsx` | See §6. |

Row actions: a table row is never a button. The row's name is a real `<button>` or link in a row-header cell; a
click elsewhere on the row is a pointer convenience on top of it.

## 6. Navigation model

Five workspaces in the top bar (Today, Games, Players, Markets, Research), plus Ask JARVIS, All pages and the
account control. A workspace row under the bar lists every page of the current workspace. The sixth group,
Intelligence & System, is opened from All pages. Phones get a five-item bottom tab bar whose fifth item, More,
opens the full grouped list. The complete destination table is in `docs/architecture/FRONTEND-IA.md` §1 and the
machine-readable list is `apps/web/lib/nav-destinations.json`.

Rules: at most five primary workspaces; every page is listed in exactly one group; a new page is added to the
JSON list (the smoke test then requires it to be reachable by click on desktop and on a phone); no page is
reachable only by URL; every route has its own document title; detail pages have a breadcrumb.

## 7. State patterns

| State | Pattern |
|---|---|
| Loading | One sentence and a thin moving bar (`LoadingState`). No grey boxes guessing at content. After 8 seconds the sentence says the server has not answered. |
| Slow | Where a list is known to be heavy (Kalshi), a deadline: "Still loading… this list is large" with Retry and Keep waiting. The header, filters and status line never wait for the table. |
| Empty | One honest sentence in ink on the page, an optional second line, an action where one exists (`EmptyState`). No frame, no icon. |
| Error | `role="alert"`, a 4px red left rule, what failed, the server's message and HTTP status, Retry (`ErrorState`). |
| Stale / delayed | The status slot in amber plus the last verified time. Old rows stay, marked "Updating…". |
| Not available | `—` with `aria-label="not available"`. Never zero, never blank. |
| Not official | "Projected — not official" wherever a projected lineup is shown. |

## 8. Accessibility requirements

* Every text token ≥ 4.5:1 on paper, sheet and band (table in §2). No `opacity` on text.
* One focus style: a 2px ink outline with 2px offset on everything focusable, native controls included. There is
  no global `outline: none`.
* Skip link first in the Tab order. One `h1` per route. A distinct `document.title` per route.
* Every overlay is a Radix Dialog (JARVIS panel, All pages / More, search, every `Sheet`).
* Tables are tables: caption, scoped headers, `aria-sort`; rows are rows.
* Targets ≥ 44px on touch layouts for buttons, tabs, navigation and sheet rows.
* Colour is never the only signal: the leading team is heavier as well as darker; moves carry an arrow and a
  sign; status always has its word.

## 9. Prohibited patterns

Grids of identical bordered cards. Boxes inside boxes. Glow, gradient washes or coloured rings as decoration.
Uppercase tracked micro-labels as the default label style. Monospace for ordinary numbers. Text below 13px. Icons
or badges that carry no information (an icon beside every heading, a navigation icon per link). Empty states that
keep a frame. Skeletons with no words. Orange on anything observed. Green and red for price moves. Team colours
outside scoreboards and game charts. The product vocabulary forbidden by `CLAUDE.md`.

## 10. Known gaps (see `docs/design/aesthetic/07-APP-INTEGRATION.md` §8)

Pages that inherit the system through tokens and primitives still carry some older habits (label-above-value
grids, tinted left-ruled notes, lineup boards with their own frames). `title` attributes still hold some
explanations. Charts were re-coloured, not redrawn. No dark theme.
