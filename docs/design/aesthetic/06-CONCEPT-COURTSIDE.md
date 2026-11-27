# Concept A · Courtside

Prototype: `prototypes/aesthetic/src/concepts/a/` (routes under `/a/`). Design prototype on the
2026-11-25 snapshot. Not live, not wired to production. Status of this document: IMPLEMENTED as a
prototype, screenshots taken and reviewed; nothing here is DEPLOYED.

## 1. Rationale (written before any code)

### The idea
The product is a box score that grew a research desk: scores, teams and players are set like a
broadcast scoreboard on a printed stat sheet, and the analysis sits one layer down in the same ruled
sheet. Observed facts are printed in ink; anything GIZER's models estimate is the only thing allowed
to carry the accent colour, so the reader can always tell what happened from what is estimated.

### Light, on purpose
Light theme only. Reasons: (1) a box score is a print object and the long tables and research prose
read better dark-on-light; (2) the team marks we hold are drawn for light grounds (several are black
or navy and vanish on a dark one); (3) it is the furthest honest distance from the rejected
black-with-emerald terminal. One theme done carefully instead of two.

### Palette (contrast computed with the WCAG 2.1 relative-luminance formula)

| Token | Hex | Role | On paper `#F5F5F1` | On sheet `#FFFFFF` | On band `#ECEDE8` |
|---|---|---|---|---|---|
| `--paper` | `#F5F5F1` | page ground (neutral, not cream) | | | |
| `--sheet` | `#FFFFFF` | the scoreboard slab, sticky bars, dialogs | | | |
| `--band` | `#ECEDE8` | table header band, selected row, inset fields | | | |
| `--ink` | `#12161A` | scores, names, body text, strong rules | 16.63 | 18.18 | 15.45 |
| `--ink-2` | `#454C53` | secondary text | 7.97 | 8.71 | 7.40 |
| `--ink-3` | `#646B72` | tertiary text, never below 13px | 4.94 | 5.40 | 4.59 |
| `--rule` | `#D5D7D1` | hairlines (decorative separation, not relied on alone) | 1.33 | 1.45 | 1.23 |
| `--accent` | `#E8471C` | rim orange: marks, bars, the live dot (graphics, 3:1 needed) | 3.59 | 3.93 | 3.34 |
| `--accent-text` | `#B5330B` | the same hue for text | 5.58 | 6.10 | 5.18 |

White on `--ink` 18.18 (primary button). Ink on `--accent` 4.63. Team colours (a small constant map of
public brand colours in `teams.ts`, not data) appear only on scoreboards, matchup headers and the two
series of a game chart; the darkest pair in the featured game are CLE `#860038` (9.28 on paper) and
NYK `#006BB6` (5.08).

The single accent has one meaning: **a GIZER model estimate, or a game in progress.** Nothing observed
(score, market price, box score line) is ever orange. Price changes are signed ink with an arrow, not
green and red.

### Type
One family, used across its width axis: **Archivo Variable** (weight 100–900, width 62–125).
Condensed and heavy it is a scoreboard face; at normal width it is a plain readable grotesque. Using
the width axis instead of a second family is the identity: the same letterforms get narrower and
heavier as the content gets more "broadcast". Numerals use tabular figures everywhere they sit in a
column. No monospace.

| Step | Size / line | Width, weight | Used for |
|---|---|---|---|
| Score XL | 168 / 0.82 (mobile 76) | 62, 800 | the hero final score |
| Score L | 64 / 0.9 (mobile 40) | 62, 800 | scoreboard rows, player line |
| Display | 72 / 0.9 (mobile 40) | 62, 800, uppercase | team names, player surname |
| Page title | 40 / 1.0 (mobile 30) | 70, 750 | one per page |
| Section | 24 / 1.2 (mobile 22) | 80, 700 | section headings |
| Sub | 18 / 1.3 | 92, 650 | row titles, contract names |
| Body | 16 / 1.55 | 100, 400 | prose, table cells |
| Secondary | 14 / 1.45 | 100, 450 | captions, notes (floor 13) |
| Label | 13 / 1.2 | 100, 650, uppercase +0.06em | table column heads and scoreboard status only |

### Grid, spacing, radius
* 12 columns, 1320px max content width, 32px gutters (24 at 1024, 16 on phones), 32px column gap.
* Spacing steps: 4, 8, 12, 16, 24, 32, 48, 72, 96. Sections are separated by 72 on desktop, 48 on phones.
* Structure comes from two rule weights: a 2px ink rule opens a section or a table head; a 1px hairline
  separates rows. No shadows except the dialog and sheet overlays.
* Radius: **4px**, on everything that has a box (controls, inputs, image masks, dialogs). Nothing else is rounded.

### Navigation
A top bar, not a sidebar: wordmark, five destinations (Today, Games, Players, Markets, Research),
global search, and an "Ask JARVIS" button that opens a side sheet from any page (`/a/jarvis` is the
full-page version). Secondary navigation lives inside a destination: game tabs, research sections,
the player switcher. On phones the five destinations become a bottom tab bar; search and JARVIS stay
in a slim top bar.

### Three things done differently from a generic dashboard
1. **One scoreboard, three sizes, no cards.** A stacked two-row line score (away over home, quarters,
   total) is the hero on Today and Game, the row on Scores and the bug in the slate strip. Columns line
   up down the whole page, so the layout is held by alignment and rules instead of boxes.
2. **Colour carries provenance.** Ink is observed, orange is estimated. A model probability is drawn as
   a tick on a ruled 0–100 scale with its interval and the price break-even marked on the same scale,
   never as a coloured badge or a big green percentage.
3. **Honesty lives in the status slot.** Every scoreboard has one slot where "Final" goes. The same slot,
   in the same type, carries "Projected, not official", "Snapshot, polled", "Model estimate, not a hit
   rate" and "Paper research". No warning boxes.

## 2. What changed from the plan while building

* The model-estimate rule got stricter: every projected figure (box-score pregame row, projected minutes,
  joint probability, "Pregame projection" column on Scores) is orange text; nothing observed is.
* JARVIS became a fixed-height page (conversation scrolls inside, composer always visible) instead of a
  long document with a sticky composer, after the sticky version covered the answer in screenshots.
* Type floor: the smallest text anywhere is 13px (the only smaller glyph is the 9px change arrow, a
  graphic). Uppercase is limited to table column heads, the status slot, team names, the player surname
  and combination names.
* Lightweight Charts is used once, for the Kalshi price history. Its TradingView logo stays visible in
  the chart and a text credit with a link sits directly under it. The game-flow, form, minutes and
  rotation charts are hand-drawn SVG/CSS.
* Team colours are a constant map in `lib.tsx` (public brand colours). They are design tokens, not data.

## 3. Components built

| Component | File | Notes |
|---|---|---|
| Shell: top bar, five destinations, skip link, per-page `document.title`, footer | `index.tsx`, `styles.css` | sticky on desktop; `/` opens search |
| Bottom tab bar (phones) | `index.tsx` | five items, 64px tall, 13px labels |
| Global search dialog | `index.tsx` (`SearchDialog`) | Radix Dialog (focus trap, Esc); players, games, teams, contracts; items not in the snapshot are listed but disabled and say so |
| Assistant sheet | `index.tsx` (`AssistantSheet`), `pages/Jarvis.tsx` (`AssistantBody`) | Radix Dialog; right sheet on desktop, bottom sheet on phones; opens from every page (`?panel=jarvis` for screenshots) |
| Scoreboard, hero size | `Scoreboard.tsx` (`HeroBoard`) | away over home, quarters, 168px total; phone version drops quarters into a mini line score |
| Scoreboard, row size (game row + line score) | `Scoreboard.tsx` (`GameRow`) | used for the nine finals and the live / stopped-feed / scheduled design states |
| Scoreboard, bug size (scoreboard strip) | `Scoreboard.tsx` (`Bug`) | slate strip on Today |
| Sticky score header | `pages/Game.tsx` (`.gamebar`) | appears when the hero scrolls away (IntersectionObserver); holds the tabs |
| Status slot | `lib.tsx` (`Slot`) | Final, Snapshot, Stale, Projected not official, Model estimate, Paper research only, Live |
| Team mark, headshot with fallbacks | `lib.tsx` (`TeamMark`, `Headshot`) | abbreviation or initials when the image is missing or fails |
| Stat table | `styles.css` (`.stat`), used in Game, Player, Markets, Research, Jarvis | ink rule + band head, hairline rows, right-aligned tabular figures, sticky first column, sorted column tinted |
| Box score | `pages/Game.tsx` (`BoxTable`) | sortable within starters and bench, totals, DNP line, pregame projection toggle |
| Game flow chart | `GameCharts.tsx` (`LeadChart`) | SVG step chart of the lead, team colours, peaks labelled |
| Team comparison bars | `pages/Game.tsx` (`Compare`) | mirrored bars; only the leader's bar takes its team colour |
| Rotation stints | `GameCharts.tsx` (`StintChart`) | CSS timeline, minutes against projection |
| Plays list | `pages/Game.tsx` (`PlayList`) | all / scoring only |
| Player header | `pages/Player.tsx` (`.ph`) | first name small, surname up to 124px, observed line beside it |
| Form chart | `pages/Player.tsx` (`FormChart`) | SVG bars per appearance, missed games as gaps, projection range and observed value beside it |
| Minutes range | `pages/Player.tsx` (`MinutesBar`) | projection range against the last-10 low and high |
| Pick row and probability scale | `Picks.tsx`, `lib.tsx` (`ProbScale`) | estimate tick, interval band, break-even notch on one 0 to 100 rule |
| Market table | `pages/Markets.tsx` | sortable; filters by type, game, text |
| Market history and detail | `pages/Markets.tsx` (`Detail`, `PriceChart`) | side panel on desktop, sheet under 1100px; chart, observation table, rules, frequencies, research status |
| Loading, past-deadline, empty, error states | `pages/Markets.tsx` (`.mk-state`) | header, filters and sync line always render; no skeleton rows |
| Empty day | `pages/Scores.tsx` (`.empty`) | day switcher on a day with no data |
| Research workspace nav | `pages/Research.tsx` | Picks, Combinations, Edition, Paper tracker, Results (`?view=`) |
| Evidence panel, combination row, ticket, calibration table | `pages/Research.tsx` | |
| Assistant message, tool trail, sources, composer | `pages/Jarvis.tsx` | question as a headline, answer as an article, `<details>` trail, depth selector, attach-image button, budget line |

## 4. Critique log

**Pass 1 (Today, Scores, Game; 1440 and 390).** Eye lands on 121 and KNICKS, as intended. Faults:
leader names were truncated with ellipses; the "Model estimate" head wrapped; the day switcher was
unstyled; quarter heads on Scores did not line up with the numbers (the hidden header row was sizing
the fixed table); "Pregame projection" in orange was repeated nine times down the page and read as
badge spam; the chart's axis labels were clipped on the phone; the phone hero had no line score; the
phone leaders block took six rows. Fixes: names wrap; column widths rebalanced; day switcher designed;
`<colgroup>` on the line score; the projection label moved to a single column head; chart padding;
mini line score on phones; one leader per team on the phone.

**Pass 2 (same pages plus box score, research tab, assistant sheet).** Faults: "Timberwolves" was
truncated on Scores; leaders sat under a "Pregame projection" head; the tab bar's rule bled 32px past
the content edge for no reason; "End of Game" and "End of the 4th Quarter" filled the last-plays list;
the y-axis promised +25 for a largest lead of 19; phone leaders wrapped names into three lines; the
assistant sheet opened with a focus ring on the close button. Fixes: wider team column; leaders
labelled and moved below the projection; rule held to the grid; period markers filtered from the short
list; axis rounds to the next 5; phone leaders restacked; focus goes to the question field.

**Pass 3 (all seven pages; 1440, 390, plus Today and Game at 1920, 1024, 768).** Faults: the Markets
table lost its last column at 1440; the phone Markets page overflowed (the design-state control); the
"Season average" label sat on top of bars; ranked picks in the workspace wrapped names and heads; the
JARVIS composer covered the answer, and on the phone it left about three lines of conversation; at 768
the hero's team names ran into the quarter columns and the leaders collided; one chart label was 11.5px.
Fixes: narrower cell padding and shorter heads, Line column dropped on phones (it is in the title);
control scrolls inside itself; average moved to the legend; workspace pick grid retuned; JARVIS rebuilt
as a fixed-height layout with a compact phone composer; tablet hero sizes; 13px floor.

## 5. Checks run (2026-11-27)

* `node scripts/shots.mjs a`: 49 page/viewport checks, 0 needing attention (no horizontal overflow,
  0 console errors, 0 failed requests, 0 broken images at 1920x1080, 1440x900, 1280x800, 1024x768,
  768x1024, 430x932, 390x844).
* 21 extra state screenshots (`state-*.png`: game tabs, sticky header, assistant sheet, search, market
  states, research views), taken with a throwaway Playwright script: no overflow, no console errors.
* `node scripts/contact-sheet.mjs a`: `contact-desktop.png`, `contact-mobile.png` written.
* `npm run build`: passes (`tsc -b && vite build`).
* NOT VERIFIED: screen reader output, real-device touch behaviour, Safari and Firefox rendering,
  keyboard walk-through by a person. Focus trapping relies on Radix Dialog and was not tested by hand.

## 6. Accessibility notes

* Contrast: table in section 1. Body 16.63:1, secondary 7.97:1, tertiary 4.94:1 on paper (4.59:1 on the
  band, its worst case), accent text 5.58:1. The accent as a graphic is 3.59:1 on paper and 3.34:1 on
  the band: above 3:1, with little margin. Hairlines (1.33:1) are never the only carrier of meaning.
* Focus: 2px ink outline with 2px offset on everything focusable; skip link first in the tab order.
* Dialogs (search, assistant, contract detail) are Radix Dialogs: focus is trapped, Esc closes, focus
  returns to the trigger; each has a title.
* Targets: buttons, tabs, day switcher and tab-bar items are 44px or taller. Known exception: the small
  depth selector in the composer is 40px tall, and column-sort buttons are 28px tall inside 36px cells.
* Tables are real tables with `scope`, captions or labels, `aria-sort` on sorted columns; scrolling
  regions are focusable and labelled. Charts carry a text summary in `aria-label`; the team comparison
  has a visually hidden table twin. Pick rows use ARIA table roles on a grid.
* Colour is never the only signal: winners are heavier as well as darker; price changes use arrows with
  hidden "up"/"down" text; missing inputs use a hollow marker and the words.
* Motion: one 280ms page fade, sheet and overlay transitions under 250ms, a pulsing live dot and a
  loading bar. All are removed under `prefers-reduced-motion`.
* Each page sets its own `document.title`.

## 7. Known weaknesses

* Today and Game open with the same hero. It is consistent, and it is also repetitive when you click
  from one to the other.
* The hero wastes the middle of the row at 1440 and wider: team name on the left, numbers on the right,
  a wide empty band between them.
* The probability scale is honest and dull: every qualified pick sits between 50 and 60 percent, so six
  rows look nearly identical. The design does not make that sameness interesting.
* The slate strip and the Scores rows show little about the eight other games because the snapshot
  holds leaders and box scores for one game only. With full data the row needs a second design pass.
* Markets: the price chart is six or seven points with index-spaced time, and its axis labels are the
  library's (one is bolded at the day boundary). It looks sparse. A hand-drawn SVG would fit the page
  better and remove the attribution requirement.
* Research combinations repeat the same two method sentences on every row.
* Player page is long on phones (about eleven screens) and the game log needs sideways scrolling past
  the fifth column.
* The JARVIS page hides the answer's later sections behind an inner scroll with no visual hint that
  more follows; on the phone the suggested questions are below the fold.
* Leader names wrap to two lines at 1440 and 1920.
* Orange projections and the NYK orange in the team mark sit close together in a few places; the accent
  is also near the red of several team colours used as bars.
* One typeface for everything is a risk: at body sizes Archivo is plain, and the identity leans entirely
  on the condensed weights.
* No dark theme.

## 8. Wiring it to the real app (Next.js, Tailwind)

* This is plain CSS under `.concept-a` with custom properties. In `apps/web` the tokens map to a
  Tailwind theme (colours, a `font-stretch` utility, the two rule weights, 4px radius), and the existing
  `docs/design/DESIGN-SYSTEM.md` would have to be rewritten around them: an owner decision, not a
  refactor.
* Fonts: `@fontsource-variable/archivo/wdth.css` here; in Next use `next/font/local` with the same
  variable file so the width axis is available, and check the licence file ships with it.
* Navigation: the current app has many more destinations than five. Each needs a home inside Today,
  Games, Players, Markets or Research (or JARVIS), and some pages (system health, budget, admin) need a
  sixth, low-key place that this prototype does not design.
* Data: every page here reads one static JSON. Real pages need loading, stale and error states per
  section; only Markets has them designed. The live states on Scores are drawn from replayed values and
  were never driven by a real poll.
* Team colours and third-party marks and photos need a proper asset decision (they are not cleared for
  redistribution) before anything public.
* The assistant composer, search actions for teams, image attach and "send" are inert. Sorting, tabs,
  filters, the day switcher, the player switcher and the dialogs work.
* `lightweight-charts` adds weight for one small chart; replacing it with SVG is the likely outcome.
* Charts are sized with a ResizeObserver on the client; under server rendering they need a fixed
  aspect-ratio fallback to avoid layout shift.
