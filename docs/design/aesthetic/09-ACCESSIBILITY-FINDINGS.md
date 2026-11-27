# PROJECT AESTHETIC 09 — Accessibility findings (current app)

Date: 2026-11-27. Reference: WCAG 2.2, levels A and AA. Scope: `apps/web` at commit `5db7bb8`.

## Method and limits

* **Code review** of `app/globals.css`, `tailwind.config.ts`, `components/ui/*`, the shell and the main domain
  components.
* **Contrast** computed with the WCAG relative-luminance formula from the hex values in `globals.css`, including
  the composited results of the opacity classes the code uses (`/10`, `/40`, `/60`, `opacity-75`).
* **Browser run:** production build (`next build`, `next start -p 3020`) against the fixture API
  (`e2e/mock-api.mjs`), Chromium through Playwright, signed in as the fixture owner, 28 routes at 1440×900 and
  390×844 (56 page renders). A script measured computed font sizes, per-text-node contrast against the composited
  background, heading order, landmarks, image alternatives, table markup, control sizes and names, focus order and
  dialog behaviour, and repeated one page with `prefers-reduced-motion: reduce`. Items marked *measured* come from
  that run.
* **Not done, so not claimed:** no screen reader was used; no real device or touch test; no browser zoom to 200%
  or 400%; no forced-colours (Windows high contrast) run; no test at 320px width; nothing was checked against
  production data or Server M. The automated contrast check does not see text drawn inside charts. An automated
  pass finds a minority of real accessibility problems; this list is a floor, not a certificate.

Severity: **S1** blocks a task or fails level A/AA for a whole class of users on every page. **S2** fails AA in
specific places or seriously degrades use. **S3** is a weakness or a risk worth fixing during the redesign.

---

## 1. Contrast of the token pairs in use

Text (needs 4.5:1; 3:1 for text ≥ 24px or ≥ 18.66px bold):

| Text token | Hex | on `bg` #060A10 | on `bg2` #0A1119 | on `card` #0D1720 | on `raised` #121F2B | Result |
|---|---|---|---|---|---|---|
| `ink` | #F3F6FA | 18.30 | 17.50 | 16.69 | 15.42 | pass |
| `soft` | #C7D1DD | 12.84 | 12.28 | 11.71 | 10.82 | pass |
| `muted` | #94A3B8 | 7.74 | 7.40 | 7.06 | 6.52 | pass |
| `faint` | #64748B | 4.17 | 3.99 | 3.80 | 3.51 | **fail for normal text on every surface** |
| `accent` | #00E5A0 | 12.01 | 11.49 | 10.96 | 10.12 | pass |
| `teal` | #00BFA6 | 8.50 | 8.13 | 7.76 | 7.16 | pass |
| `warn` | #F5B942 | 11.24 | 10.75 | 10.25 | 9.47 | pass |
| `bad` | #F05252 | 5.70 | 5.45 | 5.20 | 4.80 | pass, little margin |
| `info` | #7DC4F0 | 10.42 | 9.96 | 9.50 | 8.77 | pass |

Tinted fills (text of the same hue on a 10% fill over `card`): accent 8.99, warn 8.56, info 7.91, **bad 4.72**.
Primary button (`bg` text on `accent`): 12.01. Disabled primary button (`bg/70` on `accent/30`): about 1.9–2.1
(exempt as disabled, but the label is unreadable; *measured* 2.13 on the JARVIS "Send" button).

Non-text (needs 3:1 where the boundary or state is needed to identify a control, WCAG 1.4.11):

| Pair | Ratio | Where |
|---|---|---|
| `line` #22313E on `bg` (input and select boundary) | **1.49** | `components/ui/field.tsx:5`, date selector |
| `line` on `card` at 100% / 60% / 40% | 1.36 / 1.19 / 1.11 | every `Panel`, `Tile`, table rule |
| `card` against `bg` | 1.10 | all cards |
| `raised` against `card` | 1.08 | inner surfaces, hover rows, neutral badge |
| active nav fill (`accent/10` on `bg2`) | 1.19 | `app-shell.tsx:35` (also carries the glow ring, bold weight and a green icon) |
| modal scrim (`black/70` over `bg`) against `bg` | 1.04 | `sheet.tsx:43` — the page behind a sheet is already this dark |
| focus outline `accent` on `card` | 10.96 | `globals.css:56-59` |
| `faint` icon on `bg2` | 3.99 | inactive nav icons |

The five surface colours and the border colour all lie between luminance ratios 1.00 and 1.49 of each other. For a
user with low contrast sensitivity, or on a dim or glossy screen, the interface has no visible structure: cards,
inputs and separators disappear and only the text remains.

---

## 2. Findings

### S1

**A1. Dialogs do not manage focus; two of three claim to be modal and are not.**
`components/ui/sheet.tsx:26-41` handles Escape and body scroll only. *Measured:*

| Overlay | Focus after opening | Tab leaves the overlay | `aria-modal` |
|---|---|---|---|
| Kalshi market drawer (opened from the keyboard) | stays on the table row behind it | yes | `true` |
| Mobile "More" sheet (36 links) | stays on the "More" button behind it | yes | `true` |
| JARVIS panel (`components/jarvis/panel.tsx:34`) | stays on the brand link | yes | not set; full screen below 768px |

A keyboard user opens a drawer and their next Tab lands in the page underneath; a screen-reader user is told the
dialog is modal while the rest of the page remains reachable. The same `Sheet` is used for the prop research
drawer, the builder drawer and the JARVIS side columns. WCAG 2.4.3 Focus Order (A), 4.1.2 Name, Role, Value (A).
*Fix:* Radix `Dialog` for all overlays (focus moves in, is contained, returns to the trigger; background inert).

**A2. No way to bypass the navigation: 43 Tab stops before the content.**
There is no skip link and the sidebar's 27 links precede `<main>` in DOM order. *Measured* on `/player-props` at
1440px: the first focusable element inside `<main>` is the 43rd Tab stop (27 nav links, brand, collapse button,
date controls, assistant, log out, and the scoreboard strip's links). This repeats on every page. WCAG 2.4.1
Bypass Blocks (A). *Fix:* a skip link as the first focusable element; six primary navigation items instead of 27.

**A3. Every page has the same title.**
*Measured:* `document.title` is "GIZER NBA" on all 28 routes. `app/layout.tsx:16` defines a template but no page
supplies a title (all pages are client components). WCAG 2.4.2 Page Titled (A). *Fix:* per-route titles
(a server `layout.tsx` or `generateMetadata` per segment, or a small client title hook).

**A4. `faint` is used for real text and fails contrast everywhere it appears.**
3.51–4.17:1 depending on the surface. *Measured:* 218 failing text nodes on desktop and 59 on mobile across the 28
routes, in these places among others:
* sidebar group titles, 11px uppercase, 3.99:1 — `components/shell/app-shell.tsx:122`, `206` (on every page);
* tab counts — `components/ui/tabs.tsx:42`;
* the Kalshi ticker — `components/kalshi.tsx:377`;
* input placeholders — `components/ui/field.tsx:5` (`placeholder:text-faint`, 4.17:1 on `bg`);
* separators and the "@" between teams — `components/game-card.tsx:34`, `components/selection-card.tsx:208`,
  `components/kalshi.tsx:85` (decorative; acceptable once the informative uses are fixed).
The design system itself says `faint` is "never body copy" (`DESIGN-SYSTEM.md` §2); the rule is not enforced.
WCAG 1.4.3 Contrast (Minimum) (AA). *Fix:* a tertiary text token of at least 4.5:1 on the darkest raised surface
(for example #7F8EA3 computes to 5.0:1 on `raised` and 5.4:1 on `card`), and `faint` renamed to a non-text role.

**A5. Focus is invisible on the date selector and on every checkbox and radio.**
`globals.css:61-64` removes the focus outline from all `input` and `select` elements. Components built on
`Input`/`Select` replace it with a 1px ring colour change (`field.tsx:5`, `focus:ring-accent`), but elements that
do not use that class get nothing: the global date `<select>` (`components/shell/date-selector.tsx:30-31`, on
every page) and the eight native checkboxes and radios (`app/(app)/injuries/page.tsx:101`,
`builder/page.tsx:251`, `player-props/page.tsx:113`, `live/following/page.tsx:91`,
`components/props.tsx:478`, `components/jarvis/conversation.tsx:460`, `464`,
`components/live/game-center.tsx:475`). *Measured:* three focus stops with no outline and no ring among the first
70 on `/player-props`. WCAG 2.4.7 Focus Visible (AA). *Fix:* delete the global `outline: none`; give form controls
the same 2px outline as everything else.

### S2

**A6. Form-control boundaries are 1.49:1.** Inputs and selects are a `bg`-coloured field with a `line` ring on a
`card` surface (`field.tsx:5`): the edge is 1.49:1 against the field and 1.36:1 against the card. The only other
cue is the placeholder, which is the failing `faint` (A4), and selects have a 10px arrow. WCAG 1.4.11 Non-text
Contrast (AA).

**A7. Table rows are turned into buttons.** `components/kalshi.tsx:176-190` puts `role="button"`, `tabIndex` and
an `aria-label` on each `<tr>`; the prop market table and the game page do the same (*measured:* 7 + 7 + 3 rows).
`role="button"` replaces the row role, so a screen reader no longer announces column headers for the cells and
reads each row as one long button. The visible table semantics the code otherwise does well (captions, scoped
headers) are cancelled for exactly the tables that matter most. WCAG 1.3.1 Info and Relationships (A), 4.1.2 (A).
*Fix:* keep `<tr>` a row; put a real link or button in the first cell (the contract or player name).

**A8. Tabs are not the tabs pattern.** `components/ui/tabs.tsx:24-46` renders `role="tablist"` and `role="tab"`
with `aria-selected`, but every tab is in the Tab order, arrow keys do nothing, and there is no `aria-controls`;
only two pages wrap their content in `role="tabpanel"` (`app/(app)/cortex/page.tsx:48`, `parlays/page.tsx:63`).
The same component is used for filters (plays: All · Scoring · Fouls), view switches and section navigation,
which are three different things. WCAG 4.1.2 (A). *Fix:* links for navigation, a toggle group for filters, Radix
`Tabs` for true tabs.

**A9. Dimming by opacity pushes text below 4.5:1.** Rows that are "tracked only", did not play or are invalidated
are faded with opacity on the whole row: `components/kalshi.tsx:97` (`opacity-80`), the table row at
`kalshi.tsx:187` (`opacity-75`), `components/live/game-center.tsx:394` (`opacity-50`), `447` (`opacity-70`).
*Measured:* "Tracked only" label 4.27:1, a probability interval 4.01:1, an "Invalidated" badge 2.89:1; `muted`
text on a card computes to 4.50:1 at 75% opacity, 4.08:1 at 70% and 2.69:1 at 50%. These are the rows whose meaning
("not evaluated", "did not play") the user most needs to read. WCAG 1.4.3 (AA). *Fix:* express de-emphasis with a
text token that still passes, plus the words that are already there; never with `opacity` on text.

**A10. Sizes are in pixels and half the text is 11–12px.** *Measured:* 51.5% of visible characters on desktop and
62.1% on mobile are 11px or 12px; body text is 14px on desktop. `tailwind.config.ts:38-44` and `globals.css:26`
define every size in `px`, so a user who raises the browser's default font size gets no change at all (page zoom
still works, so this is not a 1.4.4 failure). The 11px labels are also uppercase with letter-spacing, the least
legible setting for small text. *Fix:* sizes in `rem`; 12px as the floor for secondary text only; labels in
sentence case.

**A11. Heading levels skip.** *Measured* outlines: `/games` and `/parlays` h1 → h3; `/tickets` h1 → h4;
`/games/[id]` and `/results` h2 → h4. `/login` has no heading at all (`app/login/page.tsx:72-74` uses a `div` for
the product name). `/jarvis` and `/kalshi-intelligence/[ticker]` have only a visually hidden h1. Cause: `Panel`
always emits `h2` and card components choose their own level without regard to where they are placed. WCAG 1.3.1
(A), 2.4.6 (AA). *Fix:* a heading-level prop or context on section components.

**A12. Explanations live in `title` attributes.** 388 `title=` attributes in the source carry the reason behind a
value: why a contract is tracked only (`components/kalshi.tsx:64`), what "Move" means (`kalshi.tsx:161`), whether
a quote is verified (`components/status.tsx:66`), column definitions in the box score
(`components/live/game-center.tsx:371`). A `title` is not shown on touch devices or to keyboard users and is
announced inconsistently. For a product whose rule is that every number carries its qualification, the
qualification is unreachable on a phone. WCAG 1.3.1 (A) in spirit; 1.4.13 does not apply because nothing is shown.
*Fix:* a real tooltip/popover primitive that opens on focus and tap, or inline text.

**A13. Small targets.** Desktop, under 24×24px (*measured*): the "Scores" link above the strip, 100×22 at desktop
and 43×22 on mobile, on every page (`components/live/scoreboard-strip.tsx`); the native checkboxes at 16×16 and
radios at 13×13; the sidebar collapse button renders 23×32. Inline text links 17–20px tall are exempt as inline.
Mobile: the code's 44px rule holds for buttons, tabs, inputs and nav (*measured:* 3–14 controls per page under
44px, mostly inline links), with three exceptions: the login inputs are forced to 36px (`app/login/page.tsx:42`,
`52`: `className="h-9"`), checkboxes are 16px, and the scores link is 22px tall. WCAG 2.5.8 Target Size (Minimum)
(AA) for the 16px checkboxes and the 22px link.

**A14. Streaming and polled content is not announced.** The JARVIS answer streams into the page with no live
region (`components/jarvis/conversation.tsx` has `role="status"` only for the budget notice and image
preparation); a screen-reader user gets no signal that an answer has arrived. The scoreboard strip re-renders
every 15–60 s; it has a collapse control, which satisfies 2.2.2, but changes are silent. Only the milestone toasts
use `aria-live` (`components/live/notifications.tsx:90`). WCAG 4.1.3 Status Messages (AA). Not verified with a
screen reader.

### S3

**A15. Chart focus is hidden.** `globals.css:87-91` removes outlines from Recharts surfaces. The charts have good
text alternatives (`role="img"` with a sentence, and a table elsewhere on the page — `components/charts.tsx:74`,
`114`, `143`, `199`, `243`, `299`), but if the chart remains focusable a keyboard user lands on an element with no
visible focus. *Measured:* 12 SVGs across the run that are neither hidden nor labelled. Either make charts
non-focusable or show the focus.

**A16. Forced-colours mode will erase all boundaries.** Card edges, input edges, active-tab and active-nav
indicators are drawn with Tailwind `ring-*`, i.e. `box-shadow`, which browsers remove in forced-colours mode;
inputs have no `border`. Derived from the CSS; not tested. *Fix:* real borders on controls, or a
`@media (forced-colors: active)` rule.

**A17. The sidebar hides its scrollbar.** `app-shell.tsx:116` uses `no-scrollbar overflow-y-auto`; at 900px height
the last navigation groups are off screen with no indication. Keyboard focus does scroll them into view.

**A18. Landmarks are thin.** One `<main>`, one `<aside>`, two labelled `<nav>` (good). `Panel` renders
`<section>` without a label (8 sections on the overview, 2 labelled), so sections are not exposed as regions and
cannot be used to move around a 2,300–8,800px-long page (*measured* heights: `/players/[id]` 8,812px on mobile,
`/games/[id]` 7,135px). *Fix:* `aria-labelledby` from the section heading; fewer, shorter pages.

**A19. Smooth scrolling ignores the motion preference in one place.** CSS animations and transitions are disabled
globally under `prefers-reduced-motion` (`globals.css:80-85`; *measured:* 0 animated and 0 transitioning elements
with the preference set). The scripted scroll at `app/(app)/player-props/page.tsx:52` uses
`scrollIntoView({ behavior: "smooth" })`, which CSS does not govern.

**A20. Keyboard focus may be covered by fixed bars.** The top bar is sticky (56px), the desktop notice is a fixed
32px footer and the mobile navigation is a fixed 56px bar. Only `Panel` sets `scroll-mt-20`. *Measured:* all 70
focus stops on `/player-props` were inside the viewport, but the script did not test whether a fixed bar covered
them. WCAG 2.4.11 Focus Not Obscured (AA): NOT VERIFIED either way.

**A21. Colour-only signals are mostly avoided — keep it that way.** Status dots always have a text label
(`components/ui/badge.tsx:37-45`), price moves have an arrow and a sign (`components/kalshi.tsx:46-58`), stale
data says "stale". One place to check in the redesign: the over/under/equal bar colours in `HistoryBarChart`
(`components/charts.tsx`) distinguish by hue; the table alternative carries the values.

---

## 3. What passes today (keep)

* `lang="en"`; viewport allows zoom (`width=device-width, initial-scale=1, viewport-fit=cover`).
* No horizontal page scroll at 390px or 1440px on the 28 routes (*measured*).
* Every `<img>` has an `alt` (*measured:* 0 missing); team logos are named (`components/team-logo.tsx:28`),
  avatars beside a visible name are correctly empty (`components/player-avatar.tsx:26`).
* Every visible table has a `<caption>` and `scope` on all header cells (*measured*); sortable headers expose
  `aria-sort` (`players/[id]/page.tsx:148`, `components/minutes.tsx:200`).
* Every interactive control has an accessible name (*measured:* 0 unnamed among 2,479 control instances inspected over 56 page renders); icons
  are `aria-hidden`; icon buttons have `aria-label`.
* Form fields are wrapped in a `<label>` (`components/ui/field.tsx:9-13`); errors use `role="alert"`
  (`states.tsx:44`, `app/login/page.tsx:56`); loading uses `role="status"` (`states.tsx:16`).
* Links and buttons show a 2px focus outline at 10.96:1 (`globals.css:56-59`).
* `aria-current="page"` on the active navigation item; `aria-expanded` on disclosure buttons; native
  `<details>` for collapsible blocks (`components/ui/collapsible.tsx`).
* Reduced motion honoured for all CSS motion.
* "Not available" is spoken: `NA` renders a dash with `aria-label="not available"`.

---

## 4. Requirements for the redesign (acceptance checks)

1. Text tokens: every text colour ≥ 4.5:1 on every surface it may sit on; verified by a script over the token
   table, not by eye. No `opacity` on text.
2. Control boundaries and state indicators ≥ 3:1 against their surroundings; structure never depends on a
   difference below 1.5:1.
3. One focus style for every focusable element, including native form controls and chart regions; no global
   `outline: none`.
4. All overlays built on one dialog primitive: focus in, contained, returned; background inert; Escape closes.
5. Skip link; at most seven Tab stops before the main content on desktop.
6. A distinct `document.title` and exactly one visible `h1` per route; no skipped heading levels.
7. Table rows are rows; the row's action is a link or button in a cell.
8. Sizes in `rem`; nothing informative below 12px; body and table text ≥ 14px on desktop and ≥ 16px on mobile for
   inputs (prevents iOS focus zoom).
9. Pointer targets ≥ 24×24px everywhere and ≥ 44×44px for primary controls on touch layouts.
10. Explanations reachable by keyboard and touch (popover or inline), never `title` only.
11. Live regions for assistant answers, save/settle confirmations and request errors.
12. The Playwright measurements used here become part of the smoke test: contrast below threshold, missing names,
    dialog focus, Tab stops before `<main>`, duplicate titles, heading skips. The script used for this review is
    not in the repository; its checks are described in "Method" and are small enough to rewrite inside
    `e2e/smoke.mjs`.

## 5. Not verified

Screen-reader behaviour (NVDA, VoiceOver, TalkBack); 200% and 400% zoom and 320px reflow; forced-colours mode;
focus obscured by sticky and fixed bars; text inside charts; touch behaviour on a real phone; everything on
Server M and with production data volumes.
