# PROJECT AESTHETIC 07 — Courtside in the real app (stage one)

Date: 2026-11-27. Branch `feature/project-aesthetic`. Scope: `apps/web` only. No backend file was changed.
Status words are used as in `CLAUDE.md`. Everything in §5 was run to completion on a local production build
against the fixture API (`e2e/mock-api.mjs`); **nothing here is DEPLOYED and nothing was observed on Server M or
with production data.**

## 1. What changed

| Area | Change | Files |
|---|---|---|
| Tokens | Dark emerald set replaced by the Courtside light set (paper, sheet, band, four ink levels, hairline rules, one orange for model estimates). Token **names** kept (`bg`, `card`, `raised`, `line`, `ink`, `muted`, `faint`, `accent`, `warn`, `bad`, `info`) so every page re-themed at once; `accent` now resolves to ink and the estimate colour has its own names (`model`, `model-text`). Glow shadow, gradient wash, backdrop blur and coloured rings removed. | `app/globals.css`, `tailwind.config.ts` |
| Type | Archivo Variable, self-hosted, one family across the width axis. Sizes in `rem`; floor 13px; body 16px; dense tables 15px. Inter and Barlow Condensed packages removed. | `app/layout.tsx`, `package.json` |
| Mechanical pass | A one-off codemod over `app/`, `components/`, `lib/` (80 files): removed `uppercase`, `tracking-*` and italic from labels and headings; turned hand-written cards (`rounded-lg bg-card ring-1 …`) into ruled blocks; full-strength hairlines; control boundaries to the 5.4:1 token; pills to 4px; chart hex values and tick sizes to the light palette; opacity dimming of text removed; tinted inner boxes and framed alerts turned into left-ruled notes. | 80 + 24 files |
| Primitives | `Panel` is a heading on a rule, not a box; `Tile`/`Metric` are typographic stats; `Badge` is a weighted word; tables get the box-score treatment from a base style; `Tabs` have arrow keys; `Sheet` is a Radix Dialog; loading, empty and error states redesigned. | `components/ui/*`, `components/summary.tsx` |
| Shell | 27-link sidebar replaced by a top bar (five workspaces, search, All pages, Ask JARVIS, account), a workspace row listing every page of the workspace, a bug-size scoreboard strip, breadcrumbs on detail pages, a footer notice, a five-item bottom tab bar and a More sheet. Skip link. Per-route document titles. | `components/shell/*`, `lib/nav.ts`, `lib/nav-destinations.json` |
| Search | A real dialog (`/` or Ctrl/Cmd+K): navigation destinations matched in the browser, players from `GET /players?q=`. Nothing is listed that cannot be opened. | `components/shell/search-dialog.tsx` |
| Pages | Hand-redesigned: `/`, `/live`, `/games/[id]` (header, Overview, Box Score, plus restyled Plays and Rotations), `/picks`, `/kalshi-intelligence`, `/jarvis` and the JARVIS panel, `/login`, `/games` (list). | see §3 |
| Tests | `e2e/smoke.mjs`: navigation proof, search, skip link, titles, breadcrumb, focus trapping and return, home fold, Kalshi slow / error / empty states; font floor raised from 11px to 13px. | `e2e/smoke.mjs` |

All routes, query parameters, redirects, data fetching and existing `data-testid`s are unchanged, with these
exceptions, each replaced by an equivalent or stricter check:

| Removed element | Why | Replacement check |
|---|---|---|
| `[data-testid="sidebar"]` (groups, 27 links, live dot) | the sidebar is gone | top bar has the five workspaces; every one of the 36 destinations is clicked from the workspace row, from All pages and from the More sheet; the live dot is asserted beside Live Games in the Games row, beside Games in the top bar and in the bottom tab bar |
| Brand caption "Parlay Command Center" | the wordmark is type only | the wordmark link to `/` is asserted in the top bar |
| Overview order `stat-strip` first | the owner asked for picks above the fold | order is hero, slate, numbers, props, research, system status last; picks asserted above the fold at 1440×900 |
| Kalshi move colour `rgb(125,196,240)` | moves are signed ink now | up and down both ink, with an arrow |
| `tr[role="button"]` on Kalshi and props rows | accessibility finding A7 | rows keep row semantics; a real button in a row-header cell; keyboard opening asserted |
| JARVIS "Deep review" and "Quick answers" checkboxes | shown as one control | a radio group of three (`jarvis-quick`, `jarvis-standard`, `jarvis-deep`); the same `mode` values are sent; deep resets after a send; no checkbox remains |
| Desktop `Log out` in the top bar | moved into the account menu | the menu is opened, the signed-in email asserted, then Log out |
| `LiveNav` sub-navigation on `/live*` | its three links are in the Games workspace row | covered by the navigation proof |

## 2. Navigation proof: nothing was lost

The condition of approval was "do not lose the menus we work on".

* **Before** (`git show main:apps/web/lib/nav.ts`): 27 sidebar destinations + 9 pages not in the sidebar = **36**.
* **After** (`apps/web/lib/nav-destinations.json`): **36** destinations in six groups, same URLs, same labels, plus
  one shortcut (JARVIS Briefings, a tab of `/jarvis`).

| Group | Where it lives | Pages |
|---|---|---|
| Today (2) | top bar + its workspace row; bottom tab on phones | Overview `/`, Daily Editions `/research/daily` (+ shortcut JARVIS Briefings) |
| Games (7) | top bar + row; bottom tab | Today's Games, Live Games, Starting Lineups, Matchup Intelligence, Injuries & Availability, My Following, Research Tracker |
| Players (6) | top bar + row; bottom tab | Player Explorer, Player Props, Minutes Intelligence, Player Comparison, Historical Performance, Teams |
| Markets (3) | top bar + row; More on phones | Kalshi Markets, Markets, Shared-Risk Monitor |
| Research (9) | top bar + row; bottom tab | Top Picks, Parlay Research, Same-Game Research, Research Builder, Paper Tickets, Results, Strategy Performance, Simulations, Backtesting |
| Intelligence & System (9) | All pages menu and More sheet; its own row once inside; JARVIS also has the Ask JARVIS button | JARVIS, CORTEX, Research Lab, Agent Operations, Model Registry, Data Health, Settings, Operations Admin, AI Budget |

The nine pages that used to be reachable only from the Settings link list or the phone More sheet (Operations
Admin, AI Budget, My Following, Research Tracker, Shared-Risk Monitor, Markets, Simulations, Backtesting, Teams)
are ordinary destinations now.

What the smoke test asserts (all passing in the run recorded in §5):

1. The list on `main` is read from git and has 36 entries; every one is in the new list; the new list is at least
   as long; every label is unchanged; no duplicates; exactly five primary workspaces.
2. Desktop 1440×900: each of the 27 pages of the five workspaces is opened by clicking its workspace in the top
   bar and then the page in the workspace row, the link is inside the viewport, and the page is marked current in
   both places. All 36 are then opened one by one from the All pages menu. The menu is also opened and used from
   the keyboard.
3. Phone 390×844: the bottom bar has exactly five items, each ≥ 44px; the More sheet lists all 36 in six groups,
   each row ≥ 44px; all 36 are opened one by one by tapping them in the sheet.
4. Every one of the 36 URLs, plus the detail routes, still answers 200 and renders (the pre-existing per-route
   loop, unchanged).

## 3. Hand-redesigned versus inherited

**Hand-redesigned (layout rewritten against the prototype):**
`/` (compact scoreboard hero beside the top picks, warnings, JARVIS entry and injury changes, slate rows, the
slate in numbers, props, parlay counts, research, paper performance, system status last); `/live` and the
scoreboard strip (stacked scoreboard rows with line score); `/games/[id]` (compact matchup header, a size down
from the home hero; Overview with facing leaders, team comparison in team colours, score progression; Box Score
with the table treatment; Plays and Rotations restyled); `/picks` (estimate-first rows with the 0–100 scale);
`/kalshi-intelligence` (market table, independent header, deadline and error states); `/jarvis` and the JARVIS
panel (question as a headline, answer as an article, quiet trail and sources, one depth control); `/games` (the
slate as rows); `/login`; the shell.

**Inherited through tokens, primitives and the codemod (no layout work):** every other route: `/lineups`,
`/matchups`, `/injuries`, `/live/following`, `/live/research-tracker`, `/players`, `/players/[id]`,
`/players/compare`, `/players/history`, `/player-props`, `/minutes`, `/teams`, `/teams/[id]`,
`/kalshi-intelligence/[ticker]`, `/markets`, `/exposure`, `/parlays`, `/parlays/same-game`, `/builder`,
`/tickets`, `/results`, `/performance`, `/simulations`, `/backtesting`, `/research/daily`, `/cortex`,
`/cortex/[slug]`, `/research-lab`, `/agents`, `/models`, `/data-health`, `/settings`, `/admin`,
`/admin/ai-budget`. Twenty-five of them were looked at in screenshots at 1440×900 (see §6); three small repairs
were made on inherited pages (`/games` grid, a non-wrapping interval on `/results` and `/performance` that
overflowed a phone, upper-cased player names and "N=10" in the comparison table head).

## 4. Accessibility findings addressed (from `09-ACCESSIBILITY-FINDINGS.md`)

| Finding | State |
|---|---|
| A1 dialogs do not manage focus (S1) | FIXED and TESTED: JARVIS panel, All pages / More, search and every `Sheet` (Kalshi drawer, prop drawer, builder drawer, JARVIS sheets) are Radix Dialogs. Focus moves in, is contained, and returns to the control that opened it (`useReturnFocus`, because Radix only returns focus to a `Dialog.Trigger`). |
| A2 no bypass (S1) | FIXED and TESTED: skip link, first Tab stop, moves focus to `<main>`. |
| A3 one title for every page (S1) | FIXED and TESTED: 41 routes checked, all distinct. |
| A4 `faint` fails contrast (S1) | FIXED by token: 4.94 / 5.40 / 4.59 on paper / sheet / band. Computed, not measured per text node. |
| A5 invisible focus on native controls (S1) | FIXED: global `outline: none` removed; one 2px ink outline. Not asserted by a test. |
| A6 control boundaries (S2) | FIXED by token (5.40:1 on sheet). |
| A7 rows as buttons (S2) | FIXED and TESTED on the Kalshi table; fixed on the props table. |
| A8 tabs (S2) | PARTLY: roving tabindex and arrow keys added; no `aria-controls`; filters still use the tab role. |
| A9 opacity dimming (S2) | FIXED: removed from Kalshi rows and cards, did-not-play rows, invalidated selections. |
| A10 px sizes, 11–12px text (S2) | FIXED and TESTED: `rem`, floor 13px on every route. |
| A11 heading skips, A12 `title`-only explanations, A14 live regions (S2) | NOT DONE, except `aria-live="polite"` on a finished JARVIS answer and section `aria-labelledby` on `Panel`. |
| A13 small targets (S2) | PARTLY: navigation, tabs, sheet rows and buttons are ≥ 44px on touch; native checkboxes are 20px in the box score and 16px elsewhere. |

## 5. Checks run in this session (2026-11-27, local)

| Check | Command (in `apps/web`) | Result |
|---|---|---|
| Types | `npm run typecheck` | passed, 0 errors |
| Lint | `npm run lint` | passed, 0 errors, 0 warnings |
| Build | `npm run build` | passed; 41 static pages generated, 5 dynamic routes |
| Dependencies | `npm audit --omit=dev --audit-level=high` | found 0 vulnerabilities |
| Smoke | `node e2e/mock-api.mjs` (port 8000), `API_INTERNAL_URL=http://localhost:8000 npx next start -p 3000`, `node e2e/smoke.mjs` | **3688 passed, 0 failed** (full suite: desktop 1440×900 flows, phone 390×844 flows, viewer role, PWA, large slate at both widths, gallery at seven widths) |

The same suite on `main` is recorded as 2,894 checks in the audit; an earlier complete run in this stage, before
the focus-return fix, was 3682 passed and 6 failed (all six were "focus returns to the opener", fixed by
`useReturnFocus`). The final run above was made after the last code change (the hero team-name fix).

The navigation proof in §2, the search checks, the skip link, the distinct titles, focus trapping and return in
the JARVIS panel, the home fold at 1440×900 and the Kalshi slow / error / empty states are all part of that run.
The Kalshi states are driven by intercepting `/api/v1/kalshi/markets` in the browser (hang, then 502, then
normal); the mock API was not changed.

NOT RUN: backend tests (no backend change), the production smoke script, any check on Server M.
TESTED means "passed in the fixture run above", not "verified with production data".

## 6. Screenshots and critique log

Real app, production build, fixture API, signed in as the fixture owner, device scale factor 2. Files are in
`docs/design/aesthetic/screenshots/app/` (72 files): for each of home, live, game, game-box, picks,
player-props, player, kalshi, parlays, lineups, injuries, jarvis, cortex, data-health a viewport and a full-page
image at 1440×900 and 390×844; `all-pages-menu-1440x900`, `more-sheet-390x844`, `search-dialog-*`,
`jarvis-panel-*`; and `home-*` / `game-*` at 1920×1080, 1280×800, 1024×768, 768×1024, 430×932.

**Pass 1 (home, game overview, box score, picks, Kalshi, JARVIS, live; 1440).** Compared with the prototype
screenshots. Right: the eye lands on the score and the orange estimates; picks sit beside the hero. Faults: the
chrome above the content was 355px (top bar, row, a 200px strip); the Research row hid "Backtesting" behind the
date control with no hint; a `Panel` heading rule sat on top of a table's own ink rule (two rules 12px apart);
`Panel` top padding misaligned two panels side by side; "FIXTUREBOOK" was cut to "FIXTURE…" in the price column;
on `/picks` the first pick was at 860px of 900; the game header had two rules under it. Fixes: strip cells
tightened (about 145px in all); the workspace row wraps instead of scrolling on desktop; the ink rule removed
from the table base (the box score sets its own); `Panel` padding removed and page section spacing raised to
36px in 33 files; price column widened; `/picks` filters reduced to one unlabelled row with accessible names;
header border removed.

**Pass 2 (25 inherited pages on contact sheets, then phone).** Inherited pages were coherent: no dark-on-dark
text, no invisible borders, charts on the light palette. Faults: `/games` put the new three-part rows into a
two-column grid and crushed them; framed alert boxes and tinted inner boxes were still boxes; selection and
combination cards kept their frames; the Research row wrapped one orphan link; on a phone the game header's
Follow button took its own line, the JARVIS composer filled the screen, and the search field drew a focus box
inside its own ruled field. Fixes: `/games` is a single list; a second codemod turned framed alerts into
left-ruled notes and tinted boxes into hairline-ruled notes (24 files); cards became ruled blocks; the row is
14px on desktop and fits on one line at 1440; Follow is icon-only under 768px; the composer puts attach, depth
and send on one line with short labels on phones; the search field's outline is suppressed (its rule is the
focus cue).

**Pass 3 (all required screenshots again, plus the five extra widths).** Faults: at 1280 the hero cut
"DETROIT PISTO…"; focus was not returning to the opener after any dialog closed (found by the new tests, not by
eye). Fixes: the hero sets the abbreviation large with the full name under it below 1536px, and the full name
large only from there; `useReturnFocus` added to every dialog.

Against the prohibited-pattern list, in the final screenshots: no grid of identical bordered cards on the
hand-redesigned pages; no nested boxes; no glow; uppercase only in table heads, status slots and team names; no
text under 13px; no icon beside headings or navigation links; empty states have no frame. Remaining
exceptions are listed in §8.

## 7. Backend recommendations for the Kalshi page (not implemented; out of scope)

The frontend now tells the truth about a slow list; it does not make the list faster. From
`05-KALSHI-PAGE-DIAGNOSIS.md`, in order of effect:

1. **B1 + B2**: bound the observations read to today (plus the latest earlier row per ticker) and select columns
   instead of ORM entities. Small, local, and likely enough to remove multi-second builds.
2. **B7**: a cheap `/kalshi/summary?date=` (counts, events, sync). The page's sync line and the four figures, and
   the home page's Kalshi figure, would then appear at once and stop triggering the full list build. Today the
   sync line can only say "Checking sync" until the list answers, and the home page still calls
   `/kalshi/markets?limit=1`.
3. **B3 / B4 or B5**: paginate in SQL with a `(ticker, id)` index, or a per-contract summary table (needs a
   decision).
4. **B6**: single-flight and a cache key without the minute and the search string.
5. **B8**: a database statement timeout below the browser's patience, and timing logs for this endpoint.
6. **F9** (frontend config, left for the owner): set `experimental.proxyTimeout` in `next.config.mjs` explicitly;
   the 30-second default still applies.

Confirm on Server M first with the read-only steps in §6 of the diagnosis. NOT VERIFIED: whether the owner's
skeleton was a slow answer, a proxy timeout or a killed worker.

## 8. Known weaknesses

* **Chrome height.** Top bar, workspace row and strip take about 290px on desktop and about 300px on a phone
  before any content. On a phone the home hero starts below the first third of the screen. The strip can be
  collapsed (remembered), but it is open by default and repeats the hero on Today and the header on a game page.
* **Inherited pages are re-themed, not redesigned.** They still use label-above-value grids, the lineup board
  keeps its own framed cards with coloured top rules, the editions list keeps bordered rows, and several pages
  carry left-ruled notes that are a quieter box rather than no box. `/players/[id]` is still very long.
* **`accent` now means ink.** About 200 older uses of `text-accent` / `bg-accent` became monochrome emphasis.
  That is intended, but each was not reviewed; a few "ok / ready / confirmed" states that used to be green are
  now distinguishable from neutral only by a filled versus hollow dot and the word.
* **Orange is not yet everywhere a model speaks.** It is applied to `ProbabilityDisplay`, the probability scale,
  the home and game-card projections, box-score pregame columns and rotation projections. Projections on
  `/player-props`, `/minutes`, `/players/[id]` and `/matchups` are still ink.
* **Explanations in `title` attributes** (finding A12) are unchanged, so they are still unreachable on touch.
* **Heading levels** (A11) and live regions for polled content (A14) are not fixed.
* **Charts** were re-coloured through their constants, not redrawn; Recharts tooltips and axes are plain.
* **Search** covers pages and players only: not teams, games, Kalshi contracts or CORTEX records.
* **The JARVIS page on a phone** leaves a short conversation area above the composer.
* **Workspace row on phones** scrolls sideways with no visual hint that more follows (every page is still in More).
* **Team marks and colours** in the fixture are placeholders; real logos on a light ground were not checked.
* **One typeface.** At body sizes Archivo is plain; the identity rests on the condensed weights.
* No dark theme.

## 9. Not verified

Screen readers; real devices and touch; Safari and Firefox; 200% / 400% zoom and 320px width; forced-colours
mode; production data volumes (5,500 Kalshi contracts, thousands of selections, long real team and player
names); anything on Server M; the backend test suite (not run: no backend file changed). The contrast figures are
computed from token values, not measured per text node in the browser.

## 10. What stage two should cover

1. Player page and Player Props in the Courtside language (player header, form chart, minutes range, prop table
   with estimate colour), then Lineups, Injuries, Parlays / combinations, Editions and Results.
2. Apply the estimate colour to every remaining projection and probability; review the former "accent" uses.
3. A popover primitive for the `title` explanations; heading-level context; live regions.
4. Decide the default state of the scoreboard strip on Today and on game pages, and a tighter phone chrome.
5. Search over teams, games, contracts and CORTEX records (the endpoints exist).
6. Redraw the charts as SVG in the game-flow style; team colours on the score progression.
7. The Kalshi backend work in §7, starting with the summary endpoint.
8. Real team marks on the light ground and the asset decision the prototype document asks for.

## 11. Proposed decision entries (for the main session to record in `docs/DECISIONS.md`)

> **D-0xx — Typeface dependency for the Courtside design system.** `apps/web` adds
> `@fontsource-variable/archivo` 5.3.0 (SIL Open Font License 1.1, self-hosted, no network fetch at build or run
> time) and removes `@fontsource/inter` and `@fontsource/barlow-condensed`. Reason: the approved Courtside
> direction uses one variable family across its width axis (62–125) for both text and scoreboard display; the
> `wdth.css` entry carries the weight and width axes in one file per subset. Alternatives considered: keeping
> Inter + Barlow Condensed (rejected with the old look); `next/font/local` with the same file (equivalent; the
> fontsource import was kept because the project already loads fonts that way). Consequence: `DESIGN-SYSTEM.md`
> names Archivo Variable as the only family; monospace remains only for CORTEX formulas.
>
> **D-0xx — Radix Dialog for overlays.** `apps/web` adds `@radix-ui/react-dialog` 1.x (MIT). Reason:
> accessibility finding A1 (S1): the JARVIS panel, the mobile More sheet and the Kalshi drawer did not move,
> contain or return focus, and two claimed to be modal while the page stayed reachable. All overlays (`Sheet`,
> JARVIS panel, All pages / More, search) now use this one primitive. It matches the single stack named in
> `04-COMPONENT-ARCHITECTURE.md` (Radix Primitives). Alternatives considered: a hand-written focus trap
> (rejected: easy to get wrong, no inert background). Consequence: focus return is implemented by
> `useReturnFocus` because the overlays are not opened by `Dialog.Trigger`; the smoke test asserts trapping and
> return for the panel, the More sheet, search and the Kalshi drawer.

No other dependency was added. `npm audit --omit=dev --audit-level=high` result is in §5.
