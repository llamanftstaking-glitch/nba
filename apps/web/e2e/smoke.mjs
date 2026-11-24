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
import { mkdirSync } from "node:fs";
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

const NAV = ["/", "/games", "/picks", "/player-props", "/kalshi-intelligence", "/lineups", "/parlays", "/parlays/same-game", "/players", "/minutes", "/players/compare", "/players/history", "/matchups", "/injuries", "/builder", "/tickets", "/research/daily", "/results", "/performance", "/research-lab", "/agents", "/models", "/data-health", "/settings"];
const OTHER = ["/kalshi-intelligence/KXFIX-A-PTS25", "/kalshi-intelligence/KXFIX-A-DD", "/games/FIX-G1", "/games/FIX-G2", "/players/9001", "/players/9004", "/players/compare?ids=9001,9005", "/teams", "/teams/1", "/exposure", "/markets", "/simulations", "/backtesting", "/admin"];
// The ten pages captured at every viewport for design review.
const GALLERY = [["/", "overview"], ["/games", "games"], ["/lineups", "lineups"], ["/player-props", "player-props"], ["/players/9001", "player-profile"], ["/games/FIX-G1", "game"], ["/parlays", "parlays"], ["/results", "results"], ["/agents", "agents"], ["/data-health", "data-health"], ["/kalshi-intelligence", "kalshi"], ["/kalshi-intelligence/KXFIX-A-PTS25", "kalshi-detail"], ["/minutes", "minutes"], ["/injuries", "injuries"]];
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
  await page.waitForLoadState("networkidle").catch(() => {});
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

/** Smallest rendered font size among visible text nodes (the design system floor is 11px). */
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
  const scan = text.split(DISCLAIMER).join(" ");
  const hit = FORBIDDEN.find((re) => re.test(scan));
  check(`[${label}] ${route} has no forbidden vocabulary`, !hit, hit ? `${hit} near "${scan.slice(Math.max(0, scan.search(hit) - 30), scan.search(hit) + 40).replace(/\s+/g, " ")}"` : "");
  const mf = await minFont(page);
  check(`[${label}] ${route} has no text below 11px`, mf >= 11, `smallest ${mf}px`);
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

  // --- navigation ---
  await visit(page, "/", label, errors);
  if (isMobile) {
    const nav = (await page.locator('[data-testid="bottom-nav"]').innerText()).replace(/\s+/g, " ").trim();
    check(`[${label}] bottom nav is Home | Games | Props | Parlays | More`, nav === "Home Games Props Parlays More", nav);
    const small = await page.evaluate(() => [...document.querySelectorAll('[data-testid="bottom-nav"] a, [data-testid="bottom-nav"] button')].filter((e) => e.getBoundingClientRect().height < 44).length);
    check(`[${label}] bottom nav targets are at least 44px`, small === 0, `${small} too small`);
    await page.click('[data-testid="more-button"]');
    await page.waitForSelector('[role="dialog"]');
    check(`[${label}] More sheet lists the navigation groups`, (await page.locator('[role="dialog"] a').count()) >= 24 && /Kalshi Markets/.test(await page.locator('[role="dialog"]').innerText()) && /Minutes Intelligence/.test(await page.locator('[role="dialog"]').innerText()));
    await shot("more-sheet");
    await page.keyboard.press("Escape");
  } else {
    const side = await page.locator('[data-testid="sidebar"]').innerText();
    check(`[${label}] sidebar has the four groups`, ["COMMAND CENTER", "PLAYER INTELLIGENCE", "MY RESEARCH", "SYSTEM"].every((g) => side.toUpperCase().includes(g)));
    check(`[${label}] sidebar has 24 destinations incl. Kalshi Markets and Minutes Intelligence`, (await page.locator('[data-testid="sidebar"] nav a').count()) === 24 && /Kalshi Markets/.test(side) && /Minutes Intelligence/.test(side));
    check(`[${label}] brand caption present`, /PARLAY COMMAND CENTER/i.test(side));
  }

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
  const order = await page.evaluate(() => {
    const y = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
    return [y('[data-testid="stat-strip"]'), y('[data-testid="game-card"]'), y('[data-testid="overview-props"]'), y("#high-confidence"), y('[data-testid="ops-status"]')];
  });
  check(`[${label}] overview: basketball first, diagnostics last`, order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), order.join(","));
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
  check(`[${label}] kalshi: moves use the neutral data hue, not green/red`, upColor === "rgb(125, 196, 240)", upColor);
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
  check(`[${label}] player: Kalshi threshold ladder linking to the detail`, (await page.locator('#kalshi [data-testid="kalshi-compact-row"]').count()) === 3 && /\/kalshi-intelligence\/KXFIX-A-PTS25/.test((await page.locator('#kalshi [data-testid="kalshi-compact-row"]').first().getAttribute("href")) ?? "") && />= 25/.test(await page.locator("#kalshi").innerText()));
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
  check(`[${label}] parlays: individual picks tab`, (await page.locator('[data-testid="selection-card"]').count()) === 3);
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
  await page.locator("select").filter({ hasText: "All evaluated" }).first().selectOption("all");
  await page.locator('[data-testid="builder-option"]', { hasText: "FIXTURE Player B Under 8.5 REB" }).locator('[data-testid="builder-add"]').click();
  await openDrawer();
  await page.locator('[data-testid="unreliable-banner"]:visible').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] builder: warning banner when reliable is false`, (await page.locator('[data-testid="unreliable-banner"]:visible').count()) === 1 && (await page.locator('[data-testid="builder-warnings"]:visible').count()) === 1);
  await shot("builder");
  o = await overflow(page);
  check(`[${label}] builder has no horizontal overflow`, !o, o ? JSON.stringify(o) : "");
  await closeDrawer();
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

  // --- redirects ---
  for (const [from, to] of [["/today", "/"], ["/research", "/research/daily"], ["/props", "/player-props"]]) {
    await page.goto(`${BASE}${from}`);
    check(`[${label}] ${from} redirects to ${to}`, new URL(page.url()).pathname === to, page.url());
  }

  // --- logout ---
  await page.goto(`${BASE}/settings`);
  await settle(page);
  if (isMobile) await page.click('[data-testid="more-button"]');
  await Promise.all([page.waitForURL((u) => u.pathname === "/login"), page.locator('[data-testid="logout"]:visible').click()]);
  await page.goto(`${BASE}/`);
  check(`[${label}] logout clears the session`, new URL(page.url()).pathname === "/login", page.url());
  await context.close();
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
    check(`[${tag}] gallery raised no page/console errors`, errors.length === 0, errors.join(" | "));
    await context.close();
  }
}

const browser = await chromium.launch();
try {
  if (process.env.SMOKE_ONLY !== "gallery") {
    await runViewport(browser, "desktop", { width: 1440, height: 900 });
    await runViewport(browser, "mobile", { width: 390, height: 844 });
  }
  if (process.env.SMOKE_ONLY !== "flows") await gallery(browser);
} finally {
  await browser.close();
}

console.log(`\nSmoke result: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
