#!/usr/bin/env node
// GIZER NBA — smoke test + screenshots.
//
// Prerequisites (both must already be running):
//   node e2e/mock-api.mjs                      # mock API on :8000
//   npm run build && npm run start             # app on :3000 (or `npm run dev`)
// Run:  node e2e/smoke.mjs        (BASE_URL overrides http://localhost:3000)
//
// Uses the globally installed Playwright; it is intentionally not a project dependency.

import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  // Global installs are not on the ESM resolution path; fall back to the global root.
  const { execSync } = require("node:child_process");
  const root = execSync("npm root -g").toString().trim();
  const candidates = [root, "/opt/node-tools/node_modules", ...(process.env.NODE_PATH ?? "").split(":").filter(Boolean)];
  for (const c of candidates) {
    try {
      ({ chromium } = require(join(c, "playwright")));
      break;
    } catch {
      /* try next */
    }
  }
  if (!chromium) throw new Error("Global playwright not found. Set NODE_PATH to the global node_modules directory.");
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = "owner@fixture.test";
const PASSWORD = "fixture-password";
const DISCLAIMER = "Research and paper testing only. No outcome is guaranteed. No real-money execution.";
// The mandated footer sentence "No outcome is guaranteed" stays; it is removed before the vocabulary scan.
const FORBIDDEN = [/\block\b/i, /\blocks\b/i, /guaranteed/i, /guarantee\b/i, /free money/i, /risk[- ]free/i, /can(?:[’']?t|not) lose/i, /sure thing/i, /sharp money/i, /smart money/i, /insider/i, /real[- ]?time/i, /live odds/i];

const NAV = ["/live", "/jarvis", "/cortex", "/", "/games", "/picks", "/player-props", "/kalshi-intelligence", "/lineups", "/parlays", "/parlays/same-game", "/players", "/minutes", "/players/compare", "/players/history", "/matchups", "/injuries", "/builder", "/tickets", "/research/daily", "/results", "/performance", "/research-lab", "/agents", "/models", "/data-health", "/settings"];
const OTHER = ["/kalshi-intelligence/KXFIX-A-PTS25", "/kalshi-intelligence/KXFIX-A-DD", "/games/FIX-G1", "/games/FIX-G2", "/players/9001", "/players/9004", "/players/compare?ids=9001,9005", "/teams", "/teams/1", "/exposure", "/markets", "/simulations", "/backtesting", "/admin", "/admin/ai-budget", "/live/following", "/live/research-tracker", "/games/FIX-G1?tab=boxscore", "/games/FIX-G1?tab=plays", "/games/FIX-G1?tab=rotations", "/games/FIX-G1?tab=overview", "/cortex?tab=encyclopedia", "/cortex?tab=playbook", "/cortex?tab=statistics", "/cortex?tab=player-dna", "/cortex?tab=player-dna&player=9001", "/cortex?tab=team-dna", "/cortex?tab=team-dna&team=1", "/cortex?tab=coach-dna", "/cortex?tab=coach-dna&team=1", "/cortex?tab=research", "/cortex?tab=sources", "/cortex?tab=coverage", "/cortex?tab=evaluations", "/cortex/fix-shot-clock"];
// The ten pages captured at every viewport for design review.
const GALLERY = [["/", "overview"], ["/games", "games"], ["/lineups", "lineups"], ["/player-props", "player-props"], ["/players/9001", "player-profile"], ["/games/FIX-G1", "game"], ["/parlays", "parlays"], ["/results", "results"], ["/agents", "agents"], ["/data-health", "data-health"], ["/kalshi-intelligence", "kalshi"], ["/kalshi-intelligence/KXFIX-A-PTS25", "kalshi-detail"], ["/minutes", "minutes"], ["/injuries", "injuries"], ["/jarvis", "jarvis"], ["/admin/ai-budget", "ai-budget"], ["/live", "live"], ["/games/FIX-G1?tab=overview", "live-game"], ["/games/FIX-G1?tab=boxscore", "live-boxscore"], ["/games/FIX-G1?tab=rotations", "live-rotations"], ["/cortex", "cortex"], ["/cortex?tab=encyclopedia", "cortex-encyclopedia"], ["/cortex/fix-shot-clock", "cortex-record"], ["/cortex?tab=player-dna&player=9001", "cortex-player"], ["/cortex?tab=team-dna&team=1", "cortex-team"]];
// The navigation list (lib/nav-destinations.json) is the source of truth for the shell. The list on
// `main` (the 27-link sidebar plus the 9 pages it hid) is read from git so the test proves nothing was lost.
const NAVDATA = JSON.parse(readFileSync(join(HERE, "..", "lib", "nav-destinations.json"), "utf8"));
const DESTINATIONS = NAVDATA.workspaces.flatMap((w) => w.pages.map((p) => ({ ...p, workspace: w.id, workspaceLabel: w.label, primary: w.primary })));
let LEGACY = null;
try {
  const { execSync } = require("node:child_process");
  const old = execSync("git show main:apps/web/lib/nav.ts", { cwd: HERE, stdio: ["ignore", "pipe", "ignore"] }).toString();
  LEGACY = [...old.matchAll(/href:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"/g)].map((m) => ({ href: m[1], label: m[2] })).filter((x, i, a) => !["Home", "Games", "Props", "Parlays"].includes(x.label) || a.findIndex((y) => y.href === x.href) === i);
  LEGACY = LEGACY.filter((x, i, a) => a.findIndex((y) => y.href === x.href) === i);
} catch {
  LEGACY = null; // not a git checkout, or no main branch: the comparison is reported as not run
}
const VIEWPORTS = [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [768, 1024], [430, 932], [390, 844]];

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const slug = (route) => (route === "/" ? "overview" : route.replace(/^\//, "").replace(/[/?=&,]/g, "-"));
const bodyText = (page) => page.evaluate(() => document.body.innerText);

async function settle(page) {
  // a game page keeps an event stream open, so the network never goes idle there
  await page.waitForLoadState("networkidle", { timeout: /\/games\/[^/?]+/.test(page.url()) ? 2500 : 30000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-state="loading"]'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(200);
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const over = doc.scrollWidth - doc.clientWidth;
    if (over <= 1) return null;
    let worst = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 1 && (!worst || r.right > worst.right)) {
        worst = { right: Math.round(r.right), tag: el.tagName, cls: String(el.className).slice(0, 80), text: (el.textContent ?? "").slice(0, 40) };
      }
    }
    return { over, worst };
  });
}

/** Smallest rendered font size among visible text nodes (the design system floor is 13px). */
async function minFont(page) {
  return page.evaluate(() => {
    let min = 99;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest("svg") || el.closest(".sr-only") || el.offsetParent === null) continue;
      min = Math.min(min, parseFloat(getComputedStyle(el).fontSize));
    }
    return min;
  });
}

async function visit(page, route, label, errors) {
  const before = errors.length;
  const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  check(`[${label}] ${route} responds 200`, res && res.status() === 200, `status ${res?.status()}`);
  check(`[${label}] ${route} stays authenticated`, !new URL(page.url()).pathname.startsWith("/login"), page.url());
  const text = await bodyText(page);
  check(`[${label}] ${route} renders a heading`, (await page.locator("h1").count()) > 0);
  check(`[${label}] ${route} has no failed render`, !/Application error|Unhandled Runtime Error|This page could not be found/i.test(text));
  check(`[${label}] ${route} shows no error state`, (await page.locator('[data-state="error"]').count()) === 0);
  check(`[${label}] ${route} finished loading`, (await page.locator('[data-state="loading"]').count()) === 0);
  check(`[${label}] ${route} shows the research notice`, text.includes(DISCLAIMER));
  check(`[${label}] ${route} shows the scoreboard strip`, (await page.locator('[data-testid="scoreboard-strip"]').count()) === 1);
  const scan = text.split(DISCLAIMER).join(" ");
  const hit = FORBIDDEN.find((re) => re.test(scan));
  check(`[${label}] ${route} has no forbidden vocabulary`, !hit, hit ? `${hit} near "${scan.slice(Math.max(0, scan.search(hit) - 30), scan.search(hit) + 40).replace(/\s+/g, " ")}"` : "");
  if (route.startsWith("/cortex")) {
    const main = await page.locator("main").innerText();
    const boast = main.match(/AI[- ]powered|\bintelligent\b|\bsmart\b|\bgenius\b|state[- ]of[- ]the[- ]art/i);
    check(`[${label}] ${route} does not describe the system as AI-powered, intelligent or smart`, !boast, boast ? boast[0] : "");
  }
  const mf = await minFont(page);
  check(`[${label}] ${route} has no text below 13px`, mf >= 13, `smallest ${mf}px`);
  check(`[${label}] ${route} raised no page/console errors`, errors.length === before, errors.slice(before).join(" | "));
  return text;
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click('button[type="submit"]')]);
  await settle(page);
}

function watch(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/401 \(Unauthorized\)/.test(t)) return; // expected on the bad-password and signed-out paths
    errors.push(`console: ${t}`);
  });
  return errors;
}


/** Moves the mock's scripted game (FIX-G1): phase 0 scheduled, 1 live Q1, 2 halftime, 3 live Q3, 4 final. */
const mockLive = (page, body) => page.evaluate((b) => fetch("/api/v1/__mock/live", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": "fixture-csrf-token" }, body: JSON.stringify(b) }).then((r) => r.json()), body);
const OUTCOME_WORDS = /\b(winning|losing|wins?|loses?|won|lost|hit|hits|miss|missed|misses|cashed|cashing|on pace|bet|wager|stake)\b/i;

/** GIZER LIVE: strip, /live, the game centre, following, thresholds, research tracker, player block. */
async function liveFlow(page, label, errors, shot) {
  const isMobile = label === "mobile";
  const go = async (route) => {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await settle(page);
  };
  const strip = page.locator('[data-testid="scoreboard-strip"]');
  const g1 = '[data-game-id="FIX-G1"]';
  errors.length = 0;

  // --- before tipoff: nothing pulses, the game page opens on Research ---
  await mockLive(page, { phase: 0, stale: false, streamError: false });
  await go("/live");
  check(`[${label}] live: three strip cards, none marked live before tipoff`, (await strip.locator('[data-testid="strip-card"]').count()) === 3 && (await page.locator('[data-testid="live-dot"]').count()) === 0);
  check(`[${label}] live: scheduled card shows the tipoff in ET and no score`, /\d{1,2}:\d{2}\s?(AM|PM) ET/.test(await strip.locator(`${g1}`).innerText()) && !/\b0\b/.test(await strip.locator(`${g1}`).innerText()));
  check(`[${label}] live: "no game has started" is stated, with upcoming and final sections`, (await page.locator('[data-testid="live-not-started"]').count()) + (await page.locator('[data-testid="live-upcoming"]').count()) >= 1 && (await page.locator('[data-testid="live-card"]').count()) === 3);
  check(`[${label}] live: the polling note is shown once and is worded as delayed observations`, (await page.locator('[data-testid="poll-note"]').count()) === 1 && /delayed observations/.test(await page.locator('[data-testid="poll-note"]').innerText()));
  await go("/games/FIX-G1");
  check(`[${label}] game centre: six tabs, Research selected before tipoff`, (await page.locator('[role="tablist"][aria-label="Game centre"] [role="tab"]').count()) === 6 && (await page.locator('[data-tab="research"][aria-selected="true"]').count()) === 1 && (await page.locator('[data-testid="score-header"]').getAttribute("data-status")) === "scheduled");
  check(`[${label}] game centre: no score and no LIVE marker before tipoff`, (await page.locator('[data-testid="score-header"] [data-testid="live-dot"]').count()) === 0 && !/\b0\b/.test(await page.locator('[data-testid="score-header"]').innerText()));

  // --- live Q1 ---
  await mockLive(page, { phase: 1 });
  await go("/live");
  check(`[${label}] live: one pulsing LIVE marker on the strip card, with period, clock and freshness`, (await strip.locator(`${g1} [data-testid="live-dot"]`).count()) === 1 && /Q1/.test(await strip.locator(g1).innerText()) && /6:12/.test(await strip.locator(g1).innerText()) && (await strip.locator(`${g1} [data-testid="freshness"][data-stale="0"]`).count()) === 1);
  check(`[${label}] live: strip shows the observed score`, /14/.test(await strip.locator(g1).innerText()) && /12/.test(await strip.locator(g1).innerText()));
  check(`[${label}] live: Live section holds the game with a line score and leaders`, (await page.locator(`[data-testid="live-live"] [data-testid="live-card"]`).count()) === 1 && (await page.locator('[data-testid="live-live"] [data-testid="line-score"]').count()) === 1 && (await page.locator('[data-testid="live-live"] [data-testid="live-leaders"]').count()) <= 1 && (await page.locator('[data-testid="live-upcoming"] [data-testid="live-card"]').count()) >= 1);
  if (!isMobile) check(`[${label}] live: the Games workspace row shows the live dot beside Live Games, and the top bar beside Games`, (await page.locator('[data-testid="subnav"] a[data-nav-href="/live"] [data-testid="live-dot"]').count()) === 1 && (await page.locator('[data-testid="primary-nav"] a[data-workspace="games"] [data-testid="live-dot"]').count()) === 1);
  else check(`[${label}] live: the bottom tab bar shows the live dot beside Games`, (await page.locator('[data-testid="bottom-nav"] a[data-workspace="games"] [data-testid="live-dot"]').count()) === 1);
  await shot("live");

  // day navigation on /live
  const dayText = () => page.locator("main h1").first().locator("xpath=..").innerText();
  await page.click('[data-testid="live-prev"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="live-card"]').length !== 3 || !document.querySelector('[data-testid="live-live"]'), null, { timeout: 8000 }).catch(() => {});
  await settle(page);
  check(`[${label}] live: Previous day shows that day's finished games`, (await page.locator('[data-testid="live-live"]').count()) === 0 && (await page.locator('[data-testid="live-final"] [data-testid="live-card"]').count()) >= 1 && !(await page.locator('[data-testid="live-today"]').isDisabled()));
  await page.click('[data-testid="live-today"]');
  await page.locator('[data-testid="live-live"]').waitFor({ timeout: 8000 }).catch(() => {});
  await page.click('[data-testid="live-next"]');
  await page.locator('[data-state="empty"]').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] live: a day with no games states exactly that`, /No games on /.test(await page.locator("main").innerText()));
  await page.click('[data-testid="live-today"]');
  await page.locator('[data-testid="live-live"]').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] live: Today returns to the current slate`, (await page.locator('[data-testid="live-card"]').count()) === 3 && (await page.locator('[data-testid="live-today"]').isDisabled()));

  // strip: day switch, collapse remembered, navigation
  await page.click('[data-testid="strip-yesterday"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="scoreboard-strip"] [data-game-id="FIX-G1"]'), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] strip: Yesterday swaps the cards`, (await strip.locator(g1).count()) === 0 && (await strip.locator('[data-testid="strip-card"]').count()) >= 1);
  await page.click('[data-testid="strip-today"]');
  await strip.locator(g1).waitFor({ timeout: 8000 }).catch(() => {});
  await page.click('[data-testid="strip-tomorrow"]');
  await strip.locator('[data-testid="strip-empty"]').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] strip: Tomorrow with no games says so`, (await strip.locator('[data-testid="strip-empty"]').count()) === 1);
  await page.click('[data-testid="strip-today"]');
  await strip.locator(g1).waitFor({ timeout: 8000 }).catch(() => {});
  await page.click('[data-testid="strip-toggle"]');
  check(`[${label}] strip: collapses`, (await strip.getAttribute("data-collapsed")) === "1" && (await strip.locator('[data-testid="strip-card"]:visible').count()) === 0);
  await go("/games");
  check(`[${label}] strip: collapsed state is remembered across pages`, (await strip.getAttribute("data-collapsed")) === "1");
  await page.click('[data-testid="strip-toggle"]');
  check(`[${label}] strip: expands again`, (await strip.getAttribute("data-collapsed")) === "0" && (await strip.locator('[data-testid="strip-card"]:visible').count()) >= 1);
  if (isMobile) {
    const sc = await page.evaluate(() => { const e = document.querySelector('[data-testid="strip-scroll"]'); const c = getComputedStyle(e); return { snap: c.scrollSnapType, ox: c.overflowX }; });
    check(`[${label}] strip: horizontal snap carousel on a phone`, /x/.test(sc.snap) && /auto|scroll/.test(sc.ox), JSON.stringify(sc));
  }
  await Promise.all([page.waitForURL((u) => u.pathname === "/games/FIX-G1"), strip.locator(g1).click()]);
  await settle(page);
  check(`[${label}] strip: a card opens the game centre on the live view`, new URL(page.url()).searchParams.get("tab") === "live" && (await page.locator('[data-tab="overview"][aria-selected="true"]').count()) === 1 && (await page.locator('[data-testid="live-overview"]').count()) === 1);

  // --- score header + stream ---
  const header = page.locator('[data-testid="score-header"]');
  check(`[${label}] game centre: header shows the observed score, LIVE, Q1 and the clock`, /14/.test(await header.innerText()) && /12/.test(await header.innerText()) && /LIVE/i.test(await header.innerText()) && /Q1/.test(await header.innerText()) && (await header.locator('[data-testid="live-dot"]').count()) === 1 && (await header.locator('[data-testid="freshness"][data-stale="0"]').count()) === 1);
  check(`[${label}] game centre: header is sticky`, (await header.evaluate((e) => { let n = e; while (n && n !== document.body) { if (getComputedStyle(n).position === "sticky") return true; n = n.parentElement; } return false; })));
  check(`[${label}] overview: leaders, last plays with the source wording, a corrected play`, (await page.locator('[data-testid="leaders"]').count()) === 1 && (await page.locator('[data-testid="last-plays"] [data-testid="play"]').count()) === 8 && /FIXTURE: .* (makes|misses|rebound|foul|enters|turnover)/.test(await page.locator('[data-testid="last-plays"]').innerText()));
  check(`[${label}] overview: a leader the source has not published shows the marker, not a zero`, (await page.locator('[data-testid="leaders"] [aria-label="not available"]').count()) >= 1);
  check(`[${label}] overview: team comparison bars, unpublished stats listed, null as the marker`, (await page.locator('[data-testid="team-bar"]').count()) === 4 && /Bench points/.test(await page.locator('[data-testid="not-published"]').innerText()) && (await page.locator('[data-testid="team-bars"] [aria-label="not available"]').count()) >= 1);
  await page.locator('[data-testid="progression"] svg path').first().waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] overview: score progression chart renders with its facts and no win-probability wording`, (await page.locator('[data-testid="progression"] svg path').count()) >= 1 && /lead changes/i.test(await page.locator('[data-testid="progression-facts"]').innerText()) && /No win probability is computed/.test(await page.locator('[data-testid="live-overview"]').innerText()));
  await shot("live-overview", { fullPage: true });
  const nav0 = await page.evaluate(() => performance.getEntriesByType("navigation").length + ":" + performance.timeOrigin);
  const v0 = await header.getAttribute("data-version");
  await mockLive(page, { phase: 3 });
  await page.waitForFunction(() => /70/.test(document.querySelector('[data-testid="score-header"]')?.innerText ?? ""), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] stream: the score header updates without a reload`, /70/.test(await header.innerText()) && /66/.test(await header.innerText()) && /Q3/.test(await header.innerText()) && (await header.getAttribute("data-version")) !== v0 && (await page.evaluate(() => performance.getEntriesByType("navigation").length + ":" + performance.timeOrigin)) === nav0);
  await page.waitForFunction(() => /52-49/.test(document.querySelector('[data-testid="summaries"]')?.innerText ?? ""), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] stream: a new version refreshes the tab data (stored summary appears)`, /FIXTURE summary/.test(await page.locator('[data-testid="summaries"]').innerText().catch(() => "")));
  // stream failure → Reconnecting → recovery
  await mockLive(page, { streamError: true });
  await page.locator('[data-testid="stream-state"]').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] stream: a dropped stream shows "Reconnecting…"`, /Reconnecting/.test(await page.locator('[data-testid="stream-state"]').innerText().catch(() => "")));
  await mockLive(page, { streamError: false, phase: 3 });
  await page.locator('[data-testid="stream-state"]').waitFor({ state: "detached", timeout: 16000 }).catch(() => {});
  check(`[${label}] stream: it recovers on its own and the marker goes away`, (await page.locator('[data-testid="stream-state"]').count()) === 0 && /70/.test(await header.innerText()));
  const streamErrs = errors.filter((e) => !/503|ERR_|Failed to load resource|EventSource|network/i.test(e));
  check(`[${label}] stream: only the expected connection errors were logged`, streamErrs.length === 0, streamErrs.join(" | "));
  errors.length = 0;

  // --- tabs ---
  const tab = async (id) => {
    await page.click(`[role="tablist"][aria-label="Game centre"] [data-tab="${id}"]`);
    await page.waitForFunction((t) => new URLSearchParams(location.search).get("tab") === t, id, { timeout: 5000 }).catch(() => {});
    await settle(page);
  };
  await tab("boxscore");
  check(`[${label}] tabs: Box Score sets ?tab=boxscore and renders both teams`, new URL(page.url()).searchParams.get("tab") === "boxscore" && (await page.locator('[data-testid="box-team"]').count()) === 2);
  if (!isMobile) {
    const col = (team, key) => page.locator(`[data-testid="box-team"][data-team="${team}"] [data-testid="box-row"] [data-col="${key}"]`).allInnerTexts().then((a) => a.map((x) => (x.trim() === "—" ? null : Number(x))));
    const desc = (a) => { const v = a.filter((x) => x !== null); return v.every((x, i) => i === 0 || v[i - 1] >= x) && a.indexOf(null) === -1 ? true : v.every((x, i) => i === 0 || v[i - 1] >= x) && a.slice(a.indexOf(null)).every((x) => x === null); };
    check(`[${label}] box: starters first, a divider before the bench, a did-not-play row, team totals`, (await page.locator('[data-testid="box-team"][data-team="DET"] [data-bench-start="1"]').count()) === 1 && (await page.locator('[data-testid="box-team"][data-team="DET"] [data-testid="box-dnp"]').count()) === 1 && /Did not play/.test(await page.locator('[data-testid="box-team"][data-team="DET"] [data-testid="box-dnp"]').innerText()) && (await page.locator('[data-testid="box-team"][data-team="DET"] table [data-testid="box-totals"]').count()) === 1);
    check(`[${label}] box: on-court dots and a foul marker while live`, (await page.locator('[data-testid="box-table"] [data-testid="on-court"]').count()) >= 4 && (await page.locator('[data-testid="box-table"] [data-testid="foul-trouble"]').count()) >= 1);
    check(`[${label}] box: a stat the source did not publish shows the marker, never 0`, (await page.locator('[data-testid="box-team"][data-team="DET"] [data-testid="box-row"] [data-col="blk"]').nth(2).innerText()).trim() === "—" && (await page.locator('[data-testid="box-team"][data-team="DET"] [data-testid="box-row"] [data-col="plus_minus"]').nth(1).innerText()).trim() === "—");
    await page.locator('[data-testid="box-team"][data-team="DET"] [data-sort="reb"]').click();
    const reb = await col("DET", "reb");
    check(`[${label}] box: sorts by rebounds, descending`, desc(reb) && (await page.locator('[data-testid="box-team"][data-team="DET"] th[aria-sort="descending"]').count()) === 1, reb.join(","));
    await page.locator('[data-testid="box-team"][data-team="DET"] [data-sort="blk"]').click();
    const blk = await col("DET", "blk");
    check(`[${label}] box: sorts by a second column, missing values last`, desc(blk) && blk[blk.length - 1] === null && (await page.locator('[data-testid="box-team"][data-team="ORL"] th[aria-sort="descending"]').count()) === 1, blk.join(","));
    await page.locator('[data-testid="box-team"][data-team="DET"] [data-sort="blk"]').click();
    const asc = (await col("DET", "blk")).filter((x) => x !== null);
    check(`[${label}] box: a second click reverses the order`, asc.every((x, i) => i === 0 || asc[i - 1] <= x), asc.join(","));
    await page.locator('[data-testid="box-pregame"]').check();
    check(`[${label}] box: pregame projection columns are optional and labelled`, (await page.locator('[data-testid="box-team"][data-team="DET"] [data-sort^="pre"], [data-testid="box-team"][data-team="DET"] [data-sort^="proj"]').count()) >= 1);
    const scroller = await page.locator('[data-testid="box-table"]').first().evaluate((e) => getComputedStyle(e.parentElement).overflowX);
    check(`[${label}] box: the table scrolls inside its own box with a sticky player column`, /auto|scroll/.test(scroller) && (await page.locator('[data-testid="box-table"] tbody th').first().evaluate((e) => getComputedStyle(e).position)) === "sticky");
  } else {
    check(`[${label}] box: player cards instead of a table on a phone`, (await page.locator('[data-testid="box-card"]:visible').count()) === 14 && (await page.locator('[data-testid="box-table"]:visible').count()) === 0);
    await page.locator('[data-testid="box-team"][data-team="DET"] [data-testid="box-card"] button').nth(2).click();
    const det = page.locator('[data-testid="box-card-detail"]');
    check(`[${label}] box: a card expands in place to the full stat line`, (await det.count()) === 1 && /FG/i.test(await det.innerText()) && new URL(page.url()).pathname === "/games/FIX-G1");
    check(`[${label}] box: a stat the source did not publish shows the marker on a card, never 0`, /BLK\s*—/.test(await det.innerText()), (await det.innerText()).replace(/\s+/g, " ").slice(0, 120));
    check(`[${label}] box: no link is nested inside the card button`, (await page.locator('[data-testid="box-card"] button a').count()) === 0);
  }
  await shot("live-boxscore", { fullPage: true });
  const ob = await overflow(page);
  check(`[${label}] box: no horizontal page overflow`, !ob, ob ? JSON.stringify(ob) : "");

  await tab("plays");
  const plays = page.locator('[data-testid="plays-tab"] [data-testid="play"]');
  check(`[${label}] plays: first page of 40 of 80, newest first, grouped by period`, (await plays.count()) === 40 && /40 of 80 plays/.test(await page.locator('[data-testid="plays-count"]').innerText()) && (await plays.first().getAttribute("data-seq")) === "80" && (await page.locator('[data-testid="plays-period"]').count()) >= 2);
  await page.click('[data-testid="plays-more"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="plays-tab"] [data-testid="play"]').length === 80, null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] plays: "more" loads the next page and the control goes away at the end`, (await plays.count()) === 80 && (await page.locator('[data-testid="plays-more"]').count()) === 0 && (await page.locator('[data-testid="play-corrected"]').count()) === 1);
  await mockLive(page, { phase: 4 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="plays-tab"] [data-testid="play"]').length > 80, null, { timeout: 10000 }).catch(() => {});
  check(`[${label}] plays: new plays arrive incrementally without a reload`, (await plays.count()) === 120 && (await plays.first().getAttribute("data-seq")) === "120" && /Final/i.test(await header.innerText()) && (await header.locator('[data-testid="live-dot"]').count()) === 0, `${await plays.count()} plays`);
  const pf = page.locator('[data-testid="plays-tab"] [role="tablist"]');
  await pf.locator('[data-tab="scoring"]').click();
  await page.waitForFunction(() => { const a = [...document.querySelectorAll('[data-testid="plays-tab"] [data-testid="play"]')]; return a.length > 0 && a.every((e) => ["made", "free_throw"].includes(e.dataset.kind)); }, null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] plays: Scoring filter`, (await plays.count()) > 0 && (await plays.evaluateAll((a) => a.every((e) => ["made", "free_throw"].includes(e.dataset.kind)))));
  await pf.locator('[data-tab="fouls"]').click();
  await page.waitForFunction(() => { const a = [...document.querySelectorAll('[data-testid="plays-tab"] [data-testid="play"]')]; return a.length > 0 && a.every((e) => e.dataset.kind === "foul"); }, null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] plays: Fouls filter`, (await plays.count()) === 15 && (await plays.evaluateAll((a) => a.every((e) => e.dataset.kind === "foul"))), `${await plays.count()}`);
  await pf.locator('[data-tab="substitutions"]').click();
  await page.waitForFunction(() => { const a = [...document.querySelectorAll('[data-testid="plays-tab"] [data-testid="play"]')]; return a.length > 0 && a.every((e) => e.dataset.kind === "substitution"); }, null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] plays: Substitutions filter`, (await plays.count()) === 15 && /enters the game/.test(await plays.first().innerText()));
  await pf.locator('[data-tab="all"]').click();
  await page.locator('[data-testid="plays-team"]').selectOption({ index: 1 });
  await page.waitForFunction(() => /of 60 plays/.test(document.querySelector('[data-testid="plays-count"]')?.innerText ?? ""), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] plays: team filter`, /of 60 plays/.test(await page.locator('[data-testid="plays-count"]').innerText()), await page.locator('[data-testid="plays-count"]').innerText());
  await shot("live-plays");

  await mockLive(page, { phase: 3 });
  await go("/games/FIX-G1?tab=rotations");
  check(`[${label}] rotations: a timeline with stints for the determinable team`, (await page.locator('[data-testid="rotation-team"][data-determinable="1"] [data-testid="rotation-row"]').count()) === 7 && (await page.locator('[data-testid="rotation-team"][data-determinable="1"] [data-testid="stint"]').count()) >= 10 && (await page.locator('[data-testid="rotation-team"][data-determinable="1"] [data-testid="rotation-table"]').count()) === 1);
  check(`[${label}] rotations: the other team says its stints cannot be determined and draws nothing`, /cannot be determined/.test(await page.locator('[data-testid="rotation-team"][data-determinable="0"] [data-testid="rotation-note"]').innerText()) && (await page.locator('[data-testid="rotation-team"][data-determinable="0"] [data-testid="stint"]').count()) === 0);
  await shot("live-rotations", { fullPage: true });
  const orot = await overflow(page);
  check(`[${label}] rotations: no horizontal page overflow`, !orot, orot ? JSON.stringify(orot) : "");
  await tab("research");
  check(`[${label}] tabs: Research keeps the pregame research page`, (await page.locator('[data-testid="game-page"]').count()) === 1 && (await page.locator("#kalshi").count()) === 1);
  await tab("jarvis");
  check(`[${label}] tabs: JARVIS tab offers game questions`, (await page.locator('[data-testid="game-jarvis"]').count()) === 1 && (await page.locator('[data-testid="game-jarvis"] button').count()) >= 4);
  await go("/games/FIX-G1");
  check(`[${label}] game centre: Overview is the default while the game is live`, (await page.locator('[data-tab="overview"][aria-selected="true"]').count()) === 1);

  // --- halftime and stale: never a pulsing LIVE ---
  await mockLive(page, { phase: 2, stale: true });
  await go("/games/FIX-G1?tab=overview");
  check(`[${label}] halftime: Halftime is shown without the pulsing LIVE marker`, /Halftime/i.test(await header.innerText()) && (await header.locator('[data-testid="live-dot"]').count()) === 0 && (await strip.locator(`${g1} [data-testid="live-dot"]`).count()) === 0);
  check(`[${label}] stale: "Delayed — last update HH:MM:SS ET" in the header`, /Delayed — last update \d{1,2}:\d{2}:\d{2}\s?(AM|PM)? ?ET/.test(await header.locator('[data-testid="freshness"][data-stale="1"]').innerText().catch(() => "")), await header.locator('[data-testid="freshness"]').innerText().catch(() => "none"));
  check(`[${label}] stale: the strip card says Delayed too`, /Delayed/.test(await strip.locator(`${g1} [data-testid="freshness"][data-stale="1"]`).innerText().catch(() => "")));
  await shot("live-stale");
  await mockLive(page, { phase: 3, stale: false });

  // --- follow / unfollow persists ---
  await go("/live");
  check(`[${label}] follow: nothing is followed to begin with`, (await page.locator('[data-testid="live-following"]').count()) === 0);
  const fb = page.locator(`[data-testid="live-card"]:has(a[href*="FIX-G1"]) [data-testid="follow-btn"]`);
  await fb.click();
  await page.locator('[data-testid="live-following"] [data-testid="live-card"]').waitFor({ timeout: 8000 }).catch(() => {});
  await page.reload();
  await settle(page);
  check(`[${label}] follow: the game is in Following after a reload, starred on the strip`, (await page.locator('[data-testid="live-following"] [data-testid="live-card"]').count()) === 1 && (await page.locator('[data-testid="live-following"] [data-testid="follow-btn"]').getAttribute("data-on")) === "1" && (await strip.locator(`${g1} [aria-label="Following"]`).count()) === 1 && (await strip.locator('[data-testid="strip-card"]').first().getAttribute("data-game-id")) === "FIX-G1");

  await go("/games/FIX-G1?tab=overview");
  await page.waitForTimeout(600); // let a stream frame arrive: frames carry no per-user flags
  check(`[${label}] follow: the game header shows the followed state even though stream frames are not per-user`, (await page.locator('[data-testid="score-header"] [data-testid="follow-btn"]').getAttribute("data-on")) === "1");

  // --- tracking thresholds ---
  await go("/live/following");
  check(`[${label}] following: the followed game is listed; notifications are off by default`, (await page.locator('[data-testid="following-games"] [data-testid="following-game"]').count()) === 1 && (await page.locator('[data-testid="notify-setting"]').getAttribute("data-on")) === "0");
  await page.locator('[data-testid="milestone-form"] [data-testid="player-search"] input').fill("Player A");
  await page.locator('[data-testid="milestone-pick"]').first().click();
  await page.selectOption('select[name="milestone_stat"]', "pts");
  await page.fill('input[name="milestone_threshold"]', "5");
  await page.locator('input[name="milestone_notify"]').check();
  await page.click('[data-testid="milestone-add"]');
  await page.locator('[data-testid="milestone"]').first().waitFor({ timeout: 8000 }).catch(() => {});
  await page.reload();
  await settle(page);
  const ms = page.locator('[data-testid="watchlist-players"] [data-testid="milestone"]');
  const msText = (await ms.first().innerText().catch(() => "")).replace(/\s+/g, " ");
  check(`[${label}] threshold: created, persists after a reload, shows current value and "reached" as an observation`, (await ms.count()) === 1 && (await ms.first().getAttribute("data-reached")) === "1" && /Threshold reached/.test(msText) && !OUTCOME_WORDS.test(msText), msText);
  await page.click('[data-testid="milestone-add"]');
  await page.locator('[data-testid="milestone-error"]').waitFor({ timeout: 5000 }).catch(() => {});
  check(`[${label}] threshold: adding without a player is refused inline and creates nothing`, (await page.locator('[data-testid="milestone-error"]').count()) === 1 && (await ms.count()) === 1);
  // notifications: off by default; when the browser grants permission, a reached threshold with "notify" shows one toast
  // headless Chromium always denies notification permission: first the refusal path, then a stand-in
  // Notification object that records what the app would have shown.
  await page.click('[data-testid="notify-toggle"]');
  await page.locator('[data-testid="notify-setting"] ~ [role="alert"], [data-testid="notify-setting"] + [role="alert"]').waitFor({ timeout: 5000 }).catch(() => {});
  check(`[${label}] notifications: without browser permission the setting stays off and says why`, (await page.locator('[data-testid="notify-setting"]').getAttribute("data-on")) === "0" && /permission was not granted|does not support/.test(await page.locator("main").innerText()));
  await page.addInitScript(() => {
    window.__notes = [];
    window.Notification = class { static permission = "granted"; static requestPermission = async () => "granted"; constructor(title, opts) { window.__notes.push({ title, body: opts?.body }); } };
  });
  await page.reload();
  await settle(page);
  await page.click('[data-testid="notify-toggle"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="notify-setting"]')?.getAttribute("data-on") === "1", null, { timeout: 5000 }).catch(() => {});
  if ((await page.locator('[data-testid="notify-setting"]').getAttribute("data-on")) === "1") {
    await page.locator('[data-testid="live-toast"]').first().waitFor({ timeout: 8000 }).catch(() => {});
    check(`[${label}] notifications: one in-app toast for the reached threshold`, (await page.locator('[data-testid="live-toast"]').count()) === 1 && /reached 5 pts/.test(await page.locator('[data-testid="live-toast"]').innerText()));
    const notes = await page.evaluate(() => window.__notes);
    check(`[${label}] notifications: exactly one browser notification, worded as an observation`, notes.length === 1 && /threshold reached/i.test(notes[0].title) && /reached 5 pts/.test(notes[0].body) && !OUTCOME_WORDS.test(notes[0].title + " " + notes[0].body), JSON.stringify(notes));
    await page.reload();
    await settle(page);
    await page.waitForTimeout(800);
    check(`[${label}] notifications: the same event is not shown twice`, (await page.locator('[data-testid="live-toast"]').count()) === 0 && (await page.evaluate(() => window.__notes.length)) === 0 && (await page.locator('[data-testid="notify-setting"]').getAttribute("data-on")) === "1");
    await page.click('[data-testid="notify-toggle"]');
    check(`[${label}] notifications: can be turned off again`, (await page.locator('[data-testid="notify-setting"]').getAttribute("data-on")) === "0");
  } else {
    check(`[${label}] notifications: the setting turns on once the browser grants permission`, false);
  }
  await shot("live-following", { fullPage: true });

  // --- player page live block ---
  await go("/players/9001");
  const pl = page.locator('[data-testid="player-live"]');
  check(`[${label}] player: "Live now" block with the game, the observed line, freshness and the threshold`, (await pl.getAttribute("data-live")) === "1" && /Live now/i.test(await pl.innerText()) && (await pl.locator('[data-testid="player-live-game"]').getAttribute("href")).includes("/games/FIX-G1") && (await pl.locator('[data-testid="player-live-line"]').count()) === 1 && (await pl.locator('[data-testid="freshness"]').count()) === 1 && (await pl.locator('[data-testid="milestone"]').count()) === 1);
  await go("/players/9004");
  check(`[${label}] player: no live block content for a player who is not playing`, (await page.locator('[data-testid="player-live"][data-live="1"]').count()) === 0);

  // --- research tracker ---
  await go("/live/research-tracker");
  const legs = page.locator('[data-testid="tracker-leg"]');
  const legText = (await legs.allInnerTexts()).join(" ").replace(/\s+/g, " ");
  check(`[${label}] tracker: paper tickets with legs, current observed value and distance to the line`, (await page.locator('[data-testid="tracker-ticket"]').count()) >= 1 && (await legs.count()) >= 1 && /In progress|Not started/i.test(legText));
  const badWord = legText.match(OUTCOME_WORDS);
  check(`[${label}] tracker: no leg is worded as an outcome or a wager while unsettled`, !badWord, badWord ? `"${badWord[0]}" in: ${legText.slice(Math.max(0, badWord.index - 40), badWord.index + 40)}` : "");
  check(`[${label}] tracker: legs carry no outcome colour while unsettled`, (await legs.evaluateAll((a) => a.every((e) => !/text-(accent|bad)|bg-(accent|bad)/.test(e.className) && ![...e.querySelectorAll("*")].some((c) => /\b(text-bad|bg-bad)/.test(String(c.className)))))));
  check(`[${label}] tracker: notes explain that outcomes come only from settlement`, /settled/.test(await page.locator('[data-testid="tracker-notes"]').innerText()));
  await shot("live-tracker", { fullPage: true });

  // --- clean up: delete the threshold, unfollow ---
  await go("/live/following");
  await page.locator('[data-testid="milestone-delete"]').first().click();
  if (await page.locator('[data-testid="milestone-delete"]').count()) await page.locator('[data-testid="milestone-delete"]').first().click().catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-testid="milestone"]'), null, { timeout: 8000 }).catch(() => {});
  await page.reload();
  await settle(page);
  check(`[${label}] threshold: deleted and stays deleted after a reload`, (await page.locator('[data-testid="milestone"]').count()) === 0);
  await page.locator('[data-testid="following-game"] [data-testid="follow-btn"]').first().click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="following-game"]'), null, { timeout: 8000 }).catch(() => {});
  await page.reload();
  await settle(page);
  check(`[${label}] follow: unfollow persists after a reload`, (await page.locator('[data-testid="following-game"]').count()) === 0);
  await go("/live");
  check(`[${label}] follow: /live no longer has a Following section`, (await page.locator('[data-testid="live-following"]').count()) === 0);

  // --- final ---
  await mockLive(page, { phase: 4 });
  await go("/games/FIX-G1");
  check(`[${label}] final: Final in the header, Overview by default, four periods in the line score, no LIVE marker`, /Final/i.test(await header.innerText()) && /104/.test(await header.innerText()) && (await page.locator('[data-tab="overview"][aria-selected="true"]').count()) === 1 && (await page.locator('[data-testid="live-dot"]').count()) === 0);
  await go("/games/FIX-G1?tab=rotations");
  check(`[${label}] final: no "on court" marker once the game is over (rotations and box score)`, (await page.locator('[data-testid="rotation-row"]').count()) === 7 && (await page.locator('[data-testid="rotations-tab"] [aria-label="on court"]').count()) === 0 && !/On court now/.test(await page.locator('[data-testid="rotations-tab"]').innerText()));
  await go("/games/FIX-G1?tab=boxscore");
  check(`[${label}] final: box score keeps the full lines without on-court markers`, (await page.locator('[data-testid="box-team"]').count()) === 2 && (await page.locator('[data-testid="on-court"]').count()) === 0);
  await mockLive(page, { phase: 0, stale: false, streamError: false });
  check(`[${label}] live flows raised no unexpected page/console errors`, errors.length === 0, errors.slice(0, 4).join(" | "));
  errors.length = 0;
}


/** GIZER CORTEX: the knowledge library and the computed profiles. */
async function cortexFlow(page, label, errors, shot) {
  const isMobile = label === "mobile";
  const go = async (route) => {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await settle(page);
  };
  const apiGet = (path) => page.evaluate((p) => fetch(`/api/v1${p}`, { credentials: "include" }).then((r) => r.json()), path);
  const num = async (id) => Number((await page.locator(`[data-testid="${id}"]`).first().innerText()).replace(/[^0-9.-]/g, ""));
  errors.length = 0;

  // --- overview: every number equals the API value ---
  await go("/cortex");
  const o = await apiGet("/cortex/overview");
  check(`[${label}] cortex: eleven section tabs, Overview selected`, (await page.locator('[role="tablist"][aria-label="CORTEX sections"] [role="tab"]').count()) === 11 && (await page.locator('[data-tab="overview"][aria-selected="true"]').count()) === 1);
  check(`[${label}] cortex overview: knowledge records, checked and not-checked equal the API`, (await num("count-records")) === o.knowledge_records && (await num("count-checked")) === o.records_checked_against_a_source && (await num("count-not-checked")) === o.records_authored_not_checked && o.knowledge_records === 260, `${await num("count-records")}/${await num("count-checked")}/${await num("count-not-checked")}`);
  check(`[${label}] cortex overview: sources, profiles and coaching counts equal the API`, (await num("count-sources")) === o.sources_indexed && (await num("count-sources-opened")) === o.sources_opened_by_author && (await num("count-players")) === o.player_profiles_available && (await num("count-teams")) === o.team_profiles_available && (await num("count-coaching")) === 0);
  check(`[${label}] cortex overview: coaching note, findings and unresolved hypotheses from the API`, (await page.locator('[data-testid="coaching-note"]').innerText()).trim() === o.coaching_note && (await num("count-findings")) === 5 && (await num("count-unresolved")) === o.unresolved_hypotheses);
  const bar = await page.locator('[data-testid="verification-split"] [role="img"] > div').evaluateAll((a) => a.map((e) => parseFloat(e.style.width)));
  check(`[${label}] cortex overview: two-part verification bar in proportion`, bar.length === 2 && Math.abs(bar[0] - (o.records_checked_against_a_source / o.knowledge_records) * 100) < 0.5 && Math.abs(bar[0] + bar[1] - 100) < 0.01, bar.join("/"));
  const cards = page.locator('[data-testid="department-card"]');
  check(`[${label}] cortex overview: twenty department cards with the API counts`, (await cards.count()) === 20 && (await cards.evaluateAll((a, deps) => a.every((e, i) => Number(e.dataset.department) === deps[i].id && Number(e.dataset.records) === deps[i].records && e.innerText.includes(deps[i].name)), o.departments)));
  check(`[${label}] cortex overview: the "Not built" list is shown in full`, (await page.locator('[data-testid="not-built"] li').count()) === o.not_built.length && (await page.locator('[data-testid="not-built"]').innerText()).includes("keyword search only"));
  await shot("cortex-overview", { fullPage: true });

  // --- department card → encyclopedia filtered ---
  await cards.nth(2).click();
  await page.waitForFunction(() => new URLSearchParams(location.search).get("tab") === "encyclopedia" && document.querySelector('[data-testid="concept-count"]')?.getAttribute("data-total") === "13", null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] cortex: a department card opens the Encyclopedia filtered to it`, new URL(page.url()).searchParams.get("department") === "3" && (await page.locator('[data-testid="concept-count"]').getAttribute("data-total")) === "13" && (await page.locator('[data-testid="concept-row"]').count()) === 13 && (await page.locator('select[name="cortex_department"]').inputValue()) === "3" && (await page.locator('[data-testid="concept-row"]').evaluateAll((a) => a.every((e) => e.innerText.includes("Defensive Tactical Intelligence")))));

  // --- encyclopedia: browse pages of 30, filters, chips ---
  await go("/cortex?tab=encyclopedia");
  const rows = page.locator('[data-testid="concept-row"]');
  check(`[${label}] encyclopedia: browse mode shows 30 of 260 with pagination`, (await rows.count()) === 30 && (await page.locator('[data-testid="concept-count"]').getAttribute("data-total")) === "260" && /1–30 of 260/.test(await page.locator('nav[aria-label="Pagination"]').innerText()));
  const chipsOk = await rows.evaluateAll((a) => a.every((e) => { const v = e.querySelector('[data-testid="verification-chip"]'); const t = v.innerText.trim().toLowerCase(); const cls = v.firstElementChild.className; return e.querySelector('[data-testid="kind-chip"]') && e.querySelector('[data-testid="ruleset-chip"]') && (v.dataset.verification === "checked_against_source" ? t === "checked against source" && /text-ink/.test(cls) && !/text-warn/.test(cls) : t === "not checked" && /text-warn/.test(cls)); }));
  check(`[${label}] encyclopedia: every row has kind, ruleset and a verification chip (ink when checked, amber when not)`, chipsOk && (await page.locator('[data-testid="verification-chip"][data-verification="authored_not_checked"]').count()) >= 1 && (await page.locator('[data-testid="verification-chip"][data-verification="checked_against_source"]').count()) >= 1);
  await page.locator('nav[aria-label="Pagination"] button', { hasText: "Next" }).click();
  await page.waitForFunction(() => /31–60 of 260/.test(document.querySelector('nav[aria-label="Pagination"]')?.innerText ?? ""), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] encyclopedia: next page`, /31–60 of 260/.test(await page.locator('nav[aria-label="Pagination"]').innerText()) && (await rows.count()) === 30);
  await page.selectOption('select[name="cortex_verification"]', "authored_not_checked");
  await page.waitForFunction(() => document.querySelector('[data-testid="concept-count"]')?.getAttribute("data-total") === "65", null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] encyclopedia: verification filter shows only unchecked records, with the API total`, (await page.locator('[data-testid="concept-count"]').getAttribute("data-total")) === String(o.records_authored_not_checked) && (await page.locator('[data-testid="verification-chip"][data-verification="checked_against_source"]').count()) === 0);
  await page.selectOption('select[name="cortex_verification"]', "");
  await page.selectOption('select[name="cortex_kind"]', "market");
  await page.waitForFunction((n) => document.querySelector('[data-testid="concept-count"]')?.getAttribute("data-total") === String(n), o.by_kind.market, { timeout: 8000 }).catch(() => {});
  check(`[${label}] encyclopedia: kind filter shows only that kind, with the API total`, (await page.locator('[data-testid="concept-count"]').getAttribute("data-total")) === String(o.by_kind.market) && (await rows.count()) === o.by_kind.market && (await page.locator('[data-testid="concept-row"] [data-testid="kind-chip"]').evaluateAll((a) => a.every((e) => e.dataset.kind === "market"))));
  await page.selectOption('select[name="cortex_kind"]', "");

  // search: all words → any word → none
  await page.fill('input[name="cortex_q"]', "shotclock fourteen");
  await page.waitForFunction(() => document.querySelector('[data-testid="concept-count"]')?.getAttribute("data-method") === "all_words", null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] encyclopedia: search (debounced) finds the record and says it matched every word`, (await page.locator('[data-testid="concept-count"]').getAttribute("data-mode")) === "search" && (await rows.count()) === 1 && (await rows.first().getAttribute("data-slug")) === "fix-shot-clock" && /containing every word/.test(await page.locator('[data-testid="concept-count"]').innerText()));
  await page.fill('input[name="cortex_q"]', "shotclock zzqq");
  await page.waitForFunction(() => document.querySelector('[data-testid="concept-count"]')?.getAttribute("data-method") === "any_word", null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] encyclopedia: a looser match is labelled as "any of the words"`, /any of the words/.test(await page.locator('[data-testid="concept-count"]').innerText()) && (await rows.count()) === 1);
  await page.fill('input[name="cortex_q"]', "zzqq");
  await page.waitForFunction(() => document.querySelector('[data-testid="concept-count"]')?.getAttribute("data-total") === "0", null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] encyclopedia: no match is stated honestly (keyword search, not meaning)`, (await rows.count()) === 0 && /No record matches this search/.test(await page.locator('[data-testid="encyclopedia"]').innerText()) && /by keyword, not by meaning/.test(await page.locator('[data-testid="encyclopedia"]').innerText()));
  await page.fill('input[name="cortex_q"]', "shotclock fourteen");
  await rows.first().waitFor({ timeout: 8000 }).catch(() => {});
  await shot("cortex-search");
  await Promise.all([page.waitForURL((u) => u.pathname === "/cortex/fix-shot-clock"), rows.first().locator("a").click()]);
  await settle(page);

  // --- record page ---
  const rec = page.locator('[data-testid="concept"]');
  const c = await apiGet("/cortex/concepts/fix-shot-clock");
  check(`[${label}] record: opens on its own route with title, chips and summary`, (await page.locator("h1").innerText()).toUpperCase().includes("FIXTURE SHOT CLOCK RESET") && (await rec.locator('[data-testid="kind-chip"]').getAttribute("data-kind")) === "rule" && (await rec.locator('[data-testid="verification-chip"]').getAttribute("data-verification")) === "checked_against_source" && (await rec.locator('[data-testid="concept-summary"]').innerText()).trim() === c.summary);
  check(`[${label}] record: body as two paragraphs`, (await rec.locator('[data-testid="concept-body"] p').count()) === 2);
  check(`[${label}] record: formula in a monospace block, text unchanged`, (await rec.locator('[data-testid="formula"]').innerText()).trim() === c.formula && /mono/.test(await rec.locator('[data-testid="formula"]').evaluate((e) => getComputedStyle(e).fontFamily)));
  check(`[${label}] record: season note, limitations and when-not-to-use`, (await rec.locator('[data-testid="season-note"]').innerText()).includes(c.season_note) && (await rec.locator('[data-testid="concept-limitations"] li').count()) === c.limitations.length && (await rec.locator('[data-testid="concept-when-not"]').innerText()).includes(c.when_not_to_use));
  const colTops = await page.evaluate(() => ["concept-observable", "concept-gaps"].map((t) => Math.round(document.querySelector(`[data-testid="${t}"]`).getBoundingClientRect().top)));
  check(`[${label}] record: "What our data can show" and "What we cannot see" ${isMobile ? "stacked" : "side by side"}`, (await rec.locator('[data-testid="concept-observable"] li').count()) === c.observable_in_our_data.length && (await rec.locator('[data-testid="concept-gaps"] li').count()) === c.data_gaps.length && /What our data can show/i.test(await rec.locator('[data-testid="concept-observable"]').innerText()) && /What we cannot see/i.test(await rec.locator('[data-testid="concept-gaps"]').innerText()) && (isMobile ? colTops[1] > colTops[0] : colTops[0] === colTops[1]), colTops.join("/"));
  check(`[${label}] record: evaluation questions, related records as links, sources with link and note`, (await rec.locator('[data-testid="concept-questions"] li').count()) === 1 && (await rec.locator('[data-testid="concept-related"] a[href^="/cortex/"]').count()) === 2 && (await rec.locator('[data-testid="concept-source"]').count()) === 2 && (await rec.locator('[data-testid="concept-source"] a[target="_blank"][rel~="noopener"]').count()) === 2 && /FIXTURE note/.test(await rec.locator('[data-testid="concept-source"]').first().innerText()));
  await shot("cortex-record", { fullPage: true });
  await page.click('[data-testid="ask-jarvis-concept"]');
  await page.locator('[data-testid="jarvis-panel"] textarea').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] record: "Ask JARVIS about this" opens the panel with the question prefilled, not sent`, (await page.locator('[data-testid="jarvis-panel"] textarea').inputValue()) === "Explain FIXTURE Shot clock reset and how it applies to tonight's slate" && (await page.locator('[data-testid="jarvis-panel"] [data-testid="jarvis-owner"]').count()) === 0);
  await page.keyboard.press("Escape");
  await rec.locator('[data-testid="concept-related"] a').first().click();
  await page.waitForURL((u) => u.pathname === "/cortex/fix-d1-1");
  await settle(page);
  check(`[${label}] record: a related link opens that record; offense/defense fields appear only when present`, (await page.locator('[data-testid="concept"]').getAttribute("data-slug")) === "fix-d1-1" && (await page.locator('[data-testid="concept-responsibilities"]').count()) === 1 && (await page.locator('[data-testid="concept-responses"]').count()) === 1);
  await go("/cortex/fix-d1-3");
  check(`[${label}] record: an unchecked record says so and shows no source`, (await page.locator('[data-testid="concept"] [data-testid="verification-chip"]').getAttribute("data-verification")) === "authored_not_checked" && (await page.locator('[data-testid="concept-no-sources"]').count()) === 1 && (await page.locator('[data-testid="concept-unchecked-note"]').count()) === 1 && (await page.locator('[data-testid="concept-responsibilities"]').count()) === 0);
  await go("/cortex/fix-d1-5");
  check(`[${label}] record: an empty "can show" list is stated, not hidden`, /shows nothing for this topic/.test(await page.locator('[data-testid="concept-observable"]').innerText()));
  errors.length = 0;
  await go("/cortex/no-such-record");
  check(`[${label}] record: an unknown slug shows the server's not-found message`, /FIXTURE: knowledge record not found\./.test(await page.locator('[data-testid="concept-missing"]').innerText().catch(() => "")));
  errors.length = 0; // the 404 above is expected

  // --- playbook and statistics ---
  await go("/cortex?tab=playbook");
  const kinds = (sel) => page.locator(`[data-testid="${sel}"] [data-testid="kind-chip"]`).evaluateAll((a) => a.map((e) => e.dataset.kind));
  const off = await kinds("playbook-offense"), def = await kinds("playbook-defense");
  check(`[${label}] playbook: Offense and Defense lists hold only their kind, with API totals`, off.length === 12 && off.every((k) => k === "offense") && def.length === 12 && def.every((k) => k === "defense") && (await page.locator('[data-testid="playbook-offense"] [data-testid="kind-total"]').innerText()).startsWith(String(o.by_kind.offense)) && (await page.locator('[data-testid="playbook-defense"] [data-testid="kind-total"]').innerText()).startsWith(String(o.by_kind.defense)));
  const pb = await page.evaluate(() => ["playbook-offense", "playbook-defense"].map((t) => Math.round(document.querySelector(`[data-testid="${t}"]`).getBoundingClientRect().left)));
  check(`[${label}] playbook: ${isMobile ? "one column on a phone" : "two columns"}`, isMobile ? pb[0] === pb[1] : pb[1] > pb[0] + 200, pb.join("/"));
  await go("/cortex?tab=statistics");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="statistics"] [data-testid="formula"], [data-testid="statistics"] [data-testid="no-formula"]').length === 20, null, { timeout: 10000 }).catch(() => {});
  const st = await kinds("statistics-statistic"), me = await kinds("statistics-method");
  check(`[${label}] statistics: statistic and method records only`, st.length === 10 && st.every((k) => k === "statistic") && me.length === 10 && me.every((k) => k === "method"));
  check(`[${label}] statistics: each row shows its recorded formula, or says none is recorded`, (await page.locator('[data-testid="statistics"] [data-testid="formula"]').count()) >= 15 && (await page.locator('[data-testid="statistics"] [data-testid="formula"]').count()) + (await page.locator('[data-testid="statistics"] [data-testid="no-formula"]').count()) === 20 && /^FIXTURE_STATISTIC_\d+ = PTS/.test((await page.locator('[data-testid="statistics-statistic"] [data-testid="formula"]').first().innerText()).trim()));
  await shot("cortex-statistics");

  // --- player DNA ---
  await go("/cortex?tab=player-dna");
  const pl = await apiGet("/cortex/players?limit=60");
  check(`[${label}] player DNA: list from the API, most minutes first, with headshot fallback, team, games and minutes`, (await page.locator('[data-testid="cortex-player"]').count()) === pl.items.length && (await page.locator('[data-testid="cortex-player"]').first().getAttribute("data-player-id")) === String(pl.items[0].player_id) && new RegExp(`${pl.items[0].games} g`).test(await page.locator('[data-testid="cortex-player"]').first().innerText()) && new RegExp(`${pl.items[0].minutes} min`).test(await page.locator('[data-testid="cortex-player"]').first().innerText()));
  await page.fill('input[name="cortex_player_q"]', "Player A");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="cortex-player"]').length === 1, null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] player DNA: search narrows the list`, (await page.locator('[data-testid="cortex-player"]').count()) === 1);
  await page.locator('[data-testid="cortex-player"]').first().click();
  await page.locator('[data-testid="player-dna"]').waitFor({ timeout: 8000 }).catch(() => {});
  const dna = page.locator('[data-testid="player-dna"]');
  check(`[${label}] player DNA: profile is linkable (?player=) with identity, what is not held, and team history`, new URL(page.url()).searchParams.get("player") === "9001" && /FIXTURE PLAYER A/i.test(await dna.innerText()) && /Not held for this player: height, weight, age/.test(await dna.locator('[data-testid="identity-not-held"]').innerText()) && (await dna.locator('[data-testid="team-history"] li').count()) === 2);
  const sl = (await dna.locator('[data-testid="season-line"]').innerText()).replace(/\s+/g, " ");
  check(`[${label}] player DNA: season line labels per-36 values as "per 36" and a missing value is the marker`, (sl.match(/PER 36/gi) ?? []).length === 9 && /BLK PER 36 —/i.test(sl) && /USAGE % 27\.4/i.test(sl), sl.slice(0, 200));
  check(`[${label}] player DNA: recent 10 block`, (await dna.locator('[data-testid="recent-10"] dt').count()) === 6);
  const rules = await dna.locator('[data-testid="archetype"]').evaluateAll((a) => a.map((e) => [e.querySelector("span")?.innerText.trim(), e.querySelector('[data-testid="archetype-rule"]')?.innerText.trim()]));
  check(`[${label}] player DNA: each archetype chip has its rule visible underneath`, rules.length === 2 && rules[0][1] === "usage ≥ 26% and assists per 36 ≥ 5.5" && rules[1][1] === "start share ≥ 80% and minutes per game ≥ 32" && /not scouting verdicts/.test(await dna.innerText()), JSON.stringify(rules));
  check(`[${label}] player DNA: teammate table with a small-sample marker and a missing value shown as the marker`, (await dna.locator('[data-testid="teammate-row"]').count()) === 2 && (await dna.locator('[data-testid="teammate-row"][data-small="1"] [data-testid="small-sample"]').count()) === 1 && (await dna.locator('[data-testid="teammate-row"][data-small="0"] [data-testid="small-sample"]').count()) === 0 && (await dna.locator('[data-testid="teammate-row"][data-small="1"] [aria-label="not available"]').count()) === 1);
  const tac = (await dna.locator('[data-testid="tactical-profile"]').innerText()).replace(/\s+/g, " ");
  check(`[${label}] player DNA: tactical profile panel says "Not available" with the server's reason`, /NOT AVAILABLE/i.test(tac) && tac.includes("FIXTURE: no play-type, shot-location or tracking data is held"), tac);
  check(`[${label}] player DNA: not-available list, notes and a link to the full player page`, (await dna.locator('[data-testid="dna-not-available"] li').count()) === 2 && (await dna.locator('[data-testid="dna-notes"] li').count()) === 2 && (await dna.locator('[data-testid="player-full-page"]').getAttribute("href")).startsWith("/players/9001"));
  await shot("cortex-player", { fullPage: true });
  const od = await overflow(page);
  check(`[${label}] player DNA: no horizontal page overflow`, !od, od ? JSON.stringify(od) : "");
  await go("/cortex?tab=player-dna&player=9002");
  check(`[${label}] player DNA: when archetypes are not derived the status text is shown instead of chips`, (await page.locator('[data-testid="archetype"]').count()) === 0 && /usage was not published/.test(await page.locator('[data-testid="archetypes-not-derived"]').innerText()) && /Not available for this player/.test(await page.locator('[data-testid="teammates-none"]').innerText()));
  await go("/cortex?tab=player-dna&player=9004");
  check(`[${label}] player DNA: an unavailable profile shows the server's note and no numbers`, (await page.locator('[data-testid="player-dna"]').getAttribute("data-available")) === "0" && /FIXTURE: no box scores are held/.test(await page.locator('[data-testid="player-dna-unavailable"]').innerText()) && (await page.locator('[data-testid="season-line"]').count()) === 0);
  await page.click('[data-testid="profile-back"]');
  await page.locator('[data-testid="cortex-player"]').first().waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] player DNA: back returns to the list`, new URL(page.url()).searchParams.get("player") === null && (await page.locator('[data-testid="cortex-player"]').count()) === pl.items.length);
  await go("/players/9001");
  check(`[${label}] player page: "Profile (CORTEX)" link`, (await page.locator('[data-testid="cortex-profile-link"]').getAttribute("href")).startsWith("/cortex?tab=player-dna&player=9001"));

  // --- team DNA ---
  await go("/cortex?tab=team-dna");
  check(`[${label}] team DNA: grid of 30 teams with the profile state`, (await page.locator('[data-testid="cortex-team"]').count()) === 30 && (await page.locator('[data-testid="cortex-team"][data-available="0"]').count()) === 1 && /No profile yet/.test(await page.locator('[data-testid="cortex-team"][data-available="0"]').innerText()) && /29 of 30 teams have a profile/.test(await page.locator('[data-testid="team-grid-count"]').innerText()));
  await page.locator('[data-testid="cortex-team"][data-team-id="1"]').click();
  await page.locator('[data-testid="team-dna"]').waitFor({ timeout: 8000 }).catch(() => {});
  const td = page.locator('[data-testid="team-dna"]');
  check(`[${label}] team DNA: record, ratings and shot volume (a missing value is the marker)`, /11–6/.test(await td.locator('[data-testid="team-record"]').innerText()) && /113\.1/.test(await td.locator('[data-testid="team-ratings"]').innerText()) && /\+3\.0/.test(await td.locator('[data-testid="team-ratings"]').innerText()) && (await td.locator('[data-testid="team-shot-volume"] [aria-label="not available"]').count()) === 1);
  const rot = (await td.locator('[data-testid="rotation-block"]').innerText()).replace(/\s+/g, " ");
  check(`[${label}] team DNA: rotation block (length and range, starter minutes, bench points, starting fives, leaders, first substitution)`, /8\.9/.test(rot) && /8–10/.test(rot) && /30\.8/.test(rot) && /40\.2/.test(rot) && (await td.locator('[data-testid="starting-fives"] li').count()) === 2 && (await td.locator('[data-testid="minutes-leaders"] li').count()) === 3 && /5\.4 minutes into the game, over 6 games observed live/.test(rot), rot.slice(0, 160));
  check(`[${label}] team DNA: tactical identity "Not available" with its reason, not-available list and notes`, /NOT AVAILABLE/i.test(await td.locator('[data-testid="tactical-identity"]').innerText()) && /no system is attributed/.test(await td.locator('[data-testid="tactical-identity"]').innerText()) && (await td.locator('[data-testid="dna-not-available"] li').count()) === 2 && (await td.locator('[data-testid="dna-notes"] li').count()) === 2);
  await shot("cortex-team", { fullPage: true });
  const ot = await overflow(page);
  check(`[${label}] team DNA: no horizontal page overflow`, !ot, ot ? JSON.stringify(ot) : "");
  await go("/cortex?tab=team-dna&team=2");
  check(`[${label}] team DNA: ratings that are null read "Not available", never zero`, (await page.locator('[data-testid="team-ratings"]').count()) === 0 && /Not available/i.test(await page.locator('[data-testid="team-ratings-unavailable"]').innerText()) && /no live play-by-play held/i.test(await page.locator('[data-testid="first-substitution"]').innerText()));
  await go("/cortex?tab=team-dna&team=3");
  check(`[${label}] team DNA: a team without a profile shows the server's note`, (await page.locator('[data-testid="team-dna"]').getAttribute("data-available")) === "0" && /fewer than three final games/.test(await page.locator('[data-testid="team-dna-unavailable"]').innerText()));

  // --- coach DNA ---
  await go("/cortex?tab=coach-dna");
  check(`[${label}] coach DNA: the same 30-team grid, stating that coaches are not identified`, (await page.locator('[data-testid="coach-dna-grid"] [data-testid="cortex-team"]').count()) === 30 && /Coach identities are not in our data/.test(await page.locator('[data-testid="coach-dna-grid"]').innerText()));
  await page.locator('[data-testid="cortex-team"][data-team-id="1"]').click();
  await page.locator('[data-testid="coach-dna"]').waitFor({ timeout: 8000 }).catch(() => {});
  const cd = page.locator('[data-testid="coach-dna"]');
  check(`[${label}] coach DNA: only the rotation block, headed "Rotation tendencies (coach not identified)", with the coach note prominent`, /ROTATION TENDENCIES \(COACH NOT IDENTIFIED\)/i.test(await cd.innerText()) && (await cd.locator('[data-testid="coach-note"]').innerText()).includes("FIXTURE: coach names and staff are not in our data.") && (await cd.locator('[data-testid="rotation-block"]').count()) === 1 && (await cd.locator('[data-testid="team-record"]').count()) === 0 && (await cd.locator('[data-testid="team-ratings"]').count()) === 0 && (await cd.locator('[data-testid="tactical-identity"]').count()) === 0);
  await shot("cortex-coach");
  await go("/cortex?tab=coach-dna&team=3");
  check(`[${label}] coach DNA: a team without a profile says rotation data is not available`, /Not available/i.test(await page.locator('[data-testid="coach-rotation-unavailable"]').innerText()));

  // --- research journal ---
  await go("/cortex?tab=research");
  check(`[${label}] research: the endpoint note and all five findings`, /A finding marked open is a hypothesis, not knowledge/.test(await page.locator('[data-testid="research-note"]').innerText()) && (await page.locator('[data-testid="finding"]').count()) === 5);
  const f1 = (await page.locator('[data-testid="finding"]').first().innerText()).replace(/\s+/g, " ");
  check(`[${label}] research: a finding shows hypothesis, supporting vs contradicting, sample size, experiment, result and limitations`, /bench minutes rise/.test(f1) && /SUPPORTING \(1\)/i.test(f1) && /CONTRADICTING \(1\)/i.test(f1) && /Sample size: 20/.test(f1) && /PROPOSED EXPERIMENT/i.test(f1) && /No result yet/.test(f1) && /one month of games/.test(f1) && /OPEN HYPOTHESIS/i.test(f1), f1.slice(0, 200));
  for (const [st2, n] of [["open", 2], ["supported", 1], ["rejected", 1], ["inconclusive", 1]]) {
    await page.locator(`[role="tablist"][aria-label="Finding status"] [data-tab="${st2}"]`).click();
    await page.waitForFunction(([s2, k]) => { const a = [...document.querySelectorAll('[data-testid="finding"]')]; return a.length === k && a.every((e) => e.dataset.status === s2); }, [st2, n], { timeout: 8000 }).catch(() => {});
    check(`[${label}] research: status filter "${st2}"`, (await page.locator('[data-testid="finding"]').count()) === n && (await page.locator('[data-testid="finding"]').evaluateAll((a, s2) => a.every((e) => e.dataset.status === s2), st2)) && new URL(page.url()).searchParams.get("status") === st2);
  }

  // --- sources ---
  await go("/cortex?tab=sources");
  const src = await apiGet("/cortex/sources");
  const srcRow = isMobile ? '[data-testid="source-card"]' : '[data-testid="sources"] table tbody tr';
  check(`[${label}] sources: one ${isMobile ? "card" : "table row"} per source with the API count`, (await page.locator(srcRow).count()) === src.items.length && (await page.locator('[data-testid="sources-count"]').getAttribute("data-total")) === String(src.items.length));
  const acc = await page.locator(`${srcRow} [data-testid="access-result"]`).evaluateAll((a) => a.map((e) => [e.dataset.opened, e.innerText.replace(/\s+/g, " ").trim(), e.querySelector("span")?.className ?? ""]));
  check(`[${label}] sources: "not opened" and "not reachable" look different from "opened and read"`, acc.filter((x) => x[0] === "1").length === 3 && acc.filter((x) => x[0] === "0").length === 2 && acc.filter((x) => x[0] === "0").every((x) => /text-warn/.test(x[2]) && /Not opened|Not reachable/i.test(x[1])) && acc.filter((x) => x[0] === "1").every((x) => !/text-warn/.test(x[2]) && /Opened and read/i.test(x[1])), JSON.stringify(acc.map((x) => x.slice(0, 2))));
  const srcText = (await page.locator('[data-testid="sources"]').innerText()).replace(/\s+/g, " ");
  check(`[${label}] sources: publisher, league, kind, reliability, permission note, accessed date and records citing`, /FIXTURE League/.test(srcText) && /FIBA/.test(srcText) && /official rules/.test(srcText) && /independent; not official/.test(srcText) && /no licence visible/.test(srcText) && /[A-Z][a-z]{2} \d{1,2}, 2026/.test(srcText) && srcText.includes(String(src.items[0].records_citing)));
  check(`[${label}] sources: titles link out safely; a source without a URL is plain text`, (await page.locator(`${srcRow} [data-testid="source-link"][target="_blank"][rel~="noopener"]`).count()) === 4);
  await shot("cortex-sources", { fullPage: true });
  const os = await overflow(page);
  check(`[${label}] sources: no horizontal page overflow`, !os, os ? JSON.stringify(os) : "");

  // --- coverage ---
  await go("/cortex?tab=coverage");
  check(`[${label}] coverage: twenty department rows with API counts and a bar each`, (await page.locator('[data-testid="coverage-row"]').count()) === 20 && (await page.locator('[data-testid="coverage-row"]').evaluateAll((a, deps) => a.every((e, i) => Number(e.dataset.records) === deps[i].records && e.querySelector('[role="img"]')), o.departments)) && /0 of 20 departments have no records/.test(await page.locator('[data-testid="coverage-empty"]').innerText()));
  check(`[${label}] coverage: by-kind breakdown, verification split and "Not built"`, (await page.locator('[data-testid="coverage-kinds"] li').count()) === 10 && (await num("count-checked")) === o.records_checked_against_a_source && (await page.locator('[data-testid="not-built"] li').count()) === o.not_built.length);
  check(`[${label}] coverage: says plainly that no library-wide "observable" summary is published`, /does not publish a library-wide summary/.test(await page.locator('[data-testid="coverage"]').innerText()));

  // --- evaluations (owner) ---
  await go("/cortex?tab=evaluations");
  const ev = page.locator('[data-testid="evaluations"]');
  const b = await apiGet("/cortex/benchmark");
  check(`[${label}] evaluations: benchmark size against the target of 500`, (await num("benchmark-questions")) === b.questions && /target 500 questions/.test(await ev.innerText()));
  check(`[${label}] evaluations: "reviewed by a person: N of M" with the note verbatim and prominent`, /0 of 204/i.test(await ev.locator('[data-testid="reviewed"]').innerText()) && (await ev.locator('[data-testid="benchmark-note-text"]').innerText()).trim() === b.note && (await page.evaluate(() => document.querySelector('[data-testid="benchmark-note"]').getBoundingClientRect().top < document.querySelector('[data-testid="benchmark-questions"]').getBoundingClientRect().top)));
  check(`[${label}] evaluations: by category / type / split tables`, (await ev.locator('[data-testid="benchmark-by-category"] dt').count()) === Object.keys(b.by_category).length && (await ev.locator('[data-testid="benchmark-by-type"] dt').count()) === 4 && (await ev.locator('[data-testid="benchmark-by-split"] dt').count()) === 2);
  const run = (await ev.locator('[data-testid="benchmark-run"]').first().innerText()).replace(/\s+/g, " ");
  check(`[${label}] evaluations: runs with kind, split, model, n, score as a percentage, cost and date`, (await ev.locator('[data-testid="benchmark-run"]').count()) === 2 && /Answers/.test(run) && /Dev/.test(run) && /FIXTURE-model-a/.test(run) && /\b20\b/.test(run) && /85\.0%/.test(run) && /\$0\.0412/.test(run) && /ET/.test(run) && /provisional/.test(await ev.innerText()), run);
  await ev.locator('[data-testid="run-misses"] summary').first().click();
  check(`[${label}] evaluations: misses expand`, (await ev.locator('[data-testid="run-misses"][open] li').count()) === 3 && /FIXTURE RULE-007/.test(await ev.locator('[data-testid="run-misses"][open]').innerText()));
  check(`[${label}] evaluations: recent searches, sample questions and how-to-run in a code block`, (await ev.locator('[data-testid="retrieval"]').count()) === 2 && /returned nothing/.test(await ev.locator('[data-testid="retrievals"]').innerText()) && (await ev.locator('[data-testid="sample-questions"] > li').count()) === 2 && (await ev.locator('[data-testid="how-to-run"]').innerText()).trim() === b.how_to_run && /mono/.test(await ev.locator('[data-testid="how-to-run"]').evaluate((e) => getComputedStyle(e).fontFamily)));
  await shot("cortex-evaluations", { fullPage: true });

  // --- tab switching keeps the URL; a phone scrolls the tab row, not the page ---
  await go("/cortex");
  for (const t of ["encyclopedia", "playbook", "player-dna", "team-dna", "coach-dna", "statistics", "research", "sources", "coverage", "evaluations", "overview"]) {
    await page.locator(`[role="tablist"][aria-label="CORTEX sections"] [data-tab="${t}"]`).click();
    await page.waitForFunction((x) => document.querySelector('[data-testid="cortex-panel"]')?.getAttribute("data-tab") === x, t, { timeout: 5000 }).catch(() => {});
    await settle(page);
    const ok = new URL(page.url()).searchParams.get("tab") === t && (await page.locator('[data-testid="cortex-panel"]').getAttribute("data-tab")) === t && (await page.locator('[data-state="error"]').count()) === 0 && (await page.locator('[data-testid="cortex-panel"]').innerText()).trim().length > 80;
    check(`[${label}] cortex: tab "${t}" renders and is in the URL`, ok);
  }
  if (isMobile) {
    const tabs = await page.evaluate(() => { const e = document.querySelector('[role="tablist"][aria-label="CORTEX sections"]'); return { scrolls: e.scrollWidth > e.clientWidth + 20, ox: getComputedStyle(e).overflowX }; });
    check(`[${label}] cortex: the tab row scrolls horizontally inside itself`, tabs.scrolls && /auto|scroll/.test(tabs.ox), JSON.stringify(tabs));
    await go("/cortex?tab=evaluations");
    check(`[${label}] cortex: the selected tab is scrolled into view`, await page.evaluate(() => { const e = document.querySelector('[role="tablist"][aria-label="CORTEX sections"] [aria-selected="true"]').getBoundingClientRect(); return e.left >= 0 && e.right <= window.innerWidth; }));
  }
  check(`[${label}] cortex flows raised no page/console errors`, errors.length === 0, errors.slice(0, 4).join(" | "));
  errors.length = 0;
}

async function runViewport(browser, label, viewport) {
  console.log(`\n== ${label} ${viewport.width}x${viewport.height} ==`);
  const isMobile = label === "mobile";
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile, hasTouch: isMobile });
  const page = await context.newPage();
  const errors = watch(page);
  const shot = (name, opts = {}) => page.screenshot({ path: join(SHOTS, `flow-${label}-${name}.png`), fullPage: false, ...opts });

  // --- auth gate ---
  await page.goto(`${BASE}/games`);
  check(`[${label}] signed-out visit redirects to /login`, new URL(page.url()).pathname === "/login", page.url());
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', "wrong-password");
  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="alert"]');
  check(`[${label}] wrong password shows an error and stays on /login`, new URL(page.url()).pathname === "/login");
  await shot("login");
  await login(page);
  check(`[${label}] login succeeds`, !new URL(page.url()).pathname.startsWith("/login"), page.url());

  // --- every route ---
  for (const route of [...NAV, ...OTHER]) {
    await visit(page, route, label, errors);
    const o = await overflow(page);
    check(`[${label}] ${route} has no horizontal overflow`, !o, o ? JSON.stringify(o) : "");
  }

  // --- navigation: nothing lost, everything reachable by click ---
  await visit(page, "/", label, errors);
  const hrefs = DESTINATIONS.map((d) => d.href);
  if (label === "desktop") {
    check(`[nav] the destination list has no duplicates and at most five primary workspaces`, new Set(hrefs).size === hrefs.length && NAVDATA.workspaces.filter((w) => w.primary).length === 5, `${hrefs.length} destinations`);
    check(`[nav] the list on main could be read from git`, Array.isArray(LEGACY) && LEGACY.length === 36, LEGACY ? `${LEGACY.length} destinations on main` : "git show main:apps/web/lib/nav.ts failed");
    if (LEGACY) {
      const missing = LEGACY.filter((o) => !hrefs.includes(o.href));
      check(`[nav] every destination on main (27 sidebar links + 9 hidden pages) is still a destination`, missing.length === 0 && hrefs.length >= LEGACY.length, `before ${LEGACY.length}, after ${hrefs.length}; missing: ${missing.map((m) => m.href).join(", ") || "none"}`);
      const renamed = LEGACY.filter((o) => DESTINATIONS.find((d) => d.href === o.href)?.label !== o.label);
      check(`[nav] every destination keeps the label it had on main`, renamed.length === 0, renamed.map((r) => `${r.href} "${r.label}"`).join(", "));
    }
  }
  const pathOf = () => new URL(page.url()).pathname;
  if (isMobile) {
    const nav = (await page.locator('[data-testid="bottom-nav"]').innerText()).replace(/\s+/g, " ").trim();
    check(`[${label}] bottom nav is Today | Games | Players | Research | More (five items)`, nav === "Today Games Players Research More" && (await page.locator('[data-testid="bottom-nav"] a, [data-testid="bottom-nav"] button').count()) === 5, nav);
    const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid="bottom-nav"] a, [data-testid="bottom-nav"] button')].filter((e) => e.getBoundingClientRect().height < 44).length);
    check(`[${label}] bottom nav targets are at least 44px`, small === 0, `${small} too small`);
    await page.click('[data-testid="more-button"]');
    await page.waitForSelector('[role="dialog"]');
    const listed = await page.locator('[role="dialog"] a[data-nav-href]').evaluateAll((a) => a.map((e) => e.getAttribute("data-nav-href")));
    check(`[${label}] More sheet lists every destination, grouped by workspace`, hrefs.every((h) => listed.includes(h)) && listed.length === hrefs.length && (await page.locator('[role="dialog"] [data-workspace]').count()) === NAVDATA.workspaces.length && /CORTEX/.test(await page.locator('[role="dialog"]').innerText()) && /Live Games/.test(await page.locator('[role="dialog"]').innerText()) && /JARVIS/.test(await page.locator('[role="dialog"]').innerText()) && /Kalshi Markets/.test(await page.locator('[role="dialog"]').innerText()) && /Minutes Intelligence/.test(await page.locator('[role="dialog"]').innerText()), `${listed.length} of ${hrefs.length}`);
    const smallRows = await page.locator('[role="dialog"] a[data-nav-href]').evaluateAll((a) => a.filter((e) => e.getBoundingClientRect().height < 44).length);
    check(`[${label}] More sheet rows are at least 44px tall`, smallRows === 0, `${smallRows} too small`);
    const inside = await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    check(`[${label}] More sheet takes focus and keeps it`, inside === true && (await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement))) === true);
    await shot("more-sheet");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]') && document.activeElement?.getAttribute("data-testid") === "more-button", null, { timeout: 3000 }).catch(() => {});
    check(`[${label}] More sheet: Escape closes it and focus returns to More`, (await page.locator('[role="dialog"]').count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "more-button");
    // every destination, by tapping it in the More sheet
    let reached = 0;
    const failed = [];
    for (const d of DESTINATIONS) {
      await page.click('[data-testid="more-button"]');
      await page.locator(`[data-testid="all-pages"] a[data-nav-href="${d.href}"]`).click();
      const ok = await page.waitForFunction((h) => location.pathname === h, d.href, { timeout: 10000 }).then(() => true).catch(() => false);
      await page.locator("main h1").first().waitFor({ state: "attached", timeout: 10000 }).catch(() => {});
      if (ok && (await page.locator('[data-testid="all-pages"]').count()) === 0 && (await page.locator("main h1").count()) > 0) reached++;
      else failed.push(d.href);
    }
    check(`[${label}] all ${DESTINATIONS.length} destinations are reachable by tapping them in the More sheet`, reached === DESTINATIONS.length, `reached ${reached}; failed: ${failed.join(", ")}`);
    await page.goto(`${BASE}/kalshi-intelligence`);
    await settle(page);
    check(`[${label}] a page outside the four tabs marks More as current and still shows its workspace row`, (await page.locator('[data-testid="more-button"]').evaluate((e) => /font-bold/.test(e.className))) && (await page.locator('[data-testid="subnav"][data-workspace="markets"] a[aria-current="page"]').innerText()).trim() === "Kalshi Markets");
  } else {
    const primary = await page.locator('[data-testid="primary-nav"] a').allInnerTexts();
    check(`[${label}] top bar has the five workspaces, Today first`, primary.map((t) => t.trim()).join("|") === "Today|Games|Players|Markets|Research", primary.join("|"));
    check(`[${label}] top bar has the wordmark, search, All pages, Ask JARVIS and the account control`, (await page.locator('[data-testid="topbar"] a[href="/"] [aria-label^="GIZER NBA"]').count()) === 1 && (await page.locator('[data-testid="search-trigger"]:visible').count()) === 1 && (await page.locator('[data-testid="all-pages-button"]:visible').count()) === 1 && (await page.locator('[data-testid="jarvis-launcher"]:visible').count()) === 1 && (await page.locator('[data-testid="account-button"]:visible').count()) === 1);
    // every destination of a primary workspace: click the workspace, then the page in its row
    let reached = 0;
    const failed = [];
    for (const w of NAVDATA.workspaces.filter((x) => x.primary)) {
      await page.locator(`[data-testid="primary-nav"] a[data-workspace="${w.id}"]`).click();
      await page.waitForFunction((h) => location.pathname === h, w.href, { timeout: 10000 }).catch(() => {});
      const row = await page.locator('[data-testid="subnav"] a[data-nav-href]').evaluateAll((a) => a.map((e) => e.getAttribute("data-nav-href")));
      if (!w.pages.every((p) => row.includes(p.href)) || row.length !== w.pages.length) failed.push(`${w.id} row lists ${row.length} of ${w.pages.length}`);
      for (const p of w.pages) {
        const link = page.locator(`[data-testid="subnav"] a[data-nav-href="${p.href}"]`);
        const visible = await link.evaluate((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= window.innerWidth; }).catch(() => false);
        await link.click();
        const ok = await page.waitForFunction((h) => location.pathname === h, p.href, { timeout: 10000 }).then(() => true).catch(() => false);
        await page.locator("main h1").first().waitFor({ state: "attached", timeout: 10000 }).catch(() => {});
        const current = await page.locator('[data-testid="subnav"] a[aria-current="page"]').getAttribute("data-nav-href").catch(() => null);
        const ws = await page.locator('[data-testid="primary-nav"] a[aria-current="true"]').getAttribute("data-workspace").catch(() => null);
        if (ok && visible && current === p.href && ws === w.id && (await page.locator("main h1").count()) > 0) reached++;
        else failed.push(`${p.href}${visible ? "" : " (link not in view)"}`);
      }
    }
    const nPrimary = DESTINATIONS.filter((d) => d.primary).length;
    check(`[${label}] every page of the five workspaces (${nPrimary}) is reachable by click from the top bar and the workspace row, and is marked current there`, reached === nPrimary, `reached ${reached}; failed: ${failed.join(", ")}`);
    // All pages menu: every destination, including the Intelligence & System group
    await page.click('[data-testid="all-pages-button"]');
    await page.waitForSelector('[data-testid="all-pages"]');
    const listed = await page.locator('[data-testid="all-pages"] a[data-nav-href]').evaluateAll((a) => a.map((e) => e.getAttribute("data-nav-href")));
    check(`[${label}] All pages menu lists every destination, grouped by workspace`, hrefs.every((h) => listed.includes(h)) && listed.length === hrefs.length && (await page.locator('[data-testid="all-pages"] [data-workspace]').count()) === NAVDATA.workspaces.length, `${listed.length} of ${hrefs.length}`);
    await shot("all-pages");
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="all-pages-button"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="all-pages"]');
    const inside = await page.evaluate(() => document.querySelector('[data-testid="all-pages"]')?.contains(document.activeElement));
    await page.locator('[data-testid="all-pages"] a[data-nav-href="/admin/ai-budget"]').focus();
    await page.keyboard.press("Enter");
    const kb = await page.waitForFunction(() => location.pathname === "/admin/ai-budget", null, { timeout: 10000 }).then(() => true).catch(() => false);
    check(`[${label}] All pages menu opens from the keyboard, holds focus, and Enter on a link navigates`, inside === true && kb && (await page.locator('[data-testid="all-pages"]').count()) === 0);
    reached = 0;
    failed.length = 0;
    for (const d of DESTINATIONS) {
      await page.click('[data-testid="all-pages-button"]');
      await page.locator(`[data-testid="all-pages"] a[data-nav-href="${d.href}"]`).click();
      const ok = await page.waitForFunction((h) => location.pathname === h, d.href, { timeout: 10000 }).then(() => true).catch(() => false);
      await page.locator("main h1").first().waitFor({ state: "attached", timeout: 10000 }).catch(() => {});
      if (ok && (await page.locator('[data-testid="all-pages"]').count()) === 0 && (await page.locator("main h1").count()) > 0) reached++;
      else failed.push(d.href);
    }
    check(`[${label}] all ${DESTINATIONS.length} destinations are reachable by click from the All pages menu`, reached === DESTINATIONS.length, `reached ${reached}; failed: ${failed.join(", ")}`);
    await page.goto(`${BASE}/data-health`);
    await settle(page);
    check(`[${label}] a System page shows the System row with itself marked current`, (await page.locator('[data-testid="subnav"][data-workspace="system"] a[data-nav-href]').count()) === NAVDATA.workspaces.find((w) => w.id === "system").pages.length && (await page.locator('[data-testid="subnav"] a[aria-current="page"]').innerText()).trim() === "Data Health");
  }

  // --- skip link, titles, breadcrumb, search ---
  await page.goto(`${BASE}/player-props`);
  await settle(page);
  await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); });
  await page.keyboard.press("Tab");
  const skip = await page.evaluate(() => ({ id: document.activeElement?.getAttribute("data-testid"), top: Math.round(document.activeElement?.getBoundingClientRect().top ?? -1), href: document.activeElement?.getAttribute("href") }));
  await page.keyboard.press("Enter");
  check(`[${label}] skip link is the first Tab stop, becomes visible on focus and moves focus to the main content`, skip.id === "skip-link" && skip.top >= 0 && skip.href === "#main" && (await page.evaluate(() => document.activeElement?.id)) === "main", JSON.stringify(skip));
  if (!isMobile) {
    await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); });
    let stops = 0;
    for (; stops < 40; stops++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => Boolean(document.activeElement?.closest("main")))) break;
    }
    check(`[${label}] with the skip link, the main content is two Tab stops away; without it fewer than 30 (was 43)`, stops < 30, `${stops + 1} stops`);
  }
  const titles = {};
  for (const r of [...hrefs, "/games/FIX-G1", "/players/9001", "/kalshi-intelligence/KXFIX-A-PTS25", "/cortex/fix-shot-clock", "/teams/1"]) {
    await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.title !== "GIZER NBA" && document.title !== "", null, { timeout: 10000 }).catch(() => {});
    await page.locator("main h1").first().waitFor({ state: "attached", timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(150);
    titles[r] = await page.title();
  }
  const seen = Object.values(titles);
  const dup = seen.filter((t, i) => seen.indexOf(t) !== i);
  check(`[${label}] every destination and detail page has its own document title ending in GIZER NBA`, dup.length === 0 && seen.every((t) => / · GIZER NBA$/.test(t)), `${new Set(seen).size} distinct of ${seen.length}; duplicates: ${[...new Set(dup)].join(" | ") || "none"}; e.g. ${titles["/picks"]}`);
  check(`[${label}] titles name the page: Top Picks, a game by its teams, a player by name`, /^Top Picks · Research · GIZER NBA$/.test(titles["/picks"]) && /Detroit Pistons at Orlando Magic/.test(titles["/games/FIX-G1"]) && /FIXTURE Player A/.test(titles["/players/9001"]), `${titles["/picks"]} | ${titles["/games/FIX-G1"]} | ${titles["/players/9001"]}`);
  await page.goto(`${BASE}/players/9001`);
  await settle(page);
  const crumb = (await page.locator('[data-testid="breadcrumb"]').innerText().catch(() => "")).replace(/\s+/g, " ");
  check(`[${label}] a detail page has a breadcrumb back to its workspace and list`, /Players \/ Player Explorer \/ FIXTURE Player A/.test(crumb) && (await page.locator('[data-testid="breadcrumb"] a[href^="/players"]').count()) === 2, crumb);
  check(`[${label}] a destination page has no breadcrumb (the workspace row marks it)`, (await page.goto(`${BASE}/picks`)) && (await page.locator('[data-testid="breadcrumb"]').count()) === 0);
  await settle(page);
  // search: a page, then a player, by keyboard
  await page.click('[data-testid="search-trigger"]');
  await page.waitForSelector('[data-testid="search-dialog"]');
  check(`[${label}] search: the dialog opens with focus in the field and lists pages before anything is typed`, (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "search-input" && (await page.locator('[data-testid="search-hit"][data-kind="page"]').count()) >= DESTINATIONS.length);
  await page.fill('[data-testid="search-input"]', "minutes");
  await page.waitForFunction(() => document.querySelector('[data-testid="search-hit"]')?.getAttribute("data-href") === "/minutes", null, { timeout: 5000 }).catch(() => {});
  check(`[${label}] search: finds a page by name`, (await page.locator('[data-testid="search-hit"]').first().getAttribute("data-href")) === "/minutes");
  await page.keyboard.press("Enter");
  check(`[${label}] search: Enter opens it and closes the dialog`, (await page.waitForFunction(() => location.pathname === "/minutes", null, { timeout: 10000 }).then(() => true).catch(() => false)) && (await page.locator('[data-testid="search-dialog"]').count()) === 0);
  await settle(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("/");
  await page.waitForSelector('[data-testid="search-dialog"]', { timeout: 5000 }).catch(() => {});
  check(`[${label}] search: "/" opens it from anywhere outside a field`, (await page.locator('[data-testid="search-dialog"]').count()) === 1);
  const pReq = page.waitForRequest((r) => /\/api\/v1\/players\?/.test(r.url()) && /q=Player(\+|%20)E/.test(r.url()), { timeout: 8000 }).catch(() => null);
  await page.fill('[data-testid="search-input"]', "Player E");
  const sawReq = await pReq;
  await page.locator('[data-testid="search-hit"][data-kind="player"]').first().waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] search: players come from GET /players?q=`, sawReq !== null && (await page.locator('[data-testid="search-hit"][data-kind="player"][data-href="/players/9005"]').count()) === 1);
  await page.locator('[data-testid="search-hit"][data-kind="player"][data-href="/players/9005"]').click();
  check(`[${label}] search: a player result opens the profile`, await page.waitForFunction(() => location.pathname === "/players/9005", null, { timeout: 10000 }).then(() => true).catch(() => false));
  await settle(page);
  await page.click('[data-testid="search-trigger"]');
  await page.fill('[data-testid="search-input"]', "zzqqxx");
  await page.waitForFunction(() => /Nothing matches/.test(document.querySelector('[data-testid="search-empty"]')?.textContent ?? ""), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] search: no match says so and invents nothing`, (await page.locator('[data-testid="search-hit"]').count()) === 0 && /Nothing matches/.test(await page.locator('[data-testid="search-empty"]').innerText().catch(() => "")));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[data-testid="search-dialog"]') && document.activeElement?.getAttribute("data-testid") === "search-trigger", null, { timeout: 3000 }).catch(() => {});
  check(`[${label}] search: Escape closes it and focus returns to the trigger`, (await page.locator('[data-testid="search-dialog"]').count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "search-trigger");
  await visit(page, "/", label, errors);

  // --- Overview ---
  let text = await bodyText(page);
  check(`[${label}] overview: explicit empty high-confidence message`, text.includes("No selection met the high-confidence criteria for this slate. That is a valid research outcome."));
  check(`[${label}] overview: three game cards`, (await page.locator('[data-testid="game-card"]').count()) === 3);
  check(`[${label}] overview: no_picks_reason is shown`, (await page.locator('[data-testid="no-picks-reason"]').first().innerText()).includes("FIXTURE: all 3 evaluated selections were rejected"));
  check(`[${label}] overview: probability with interval`, /58\.2%\s*\[53\.2–63\.2\]/.test(text));
  check(`[${label}] overview: tipoff shown in ET`, /\d{1,2}:\d{2}\s?(AM|PM) ET/.test(text));
  check(`[${label}] overview: unavailable values use the explicit marker`, (await page.locator('[aria-label="not available"]').count()) > 0);
  check(`[${label}] overview: warnings banner`, (await page.locator('[data-testid="warnings"] li').count()) === 2);
  check(`[${label}] overview: nine summary tiles incl. lineups, prop markets and Kalshi`, (await page.locator('[data-testid="stat-strip"] [data-testid="tile"]').count()) === 9 && /7\s*contracts/.test((await page.locator('[data-testid="kalshi-tile"]').innerText()).replace(/\s+/g, " ")) && /Kalshi/.test(await page.locator('[data-testid="overview-props"]').innerText()) && /1\s*confirmed\s*4\s*projected/i.test(text) && /quoted/i.test(text));
  check(`[${label}] overview: per-team lineup status on game cards`, (await page.locator('[data-game-id="FIX-G2"] [data-testid="card-lineups"]').innerText()).replace(/\s+/g, " ").match(/BOS lineup Awaiting NYK lineup Projected/i) !== null);
  check(`[${label}] overview: prop research rows`, (await page.locator('[data-testid="overview-props"] [data-testid="prop-row"]').count()) >= 3);
  check(`[${label}] overview: parlay category strip`, (await page.locator('[data-testid="parlay-strip"] a').count()) === 8);
  await page.evaluate(() => window.scrollTo(0, 0));
  const order = await page.evaluate(() => {
    const y = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return [y('[data-testid="home-hero"]'), y('[data-testid="game-card"]'), y('[data-testid="stat-strip"]'), y('[data-testid="overview-props"]'), y("#high-confidence"), y('[data-testid="ops-status"]')];
  });
  check(`[${label}] overview: basketball first (scoreboard, slate, numbers, props, research), system status last`, order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])) && (await page.evaluate(() => { const o = document.querySelector('[data-testid="ops-status"]').getBoundingClientRect().top; return ["home-picks", "home-briefing", "warnings", "parlay-strip", "summary-compact", "stat-strip"].every((t) => { const e = document.querySelector(`[data-testid="${t}"]`); return e && e.getBoundingClientRect().top < o; }); })), order.join(","));
  const hero = page.locator('[data-testid="home-hero"]');
  check(`[${label}] overview: compact scoreboard hero for one game, with a line to its game page`, (await hero.count()) === 1 && (await hero.locator("tbody tr").count()) === 2 && /\/games\/FIX-G\d/.test((await hero.locator('[data-testid="hero-link"]').getAttribute("href")) ?? "") && (await hero.locator('[data-testid="status-chip"]').count()) === 1);
  const fold = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    const rows = [...document.querySelectorAll('[data-testid="home-pick"]')].map((e) => Math.round(e.getBoundingClientRect().bottom));
    return { h: window.innerHeight, picks: r('[data-testid="home-picks"]'), rows, hero: r('[data-testid="home-hero"]'), text: document.querySelector('[data-testid="home-picks"]')?.innerText ?? "" };
  });
  check(`[${label}] overview: top picks lead with the model estimate, labelled, then contract and price`, fold.rows.length === 3 && /MODEL ESTIMATE/i.test(fold.text) && /58\.2%\s*\[53\.2–63\.2\]\s*FIXTURE ORL \+2\.5[\s\S]*-110/.test(fold.text) && /not an observed hit rate/.test(fold.text), fold.text.replace(/\s+/g, " ").slice(0, 160));
  if (!isMobile) check(`[${label}] overview: every top pick is above the fold at 1440x900, beside the scoreboard, not under it`, viewport.width === 1440 && viewport.height === 900 && fold.rows.every((b) => b <= fold.h) && fold.picks.top < fold.hero.bottom, JSON.stringify(fold).slice(0, 200));
  else check(`[${label}] overview: on a phone the top picks follow the scoreboard directly`, fold.picks.top > fold.hero.top && fold.picks.top < fold.hero.bottom + 120, JSON.stringify(fold).slice(0, 160));
  await page.click('[data-testid="home-ask-jarvis"]');
  await page.locator('[data-testid="jarvis-panel"] textarea').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] overview: the JARVIS entry opens the panel with the slate question written, not sent`, /read on today's slate/.test(await page.locator('[data-testid="jarvis-panel"] textarea').inputValue().catch(() => "")) && (await page.locator('[data-testid="jarvis-panel"] [data-testid="jarvis-owner"]').count()) === 0);
  await page.keyboard.press("Escape");
  await page.locator('[data-testid="jarvis-panel"]').waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  check(`[${label}] date selector lists available dates`, (await page.locator('[data-testid="date-selector"] option').count()) >= 3);
  await page.click('button[aria-label="Previous day"]');
  await page.waitForURL(/date=\d{4}-\d{2}-\d{2}/);
  await settle(page);
  text = await bodyText(page);
  check(`[${label}] previous-day arrow loads the historical slate`, /historical date/.test(text) && text.includes("MIA"));
  check(`[${label}] overview: honest prop message when no quotes exist`, text.includes("FIXTURE: no player prop quotes were stored for this date.") && /Enter a market manually/i.test(text));

  // --- Player props: table/cards, drawer, threshold ---
  await visit(page, "/player-props", label, errors);
  const rowSel = isMobile ? '[data-testid="prop-card"]' : '[data-testid="market-row"]';
  check(`[${label}] props: quote status uses the API message verbatim`, (await page.locator('[data-testid="quote-status"]').innerText()).trim() === "FIXTURE: provider quotes cover DET @ ORL and LAL @ DEN only." && !/No quote provider configured/i.test(await bodyText(page)));
  check(`[${label}] props: seven markets listed`, (await page.locator(`${rowSel}:visible`).count()) === 7);
  const freq = await page.locator(isMobile ? '[data-testid="hist-frequency"]' : '[data-testid="market-row"] [data-testid="hist-frequency"]').allInnerTexts().catch(() => []);
  if (isMobile) await page.locator('[data-prop="9001:player_pts:FIX-G1"] [data-testid="prop-card-toggle"]').click();
  const freqText = (await page.locator('[data-prop="9001:player_pts:FIX-G1"] [data-testid="hist-frequency"]').first().innerText()).replace(/\s+/g, " ");
  check(`[${label}] props: history shown as a count, not a percentage`, /^\d+ of 10 over \(L10\)$/.test(freqText) && !freqText.includes("%") && freq.every((f) => !f.includes("%")), freqText);
  text = await bodyText(page);
  check(`[${label}] props: origin tags`, /Provider/.test(text) && /Owner-entered/.test(text) && (isMobile || /Hypothetical/.test(text)));
  await page.fill('[data-testid="props-search"]', "Player E");
  await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).length === 2, rowSel, { timeout: 8000 }).catch(() => {});
  check(`[${label}] props: text search filters`, (await page.locator(`${rowSel}:visible`).count()) === 2);
  await page.fill('[data-testid="props-search"]', "");
  await page.check('[data-testid="props-quoted"]');
  await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).length === 5, rowSel, { timeout: 8000 }).catch(() => {});
  check(`[${label}] props: quoted-only filter`, (await page.locator(`${rowSel}:visible`).count()) === 5);
  await page.uncheck('[data-testid="props-quoted"]');
  await settle(page);
  if (isMobile) {
    await page.locator('[data-prop="9001:player_pts:FIX-G1"] [data-testid="prop-card-toggle"]').click();
    await page.locator('[data-prop="9001:player_pts:FIX-G1"] [data-testid="prop-open"]').click();
  } else {
    await page.locator('[data-testid="market-row"][data-prop="9001:player_pts:FIX-G1"]').click();
  }
  const drawer = page.locator('[data-testid="prop-drawer"]');
  await drawer.locator('[data-testid="history-summary"]').waitFor({ timeout: 10000 }).catch(() => {});
  check(`[${label}] props drawer: opens with the history chart`, (await drawer.locator('[data-testid="history-chart"] svg').count()) > 0);
  check(`[${label}] props drawer: threshold defaults to the line`, (await drawer.locator('[data-testid="threshold-input"]').inputValue()) === "24.5");
  const sum1 = await drawer.locator('[data-testid="history-summary"]').innerText();
  check(`[${label}] props drawer: summary is labelled descriptive`, /Over \d+ · Under \d+ · Equal \d+ of 10/.test(sum1) && sum1.includes("descriptive history, not a probability"), sum1);
  check(`[${label}] props drawer: Measurement B block`, (await drawer.locator('[data-testid="measurement-b"]').innerText()).includes("of 6 quoted games"));
  await shot("props-drawer");
  await drawer.locator('[data-testid="threshold-input"]').fill("5");
  await page.waitForFunction((prev) => document.querySelector('[data-testid="prop-drawer"] [data-testid="history-summary"]')?.innerText !== prev, sum1, { timeout: 8000 }).catch(() => {});
  const sum2 = await drawer.locator('[data-testid="history-summary"]').innerText();
  check(`[${label}] props drawer: hypothetical threshold re-queries`, /Over 10 · Under 0/.test(sum2), sum2);
  await drawer.locator('[data-tab="L5"]').click();
  await page.waitForFunction(() => / of 5\b/.test(document.querySelector('[data-testid="prop-drawer"] [data-testid="history-summary"]')?.innerText ?? ""), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] props drawer: window switcher`, / of 5\b/.test(await drawer.locator('[data-testid="history-summary"]').innerText()));
  // "Add manual market" prefilled from the drawer
  await drawer.locator('[data-testid="drawer-add-manual"]').click();
  await page.waitForSelector('[data-testid="prop-drawer"]', { state: "detached" }).catch(() => {});
  const form = page.locator('[data-testid="manual-form"]');
  check(`[${label}] manual entry: prefilled from the drawer`, (await form.locator('select[name="game_id"]').inputValue()) === "FIX-G1" && (await form.locator('select[name="player_id"]').inputValue()) === "9001" && (await form.locator('select[name="market"]').inputValue()) === "player_pts" && (await form.locator('input[name="line"]').inputValue()) === "24.5");
  check(`[${label}] manual entry: states that entries are not verified quotes`, /not independently verified quotes/i.test(await form.innerText()));
  // submit a new owner-entered market, then withdraw it
  await form.locator('select[name="game_id"]').selectOption("FIX-G3");
  await form.locator('input[name="player_search"]').fill("Player E");
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="manual-form"] select[name="player_id"] option')].some((o) => o.value === "9005"), null, { timeout: 8000 }).catch(() => {});
  await form.locator('select[name="player_id"]').selectOption("9005");
  await form.locator('select[name="market"]').selectOption("player_reb");
  await form.locator('input[name="line"]').fill("11.5");
  const before = await page.locator('[data-testid="manual-entry"]').count();
  await form.locator('[data-testid="manual-submit"]').click();
  check(`[${label}] manual entry: owner-entered quote without a price is refused client-side`, /needs at least one price/i.test(await form.locator('[role="alert"]').innerText().catch(() => "")));
  await form.locator('input[name="over_price"]').fill("-110");
  const post = page.waitForResponse((r) => r.url().endsWith("/api/v1/player-props/manual") && r.request().method() === "POST");
  await form.locator('[data-testid="manual-submit"]').click();
  const pr = await post;
  check(`[${label}] manual entry: POST succeeded with CSRF`, pr.status() === 200 && pr.request().headers()["x-csrf-token"] === "fixture-csrf-token", `status ${pr.status()}`);
  await page.locator('[data-testid="manual-ok"]').waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="manual-entry"]').length === n + 1, before, { timeout: 8000 }).catch(() => {});
  check(`[${label}] manual entry: appears in the list`, (await page.locator('[data-testid="manual-entry"]').count()) === before + 1);
  await settle(page);
  check(`[${label}] manual entry: adds a market row`, (await page.locator(`[data-prop="9005:player_reb:FIX-G3"]:visible`).count()) === 1);
  await shot("manual-entry", { fullPage: false });
  const live = page.locator('[data-testid="manual-entry"][data-withdrawn="0"]', { hasText: "REB 11.5" });
  const gone = page.locator('[data-testid="manual-entry"][data-withdrawn="1"]', { hasText: "REB 11.5" });
  const goneBefore = await gone.count();
  const wd = page.waitForResponse((r) => /\/player-props\/manual\/\d+\/withdraw$/.test(r.url()));
  await live.first().locator('[data-testid="manual-withdraw"]').click();
  check(`[${label}] manual entry: withdraw POST`, (await wd).status() === 200);
  await live.first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  check(`[${label}] manual entry: withdrawn entry is kept and marked`, (await live.count()) === 0 && (await gone.count()) === goneBefore + 1 && /Withdrawn/i.test(await gone.first().innerText()));
  await settle(page);
  check(`[${label}] manual entry: market row removed after withdraw`, (await page.locator(`[data-prop="9005:player_reb:FIX-G3"]:visible`).count()) === 0);

  // --- Top picks (bounded, server-side paging) ---
  const selReqs = [];
  const onSelReq = (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith("/api/v1/selections")) selReqs.push(u.searchParams);
  };
  page.on("request", onSelReq);
  await visit(page, "/picks", label, errors);
  check(`[${label}] picks: ranked view grouped by game`, (await page.locator('[data-testid="selection-game-group"]').count()) === 2 && (await page.locator('[data-testid="selection-row"]').count()) === 3);
  check(`[${label}] picks: tab counts from the API`, (await page.locator('[data-tab="ranked"]').innerText()).replace(/\s+/g, " ") === "Top picks 3" && (await page.locator('[data-tab="rejected"]').innerText()).replace(/\s+/g, " ") === "Rejected 3" && (await page.locator('[data-tab="stale"]').innerText()).replace(/\s+/g, " ") === "Stale 0");
  await page.click('[data-tab="rejected"]');
  await page.locator('[data-testid="picks-list"]').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] picks: classification tab is a paged list`, (await page.locator('[data-testid="picks-list"] [data-testid="selection-row"]').count()) === 3);
  await page.click('[data-tab="stale"]');
  await settle(page);
  check(`[${label}] picks: empty classification explains itself`, /No selection is stale/.test(await bodyText(page)));
  await page.click('[data-tab="qualified"]');
  await page.fill('[data-testid="picks-search"]', "Player E");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="picks-list"] [data-testid="selection-row"]').length === 1, null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] picks: search uses the q parameter`, (await page.locator('[data-testid="picks-list"] [data-testid="selection-row"]').count()) === 1 && selReqs.some((p) => p.get("q") === "Player E"));
  check(`[${label}] picks: every /selections request is paginated`, selReqs.length >= 3 && selReqs.every((p) => Number(p.get("limit")) > 0 && Number(p.get("limit")) <= 1000), selReqs.map((p) => p.toString()).join(" | "));
  page.off("request", onSelReq);

  // --- compare / history are not blank on first load ---
  await visit(page, "/players/compare", label, errors);
  await page.locator('[data-testid="compare-table"]').waitFor({ timeout: 10000 }).catch(() => {});
  check(`[${label}] compare: preselects two slate players and offers quick picks`, (await page.locator('[data-testid="compare-selected"] li').count()) === 2 && (await page.locator('[data-testid="compare-table"] thead th').count()) === 3 && (await page.locator('[data-testid="compare-chip"]').count()) >= 2 && /two highest projected-minute players/.test(await page.locator('[data-testid="compare-preselected"]').innerText()));
  await visit(page, "/players/history", label, errors);
  check(`[${label}] history: slate players listed as quick links`, (await page.locator('[data-testid="history-quick-link"]').count()) >= 4 && /\/players\/9001.*#history/.test((await page.locator('[data-testid="history-quick-link"]').first().getAttribute("href")) ?? ""));

  // --- Kalshi market watch ---
  text = await visit(page, "/kalshi-intelligence", label, errors);
  const kSel = isMobile ? '[data-testid="kalshi-card"]' : '[data-testid="kalshi-row"]';
  const kCount = async (n) => page.waitForFunction(([sel, k]) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).length === k, [kSel, n], { timeout: 8000 }).then(() => true).catch(() => false);
  check(`[${label}] kalshi: seven contracts`, await kCount(7));
  check(`[${label}] kalshi: summary tiles from counts`, (await page.locator('[data-testid="kalshi-tiles"] [data-testid="tile"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join("|").match(/CONTRACTS 7\|NORMALISED 5.*\|TRACKED ONLY 2.*\|EVENTS 3/i) !== null);
  check(`[${label}] kalshi: stale sync tag, last sync time and sync note`, (await page.locator('[data-testid="kalshi-sync"]').first().getAttribute("data-stale")) === "1" && /Stale/i.test(text) && /Last sync .* ET/.test(text) && text.includes("FIXTURE: prices are polled about every 5 minutes"));
  check(`[${label}] kalshi: prices in cents and signed moves`, /56\.5¢/.test(text) && /\+6\.5¢/.test(text) && /−3¢/.test(text));
  check(`[${label}] kalshi: original contract title and comparator`, text.includes("FIXTURE Player A: 25+ points") && (isMobile || />= 25/.test(text)));
  check(`[${label}] kalshi: tracked-only tags with the note as a tooltip`, (await page.locator(`${kSel} [data-testid="tracked-only"]:visible`).count()) === 2 && /protected double-double/.test((await page.locator(`[data-ticker="KXFIX-A-DD"] [data-testid="tracked-only"]:visible`).first().getAttribute("title")) ?? ""));
  check(`[${label}] kalshi: API notes under the table`, (await page.locator('[data-testid="kalshi-notes"] li').count()) === 2);
  const controls = (await page.locator("main button, main a").allInnerTexts()).join(" | ");
  check(`[${label}] kalshi: no buy / sell / trade / order controls`, !/\b(buy|sell|trade|order|bet)\b/i.test(controls), controls.slice(0, 120));
  const upColor = await page.locator('[data-move="up"]:visible').first().evaluate((e) => getComputedStyle(e).color);
  const downColor = await page.locator('[data-move="down"]:visible').first().evaluate((e) => getComputedStyle(e).color);
  check(`[${label}] kalshi: moves are signed ink with an arrow: not green, not red, not the estimate orange`, upColor === "rgb(18, 22, 26)" && downColor === "rgb(18, 22, 26)" && (await page.locator('[data-move="up"]:visible svg').count()) >= 1, `${upColor} / ${downColor}`);
  if (!isMobile) {
    check(`[${label}] kalshi: table rows keep row semantics; the contract name is a real button in a row header`, (await page.locator('[data-testid="kalshi-table"] tr[role="button"], [data-testid="kalshi-table"] tr[tabindex]').count()) === 0 && (await page.locator('[data-testid="kalshi-row"] th[scope="row"] button[data-testid="kalshi-row-open"]').count()) === 7 && (await page.locator('[data-testid="kalshi-table"] thead th[scope="col"]').count()) >= 10);
    await page.locator('[data-testid="kalshi-row"][data-ticker="KXFIX-A-PTS30"] [data-testid="kalshi-row-open"]').focus();
    await page.keyboard.press("Enter");
    await page.locator('[data-testid="kalshi-drawer"] [data-testid="kalshi-detail"]').waitFor({ timeout: 10000 }).catch(() => {});
    const inDrawer = await page.evaluate(() => document.querySelector('[data-testid="kalshi-drawer"]')?.contains(document.activeElement));
    for (let k = 0; k < 12; k++) await page.keyboard.press("Tab");
    const stillIn = await page.evaluate(() => document.querySelector('[data-testid="kalshi-drawer"]')?.contains(document.activeElement));
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="kalshi-drawer"]').waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "kalshi-row-open", null, { timeout: 3000 }).catch(() => {});
    check(`[${label}] kalshi drawer: opens from the keyboard, traps focus, and returns it to the contract button on close`, inDrawer === true && stillIn === true && (await page.evaluate(() => document.activeElement?.closest("[data-ticker]")?.getAttribute("data-ticker"))) === "KXFIX-A-PTS30");
  }
  await page.selectOption('[data-testid="kalshi-kind"]', "player");
  check(`[${label}] kalshi: kind filter`, await kCount(4));
  await page.selectOption('[data-testid="kalshi-interp"]', "unsupported");
  check(`[${label}] kalshi: interpretation filter`, await kCount(1));
  await page.selectOption('[data-testid="kalshi-interp"]', "");
  await page.selectOption('[data-testid="kalshi-kind"]', "");
  await page.selectOption('[data-testid="kalshi-game"]', "FIX-G3");
  check(`[${label}] kalshi: game filter`, await kCount(2));
  await page.selectOption('[data-testid="kalshi-game"]', "");
  await page.fill('[data-testid="kalshi-search"]', "rebounds");
  check(`[${label}] kalshi: text search`, await kCount(1));
  await page.fill('[data-testid="kalshi-search"]', "");
  await kCount(7);
  await page.selectOption('[data-testid="kalshi-sort"]', "movement");
  await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null)?.getAttribute("data-ticker") === "KXFIX-A-PTS25", kSel, { timeout: 8000 }).catch(() => {});
  check(`[${label}] kalshi: sort by movement`, (await page.locator(`${kSel}:visible`).first().getAttribute("data-ticker")) === "KXFIX-A-PTS25");
  if (isMobile) {
    await page.locator('[data-ticker="KXFIX-A-PTS25"] [data-testid="kalshi-card-toggle"]').click();
    await page.locator('[data-ticker="KXFIX-A-PTS25"] [data-testid="kalshi-open"]').click();
  } else {
    await page.locator('[data-testid="kalshi-row"][data-ticker="KXFIX-A-PTS25"]').click();
  }
  const kd = page.locator('[data-testid="kalshi-drawer"] [data-testid="kalshi-detail"]');
  await kd.waitFor({ timeout: 10000 }).catch(() => {});
  check(`[${label}] kalshi detail: opens in a drawer`, (await kd.count()) === 1);
  check(`[${label}] kalshi detail: price history line and bid/ask band`, (await kd.locator('[data-testid="kalshi-chart"] .recharts-line-curve').count()) === 1 && (await kd.locator('[data-testid="kalshi-chart"] .recharts-area-area').count()) === 1);
  check(`[${label}] kalshi detail: timeline markers on the chart (two inside the observed window)`, (await kd.locator('[data-testid="kalshi-chart"] .recharts-reference-line').count()) === 2);
  check(`[${label}] kalshi detail: events listed chronologically`, (await kd.locator('[data-testid="kd-timeline"] li').count()) === 3 && /market opened/.test(await kd.locator('[data-testid="kd-timeline"] li').first().innerText()));
  const kdText = await kd.innerText();
  check(`[${label}] kalshi detail: market data precedes model research, both labelled`, /MARKET DATA · KALSHI/i.test(kdText) && /INDEPENDENT MODEL RESEARCH · GIZER/i.test(kdText) && kdText.search(/MARKET DATA/i) < kdText.search(/INDEPENDENT MODEL RESEARCH/i) && /Market price/i.test(kdText) && /Model probability/i.test(kdText));
  check(`[${label}] kalshi detail: contract rules verbatim`, (await kd.locator('[data-testid="kd-rules"]').innerText()).includes("FIXTURE rule: if Player A: 25+ points is recorded") && /FIXTURE secondary rule/.test(kdText));
  const kh = (await kd.locator('[data-testid="kd-history"]').innerText()).replace(/\s+/g, " ");
  check(`[${label}] kalshi detail: history as counts, never a percentage`, /L10 \d+ of 10 over/.test(kh) && !kh.includes("%") && /descriptive history, not a probability/.test(kh), kh.slice(0, 90));
  check(`[${label}] kalshi detail: research selections with classification and rejection reasons`, (await kd.locator('[data-testid="kd-selection"]').count()) === 2 && /Standard research/i.test(kdText) && /FIXTURE: edge below the minimum threshold/.test(kdText) && /56\.1%\s*\[51\.1–61\.1\]/.test(kdText));
  check(`[${label}] kalshi detail: both API notes and the research note`, (await kd.locator('[data-testid="kd-notes"] li').count()) === 2 && /fitted without market prices/.test(kdText));
  await kd.locator('[data-tab="spread"]').click();
  check(`[${label}] kalshi detail: spread / volume history toggle`, (await kd.locator('[data-testid="kalshi-chart"]').getAttribute("data-metric")) === "spread");
  await shot("kalshi-detail");
  const ko = await overflow(page);
  check(`[${label}] kalshi detail drawer has no horizontal overflow`, !ko, ko ? JSON.stringify(ko) : "");
  await visit(page, "/kalshi-intelligence/KXFIX-E-REB10", label, errors);
  text = await bodyText(page);
  check(`[${label}] kalshi detail page: single observation is stated, no line drawn`, /Only one observation so far/.test(text) && (await page.locator('[data-testid="kalshi-chart"]').count()) === 0);
  await visit(page, "/kalshi-intelligence/KXFIX-A-DD", label, errors);
  text = await bodyText(page);
  check(`[${label}] kalshi detail page: tracked-only contract shows the note and no model numbers`, (await page.locator('[data-testid="kd-tracked-note"]').innerText()).includes("protected double-double") && (await page.locator('[data-testid="kd-no-model"]').count()) === 1 && (await page.locator('[data-testid="kd-selection"]').count()) === 0 && !/Model probability \[/i.test(text));

  await visit(page, "/kalshi-intelligence/KXFIX-G1-ML", label, errors);
  check(`[${label}] kalshi detail page: game contract wording`, (await page.locator('[data-testid="kd-no-research"]').innerText()).trim() === "Model research is shown for player contracts only.");

  // --- Kalshi: slow, hung and failing list (the frontend half of docs/design/aesthetic/05) ---
  {
    const LIST = (u) => u.pathname === "/api/v1/kalshi/markets";
    let mode = "hang";
    let calls = 0;
    const release = [];
    await page.route(LIST, async (route) => {
      calls++;
      if (mode === "hang") return new Promise((res) => release.push(() => route.abort().catch(() => {}).then(res)));
      if (mode === "fail") return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "bad_gateway", message: "FIXTURE: upstream did not answer." } }) });
      return route.continue();
    });
    errors.length = 0;
    await page.goto(`${BASE}/kalshi-intelligence`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="kalshi-loading"]').waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="kalshi-game"] option').length === 4, null, { timeout: 5000 }).catch(() => {});
    const early = await page.evaluate(() => ({ h1: document.querySelector("main h1")?.innerText ?? "", filters: document.querySelectorAll('[data-testid="kalshi-filters"] input, [data-testid="kalshi-filters"] select').length, games: document.querySelectorAll('[data-testid="kalshi-game"] option').length, sync: document.querySelector('[data-testid="kalshi-sync-pending"]')?.innerText ?? "", loading: document.querySelector('[data-testid="kalshi-loading"]')?.innerText ?? "", bars: document.querySelectorAll('main .animate-pulse').length }));
    check(`[${label}] kalshi slow: title, all six filters (with the slate's games) and a sync status line render while the list is pending`, /Kalshi Market Watch/i.test(early.h1) && early.filters === 6 && early.games === 4 && /Checking sync/i.test(early.sync), JSON.stringify(early).slice(0, 220));
    check(`[${label}] kalshi slow: the wait is stated in words, never as a skeleton alone`, /Loading contracts for this slate/.test(early.loading) && early.bars === 0);
    await page.locator('[data-testid="kalshi-slow"]').waitFor({ timeout: 14000 }).catch(() => {});
    const slowText = await page.locator('[data-testid="kalshi-slow"]').innerText().catch(() => "");
    check(`[${label}] kalshi slow: at the deadline it says "Still loading… this list is large" with Retry and Keep waiting`, /Still loading… this list is large\./.test(slowText) && /for \d+ seconds/.test(slowText) && (await page.locator('[data-testid="kalshi-retry"]').count()) === 1 && (await page.locator('[data-testid="kalshi-keep-waiting"]').count()) === 1 && (await page.locator('[data-testid="kalshi-list"]').getAttribute("data-state")) === "slow", slowText.replace(/\s+/g, " ").slice(0, 140));
    check(`[${label}] kalshi slow: no silent retry was issued (one request so far)`, calls === 1, `${calls} requests`);
    await page.click('[data-testid="kalshi-keep-waiting"]');
    check(`[${label}] kalshi slow: Keep waiting withdraws the prompt and keeps the same request`, (await page.locator('[data-testid="kalshi-slow"]').count()) === 0 && (await page.locator('[data-testid="kalshi-loading"]').count()) === 1 && calls === 1);
    mode = "fail";
    release.splice(0).forEach((f) => f());
    await page.locator('[data-testid="kalshi-list"] [data-state="error"]').waitFor({ timeout: 8000 }).catch(() => {});
    const errText = await page.locator('[data-testid="kalshi-list"] [data-state="error"]').innerText().catch(() => "");
    check(`[${label}] kalshi error: a real error state with the reason and Retry replaces the wait`, /The contract list did not load/.test(errText) && /Retry/.test(errText) && (await page.locator('[data-testid="kalshi-loading"], [data-testid="kalshi-slow"]').count()) === 0 && /Sync unknown/i.test(await page.locator('[data-testid="kalshi-sync-pending"]').innerText().catch(() => "")), errText.replace(/\s+/g, " ").slice(0, 140));
    const before502 = calls;
    await page.locator('[data-testid="kalshi-list"] [data-state="error"] button').click();
    await page.waitForTimeout(600);
    check(`[${label}] kalshi error: a 502 is shown with its status, and Retry sends exactly one new request`, calls === before502 + 1 && /FIXTURE: upstream did not answer\. \(HTTP 502\)/.test(await page.locator('[data-testid="kalshi-list"] [data-state="error"]').innerText().catch(() => "")), `${calls - before502} request(s)`);
    mode = "ok";
    await page.locator('[data-testid="kalshi-list"] [data-state="error"] button').click();
    check(`[${label}] kalshi error: Retry recovers once the API answers`, (await kCount(7)) && (await page.locator('[data-testid="kalshi-list"]').getAttribute("data-state")) === "ready" && (await page.locator('[data-testid="kalshi-sync"]').count()) === 1);
    await page.unroute(LIST);
    await page.fill('[data-testid="kalshi-search"]', "zzqq-no-such-contract");
    await page.locator('[data-testid="kalshi-clear"]').waitFor({ timeout: 8000 }).catch(() => {});
    await page.locator('[data-testid="kalshi-clear"]').click().catch(() => {});
    check(`[${label}] kalshi empty: a filter that matches nothing says so and offers Clear filters, which restores the list`, (await kCount(7)) && (await page.locator('[data-testid="kalshi-search"]').inputValue()) === "");
    errors.length = 0; // the aborted and 502 requests above are expected
  }

  // --- Minutes intelligence ---
  text = await visit(page, "/minutes", label, errors);
  const mSel = isMobile ? '[data-testid="minutes-card"]' : '[data-testid="minutes-row"]';
  const mIds = async () => page.locator(`${mSel}:visible`).evaluateAll((els) => els.map((e) => e.getAttribute("data-player-id")).join(","));
  check(`[${label}] minutes: five players, default sort by projected minutes`, (await mIds()) === "9001,9005,9002,9003,9004", await mIds());
  check(`[${label}] minutes: header note, model status shown honestly`, /descriptive context/.test(text) && /Candidate — did not pass validation/i.test(await page.locator('[data-testid="minutes-model-status"]').innerText()) && text.includes("FIXTURE: the minutes band is the candidate model's 80% range"));
  check(`[${label}] minutes: band, role-change and returned-recently flags`, /\[\d+–\d+\]/.test(text) && /\+7\.2 vs L20/.test(text) && /Returned recently/i.test(text));
  check(`[${label}] minutes: projected lineup status is labelled Projected`, isMobile || /Projected/.test(await page.locator('[data-testid="minutes-row"][data-player-id="9001"]').innerText()));
  if (isMobile) {
    await page.selectOption('[data-testid="minutes-sort"]', "l5:asc");
  } else {
    await page.locator('[data-testid="minutes-table"] [data-sort="l5"]').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="minutes-row"]')?.getAttribute("data-player-id") === "9001", null, { timeout: 8000 }).catch(() => {});
    await page.locator('[data-testid="minutes-table"] [data-sort="l5"]').click();
  }
  await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null)?.getAttribute("data-player-id") === "9003", mSel, { timeout: 8000 }).catch(() => {});
  check(`[${label}] minutes: server-side sort (L5 ascending, unavailable last)`, (await mIds()).startsWith("9003") && (await mIds()).endsWith("9004"), await mIds());
  await page.selectOption('[data-testid="minutes-class"]', "variable");
  await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).length === 1, mSel, { timeout: 8000 }).catch(() => {});
  check(`[${label}] minutes: classification filter`, (await mIds()) === "9002");
  if (isMobile) await page.locator('[data-testid="minutes-card-toggle"]').first().click();
  else await page.locator('[data-testid="minutes-row"]').first().click();
  check(`[${label}] minutes: classification reason in the expanded row`, /minutes ranged widely/.test(await bodyText(page)));
  await page.selectOption('[data-testid="minutes-class"]', "");
  await page.fill('[data-testid="minutes-search"]', "Player E");
  await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).length === 1, mSel, { timeout: 8000 }).catch(() => {});
  check(`[${label}] minutes: search`, (await mIds()) === "9005");
  await shot("minutes");

  // --- Injury intelligence centre ---
  text = await visit(page, "/injuries", label, errors);
  check(`[${label}] injuries: status changes on top with previous → current and reassess counts`, (await page.locator('#status-changes [data-testid="injury-change"]').count()) === 3 && /3 research records to reassess \(2 qualified\)/.test(text) && /Questionable/.test(await page.locator('[data-testid="injury-change"]').first().innerText()) && /Lineup: FIXTURE/.test(text));
  check(`[${label}] injuries: change notes`, (await page.locator('[data-testid="injury-change-notes"] li').count()) === 2);
  const top = await page.evaluate(() => [document.querySelector("#status-changes")?.getBoundingClientRect().top ?? -1, document.querySelector('[data-testid="injury-game"]')?.getBoundingClientRect().top ?? -1]);
  check(`[${label}] injuries: full availability feed kept below`, top[0] >= 0 && top[1] > top[0]);
  await page.check('[data-testid="material-toggle"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="injury-change"]').length === 2, null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] injuries: material-only toggle`, (await page.locator('[data-testid="injury-change"]').count()) === 2 && (await page.locator('[data-testid="injury-change"][data-material="0"]').count()) === 0);

  // --- Lineups ---
  await visit(page, "/lineups", label, errors);
  check(`[${label}] lineups: board view is the default with one card per game`, (await page.locator('[data-testid="lineup-card"]').count()) === 3);
  check(`[${label}] lineups: board never pads a missing lineup`, (await page.locator('[data-testid="lineup-card"][data-game-id="FIX-G2"] [data-team="BOS"] [data-testid="lc-player"]').count()) === (await page.locator('[data-testid="lineup-card"][data-game-id="FIX-G2"] [data-team="BOS"] ul li').count()) && (await page.locator('[data-testid="lineup-card"][data-game-id="FIX-G2"] [data-team="BOS"] [data-testid="lc-no-lineup"]').count()) === 1);
  check(`[${label}] lineups: board labels projections as not official`, /Projected Lineup\s*· not official/i.test((await page.locator('[data-testid="lineup-card"]').first().innerText()).replace(/\n/g, " ")));
  await shot("lineups-board");
  await page.locator('[data-testid="lineup-view-detailed"]').click();
  check(`[${label}] lineups: three games`, (await page.locator('[data-testid="lineup-game"]').count()) === 3);
  const g1 = page.locator('[data-game-id="FIX-G1"]');
  const det = await g1.locator('[data-team="DET"]').innerText();
  check(`[${label}] lineups: projected lineup labelled "Projected — not official", never Confirmed`, /Projected — not official/i.test(det) && !/confirmed/i.test(det.replace(/last confirmed five/gi, "")), det.slice(0, 80));
  check(`[${label}] lineups: five starters, not padded`, (await g1.locator('[data-team="DET"] [data-testid="lineup-player"]').count()) === 7);
  if (isMobile) {
    check(`[${label}] lineups: one team visible at a time`, !(await g1.locator('[data-team="ORL"]').isVisible()));
    await g1.locator('[data-tab="home"]').click();
    check(`[${label}] lineups: team switcher shows the home team`, (await g1.locator('[data-team="ORL"]').isVisible()) && !(await g1.locator('[data-team="DET"]').isVisible()));
    await shot("lineups-home-team");
  } else {
    const boxes = await Promise.all(["DET", "ORL"].map((t) => g1.locator(`[data-team="${t}"]`).boundingBox()));
    check(`[${label}] lineups: away left, home right`, boxes[0] && boxes[1] && boxes[0].x < boxes[1].x && Math.abs(boxes[0].y - boxes[1].y) < 4);
  }
  const g2 = page.locator('[data-game-id="FIX-G2"]');
  if (isMobile) await g2.locator('[data-tab="away"]').click();
  check(`[${label}] lineups: empty starters say so`, (await g2.locator('[data-team="BOS"] [data-testid="no-lineup"]').innerText()).includes("No lineup information available") && /Awaiting confirmation/i.test(await g2.locator('[data-team="BOS"]').innerText()));
  await g1.locator('[data-testid="lineup-history-toggle"]').click();
  await g1.locator('[data-testid="lineup-history"]').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] lineups: history list`, (await g1.locator('[data-testid="lineup-history"] li').count()) === 2);

  // --- Player profile ---
  await visit(page, "/players/9001", label, errors);
  check(`[${label}] player: header with next game and lineup status`, /@ ORL/.test(await page.locator('[data-testid="next-game"]').innerText()) && /Projected — not official/i.test(await page.locator('[aria-label="Player"]').innerText()));
  check(`[${label}] player: averages strip with sample sizes`, (await page.locator('[data-testid="averages-strip"] [data-testid="window-sample"]').allInnerTexts()).join("|") === "n=24|n=5|n=10|n=20");
  check(`[${label}] player: minutes & role block`, /FIXTURE: started 10 of the last 10/.test(await page.locator('[data-testid="minutes-profile"]').innerText()) && /Starts \/ bench/i.test(await page.locator('[data-testid="minutes-profile"]').innerText()) && /did not pass validation/.test(await page.locator("#minutes").innerText()));
  check(`[${label}] player: Kalshi threshold ladder linking to the detail`, (await page.locator('#kalshi [data-testid="kalshi-compact-row"]').count()) === 3 && (await page.locator('#kalshi [data-testid="kalshi-compact-row"][href*="/kalshi-intelligence/KXFIX-A-PTS25"]').count()) === 1 && />= 25/.test(await page.locator("#kalshi").innerText()));
  const hist = page.locator('#history [data-testid="player-history"]');
  await hist.locator('[data-testid="history-summary"]').waitFor({ timeout: 10000 }).catch(() => {});
  const h1 = await hist.locator('[data-testid="history-summary"]').innerText();
  check(`[${label}] player: history summary`, /Over \d+ · Under \d+ · Equal \d+ of 10 — descriptive history, not a probability/.test(h1), h1);
  check(`[${label}] player: one bar per game`, (await hist.locator('[data-testid="history-chart"] .recharts-bar-rectangle').count()) === 10);
  await hist.locator('[data-tab="reb"]').click();
  await page.waitForFunction((prev) => document.querySelector('#history [data-testid="history-summary"]')?.innerText !== prev, h1, { timeout: 8000 }).catch(() => {});
  check(`[${label}] player: stat switch`, (await hist.getAttribute("data-stat")) === "reb" && /REB/.test(await hist.locator('[data-testid="history-summary"]').innerText()));
  await hist.locator('[data-tab="L20"]').click();
  await page.waitForFunction(() => / of 20\b/.test(document.querySelector('#history [data-testid="history-summary"]')?.innerText ?? ""), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] player: window switch`, / of 20\b/.test(await hist.locator('[data-testid="history-summary"]').innerText()));
  check(`[${label}] player: Measurement B unavailable reason`, /Not available: FIXTURE/.test(await hist.locator('[data-testid="measurement-b"]').innerText()));
  await hist.locator('[data-testid="history-table-toggle"]').click();
  check(`[${label}] player: accessible table alternative`, (await hist.locator('[data-testid="history-table"] tbody tr').count()) === 20);
  await shot("player-history");
  const distMore = page.locator('[data-testid="distribution"] button:visible', { hasText: "Show all" });
  if (await distMore.count()) {
    check(`[${label}] player: long stacked tables are capped with a Show all control`, true);
    await distMore.first().click();
  }
  check(`[${label}] player: distribution table`, (await page.locator('[data-testid="distribution"]').innerText()).includes("n=24 of 30 requested"));
  check(`[${label}] player: small-sample flags`, (await page.locator('[data-testid="player-page"]').innerText()).match(/Small sample/gi)?.length >= 3);
  check(`[${label}] player: missed games listed`, (await page.locator('[data-testid="missed-games"] li').count()) === 2);
  if (viewport.width >= 1280) {
    await page.locator('[data-testid="game-log"] [data-sort="pts"]').click();
    const pts = (await page.locator('[data-testid="game-log"] tbody tr td:nth-child(5)').allInnerTexts()).map(Number);
    check(`[${label}] player: game log sortable`, pts.length === 15 && pts.every((v, i) => i === 0 || v <= pts[i - 1]), pts.join(","));
  }
  await visit(page, "/players/9004", label, errors);
  check(`[${label}] player without history: initials avatar and honest empty states`, (await page.locator('[aria-label="Player"] [data-testid="avatar-fallback"]').count()) === 1 && /Not available/.test(await page.locator('[data-testid="averages-strip"]').innerText()));

  // --- Comparison / history index ---
  await visit(page, "/players/compare?ids=9001,9005", label, errors);
  check(`[${label}] compare: side-by-side averages with sample sizes`, (await page.locator('[data-testid="compare-table"] thead th').count()) === 3 && /n=10/.test(await page.locator('[data-testid="compare-table"] thead').innerText()));
  check(`[${label}] compare: overlaid L10 chart`, (await page.locator('[data-testid="overlay-chart"] .recharts-line').count()) === 2);
  await page.locator('[data-testid="player-search"] input').fill("Player B");
  await page.locator('[data-testid="compare-add"]').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="compare-selected"] li').length === 3, null, { timeout: 8000 }).catch(() => {});
  await settle(page);
  check(`[${label}] compare: third player added`, (await page.locator('[data-testid="compare-table"] thead th').count()) === 4 && (await page.locator('[data-testid="overlay-chart"] .recharts-line').count()) === 3);
  await shot("compare");
  await page.goto(`${BASE}/players/history`);
  await page.locator('[data-testid="player-search"] input').fill("Player A");
  await page.locator('[data-testid="history-open"]').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForURL(/\/players\/9001/, { timeout: 8000 }).catch(() => {});
  check(`[${label}] history index deep-links to the profile history section`, /\/players\/9001.*#history$/.test(page.url()), page.url());

  // --- Game page ---
  await visit(page, "/games/FIX-G1", label, errors);
  const gp = page.locator('[data-testid="game-page"]');
  const ys = await page.evaluate(() => ["#matchup", "#environment", "#lineups", "#minutes", "#props", "#kalshi", "#history", "#availability", "#projections", "#selections", "#sgp", "#sources"].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1));
  check(`[${label}] game: twelve sections in order`, ys.every((v, i) => v !== -1 && (i === 0 || v > ys[i - 1])), ys.map(Math.round).join(","));
  check(`[${label}] game: player minutes for both teams`, (await gp.locator('#minutes [data-testid="minutes-compact-row"]').count()) === 2 && /did not pass validation/.test(await gp.locator("#minutes").innerText()));
  check(`[${label}] game: Kalshi observations grouped, with tracked-only and stale tags`, (await gp.locator('#kalshi [data-testid="kalshi-compact-row"]').count()) === 4 && (await gp.locator('#kalshi [data-testid="kalshi-group"]').count()) === 3 && (await gp.locator('#kalshi [data-testid="tracked-only"]').count()) === 1 && (await gp.locator('#kalshi [data-testid="kalshi-sync"]').getAttribute("data-stale")) === "1");
  check(`[${label}] game: historical player performance rows`, (await gp.locator('[data-testid="game-history"] [data-testid="hist-frequency"]').count()) >= 2);
  check(`[${label}] game: availability timeline for this game only`, (await gp.locator('#availability [data-testid="injury-change"]').count()) === 2);
  check(`[${label}] game: model projections are in an expandable block`, (await gp.locator("#projections details").count()) === 1 && !(await gp.locator('[data-testid="player-averages"]').isVisible()));
  check(`[${label}] game: lineup table`, (await gp.locator('[data-testid="team-lineup"]').count()) === 2);
  check(`[${label}] game: player props for the game`, (await gp.locator(`#props ${rowSel}:visible`).count()) === 3);
  check(`[${label}] game: descriptive context row on selections`, /Historical context \(descriptive\)/i.test(await gp.locator('[data-testid="historical-context"]').first().innerText()));
  check(`[${label}] game: "+N more evaluated (not qualified)" from selection_counts`, /\+1 more evaluated \(not qualified\)/.test(await page.locator('[data-testid="game-more-evaluated"]').innerText()) && (await page.locator('[data-testid="game-watchlist"]').count()) === 1);
  await page.click('[data-testid="toggle-all-selections"]');
  check(`[${label}] game: rejected selections listed with reasons`, (await page.locator('[data-testid="rejection-inline"]').first().innerText()).includes("FIXTURE: edge below the minimum threshold."));
  await visit(page, "/games/FIX-G2", label, errors);
  check(`[${label}] game without history: team form empty state`, /Team form is not available/.test(await bodyText(page)));

  // --- Parlays ---
  await visit(page, "/parlays", label, errors);
  check(`[${label}] parlays: eight tabs`, (await page.locator('[role="tab"]').count()) === 8);
  check(`[${label}] parlays: three combo cards, one invalidated`, (await page.locator('[data-testid="combo-card"]').count()) === 3 && (await page.locator('[data-testid="combo-invalidated"]').count()) === 1);
  await page.locator('[data-combo-uid="FIX-D1"] [data-testid="combo-toggle"]').click();
  let detail = await page.locator('[data-combo-uid="FIX-D1"] [data-testid="combo-detail"]').innerText();
  check(`[${label}] parlays: no-quote text`, detail.includes("No verified combined sportsbook quote — research only"));
  check(`[${label}] parlays: reference price label`, /Arithmetic product of leg prices — not a sportsbook quote/i.test(detail));
  check(`[${label}] parlays: independent vs adjusted probability`, /Independent product/i.test(detail) && /Correlation-adjusted/i.test(detail));
  let o = await overflow(page);
  check(`[${label}] parlays expanded card has no horizontal overflow`, !o, o ? JSON.stringify(o) : "");
  await shot("parlays-expanded", { fullPage: true });
  await page.locator('[data-combo-uid="FIX-D2"] [data-testid="combo-toggle"]').click();
  detail = await page.locator('[data-combo-uid="FIX-D2"] [data-testid="combo-detail"]').innerText();
  check(`[${label}] parlays: observed quote shown when present`, /Observed combined quote/i.test(detail) && !detail.includes("No verified combined sportsbook quote"));
  await page.click('[data-tab="quad"]');
  await settle(page);
  check(`[${label}] parlays: empty category has explicit empty state`, (await page.locator('[data-state="empty"]').innerText()).includes("No 4-leg combination met the research criteria"));
  await page.click('[data-tab="picks"]');
  await settle(page);
  check(`[${label}] parlays: individual picks tab lists ranked selections as compact rows`, (await page.locator('[data-testid="selection-row"]').count()) === 3 && (await page.locator('[data-testid="selection-card"]').count()) === 0);
  await page.locator('[data-testid="selection-row"] button').first().click();
  check(`[${label}] selection row expands to the full card`, (await page.locator('[data-testid="selection-card"]').count()) === 1);
  await page.locator('[data-testid="evidence-toggle"]').first().click();
  check(`[${label}] selection: evidence panel expands`, await page.locator('[data-testid="evidence-panel"]').first().isVisible());
  check(`[${label}] selection: evidence meter is labelled separately`, /Evidence\s*72\s*\/100/.test((await page.locator('[data-testid="evidence-meter"]').first().innerText()).replace(/\n/g, " ")));
  check(`[${label}] selection: classification uses the research labels`, /Standard research/i.test(await page.locator('[data-testid="selection-card"]').first().innerText()));
  check(`[${label}] selection: quote origin shown`, /Quote\s+Provider/.test((await page.locator('[data-testid="selection-card"]').first().innerText()).replace(/\s+/g, " ")));

  // --- Results ---
  text = await visit(page, "/results", label, errors);
  check(`[${label}] results: all six engine rows`, ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "FIVE", "SIX"].every((e) => text.includes(`${e} ·`)));
  check(`[${label}] results: empty engines say n=0`, (await page.locator('[data-testid="engine-empty"]:visible').count()) === 3);
  check(`[${label}] results: API disclaimer rendered`, (await page.locator('[data-testid="results-disclaimer"]').innerText()).startsWith("FIXTURE disclaimer"));
  check(`[${label}] results: charts rendered`, (await page.locator('[data-testid="calibration-chart"] svg').count()) > 0 && (await page.locator('[data-testid="equity-chart"] svg').count()) > 0);
  check(`[${label}] results: winning and losing tickets both listed`, /Win/i.test(text) && /Loss/i.test(text) && (await page.locator('[data-testid="forensic-report"]').count()) === 2);

  // --- Performance, models, data health, injuries, agents ---
  text = await visit(page, "/performance", label, errors);
  check(`[${label}] performance: market / engine / structure groups`, /By market type/i.test(text) && /By engine/i.test(text) && /By structure/i.test(text));
  check(`[${label}] performance: n=0 rows instead of blanks`, (await page.locator('[data-testid="strategy-empty"]:visible').count()) === 4 && /no priced tickets/.test(text));
  check(`[${label}] performance: disclaimer`, (await page.locator('[data-testid="strategies-disclaimer"]').innerText()).startsWith("FIXTURE disclaimer"));
  text = await visit(page, "/models", label, errors);
  check(`[${label}] models: registry moved here`, text.includes("FIXTURE-props-gbm") && text.includes("FIXTURE-copula"));
  text = await visit(page, "/data-health", label, errors);
  check(`[${label}] data health: provider configuration center`, (await page.locator('[data-testid="provider-card"]').count()) === 4 && (await page.locator('[data-provider="kalshi"]').count()) === 1 && /Credential missing/i.test(text) && /Credential present/i.test(text));
  check(`[${label}] data health: no key entry field, .env stated`, (await page.locator("main input, main textarea").count()) === 0 && /\.env/.test(text));
  text = await visit(page, "/injuries", label, errors);
  check(`[${label}] injuries: grouped by game then team with stale tags`, (await page.locator('[data-testid="injury-game"]').count()) === 2 && (await page.locator('[data-testid="injury-row"][data-stale="1"]').count()) === 3 && /Previously: Questionable/.test(text));
  text = await visit(page, "/agents", label, errors);
  check(`[${label}] agents: "never run" shown honestly`, /never run/i.test(text));

  // --- Builder ---
  await visit(page, "/builder", label, errors);
  const drawerMode = viewport.width < 1024;
  const openDrawer = async () => {
    if (drawerMode && (await page.locator('[data-testid="builder-drawer"]').getAttribute("data-open")) !== "1") await page.click('[data-testid="builder-drawer-toggle"]');
  };
  const closeDrawer = async () => {
    if (drawerMode && (await page.locator('[data-testid="builder-drawer"]').getAttribute("data-open")) === "1") await page.click('[data-testid="builder-drawer-toggle"]');
  };
  const evalLoc = page.locator('[data-testid="builder-evaluation"]:visible');
  check(`[${label}] builder: qualified selections offered`, (await page.locator('[data-testid="builder-add"]').count()) === 3);
  const evalRequests = [];
  page.on("request", (r) => {
    if (r.url().includes("/builder/evaluate")) evalRequests.push(r.postData());
  });
  await page.locator('[data-testid="builder-add"]').first().click();
  await page.locator('[data-testid="builder-add"]').first().click();
  await openDrawer();
  await evalLoc.waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] builder: evaluation shown after adding two legs`, (await evalLoc.count()) === 1 && evalRequests.length >= 1);
  const joint2 = (await page.locator('[data-testid="builder-joint"]:visible').innerText().catch(() => "")).replace(/\s+/g, " ");
  check(`[${label}] builder: joint probability with interval`, /\d+\.\d%\s*\[\d+\.\d–\d+\.\d\]/.test(joint2), joint2);
  await closeDrawer();
  const callsBefore = evalRequests.length;
  await page.locator('[data-testid="builder-add"]').first().click();
  await openDrawer();
  await page.waitForFunction((prev) => {
    const el = [...document.querySelectorAll('[data-testid="builder-joint"]')].find((e) => e.offsetParent !== null);
    return el && el.textContent.replace(/\s+/g, " ") !== prev;
  }, joint2, { timeout: 8000 }).catch(() => {});
  check(`[${label}] builder: re-evaluated on change`, evalRequests.length > callsBefore);
  await page.locator('[data-testid="builder-remove"]:visible').last().click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="builder-legs"]')].find((e) => e.offsetParent !== null)?.querySelectorAll("li").length === 2, null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] builder: leg removed`, (await page.locator('[data-testid="builder-legs"]:visible li').count()) === 2);
  await evalLoc.waitFor({ timeout: 8000 }).catch(() => {});
  const saveResp = page.waitForResponse((r) => r.url().endsWith("/api/v1/paper/tickets") && r.request().method() === "POST");
  await page.locator('[data-testid="builder-evaluation"]:visible [data-testid="save-ticket"] button').click();
  const resp = await saveResp;
  check(`[${label}] builder: POST /paper/tickets succeeded with CSRF header`, resp.status() === 200 && resp.request().headers()["x-csrf-token"] === "fixture-csrf-token", `status ${resp.status()}`);
  await page.locator('[data-testid="save-ticket-ok"]:visible').waitFor({ timeout: 8000 }).catch(() => {});
  const savedText = await page.locator('[data-testid="save-ticket-ok"]:visible').innerText().catch(() => "");
  check(`[${label}] builder: save confirmation shown`, /Saved as paper ticket #\d+/.test(savedText), savedText);
  await closeDrawer();
  check(`[${label}] builder: qualified only by default`, (await page.locator('[data-testid="builder-option"]').count()) === 3);
  await page.check('[data-testid="builder-watchlist"]');
  await page.locator('[data-testid="builder-option"]', { hasText: "FIXTURE Player B Under 8.5 REB" }).waitFor({ timeout: 8000 }).catch(() => {});
  await page.locator('[data-testid="builder-option"]', { hasText: "FIXTURE Player B Under 8.5 REB" }).locator('[data-testid="builder-add"]').click();
  await openDrawer();
  await page.locator('[data-testid="unreliable-banner"]:visible').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] builder: warning banner when reliable is false`, (await page.locator('[data-testid="unreliable-banner"]:visible').count()) === 1 && (await page.locator('[data-testid="builder-warnings"]:visible').count()) === 1);
  await shot("builder");
  o = await overflow(page);
  check(`[${label}] builder has no horizontal overflow`, !o, o ? JSON.stringify(o) : "");
  await closeDrawer();
  check(`[${label}] builder: researched combinations are collapsed by default`, !(await page.locator('[data-testid="builder-load"]').first().isVisible()));
  await page.locator('[data-testid="builder-load-panel"] summary').click();
  await page.locator('[data-testid="builder-load"]').first().click();
  await openDrawer();
  await page.waitForTimeout(700);
  check(`[${label}] builder: load a combination from /combos`, (await page.locator('[data-testid="builder-legs"]:visible li').count()) === 2);

  // --- tickets, exposure, admin, editions ---
  await visit(page, "/tickets", label, errors);
  const m = savedText.match(/#(\d+)/);
  check(`[${label}] tickets: saved ticket is listed as open`, Boolean(m) && (await page.locator(`[data-ticket-id="${m?.[1]}"]`).count()) === 1);
  await page.click('[data-tab="settled"]');
  await settle(page);
  check(`[${label}] tickets: settled win and loss with forensic reports`, (await page.locator('[data-testid="forensic-report"]').count()) === 2);
  text = await visit(page, "/exposure", label, errors);
  check(`[${label}] exposure: simulation block compares both figures`, /P\(at least one ticket wins\)/i.test(text) && /Expected aggregate P&L/i.test(text));
  check(`[${label}] exposure: never describes tickets as independent`, !/independent/i.test(text.replace(/FIXTURE note:[^\n]*/g, "")));
  await visit(page, "/admin", label, errors);
  await page.click('[data-testid="pause-toggle"]');
  await page.waitForFunction(() => /Resume research/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] admin: pause toggle round-trips`, /Paused/i.test(await page.locator('[data-testid="pause-control"]').innerText()));
  await page.click('[data-testid="pause-toggle"]');
  await page.waitForFunction(() => /Pause research/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  await visit(page, "/research/daily", label, errors);
  check(`[${label}] editions: list, diff and full edition`, (await page.locator('[data-testid="edition-row"]').count()) === 3 && (await page.locator('[data-testid="edition-diff"]').count()) === 1 && (await page.locator('[data-testid="edition-full"]').count()) === 1);
  check(`[${label}] flows raised no page/console errors`, errors.length === 0, errors.join(" | "));

  // --- JARVIS ---
  const mockJarvis = (state) => page.evaluate((v) => fetch("/api/v1/__mock/jarvis", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": "fixture-csrf-token" }, body: JSON.stringify({ state: v }) }).then((r) => r.json()), state);
  const pillIs = (root, st) => page.waitForFunction(([sel, v]) => document.querySelector(`${sel} [data-testid="jarvis-pill"]`)?.getAttribute("data-state") === v, [root, st], { timeout: 8000 }).then(() => true).catch(() => false);
  const sendJ = async (root, text) => {
    await page.locator(`${root} [data-testid="jarvis-input"]`).fill(text);
    await page.locator(`${root} [data-testid="jarvis-input"]`).press("Enter");
  };
  const answered = (root, n) => page.waitForFunction(([sel, k]) => document.querySelectorAll(`${sel} [data-testid="jarvis-answer"][data-streaming="0"]`).length === k && !document.querySelector(`${sel} [data-testid="jarvis-live"]`), [root, n], { timeout: 15000 }).then(() => true).catch(() => false);
  const P = '[data-testid="jarvis-page"]';
  await visit(page, "/jarvis", label, errors);
  await mockJarvis("ready");
  await page.reload();
  await settle(page);
  check(`[${label}] jarvis: renders with the Ready state pill and the mark`, (await pillIs(P, "ready")) && (await page.locator(`${P} [data-testid="jarvis-mark"]`).count()) >= 1);
  check(`[${label}] jarvis: empty state explains itself and offers suggestions`, /Every number in an answer comes from platform records/.test(await page.locator('[data-testid="jarvis-empty"]').innerText()) && (await page.locator('[data-testid="jarvis-suggestion"]').count()) >= 4);
  const jReqs = [];
  const onJReq = (r) => {
    if (/\/jarvis\/conversations\/\d+\/messages$/.test(r.url())) jReqs.push({ body: JSON.parse(r.postData() ?? "{}"), headers: r.headers(), method: r.method() });
  };
  page.on("request", onJReq);
  const spentBefore = isMobile ? null : await page.locator('[data-testid="jarvis-spent"]').innerText();
  await page.check(`${P} [data-testid="jarvis-deep"]`);
  await sendJ(P, "What is on the slate today?");
  const sawProcessing = await pillIs(P, "processing");
  await page.locator(`${P} [data-testid="jarvis-live"] [data-testid="jarvis-tool"]`).first().waitFor({ timeout: 8000 }).catch(() => {});
  const liveTool = await page.locator(`${P} [data-testid="jarvis-live"] [data-testid="jarvis-tool"]`).first().innerText().catch(() => "");
  check(`[${label}] jarvis: Processing only while the stream is open, with real tool labels`, sawProcessing && /FIXTURE: Reading the slate/.test(liveTool), liveTool);
  check(`[${label}] jarvis: composer shows Stop while a request is in flight`, (await page.locator(`${P} [data-testid="jarvis-stop"]`).count()) === 1 || (await page.locator(`${P} [data-testid="jarvis-answer"][data-streaming="0"]`).count()) === 1);
  check(`[${label}] jarvis: answer completes`, await answered(P, 1));
  const ans = page.locator(`${P} [data-testid="jarvis-answer"]`).first();
  check(`[${label}] jarvis: streamed Markdown renders a heading, bold, list, inline code and a table`, (await ans.locator('[data-testid="md-table"] tbody tr').count()) === 2 && (await ans.locator("h3").count()) === 1 && (await ans.locator("strong").count()) >= 1 && (await ans.locator("li").count()) >= 2 && (await ans.locator("code").count()) === 1 && !/\*\*|\|---/.test(await ans.innerText()));
  const meta = (await ans.locator('[data-testid="jarvis-meta"]').innerText()).replace(/\s+/g, " ");
  check(`[${label}] jarvis: model, cost (4 decimals) and sources under the answer`, /FIXTURE-opus-model/.test(meta) && /\$0\.2145/.test(meta) && /Sources \(2\)/.test(meta), meta);
  await ans.locator('[data-testid="jarvis-sources"] summary').click();
  check(`[${label}] jarvis: sources list tool label and args`, /FIXTURE: Inspecting the injury report/.test(await ans.locator('[data-testid="jarvis-sources"]').innerText()) && /material=true/.test(await ans.locator('[data-testid="jarvis-sources"]').innerText()));
  check(`[${label}] jarvis: stream request is a POST with CSRF and mode "deep"`, jReqs.length === 1 && jReqs[0].method === "POST" && jReqs[0].headers["x-csrf-token"] === "fixture-csrf-token" && jReqs[0].body.mode === "deep");
  check(`[${label}] jarvis: deep review resets after each send, back to Standard`, !(await page.locator(`${P} [data-testid="jarvis-deep"]`).isChecked()) && (await page.locator(`${P} [data-testid="jarvis-standard"]`).isChecked()));
  check(`[${label}] jarvis: Quick answers / Standard / Deep review is one control (a radio group of three)`, (await page.locator(`${P} [data-testid="jarvis-depth"] input[type="radio"]`).count()) === 3 && (await page.locator(`${P} [data-testid="jarvis-depth"] input[type="radio"]:checked`).count()) === 1 && (await page.locator(`${P} input[type="checkbox"]`).count()) === 0);
  check(`[${label}] jarvis: pill returns to Ready after the turn`, await pillIs(P, "ready"));
  if (!isMobile) {
    await page.waitForFunction((prev) => document.querySelector('[data-testid="jarvis-spent"]')?.textContent !== prev, spentBefore, { timeout: 8000 }).catch(() => {});
    check(`[${label}] jarvis: budget readout refreshes after the turn`, (await page.locator('[data-testid="jarvis-spent"]').innerText()) !== spentBefore);
    check(`[${label}] jarvis: right column shows this turn's tool activity`, (await page.locator('[data-testid="jarvis-right"] [data-testid="jarvis-tool"][data-status="ok"]').count()) === 2);
  }
  check(`[${label}] jarvis: conversation id is in the URL`, /[?&]c=\d+/.test(page.url()), page.url());
  await page.reload();
  await settle(page);
  check(`[${label}] jarvis: conversation persists after reload`, (await answered(P, 1)) && /What is on the slate today\?/.test(await page.locator(`${P} [data-testid="jarvis-owner"]`).first().innerText()) && (await page.locator(`${P} [data-testid="md-table"]`).count()) === 1);
  await sendJ(P, "/budget");
  check(`[${label}] jarvis: slash command answered from stored data`, (await answered(P, 2)) && /Answered from stored data, no model/.test(await page.locator(`${P} [data-testid="jarvis-meta"]`).nth(1).innerText()) && jReqs[1]?.body.mode === "standard");
  await sendJ(P, "please trigger-budget-error now");
  await page.locator(`${P} [data-testid="jarvis-error"]`).waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] jarvis: budget error shows the server message verbatim and flips the pill`, (await page.locator(`${P} [data-testid="jarvis-error"]`).innerText().catch(() => "")).trim() === "FIXTURE: the lifetime AI budget cap has been reached; no model request was sent." && (await pillIs(P, "budget_limited")));
  await mockJarvis("ready");
  await sendJ(P, "trigger-drop");
  await page.waitForFunction(() => /Connection lost/.test(document.querySelector('[data-testid="jarvis-error"]')?.textContent ?? "") && !document.querySelector('[data-testid="jarvis-page"] [data-testid="jarvis-live"]'), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] jarvis: dropped stream says connection lost and reloads the conversation`, /Connection lost/.test(await page.locator(`${P} [data-testid="jarvis-error"]`).innerText().catch(() => "")) && (await page.locator(`${P} [data-testid="jarvis-live"]`).count()) === 0);
  page.off("request", onJReq);
  await mockJarvis("provider_unavailable");
  await page.goto(`${BASE}/jarvis`);
  await settle(page);
  const un = await page.locator('[data-testid="jarvis-unavailable"]').innerText().catch(() => "");
  check(`[${label}] jarvis: provider unavailable is stated with the server message and the slash-command note`, (await pillIs(P, "provider_unavailable")) && un.includes("FIXTURE: no provider key is configured on the server.") && /\/budget, \/status, \/health, \/events, \/agents, \/briefing/.test(un));
  await mockJarvis("ready");
  // history: open, delete with confirm
  if (isMobile) await page.click('[data-testid="jarvis-history-btn"]');
  const histRoot = isMobile ? '[data-testid="jarvis-history-sheet"]' : '[data-testid="jarvis-page"] aside';
  await page.locator(`${histRoot} [data-testid="jarvis-history-item"]`).first().waitFor({ timeout: 8000 }).catch(() => {});
  const histN = await page.locator(`${histRoot} [data-testid="jarvis-history-item"]`).count();
  check(`[${label}] jarvis: conversation history lists the conversation`, histN >= 1 && /What is on the slate today\?/.test(await page.locator(`${histRoot} [data-testid="jarvis-history"]`).innerText()));
  check(`[${label}] jarvis: left column has new conversation, suggestions and the AI budget link`, (await page.locator(`${histRoot} [data-testid="jarvis-new"]`).count()) === 1 && (await page.locator(`${histRoot} [data-testid="jarvis-budget-link"]`).count()) === 1);
  await page.locator(`${histRoot} [data-testid="jarvis-delete"]`).first().click();
  check(`[${label}] jarvis: delete asks for confirmation first`, (await page.locator(`${histRoot} [data-testid="jarvis-history-item"]`).count()) === histN);
  const delReq = page.waitForRequest((r) => /\/jarvis\/conversations\/\d+\/delete$/.test(r.url()));
  await page.locator(`${histRoot} [data-testid="jarvis-delete-confirm"]`).click();
  check(`[${label}] jarvis: delete is a POST to …/delete`, (await delReq).method() === "POST");
  await page.waitForFunction(([sel, n]) => document.querySelectorAll(`${sel} [data-testid="jarvis-history-item"]`).length === n - 1, [histRoot, histN], { timeout: 8000 }).catch(() => {});
  check(`[${label}] jarvis: conversation removed from history`, (await page.locator(`${histRoot} [data-testid="jarvis-history-item"]`).count()) === histN - 1);
  if (isMobile) {
    await page.locator('[data-testid="jarvis-history-sheet"] [data-testid="sheet-close"]').click();
    await page.click('[data-testid="jarvis-details-btn"]');
    check(`[${label}] jarvis: details drawer shows context, model and budget`, (await page.locator('[data-testid="jarvis-details-sheet"] [data-testid="jarvis-budget"]').count()) === 1 && /FIXTURE-sonnet-model/.test(await page.locator('[data-testid="jarvis-details-sheet"]').innerText()));
    await page.locator('[data-testid="jarvis-details-sheet"] [data-testid="sheet-close"]').click();
  }
  // memory / briefings / events
  await page.goto(`${BASE}/jarvis?tab=memory`);
  await settle(page);
  const memN = await page.locator('[data-testid="memory-item"]').count();
  check(`[${label}] jarvis memory: items with category, status, sources and author`, memN >= 2 && /Verified/i.test(await page.locator('[data-testid="jarvis-memory"]').innerText()) && /Sources: FIXTURE box scores/.test(await page.locator('[data-testid="jarvis-memory"]').innerText()));
  await page.fill('input[name="memory_text"]', "FIXTURE smoke note");
  await page.click('[data-testid="memory-add"]');
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="memory-item"]').length === n + 1, memN, { timeout: 8000 }).catch(() => {});
  check(`[${label}] jarvis memory: add note`, (await page.locator('[data-testid="memory-item"]').count()) === memN + 1);
  await page.locator('[data-testid="memory-item"]', { hasText: "FIXTURE smoke note" }).locator('[data-testid="memory-delete"]').click();
  const memDel = page.waitForRequest((r) => /\/jarvis\/memory\/\d+\/delete$/.test(r.url()));
  await page.locator('[data-testid="memory-delete-confirm"]').click();
  check(`[${label}] jarvis memory: delete with confirm is a POST`, (await memDel).method() === "POST");
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="memory-item"]').length === n, memN, { timeout: 8000 }).catch(() => {});
  await page.goto(`${BASE}/jarvis?tab=briefings`);
  await settle(page);
  const brText = await page.locator('[data-testid="jarvis-briefings"]').innerText();
  check(`[${label}] jarvis briefings: generator labels`, /Written by FIXTURE-haiku-model/.test(brText) && /Generated from stored records/.test(brText) && (await page.locator('[data-testid="briefing-kind"] option').count()) === 5);
  await page.selectOption('[data-testid="briefing-kind"]', "postgame");
  await page.click('[data-testid="briefing-run"]');
  await page.locator('[data-testid="briefing-result"]').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] jarvis briefings: the reason is shown when nothing was created`, /Nothing was created: FIXTURE: no games are final yet/.test(await page.locator('[data-testid="briefing-result"]').innerText().catch(() => "")));
  await page.goto(`${BASE}/jarvis?tab=events`);
  await settle(page);
  check(`[${label}] jarvis events: listed with severity`, (await page.locator('[data-testid="event-item"]').count()) === 3 && /Alert/i.test(await page.locator('[data-testid="event-item"]').first().innerText()));

  // --- JARVIS image attachments ---
  await page.goto(`${BASE}/jarvis`);
  await settle(page);
  const pngB64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 1200;
    const g = c.getContext("2d");
    g.fillStyle = "#123";
    g.fillRect(0, 0, 2400, 1200);
    g.fillStyle = "#fff";
    g.font = "64px sans-serif";
    g.fillText("FIXTURE PARLAY SLIP", 80, 200);
    return c.toDataURL("image/png").split(",")[1];
  });
  const png = (name) => ({ name, mimeType: "image/png", buffer: Buffer.from(pngB64, "base64") });
  const attCount = (root, n) => page.waitForFunction(([sel, k]) => document.querySelectorAll(`${sel} [data-testid="jarvis-attachment"]`).length === k, [root, n], { timeout: 10000 }).then(() => true).catch(() => false);
  check(`[${label}] attachments: hint, attach button and a multi-image picker without capture`, /Attach a parlay or pick slip screenshot/.test(await page.locator(`${P} [data-testid="jarvis-attach-hint"]`).innerText()) && (await page.locator(`${P} [data-testid="jarvis-file"]`).getAttribute("accept")) === "image/png,image/jpeg,image/webp,image/gif" && (await page.locator(`${P} [data-testid="jarvis-file"]`).getAttribute("multiple")) !== null && (await page.locator(`${P} [data-testid="jarvis-file"]`).getAttribute("capture")) === null);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null), page.click('[data-testid="jarvis-suggest-image"]')]);
  check(`[${label}] attachments: "Analyse a parlay screenshot" chip opens the file picker and focuses the composer`, chooser !== null && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "jarvis-input");
  await page.locator(`${P} [data-testid="jarvis-file"]`).setInputFiles([png("slip-1.png")]);
  check(`[${label}] attachments: thumbnail appears with an accessible remove button`, (await attCount(P, 1)) && (await page.locator(`${P} [data-testid="jarvis-attachment-remove"]`).getAttribute("aria-label")) === "Remove attachment 1: slip-1.png");
  await page.locator(`${P} [data-testid="jarvis-attachment-remove"]`).click();
  check(`[${label}] attachments: remove works`, await attCount(P, 0));
  await page.locator(`${P} [data-testid="jarvis-file"]`).setInputFiles([{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("FIXTURE text") }]);
  await page.locator(`${P} [data-testid="jarvis-attach-error"]`).waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] attachments: a non-image is refused inline`, /notes\.txt is not an image/.test(await page.locator(`${P} [data-testid="jarvis-attach-error"]`).innerText().catch(() => "")) && (await attCount(P, 0)));
  await page.locator(`${P} [data-testid="jarvis-file"]`).setInputFiles([png("a.png"), png("b.png"), png("c.png"), png("d.png")]);
  check(`[${label}] attachments: a fourth image is refused with a clear message`, (await attCount(P, 3)) && /at most 3 images/.test(await page.locator(`${P} [data-testid="jarvis-attach-error"]`).innerText().catch(() => "")));
  const ao = await overflow(page);
  check(`[${label}] attachments: composer with three thumbnails has no horizontal overflow`, !ao, ao ? JSON.stringify(ao) : "");
  await shot("jarvis-attachments");
  for (let k = 0; k < 2; k++) await page.locator(`${P} [data-testid="jarvis-attachment-remove"]`).first().click();
  await attCount(P, 1);
  // failed sends keep the attachment
  const imgReqs = [];
  const onImgReq = (r) => {
    if (/\/jarvis\/conversations\/\d+\/messages$/.test(r.url())) imgReqs.push(JSON.parse(r.postData() ?? "{}"));
  };
  page.on("request", onImgReq);
  await sendJ(P, "trigger-422 please");
  await page.locator(`${P} [data-testid="jarvis-error"]`).waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] attachments: a 422 is shown verbatim and the attachment is kept for a retry`, (await page.locator(`${P} [data-testid="jarvis-error"]`).innerText().catch(() => "")).trim() === "FIXTURE: the message body exceeds the allowed size." && (await attCount(P, 1)));
  await page.locator(`${P} [data-testid="jarvis-input"]`).fill("trigger-invalid-image");
  await page.locator(`${P} [data-testid="jarvis-input"]`).press("Enter");
  await page.waitForFunction(() => document.querySelector('[data-testid="jarvis-error"]')?.getAttribute("data-code") === "invalid_image", null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] attachments: invalid_image is shown verbatim and the attachment is kept`, (await page.locator(`${P} [data-testid="jarvis-error"]`).innerText().catch(() => "")).trim() === "FIXTURE: the attached image could not be read. Attach a PNG, JPEG, WebP or GIF under 1.5 MB." && (await attCount(P, 1)));
  // send with an image and no text
  await page.locator(`${P} [data-testid="jarvis-input"]`).fill("");
  check(`[${label}] attachments: sending is allowed with an image and no text`, await page.locator(`${P} [data-testid="jarvis-send"]`).isEnabled());
  await page.locator(`${P} [data-testid="jarvis-send"]`).click();
  await page.locator(`${P} [data-testid="jarvis-live"] [data-testid="jarvis-tool"]`).first().waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-testid="jarvis-page"] [data-testid="jarvis-live"]') && document.querySelectorAll('[data-testid="jarvis-page"] [data-testid="jarvis-message-image"]').length >= 1, null, { timeout: 15000 }).catch(() => {});
  const last = imgReqs[imgReqs.length - 1] ?? {};
  const sentImg = last.images?.[0] ?? {};
  const dims = await page.evaluate(async (b64) => {
    const im = new Image();
    im.src = `data:image/jpeg;base64,${b64}`;
    await im.decode();
    return [im.naturalWidth, im.naturalHeight];
  }, sentImg.data ?? "");
  check(`[${label}] attachments: uploaded as downscaled JPEG base64 without a data: prefix (longest side 1568)`, last.text === "" && last.images?.length === 1 && sentImg.media_type === "image/jpeg" && typeof sentImg.data === "string" && !sentImg.data.startsWith("data:") && sentImg.data.startsWith("/9j/") && dims[0] === 1568 && dims[1] === 784, JSON.stringify(dims));
  const slipAns = (await page.locator(`${P} [data-testid="jarvis-answer"]`).last().innerText()).replace(/\s+/g, " ");
  check(`[${label}] attachments: the answer's first table lists the legs read from the slip`, /FIXTURE Player A Over PTS/.test(await page.locator(`${P} [data-testid="jarvis-answer"]`).last().locator('[data-testid="md-table"]').first().innerText()) && /Sources \(3\)/.test(slipAns));
  if (!isMobile) check(`[${label}] attachments: stream showed the lookup, projection and combination tool labels`, (await page.locator('[data-testid="jarvis-right"] [data-testid="jarvis-tool"]').allInnerTexts()).join("|").match(/Looking up the player.*Loading model projections.*Evaluating the combination/s) !== null);
  check(`[${label}] attachments: composer is cleared after a successful send`, await attCount(P, 0));
  const loaded = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="jarvis-page"] [data-testid="jarvis-message-image"] img')].map((i) => [i.getAttribute("src"), i.complete && i.naturalWidth > 0]));
  await page.reload();
  await settle(page);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="jarvis-page"] [data-testid="jarvis-message-image"] img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
  const afterReload = await loaded();
  check(`[${label}] attachments: the image survives a reload, served by the message image route`, afterReload.length === 1 && /\/api\/v1\/jarvis\/messages\/\d+\/images\/0$/.test(afterReload[0][0]) && afterReload[0][1] === true, JSON.stringify(afterReload));
  await page.locator(`${P} [data-testid="jarvis-message-image"]`).first().click();
  check(`[${label}] attachments: clicking a thumbnail opens it larger`, (await page.locator('[data-testid="image-overlay"] img').count()) === 1);
  await page.keyboard.press("Escape");
  check(`[${label}] attachments: Esc closes the overlay and focus returns to the thumbnail`, (await page.locator('[data-testid="image-overlay"]').count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "jarvis-message-image");
  // paste path
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    const ta = document.querySelector('[data-testid="jarvis-page"] [data-testid="jarvis-input"]');
    ta.focus();
    ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, pngB64);
  check(`[${label}] attachments: pasting a screenshot into the textarea attaches it`, await attCount(P, 1));
  // drop target state
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "drag.png", { type: "image/png" }));
    document.querySelector('[data-testid="jarvis-page"] [data-testid="jarvis-conversation"]').dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  check(`[${label}] attachments: dragging files shows a visible drop target`, (await page.locator(`${P} [data-testid="jarvis-drop-target"]`).count()) === 1);
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
    document.querySelector('[data-testid="jarvis-page"] [data-testid="jarvis-conversation"]').dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, pngB64);
  check(`[${label}] attachments: dropping an image attaches it and clears the drop state`, (await attCount(P, 2)) && (await page.locator(`${P} [data-testid="jarvis-drop-target"]`).count()) === 0);
  page.off("request", onImgReq);
  errors.length = 0; // the 422 above logs an expected console error

  // --- JARVIS panel: launcher, context chip, Ctrl+J, Ask JARVIS ---
  const PN = '[data-testid="jarvis-panel"]';
  await page.goto(`${BASE}/games/FIX-G1`);
  await settle(page);
  await page.click('[data-testid="jarvis-launcher"]');
  await page.locator(`${PN} [data-testid="ctx-game"]`).waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] panel: opens from a game page with the game context chip`, /DET @ ORL/.test(await page.locator(`${PN} [data-testid="ctx-game"]`).innerText().catch(() => "")) && /\/games\/FIX-G1/.test(await page.locator(`${PN} [data-testid="ctx-page"]`).innerText().catch(() => "")));
  const box = await page.locator(PN).boundingBox();
  check(`[${label}] panel: ${isMobile ? "full-screen drawer on mobile" : "about 420px side panel on desktop"}`, box && (isMobile ? Math.round(box.width) === viewport.width && Math.round(box.height) === viewport.height : Math.round(box.width) === 420 && Math.round(box.x + box.width) === viewport.width), JSON.stringify(box));
  check(`[${label}] panel: focus moves to the question field on open`, (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "jarvis-input");
  check(`[${label}] panel: composer also accepts image attachments`, (await page.locator(`${PN} [data-testid="jarvis-attach"]`).count()) === 1 && (await page.locator(`${PN} [data-testid="jarvis-suggest-image"]`).count()) === 0);
  check(`[${label}] panel: context-specific suggestion first`, /What matters in DET @ ORL/.test(await page.locator(`${PN} [data-testid="jarvis-suggestion"]`).first().innerText().catch(() => "")));
  await sendJ(PN, "Summarise this game");
  check(`[${label}] panel: answers in place`, (await answered(PN, 1)) && (await page.locator(`${PN} [data-testid="md-table"]`).count()) === 1);
  const po = await overflow(page);
  check(`[${label}] panel has no horizontal overflow`, !po, po ? JSON.stringify(po) : "");
  {
    const inPanel = () => page.evaluate(() => Boolean(document.querySelector('[data-testid="jarvis-panel"]')?.contains(document.activeElement)));
    const starts = await inPanel();
    let held = true;
    for (let k = 0; k < 30; k++) {
      await page.keyboard.press("Tab");
      held = held && (await inPanel());
    }
    for (let k = 0; k < 6; k++) {
      await page.keyboard.press("Shift+Tab");
      held = held && (await inPanel());
    }
    check(`[${label}] panel: focus starts inside and Tab / Shift+Tab never leave it (36 presses)`, starts && held && (await page.locator('[data-testid="jarvis-panel"]').getAttribute("role")) === "dialog");
    check(`[${label}] panel: the page behind is inert while it is open`, await page.evaluate(() => { const m = document.getElementById("main"); return Boolean(m?.closest("[aria-hidden='true'], [inert]")) || getComputedStyle(document.body).pointerEvents === "none"; }));
  }
  await shot("jarvis-panel");
  await page.click('[data-testid="jarvis-panel-close"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="jarvis-panel"]') && document.activeElement?.getAttribute("data-testid") === "jarvis-launcher", null, { timeout: 3000 }).catch(() => {});
  check(`[${label}] panel: closes, and focus returns to the launcher that opened it`, (await page.locator(PN).count()) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "jarvis-launcher");
  await page.keyboard.press("Control+j");
  await page.locator(PN).waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] panel: Ctrl+J opens it and reuses the conversation while the context is unchanged`, (await page.locator(PN).count()) === 1 && (await answered(PN, 1)));
  check(`[${label}] panel: has an "Open full page" link to the same conversation`, /\/jarvis\?c=\d+/.test((await page.locator('[data-testid="jarvis-open-full"]').getAttribute("href")) ?? ""));
  await page.keyboard.press("Control+j");
  await page.goto(`${BASE}/players/9001`);
  await settle(page);
  await page.keyboard.press("Control+j");
  await page.locator(`${PN} [data-testid="ctx-player"]`).waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] panel: a new context starts a new conversation`, /FIXTURE Player A/.test(await page.locator(`${PN} [data-testid="ctx-player"]`).innerText().catch(() => "")) && (await page.locator(`${PN} [data-testid="jarvis-answer"]`).count()) === 0);
  await page.click('[data-testid="jarvis-panel-close"]');
  await page.goto(`${BASE}/parlays`);
  await settle(page);
  await page.locator('[data-combo-uid="FIX-D1"] [data-testid="combo-toggle"]').click();
  await page.locator('[data-combo-uid="FIX-D1"] [data-testid="ask-jarvis"]').click();
  await page.locator(`${PN} [data-testid="ctx-combo"]`).waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] panel: "Ask JARVIS" on a combination card passes the record`, /FIX-D1/.test(await page.locator(`${PN} [data-testid="ctx-combo"]`).innerText().catch(() => "")));
  await page.click('[data-testid="jarvis-panel-close"]');
  await page.click('[data-tab="picks"]');
  await settle(page);
  await page.locator('[data-testid="selection-row"] button').first().click();
  await page.locator('[data-testid="selection-card"] [data-testid="ask-jarvis"]').first().click();
  await page.locator(`${PN} [data-testid="ctx-selection"]`).waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] panel: "Ask JARVIS" on a selection card passes the record`, (await page.locator(`${PN} [data-testid="ctx-selection"]`).count()) === 1);
  await page.click('[data-testid="jarvis-panel-close"]');

  // --- AI budget ---
  text = await visit(page, "/admin/ai-budget", label, errors);
  check(`[${label}] ai budget: lifetime bar with the suspend line and five checkpoints`, (await page.locator('[data-testid="budget-suspend-line"]').count()) === 1 && (await page.locator('[data-testid="budget-checkpoints"] li').count()) === 6 && /Suspends at \$95\.00/.test(text) && /10% · \$10\.00 reached/.test(text));
  check(`[${label}] ai budget: four allocation bars, today vs daily cap`, (await page.locator('[data-testid="budget-buckets"] [data-testid="budget-bar"]').count()) === 4 && /Today vs daily cap/.test(text));
  check(`[${label}] ai budget: tables by model / task / agent, prices, notes verbatim, recent requests`, /By model/i.test(text) && /By task/i.test(text) && /By agent/i.test(text) && /jarvis\.chat/.test(text) && (await page.locator('[data-testid="budget-notes"] li').count()) === 2 && text.includes("FIXTURE note: requests stop at the suspend line unless the safety buffer is released.") && /provider timeout; reservation released/.test(text));
  check(`[${label}] ai budget: totals, cache savings, average per day, estimated days, daily chart`, /\$2\.26/.test(text) && /\$0\.88/.test(text) && /94/.test(text) && (await page.locator('[data-testid="budget-chart"] .recharts-bar-rectangle').count()) === 30);
  await page.click('[data-testid="budget-pause-btn"]');
  check(`[${label}] ai budget: emergency pause asks for confirmation`, (await page.locator('[data-testid="budget-pause"]').getAttribute("data-on")) === "0" && /Pause every model request now\?/.test(await page.locator('[data-testid="budget-pause"]').innerText()));
  const pauseReq = page.waitForRequest((r) => r.url().endsWith("/api/v1/admin/ai-budget") && r.method() !== "GET");
  await page.click('[data-testid="budget-pause-confirm"]');
  const pr2 = await pauseReq;
  check(`[${label}] ai budget: pause issues a POST with {paused:true}`, pr2.method() === "POST" && JSON.parse(pr2.postData() ?? "{}").paused === true && pr2.headers()["x-csrf-token"] === "fixture-csrf-token");
  await page.waitForFunction(() => document.querySelector('[data-testid="budget-pause"]')?.getAttribute("data-on") === "1", null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] ai budget: paused state is shown`, (await page.locator('[data-testid="budget-pause"]').getAttribute("data-on")) === "1" && /Paused/i.test(await page.locator('[data-testid="budget-state"]').innerText()));
  await page.click('[data-testid="budget-pause-btn"]');
  await page.click('[data-testid="budget-pause-confirm"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="budget-pause"]')?.getAttribute("data-on") === "0", null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] ai budget: briefings and safety-buffer toggles present`, (await page.locator('[data-testid="budget-briefings"]').count()) === 1 && /last \$5\.00 up to the \$100\.00 cap|remaining \$5\.00 up to the cap/.test(await page.locator('[data-testid="budget-buffer"]').innerText()));
  await page.click('[data-testid="budget-edit"]');
  await page.fill('input[name="allocation_sonnet"]', "500");
  await page.click('[data-testid="budget-save"]');
  await page.locator('[data-testid="budget-form-error"]').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] ai budget: server 422 message shown verbatim`, (await page.locator('[data-testid="budget-form-error"]').innerText().catch(() => "")).trim() === "FIXTURE: allocations exceed the lifetime cap.");
  await shot("ai-budget", { fullPage: true });
  check(`[${label}] JARVIS and budget flows raised no unexpected page/console errors`, errors.filter((e) => !/status of (422|500)|ERR_|Failed to fetch|network/i.test(e)).length === 0, errors.join(" | "));
  errors.length = 0;

  await liveFlow(page, label, errors, shot);

  await cortexFlow(page, label, errors, shot);

  // --- redirects ---
  for (const [from, to] of [["/today", "/"], ["/research", "/research/daily"], ["/props", "/player-props"]]) {
    await page.goto(`${BASE}${from}`);
    check(`[${label}] ${from} redirects to ${to}`, new URL(page.url()).pathname === to, page.url());
  }

  // --- logout ---
  await page.goto(`${BASE}/settings`);
  await settle(page);
  if (isMobile) await page.click('[data-testid="more-button"]');
  else await page.click('[data-testid="account-button"]');
  check(`[${label}] account: the signed-in email is shown beside Log out`, /owner@fixture\.test/.test(await page.locator(isMobile ? '[data-testid="all-pages"]' : '[data-testid="account-menu"]').innerText()));
  await Promise.all([page.waitForURL((u) => u.pathname === "/login"), page.locator('[data-testid="logout"]:visible').click()]);
  await page.goto(`${BASE}/`);
  check(`[${label}] logout clears the session`, new URL(page.url()).pathname === "/login", page.url());
  await context.close();
}

/**
 * Large-slate guardrail. The mock swaps today's slate for ~1,600 selections, 68 combinations, 640 Kalshi
 * contracts and 26 model evaluations with big nested metrics; no page may render an unbounded list.
 */
async function largeSlate(browser) {
  const LIMITS = [[1440, 900, 12000], [390, 844, 15000]];
  const routes = [...NAV, "/games/FIX-L1", "/players/9001", "/kalshi-intelligence/KXFIX-L-20000-pts-5", "/markets", "/simulations", "/backtesting", "/exposure", "/admin/ai-budget", "/live/following", "/live/research-tracker", "/games/FIX-G1?tab=boxscore", "/games/FIX-G1?tab=plays", "/games/FIX-G1?tab=rotations", "/cortex?tab=encyclopedia", "/cortex?tab=playbook", "/cortex?tab=statistics", "/cortex?tab=player-dna", "/cortex?tab=player-dna&player=9001", "/cortex?tab=team-dna", "/cortex?tab=team-dna&team=1", "/cortex?tab=coach-dna", "/cortex?tab=coach-dna&team=1", "/cortex?tab=research", "/cortex?tab=sources", "/cortex?tab=coverage", "/cortex?tab=evaluations", "/cortex/fix-shot-clock"];
  for (const [width, height, maxHeight] of LIMITS) {
    const tag = `large ${width}`;
    console.log(`\n== large slate ${width}x${height} ==`);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
    const page = await context.newPage();
    const errors = watch(page);
    await login(page);
    const toggle = (on) => page.evaluate((v) => fetch("/api/v1/__mock/large", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": "fixture-csrf-token" }, body: JSON.stringify({ on: v }) }).then((r) => r.json()), on);
    try {
      check(`[${tag}] large-slate mode switched on`, (await toggle(true)).large === true);
      await mockLive(page, { phase: 4, stale: false, streamError: false }); // the scripted game is final: the longest box score, play list and rotation chart
      const sel = [];
      page.on("request", (r) => {
        const u = new URL(r.url());
        if (u.pathname.endsWith("/api/v1/selections")) sel.push([new URL(page.url()).pathname, u.searchParams]);
      });
      for (const route of routes) {
        await page.goto(`${BASE}${route}`);
        await settle(page);
        const m = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, chars: document.querySelector("main")?.innerText.length ?? 0, err: document.querySelectorAll('[data-state="error"]').length }));
        check(`[${tag}] ${route} is at most ${maxHeight}px tall`, m.h <= maxHeight, `${m.h}px`);
        check(`[${tag}] ${route} shows no error state`, m.err === 0);
        const o = await overflow(page);
        check(`[${tag}] ${route} has no horizontal overflow`, !o, o ? JSON.stringify(o) : "");
        if (route === "/live") check(`[${tag}] /live lists the nine-game slate and the strip scrolls inside its own box`, (await page.locator('[data-testid="live-card"]').count()) === 9 && (await page.locator('[data-testid="strip-card"]').count()) === 9);
        if (route === "/players/compare") check(`[${tag}] compare is not blank on first load`, m.chars > 400 && (await page.locator('[data-testid="compare-table"]').count()) === 1, `${m.chars} chars`);
        if (route === "/players/history") check(`[${tag}] history is not blank on first load`, m.chars > 400 && (await page.locator('[data-testid="history-quick-link"]').count()) >= 10, `${m.chars} chars`);
        if (route === "/picks") check(`[${tag}] picks renders at most five rows per game`, (await page.locator('[data-testid="selection-row"]').count()) === 45);
        if (route === "/research/daily") {
          check(`[${tag}] editions: rejected list is paged 20 at a time with the total stated`, (await page.locator('[data-testid="edition-rejected-row"]').count()) === 20 && /not qualified in total — showing the 200 most relevant/.test(await bodyText(page)));
          check(`[${tag}] editions: diff/edition view states it works on bounded data`, /at most 150 qualified and watchlist rows/.test(await bodyText(page)));
        }
        if (route === "/models") check(`[${tag}] models: details collapsed by default, nested metrics as tables`, (await page.locator('[data-testid="registry-item"]').count()) >= 26 && (await page.locator('[data-testid="registry-details"][open]').count()) === 0);
        if (route === "/parlays/same-game") check(`[${tag}] same-game: grouped by game`, (await page.locator('[data-testid="combo-card"]').count()) === 18);
        if (route === "/injuries") check(`[${tag}] injuries: off-slate teams collapsed in one closed group`, (await page.locator('[data-testid="injury-game-group"]:not([open])').count()) === 1 && (await page.locator('[data-testid="injury-game-group"][open]').count()) === 9);
      }
      const by = (path) => sel.filter(([p]) => p === path).map(([, q]) => q);
      for (const path of ["/picks", "/builder"]) {
        const reqs = by(path);
        check(`[${tag}] ${path} issues paginated /selections requests`, reqs.length >= 1 && reqs.every((q) => Number(q.get("limit")) > 0 && Number(q.get("limit")) <= 1000), reqs.map((q) => q.toString()).join(" | "));
      }
      check(`[${tag}] no page issues an unbounded /selections request (incl. /research/daily)`, sel.every(([, q]) => Number(q.get("limit")) > 0 && Number(q.get("limit")) <= 1000), sel.filter(([, q]) => !q.get("limit")).map(([p]) => p).join(","));
      // a model's details expand into tables, not a JSON dump
      await page.goto(`${BASE}/models`);
      await settle(page);
      await page.locator('[data-testid="registry-details"] summary').first().click();
      check(`[${tag}] models: calibration renders as a table`, (await page.locator('[data-testid="registry-details"][open] [data-testid="metrics-table"]').count()) >= 1 && !/\{"/.test(await page.locator('[data-testid="registry-details"][open]').innerText()));
      check(`[${tag}] large slate raised no page/console errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
    } finally {
      await toggle(false).catch(() => {});
      await mockLive(page, { phase: 0 }).catch(() => {});
      await context.close();
    }
  }
}

/** Design-review gallery: the ten key pages at every viewport, plus an overflow check at each width. */
async function gallery(browser) {
  for (const [width, height] of VIEWPORTS) {
    const tag = `${width}x${height}`;
    console.log(`\n== gallery ${tag} ==`);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
    const page = await context.newPage();
    const errors = watch(page);
    await login(page);
    await mockLive(page, { phase: 3, stale: false, streamError: false });
    for (const [route, name] of GALLERY) {
      await page.goto(`${BASE}${route}`);
      await settle(page);
      const o = await overflow(page);
      check(`[${tag}] ${route} has no horizontal overflow`, !o, o ? JSON.stringify(o) : "");
      await page.screenshot({ path: join(SHOTS, `${tag}-${name}.png`), fullPage: false });
      await page.screenshot({ path: join(SHOTS, `${tag}-${name}-full.png`), fullPage: true });
    }
    // Player Props with the research drawer open
    await page.goto(`${BASE}/player-props`);
    await settle(page);
    if (width >= 1280) await page.locator('[data-testid="market-row"]').first().click();
    else {
      await page.locator('[data-testid="prop-card-toggle"]').first().click();
      await page.locator('[data-testid="prop-open"]').first().click();
    }
    await page.locator('[data-testid="prop-drawer"] [data-testid="history-summary"]').waitFor({ timeout: 10000 }).catch(() => {});
    check(`[${tag}] props drawer opens`, (await page.locator('[data-testid="prop-drawer"] [data-testid="history-chart"]').count()) === 1);
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SHOTS, `${tag}-player-props-drawer.png`), fullPage: false });
    await mockLive(page, { phase: 0 });
    check(`[${tag}] gallery raised no page/console errors`, errors.length === 0, errors.join(" | "));
    await context.close();
  }
}

/** A viewer account must see the owner-only message on the AI budget page. */
async function viewerRole(browser) {
  console.log("\n== viewer role ==");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', "viewer@fixture.test");
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click('button[type="submit"]')]);
  await page.goto(`${BASE}/admin/ai-budget`);
  await settle(page);
  const t = await page.locator('[data-testid="budget-forbidden"]').innerText().catch(() => "");
  check("[viewer] /admin/ai-budget shows the 403 message from the server", /Owner access required/i.test(t) && t.includes("FIXTURE: this area is available to the owner account only.") && (await page.locator('[data-testid="ai-budget"]').count()) === 0, t);
  await page.goto(`${BASE}/live`);
  await settle(page);
  await page.locator('[data-testid="live-card"] [data-testid="follow-btn"]').first().click();
  await page.locator('[data-testid="follow-error"]').waitFor({ timeout: 8000 }).catch(() => {});
  const fe = await page.locator('[data-testid="follow-error"]').innerText().catch(() => "");
  await page.reload();
  await settle(page);
  check("[viewer] following is refused with the server's 403 message and nothing is followed", fe.includes("FIXTURE: following requires the owner account.") && (await page.locator('[data-testid="live-following"]').count()) === 0, fe);
  await page.goto(`${BASE}/cortex?tab=evaluations`);
  await settle(page);
  const ce = await page.locator('[data-testid="evaluations-forbidden"]').innerText().catch(() => "");
  check("[viewer] CORTEX evaluations shows the server's 403 message and no benchmark", /Owner access required/i.test(ce) && ce.includes("FIXTURE: this area is available to the owner account only.") && (await page.locator('[data-testid="evaluations"]').count()) === 0, ce);
  await page.goto(`${BASE}/cortex`);
  await settle(page);
  check("[viewer] the rest of CORTEX is readable by a viewer", (await page.locator('[data-testid="cortex-overview"]').count()) === 1 && (await page.locator('[data-state="error"]').count()) === 0);
  await context.close();
}

/** The PWA manifest and icons are public static files; no service worker is registered. */
async function pwa(browser) {
  console.log("\n== pwa ==");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const res = await page.request.get(`${BASE}/manifest.webmanifest`, { maxRedirects: 0 });
  const m = res.status() === 200 ? await res.json().catch(() => null) : null;
  check("[pwa] manifest is served without a session", res.status() === 200 && m !== null, `status ${res.status()}`);
  check("[pwa] manifest: name, start_url /live, standalone, theme colours", m?.name === "GIZER NBA" && m?.start_url === "/live" && m?.display === "standalone" && Boolean(m?.theme_color) && Boolean(m?.background_color), JSON.stringify(m)?.slice(0, 200));
  let iconsOk = Array.isArray(m?.icons) && m.icons.length >= 2;
  for (const ic of m?.icons ?? []) {
    const r = await page.request.get(`${BASE}${ic.src}`, { maxRedirects: 0 });
    iconsOk = iconsOk && r.status() === 200 && /image\/png/.test(r.headers()["content-type"] ?? "");
  }
  check("[pwa] manifest icons are static PNG files that load", iconsOk);
  await page.goto(`${BASE}/login`);
  const head = await page.evaluate(() => ({ manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"), apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"), capable: document.querySelector('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]')?.getAttribute("content"), sw: "serviceWorker" in navigator ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : 0 }));
  check("[pwa] pages link the manifest and the iOS home-screen meta", head.manifest === "/manifest.webmanifest" && Boolean(head.apple) && head.capable === "yes", JSON.stringify(head));
  check("[pwa] no service worker is registered", (await page.evaluate(() => ("serviceWorker" in navigator ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : 0))) === 0);
  await context.close();
}

const browser = await chromium.launch();
try {
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === "flows") {
    await runViewport(browser, "desktop", { width: 1440, height: 900 });
    await runViewport(browser, "mobile", { width: 390, height: 844 });
  }
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === "flows") await viewerRole(browser);
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === "flows") await pwa(browser);
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === "large") await largeSlate(browser);
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === "gallery") await gallery(browser);
} finally {
  await browser.close();
}

console.log(`\nSmoke result: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
