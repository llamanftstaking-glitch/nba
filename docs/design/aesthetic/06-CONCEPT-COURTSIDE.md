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

