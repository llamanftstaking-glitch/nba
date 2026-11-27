# PROJECT AESTHETIC: design prototypes

Three visual design concepts of GIZER NBA in one small Vite + React + TypeScript app, all reading the
same data snapshot. **Design prototypes only**: not live, not connected to production, not deployed,
no backend calls at runtime. Research, simulation and paper testing vocabulary applies here as it does
in the product (see the repository `CLAUDE.md`).

| Prefix | Concept | Folder (the only place its designer edits) |
|---|---|---|
| `/a/` | A · Premium Sports Editorial | `src/concepts/a/` |
| `/b/` | B · Professional Intelligence Terminal | `src/concepts/b/` |
| `/c/` | C · JARVIS-First | `src/concepts/c/` |

`/` is a neutral index that links to the three and states that everything is a prototype on a snapshot.

## Commands

```bash
cd prototypes/aesthetic
npm ci                          # only if node_modules is missing
npm run dev                     # http://localhost:4310  (vite --port 4310 --strictPort)
npm run build                   # tsc -b && vite build   (must pass)
npm run preview                 # serves dist/ on :4310
node scripts/shots.mjs a        # screenshots for one concept (server on :4310 must be running)
node scripts/shots.mjs a --only game,player
node scripts/contact-sheet.mjs a   # contact-desktop.png + contact-mobile.png from those screenshots
node scripts/export-dataset.mjs    # re-export the snapshot (needs the local API on :8010; see src/data/README.md)
```

## Required pages (identical in every concept, so screenshots are comparable)

| Path | Screenshot name | Page |
|---|---|---|
| `/<c>/` | `dashboard` | Main dashboard |
| `/<c>/scores` | `scores` | Live NBA scoreboard (the nine games of the snapshot date) |
| `/<c>/game` | `game` | Game matchup page: the featured game (`featuredGame`, CLE @ NYK) |
| `/<c>/player` | `player` | Player intelligence page: the first featured player (`featuredPlayer`) |
| `/<c>/markets` | `markets` | Kalshi Market Watch |
| `/<c>/research` | `research` | Research workspace: top picks, parlays, edition |
| `/<c>/jarvis` | `jarvis` | JARVIS assistant |

Mobile is the same routes at phone width. No horizontal page overflow at any viewport.

## Rules that keep three parallel designers conflict-free

1. Edit only inside your own `src/concepts/<x>/`. Add as many files and subfolders there as you like.
2. Never edit: `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`,
   `src/main.tsx`, `src/App.tsx`, `src/IndexPage.tsx`, `src/base.css`, `src/pages.ts`, `src/data/**`,
   `scripts/**`, or another concept's folder. Do not run `npm install`.
3. `src/concepts/<x>/index.tsx` default-exports one component that owns the whole `/<x>/*` subtree
   (it is rendered inside the shell's `<BrowserRouter>`, so use nested `<Routes>` with relative paths
   and absolute links such as `/a/game`).
4. All CSS selectors are scoped under your root class (`.concept-a`, `.concept-b`, `.concept-c`).
   Details and the two permitted exceptions are in the README inside each concept folder.
5. Data is read-only: `import { data, featuredGame, featuredPlayer, teamLogo, ... } from '../../data'`.
   Never invent, pad or alter a number. `null` means not available: show that state.
6. No network fonts, no CDN scripts. Fonts are installed locally (list below).

## Installed (exact versions, `package-lock.json` committed)

Runtime: react 19.3.1, react-dom 19.3.1, react-router-dom 7.18.7, @tanstack/react-table 9.3.1,
lightweight-charts 5.3.0, recharts 3.11.1, motion 14.14.0, lucide-react 1.81.0, clsx 2.1.1,
@radix-ui/react-dialog 1.3.1, react-tabs 1.2.1, react-popover 1.3.1, react-tooltip 1.4.1,
react-scroll-area 1.4.0, react-select 2.4.1.

Build: vite 8.4.0, @vitejs/plugin-react 6.3.0, typescript 7.0.2, @types/react 19.3.3,
@types/react-dom 19.3.0, @types/node 26.6.11.

Tailwind is deliberately not installed: each concept writes its own CSS.

Version notes that differ from older habits:
* `@tanstack/react-table` is **v9**: the hook is `useTable` with `createCoreRowModel`,
  `createSortedRowModel`, ... (not v8's `useReactTable` / `getCoreRowModel`). Check
  `node_modules/@tanstack/react-table` types before use; a plain `<table>` is also fine.
* `motion`: `import { motion } from 'motion/react'`.
* `lightweight-charts` v5: `chart.addSeries(LineSeries, options)`.

### Fonts (all 5.3.0, local via @fontsource; import inside your concept only)

| Family (CSS `font-family`) | Import |
|---|---|
| `Inter Variable` | `@fontsource-variable/inter` |
| `Archivo Variable` | `@fontsource-variable/archivo` |
| `Oswald Variable` | `@fontsource-variable/oswald` |
| `Space Grotesk Variable` | `@fontsource-variable/space-grotesk` |
| `Manrope Variable` | `@fontsource-variable/manrope` |
| `Fraunces Variable` | `@fontsource-variable/fraunces` |
| `JetBrains Mono Variable` | `@fontsource-variable/jetbrains-mono` |
| `Sora Variable` | `@fontsource-variable/sora` |
| `DM Sans Variable` | `@fontsource-variable/dm-sans` |
| `Barlow Condensed` | `@fontsource/barlow-condensed/500.css` (one import per weight, 100 to 900) |
| `Saira Condensed` | `@fontsource/saira-condensed/600.css` (per weight) |
| `IBM Plex Sans` | `@fontsource/ibm-plex-sans/400.css` (per weight) |
| `IBM Plex Mono` | `@fontsource/ibm-plex-mono/400.css` (per weight) |
| `Anton` | `@fontsource/anton` (400 only) |
| `Bebas Neue` | `@fontsource/bebas-neue` (400 only) |

Variable packages also ship extra axes where the family has them (for example
`@fontsource-variable/fraunces/opsz.css`, `@fontsource-variable/inter/opsz.css`). `@font-face` rules
are global but inert until a concept names the family, so they do not leak a look between concepts.

## Screenshots

`scripts/shots.mjs <concept>` opens `http://localhost:4310/<concept>/<page>` for the seven pages at
1920x1080, 1440x900, 1280x800, 1024x768, 768x1024, 430x932 and 390x844 and writes
`docs/design/aesthetic/screenshots/<concept>/<page>-<w>x<h>.png` (viewport), plus
`<page>-1440x900-full.png` and `<page>-390x844-full.png` (full page). Device scale factor is 2 at
1440x900 and 390x844 and 1 elsewhere. For every page and viewport it prints whether the document
overflows horizontally, console errors, failed requests and broken images. It waits for fonts,
images and network idle, then 700 ms, so entry animations should settle within that.

`scripts/contact-sheet.mjs <concept>` writes `contact-desktop.png` (the seven 1440x900 shots, labelled
grid) and `contact-mobile.png` (the seven 390x844 shots, labelled row) into the same folder.

Both use the globally installed Playwright; it is not a dependency of this app.

## Images are third-party assets

Team logos and player headshots are remote URLs on the ESPN CDN (`a.espncdn.com`) that came with the
data. They were checked from this machine on 2026-11-27 and load in both `curl` and the headless
Chromium used for screenshots, so nothing was downloaded and nothing is stored in this repository.
They are third-party assets used for an internal prototype and are **not cleared for redistribution**.
Use them only through `teamLogo()`, `playerHeadshot()` and `playerHeadshotSized()`, always with a
sensible fallback when the helper returns `null` or the image fails (initials, abbreviation). Never
substitute a different person's image.

## Audit

`npm audit --omit=dev` and `npm audit`: 0 vulnerabilities (run 2026-11-27).
