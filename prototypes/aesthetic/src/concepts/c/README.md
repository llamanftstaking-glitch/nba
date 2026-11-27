# Concept C · JARVIS-First

This folder is the whole concept. Its designer edits **only** files in here; nobody else does.

* `index.tsx` default-exports the component that owns every route under `/c/` (nested
  `<Routes>`, own layout, own navigation). Keep the seven required paths: `/c/`, `/c/scores`,
  `/c/game`, `/c/player`, `/c/markets`, `/c/research`, `/c/jarvis`.
* `styles.css` (and any further CSS files you add here) is imported only from this folder.

## The CSS scoping rule

**Every selector starts with `.concept-c`.** The outermost element rendered by `index.tsx` carries
`className="concept-c"`. No bare element selectors (`body`, `h1`, `a`, `*`), no `:root`
variables, no global resets: declare custom properties on `.concept-c` and reset inside it
(`.concept-c *, .concept-c *::before { box-sizing: border-box }`).

Why: the three concepts are chunks of one single-page app. Once a concept's CSS has loaded it stays in
the document, so an unscoped rule would restyle the other two concepts and the index page.

Two permitted exceptions:
1. Page background and scroll behaviour may be set with `html:has(.concept-c)` /
   `body:has(.concept-c)`.
2. Radix portals (Dialog, Popover, Tooltip, Select) render outside your root. Either pass your root
   element as the Portal `container`, or put the class on the portalled content as well
   (`<Dialog.Content className="concept-c dialog">`) and scope those rules the same way.

`@keyframes` and `@font-face` names are global: prefix keyframes with `c-` (`@keyframes c-fade`).
Import fonts from `@fontsource` packages in this folder only (list in `prototypes/aesthetic/README.md`).

## Also
* Data: `import { data, featuredGame, featuredPlayer, teamLogo, playerHeadshot, fmtTimeET } from '../../data'`.
  Read-only; see `src/data/README.md`. Never invent or pad a number; `null` is shown as not available.
* Do not edit `package.json`, the shell files in `src/`, `src/data/`, `scripts/`, or another concept.
  Do not run `npm install`.
* Check your work: `npm run build`, then `node scripts/shots.mjs c` and
  `node scripts/contact-sheet.mjs c` with the dev server running on port 4310.
