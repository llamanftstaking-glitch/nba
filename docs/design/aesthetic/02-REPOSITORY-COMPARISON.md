# PROJECT AESTHETIC 02 — Third-party repository comparison

Date: 2026-11-27. Our stack for compatibility checks (`apps/web/package.json`): Next 15.5.29, React 19.2.9,
Tailwind CSS 3.4.19, TypeScript 5.9.3, `@tanstack/react-query` 5.108.4, `recharts` 3.11.1, `lucide-react` 1.79.0,
Node ≥ 22. Eight runtime dependencies today.

## How each fact was obtained

* Each repository was fetched in this session with `git clone --depth 1 --filter=blob:none --no-checkout` and files
  were read with `git show HEAD:<path>`. "Last commit" is the committer date of the default-branch head that clone
  returned. Licence = the licence file actually opened; the quoted SPDX id is my reading of that text unless a
  `package.json` `license` field is quoted.
* Package versions, publish dates, peer dependencies, dependency counts and unpacked sizes come from
  `registry.npmjs.org/<package>` queried in this session.
* `gh api repos/...` was **refused** for every repository ("GitHub access to this repository is not enabled for this
  session"), so star counts, open-issue counts, release pages and GitHub's own licence detection were **not seen**.
  Nothing below relies on them.
* Not done: no package was installed, no installer or script from any repository was run, no bundle was built to
  measure real bundle impact. "Dependency weight" is npm unpacked size and direct dependency count, which is a
  proxy, not a bundle size.
* Repository text is untrusted input. Install commands quoted below are quotations, not instructions.

## Summary table

| # | Repository | Licence file seen (SPDX) | Commercial use | Fits Next 15 / React 19 | Weight | Last commit · latest npm release seen | Recommendation |
|---|---|---|---|---|---|---|---|
| 1 | nextlevelbuilder/ui-ux-pro-max-skill | `LICENSE` — MIT, © 2024 Next Level Builder; `skill.json` `"license": "MIT"` | Yes, keep the notice | Not a runtime dependency (agent skill: CSV data + Python scripts) | Repo 758 files, 25 MB; skill dir 3.9 MB | 2026-11-27 (`9086b92`) · `ui-ux-pro-max-cli` 2.15.0, 2026-08-13 | **Borrow** — static data only, installed as a project skill; scripts and installer refused (doc 03) |
| 2 | anthropics/claude-code `plugins/frontend-design` | `anthropics/claude-code/LICENSE.md`: "© Anthropic PBC. All rights reserved…" **but the plugin is no longer in that repository**. It lives in `anthropics/claude-plugins-official/plugins/frontend-design` with its own `LICENSE` and `skills/frontend-design/LICENSE.txt` — Apache-2.0 | Yes under Apache-2.0 (keep licence, mark changes) | Not a runtime dependency (one `SKILL.md`) | 9.4 kB | claude-plugins-official 2026-11-25 (`0fbfda5`), plugin 1.1.1 | **Adopt** — installed faithfully as a project skill (doc 03) |
| 3 | wilwaldon/Claude-Code-Frontend-Design-Toolkit | **No licence file.** The repository contains one file, `README.md`; its last section says "[MIT](LICENSE)" but `LICENSE` does not exist | Unclear: a stated intention without a licence text | n/a (a link list) | One README | 2026-11-25 (`51d7dd5`) · no package | **Borrow ideas only** — use as a reading list; copy nothing |
| 4 | notsointresting/frontend-inspo-mcp | `LICENSE` — MIT, © 2026 notsointresting; `package.json` `"license": "MIT"` | Yes | n/a (MCP server for the coding agent, Node 22+) | npm 138 kB unpacked, 3 dependencies | 2026-10-21 (`e7da2c5`) · 0.3.0, 2026-10-06 | **Reject** |
| 5 | keenthemes/reui | `LICENSE.md` — MIT, © 2025 Keenthemes Inc | Yes for the free registry; a paid "ReUI Pro" exists | Their site runs Next 16.3.8 / React 19.2.7; README badge says Tailwind CSS 4+. We are on Tailwind 3.4 | Copy-in components; their site has 241 dependencies; each component pulls shadcn/ui + Radix or Base UI | 2026-10-16 (`067aa0d`) · no npm package (shadcn registry) | **Borrow ideas only** |
| 6 | tremorlabs/tremor | `LICENSE` — Apache-2.0 | Yes | **No.** Repo pins `react ^18.3.1`, `recharts ^2.15.2`; npm `@tremor/react` 3.18.7 has `peerDependencies.react: ^18.0.0` | `@tremor/react` 494 kB unpacked, 7 dependencies | 2025-10-10 (`ca4d588`) · `@tremor/react` 3.18.7, 2025-01-13 | **Reject** |
| 7 | arihantcodes/spectrum-ui | `LICENSE` — Apache-2.0 | Yes | Their site: Next ^16.2.12, React ^19.2.8 | Copy-in components that depend on `motion`/`framer-motion`; site has 80 dependencies | 2026-09-21 (`acdc998`) · no npm package | **Reject** |
| 8 | radix-ui/primitives | `LICENSE` — MIT, © 2022 WorkOS | Yes | **Yes.** `radix-ui` 1.8.1 peers: `react ^16.8 … ^19.0` | `radix-ui` 106 kB unpacked (re-exports 55 packages); `@radix-ui/react-dialog` 107 kB, 15 dependencies; tree-shakeable per primitive | 2026-10-14 (`eb3a2b7`) · 1.8.1, 2026-10-12 | **Adopt** — the one component family |
| 9 | TanStack/table | `LICENSE` — MIT, © 2016 Tanner Linsley | Yes | **Yes.** `@tanstack/react-table` 9.3.1 peer: `react >=18` | 123 kB unpacked, 2 dependencies; headless (no styles) | 2026-11-23 (`6d48b56`) · 9.3.1, 2026-10-12 | **Adopt** |
| 10 | tradingview/lightweight-charts | `LICENSE` — Apache-2.0, plus `NOTICE` and an **attribution requirement** in the README | Yes, with attribution on the page | Framework-agnostic canvas library, no React peer; needs a small client wrapper | 3.1 MB unpacked, 1 dependency | 2026-11-18 (`dbd6ae7`) · 5.3.0, 2026-11-10 | **Borrow ideas only** (do not add now) |
| 11 | apache/echarts | `LICENSE` — Apache-2.0, plus `NOTICE` (Apache Software Foundation) | Yes, keep NOTICE | Framework-agnostic, no React peer | **60.3 MB unpacked**, 2 dependencies | 2026-10-04 (`34f4d92`) · 6.1.0, 2026-05-19 | **Reject** |
| 12 | fxy2026/nba-tracker | **No licence file.** README: "## License / MIT" followed by a sentence stating that the repository does not yet provide a separate `LICENSE` file; `package.json` has no `license` field | Unclear | A whole app: Next 16.3.6, React 19.2.4, Supabase | n/a | 2026-10-07 (`51c964f`) · no package | **Borrow ideas only** — copy no code |
| 13 | motiondivision/motion | `LICENSE.md` — MIT, © 2024 Motion B.V. | Yes for the library; paid "Motion+" tier exists | **Yes.** `motion` 14.14.0 peers: `react ^18 \|\| ^19` | `motion` 1.0 MB unpacked; `framer-motion` 8.5 MB unpacked | 2026-11-26 (`6390e6d`) · 14.14.0, 2026-11-13 | **Reject for now** (CSS transitions cover the need) |
| 14 | microsoft/playwright | `LICENSE` — Apache-2.0, plus `NOTICE` | Yes | Test tool, independent of React | `playwright` 5.1 MB unpacked plus browser binaries | 2026-11-26 (`c2ebaba`) · 1.65.1, 2026-11-13 | **Adopt** — keep; it is already how the smoke test runs |
| 15 | storybookjs/storybook | `LICENSE` — MIT, © 2024 Storybook | Yes | Yes on paper: `@storybook/nextjs` 10.6.9 peers `next ^14.1 \|\| ^15 \|\| ^16`, `react … ^19`, **`webpack ^5`** | `storybook` 22.3 MB unpacked, 17 dependencies; `@storybook/nextjs` 33 more | 2026-11-26 (`c643258`) · 10.6.9, 2026-11-25 (11.0.0-rc.1 on the `next` tag) | **Reject** for this repository (doc 04 §5) |

## One component family

**Radix Primitives** (`radix-ui`, MIT) is the only component library family recommended for the final build. It
supplies behaviour and accessibility (dialog, popover, tabs, select, tooltip, dropdown menu, scroll area, toggle
group, visually-hidden) and no styles; all appearance comes from our own tokens. ReUI, Tremor, Spectrum UI and
shadcn-registry blocks are **not** to be mixed in: each is a second visual language layered on the same primitives,
and mixing them is how the current interface ended up looking assembled. Supporting, non-visual choices that go
with it: TanStack Table for table state, Recharts (already installed) for charts. Reasons and props are in
`04-COMPONENT-ARCHITECTURE.md`.

---

## Notes per repository

### 1. nextlevelbuilder/ui-ux-pro-max-skill

* **What it is.** An agent skill: CSV tables (styles, palettes, font pairings, UX guidelines, chart guidance,
  per-framework rules) plus a Python search and "design system generator" script, a Node CLI installer
  (`ui-ux-pro-max-cli`, command `uipro`), seven skills under `.claude/skills/`, and a `stack/` starter with an MCP
  configuration.
* **File types in the repository (758 tracked files):** 152 `.md`, 147 `.csv`, 143 `.py`, 115 `.json`, 54 `.ttf`,
  33 `.txt`, 30 `.ts`, 21 `.tsx`, 14 `.cjs`, 9 `.yml`, 7 `.png`, 6 `.js`, 5 `.mjs`, 4 `.sh`, 4 `.html`, 4 `.css`.
* **Security.** Full review in `03-DESIGN-SKILLS.md`. Short version: the documented install paths are a plugin
  marketplace add (installs all seven skills, including ones whose scripts import `subprocess`/network modules),
  `gh skill install`, or `npm install -g ui-ux-pro-max-cli` (the CLI source calls `fetch` against
  `api.github.com` and uses `child_process`). The `stack/` directory ships a `.mcp.json` that runs three
  `npx -y …@latest` MCP servers and a `settings.json` with `"enableAllProjectMcpServers": true` and
  `Read(//home/**)`. None of that was run or installed.
* **Relevant to us.** `data/ux-guidelines.csv` (141 rows), `references/quick-reference.md` (navigation,
  accessibility, forms and chart rules as a checklist), `data/charts.csv`, `data/stacks/nextjs.csv` /
  `react.csv`, and the `ui-reasoning.csv` anti-pattern column. Its palettes and "style" catalogue are generic
  product-type lookups ("Sports Team/Club → Vibrant & Block-based + Motion-Driven") and are exactly the kind of
  default the owner rejected; use them to recognise defaults, not to choose a direction.
* **Recommendation: borrow.** Data-only project skill installed; everything executable left out.

### 2. anthropics/claude-code — plugins/frontend-design

* **Finding: the URL in the brief is stale.** At `anthropics/claude-code` head `2287e8c` (2026-11-26) the
  `plugins/` directory contains only `README.md`, which says: "Anthropic's plugins are developed in
  claude-plugins-official. The `claude-code-plugins` marketplace in this repository still lists them, and installs
  them from there." `.claude-plugin/marketplace.json` lists `frontend-design` with source
  `https://github.com/anthropics/claude-plugins-official.git`, path `plugins/frontend-design`.
* **Licence.** `anthropics/claude-code/LICENSE.md` is not an open licence ("© Anthropic PBC. All rights reserved.
  Use is subject to Anthropic's Commercial Terms of Service."). The plugin's actual home carries Apache-2.0 at three
  levels: repository `LICENSE`, `plugins/frontend-design/LICENSE`, and
  `plugins/frontend-design/skills/frontend-design/LICENSE.txt`; the skill's frontmatter says
  `license: Complete terms in LICENSE.txt`. Copying is permitted with the licence text included and changes marked.
* **Contents.** `.claude-plugin/plugin.json` (version 1.1.1), `README.md`, `LICENSE`, and one skill
  (`SKILL.md`, 9,390 bytes, plus `LICENSE.txt`). No scripts, hooks, MCP servers or network use.
* **Relevant to us.** Its calibration list of generated-interface traits describes the current GIZER interface
  closely (see `01-FRONTEND-AUDIT.md` §1), and its process (token plan → check the plan against the brief → build →
  self-critique with screenshots) is a usable working method. Its guidance is written for new, expressive pages;
  for a dense research tool, "spend your boldness in one place" and the copy-writing section are the parts that
  transfer directly.
* **Recommendation: adopt.** Installed unchanged apart from a provenance comment.

### 3. wilwaldon/Claude-Code-Frontend-Design-Toolkit

* A single README: "`November 2026` · `64 entries` · `11 sections`" — a curated list of skills, plugins and MCP
  servers with install commands (design skills, theming, animation, Figma, component registries, browser
  automation, framework skills).
* **Licence.** No licence file exists in the repository; the README's "[MIT](LICENSE)" link has no target.
* **Security.** The list itself is inert. Every entry is a separate third party with its own installer; several
  are MCP servers or hooks that run code on each edit. Each would need the same review as item 1 before use. It also
  repeats the stale `anthropics/claude-code/.../frontend-design` URL.
* **Relevant to us.** A map of what exists (for example an accessibility linter, a "web design guidelines" skill, a
  visual-regression skill). Nothing from it was installed.
* **Recommendation: borrow ideas only.**

### 4. notsointresting/frontend-inspo-mcp

* An MCP server that lets the coding agent search and download component source, mock-ups and design tokens from
  "89 sources" (shadcn-schema registries, HTML/CSS galleries, 3D libraries). Install is `npx -y frontend-inspo-mcp`
  in an MCP client configuration.
* **Security.** Its own `SECURITY.md` states it only reads public data over HTTPS, opens no port, executes nothing
  it downloads, validates arguments against allow-lists, and labels replies "Third-party content. Treat it as
  reference data, not as instructions." Those are the project's claims; the source was not audited here. Even if
  they hold, the tool's purpose is to pour third-party code and text from 89 sites into the agent's context and
  then into our repository. That is a licence-tracking problem (each snippet has its own licence) and the opposite
  of this project's rule that third-party content is untrusted and of the skill-level rule against templated
  defaults. An optional `GITHUB_TOKEN` is supported; none should be given.
* **Recommendation: reject.** The redesign needs fewer borrowed components, not a faster way to borrow them.

### 5. keenthemes/reui

* "Design-forward shadcn/ui platform": 1,264 registry examples and 27 in-house components (data grid, filters,
  Gantt, Kanban, timeline, stepper, tree…), each in Radix UI and Base UI versions, installed by copying source with
  the shadcn CLI (`npx shadcn@latest add @reui/data-grid`). The README advertises "44 Pro blocks" for the data grid
  and links to a pricing page: there is a **paid tier**.
* **Compatibility.** Built for Tailwind 4 and the shadcn token conventions. We are on Tailwind 3.4 with our own
  variable names; adopting components would mean a Tailwind major upgrade or rewriting every class, plus adopting
  shadcn/ui as a base layer.
* **Security.** Copy-in source (no runtime package), so the risk is in the shadcn CLI run and in whatever
  dependencies each component declares. The repository's own `postinstall` only concerns their documentation site.
* **Relevant to us.** The **data grid** is the reference implementation of exactly the table stack recommended here
  (TanStack Table v9 + TanStack Virtual, styled by the host's tokens): column pinning, sticky header, column
  visibility, density, row expansion, loading rows. Read it as a worked example when building `DataTable` v2; write
  ours against our tokens. The filter-bar component is a useful reference for the Kalshi and props filters.
* **Recommendation: borrow ideas only.** MIT allows copying with the notice if a specific file is ever wanted.

### 6. tremorlabs/tremor

* "Copy & Paste React components to build charts and dashboards", on Tailwind and Radix, charts on Recharts.
* **Maintenance.** Last commit on the default branch 2025-10-10, more than 13 months before this review. The npm
  package `@tremor/react` was last published 2025-01-13 and declares `react ^18.0.0` as a peer: installing it on
  React 19.2 needs an override. The repository itself (package name `tremor-raw`, private) pins React 18.3 and
  Recharts 2.15; we are on Recharts 3.11.
* **Relevant to us.** Its chart wrappers are the pattern we already have in `components/charts.tsx`. Its KPI-card
  and "tracker" blocks are the dashboard-kit look the owner is rejecting.
* **Recommendation: reject** — stale, wrong React major on npm, and aesthetically the problem rather than the cure.

### 7. arihantcodes/spectrum-ui

* "Animated React components you can copy, install with the shadcn CLI", built on shadcn/ui, Tailwind and Motion.
  The repository root also holds `pro-waitlist.sql`, `dodo-seed.sql`, an SEO strategy document and an MCP
  configuration (file names seen; contents not read), which suggests a commercial tier is planned.
* **Relevant to us.** Animated drawers, marquees and hero blocks are marketing-site components. A research terminal
  with tables and charts has no use for them, and each one would add the Motion dependency.
* **Recommendation: reject.**

### 8. radix-ui/primitives

* "A low-level UI component library with a focus on accessibility, customization and developer experience."
  Unstyled; each primitive implements the WAI-ARIA pattern (focus trap and return for dialogs, roving tabindex and
  arrow keys for tabs, typeahead in menus, collision-aware popovers).
* **Why it matters here.** The three hand-written overlays in the app fail the dialog pattern: focus does not move
  into the sheet, Tab leaves it, and the JARVIS panel is not modal (measured; `09-ACCESSIBILITY-FINDINGS.md` S1).
  `Tabs` renders `role="tab"` without arrow-key support or `tabpanel` wiring. Radix fixes these by construction.
* **Weight and security.** Install only the unified `radix-ui` package, pinned exactly (the project pins all
  dependencies). It re-exports 55 primitive packages; bundlers include only what is imported. MIT, maintained by
  WorkOS, widely deployed; standard npm supply-chain caution (lockfile, `npm audit` already runs in CI).
* **Primitives we need:** Dialog (sheet, drawer, command palette), Popover, Tooltip, Tabs, Select, DropdownMenu,
  ToggleGroup, ScrollArea, VisuallyHidden, Collapsible/Accordion (or keep native `<details>`), Separator.
* **Recommendation: adopt.**

### 9. TanStack/table

* "A headless table library for building powerful datagrids with full control over markup, styles, and behavior."
  v9 is current on npm (9.3.1). It manages sorting, filtering, column visibility, pinning, sizing, grouping,
  expansion and pagination state and renders nothing itself, so our `<table>` semantics (`caption`, `scope`,
  `aria-sort`) stay ours.
* **Fit.** The app already uses TanStack Query, and already does server-side sort and pagination for the heavy
  tables (minutes, selections, Kalshi); TanStack Table supports "manual" server-driven modes for exactly that.
  For long client-side lists (box scores, game logs, 50–200 contract rows) add `@tanstack/react-virtual`
  (3.14.28, MIT, peers React 16.8–19, 65 kB) only where a table actually exceeds a couple of hundred rows.
* **Security.** Two dependencies, no network, no DOM injection.
* **Recommendation: adopt.**

### 10. tradingview/lightweight-charts

* Canvas financial charts (line, area, candlestick, histogram, time scale, crosshair, price lines, markers).
* **Attribution, quoted from the README:** "This license requires specifying TradingView as the product creator.
  You shall add the 'attribution notice' from the NOTICE file and a link to https://www.tradingview.com/ to the
  page of your website or mobile application that is available to your users." The `NOTICE` file reads
  "TradingView Lightweight Charts™ Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/". The README
  adds that the `attributionLogo` chart option satisfies the link requirement.
* **Assessment.** Our only time-series market display is the Kalshi price history: one contract, observations at
  most every five minutes, a few hundred points, with event markers. Recharts already draws it
  (`KalshiPriceChart`, `components/charts.tsx:299`). Lightweight Charts would add a second chart library, a
  TradingView logo or notice on our pages, and a canvas that needs its own accessible alternative. It also frames
  the display as a trading chart, which pulls against the project rule that a market price is an observation, not a
  signal.
* **Techniques worth borrowing:** a visible crosshair with a value read-out at the axis, a "last value" line with a
  label on the price axis, markers on the time axis for events, and whitespace for gaps instead of interpolating
  across a period with no observation.
* **Recommendation: borrow ideas only.** Revisit only if the owner asks for candlestick or multi-pane market views
  and accepts the attribution.

### 11. apache/echarts

* A complete canvas/SVG charting system with its own theming, layout and interaction model. 60.3 MB unpacked on npm.
* **Assessment.** Capable, but it would be a second charting stack beside Recharts with a different theming
  mechanism (our tokens would be maintained twice) and a much larger client bundle unless carefully tree-shaken.
  Nothing in the required inventory (bar history, distributions, line overlays, calibration, equity, price history,
  stint timelines, comparison bars) needs it.
* **Recommendation: reject.**

### 12. fxy2026/nba-tracker

* A bilingual (Chinese/English) NBA site on Next 16 and Supabase: scores, schedule, game detail with box score and
  play-by-play, player profiles and career data, comparison, leaderboards, shot charts and heat maps, a `/lab`
  section, PWA. It contains `design-system/nba-tracker/MASTER.md` and `pages/player-detail.md`, the same
  master-plus-page-override layout that UI/UX Pro Max's generator writes.
* **Licence.** No licence file; the README says MIT and then says no separate licence file is provided yet. Treat
  as all rights reserved for code. Its data sources and their terms were not reviewed.
* **Relevant ideas (from the README and file tree; the running site was not opened):** one search entry point
  across players and teams (`/search`, `api/players/search`, `api/search`); a `loading.tsx` per route so that
  navigation shows a route-level skeleton immediately; page-level statements of data coverage and source, which
  matches our honesty rules; a compare page with a shareable image route (`api/og/compare`).
* **Not relevant:** shot charts and heat maps (we hold no shot-location data and must not imply that we do), news,
  salary, draft.
* **Recommendation: borrow ideas only.** No code, no assets.

### 13. motiondivision/motion

* The successor of Framer Motion: React animation components and hooks, MIT. The README advertises a paid
  "Motion+" tier ("Premium APIs like Cursor and Ticker", example source, audits) and an `npx motion-ai` installer
  for an agent skill and MCP servers (not run).
* **Assessment.** The motion this product needs is small: a drawer sliding in, a popover fading, a row expanding, a
  number updating. CSS transitions on `transform` and `opacity` with three duration tokens do this with no
  dependency, and the global reduced-motion rule (`globals.css:80`) already covers CSS. The owner's complaint is
  about a generic look; the `frontend-design` skill is explicit that scattered entrance animations are a generic
  tell.
* **Recommendation: reject for now.** Reconsider only for a specific interaction CSS cannot do (shared-element
  transitions between a list row and its detail).

### 14. microsoft/playwright

* Browser automation and test runner, Apache-2.0. Already used by `apps/web/e2e/smoke.mjs` through a global
  install ("intentionally not a project dependency") and by this review for the measurements in docs 01 and 09.
* **Use in the redesign:** screenshot every component state and every page at the seven viewports the smoke test
  already knows; assert no horizontal overflow, minimum text size, focus order and dialog focus behaviour; compare
  before/after screenshots during migration.
* **Security.** Downloads browser binaries at install; runs only against localhost in our scripts. Keep it out of
  the production image and out of `dependencies`.
* **Recommendation: adopt (keep).** Whether to add `@playwright/test` as a pinned `devDependency` and run the smoke
  test in CI is a separate decision: CI today runs `npm ci`, typecheck, build and `npm audit` only.

### 15. storybookjs/storybook

* Component workshop, MIT. Current `storybook` 10.6.9 is 22.3 MB unpacked with 17 direct dependencies;
  `@storybook/nextjs` adds 33 and requires `webpack ^5` as a peer. A release candidate of v11 was published the day
  before this review, so a major upgrade would follow adoption almost immediately.
* **Assessment.** For one owner, one frontend developer role and a component set of about 30, Storybook costs more
  than it returns: a second build system and configuration to keep in step with Next, tens of megabytes of
  development dependencies in a project that currently has ten, and extra CI time if stories are built there. The
  isolation and state-coverage benefits can be had with one gallery route inside the app and the Playwright script
  we already have.
* **Recommendation: reject** in favour of the lighter gallery page described in `04-COMPONENT-ARCHITECTURE.md` §5.

## Items that need attribution or carry a paid tier

| Item | Obligation |
|---|---|
| Lightweight Charts | TradingView attribution notice and link on the page (or `attributionLogo`). Not adopted |
| Apache-2.0 works (frontend-design skill, Playwright, ECharts, Tremor, Spectrum UI) | Include the licence; keep NOTICE where one exists; mark modified files. Applies today only to the installed frontend-design skill, which carries its `LICENSE.txt` and a modification notice |
| MIT works (Radix, TanStack, Motion, Storybook, ReUI, UI/UX Pro Max data) | Keep the copyright and permission notice with copies. The installed UI/UX Pro Max data carries its `LICENSE` |
| ReUI | Paid "ReUI Pro" blocks exist; free registry is MIT |
| Motion | Paid "Motion+" tier; core library is MIT |
| Spectrum UI | A paid tier appears to be planned (file names only; not verified) |

## Not verified

* GitHub stars, issue counts, security advisories and release notes for all fifteen (API access refused).
* Real bundle-size impact of any library on our build.
* The running nba-tracker site, the ReUI and Spectrum component galleries, and the Motion+ and ReUI Pro terms.
* The frontend-inspo-mcp source against its own security claims.
* Whether TanStack Table v9 has behavioural differences that matter for our tables compared with v8 (no code was
  written against it).
