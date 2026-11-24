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
// The mandated footer sentence itself contains one of the listed words; it is removed before the vocabulary scan.
const FORBIDDEN = [/\block\b/i, /\blocks\b/i, /guaranteed/i, /guarantee\b/i, /free money/i, /risk[- ]free/i, /can(?:[’']?t|not) lose/i, /sure thing/i];

const PRIMARY = ["/", "/games", "/picks", "/parlays", "/parlays/same-game", "/props", "/tickets", "/results", "/performance", "/research-lab", "/agents", "/settings"];
const SECONDARY = ["/games/FIX-G1", "/games/FIX-G2", "/players", "/players/9001", "/players/9004", "/teams", "/teams/1", "/injuries", "/research/daily", "/builder", "/exposure", "/markets", "/simulations", "/backtesting", "/data-health", "/admin"];
const NO_OVERFLOW_REQUIRED = ["/", "/games", "/parlays", "/results"];

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passed++;
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const slug = (route) => (route === "/" ? "command-center" : route.replace(/^\//, "").replace(/[/?=&]/g, "-"));

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-state="loading"]'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(150);
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const over = doc.scrollWidth - doc.clientWidth;
    if (over <= 1) return null;
    // name the widest offender to make failures actionable
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

async function visit(page, route, label, errors) {
  const before = errors.length;
  const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  check(`[${label}] ${route} responds 200`, res && res.status() === 200, `status ${res?.status()}`);
  check(`[${label}] ${route} stays authenticated`, !new URL(page.url()).pathname.startsWith("/login"), page.url());
  const text = await page.evaluate(() => document.body.innerText);
  check(`[${label}] ${route} renders a heading`, (await page.locator("h1").count()) > 0);
  check(`[${label}] ${route} has no failed render`, !/Application error|Unhandled Runtime Error|This page could not be found/i.test(text));
  check(`[${label}] ${route} shows no error state`, (await page.locator('[data-state="error"]').count()) === 0);
  check(`[${label}] ${route} finished loading`, (await page.locator('[data-state="loading"]').count()) === 0);
  check(`[${label}] ${route} shows the research notice`, text.includes(DISCLAIMER));
  const scan = text.split(DISCLAIMER).join(" ");
  const hit = FORBIDDEN.find((re) => re.test(scan));
  check(`[${label}] ${route} has no forbidden vocabulary`, !hit, hit ? `${hit} near "${scan.slice(Math.max(0, scan.search(hit) - 30), scan.search(hit) + 40).replace(/\s+/g, " ")}"` : "");
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

async function runViewport(browser, label, viewport) {
  console.log(`\n== ${label} ${viewport.width}x${viewport.height} ==`);
  const isMobile = label === "mobile";
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile, hasTouch: isMobile });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/401 \(Unauthorized\)/.test(t)) return; // expected while testing the bad-password and signed-out paths
    errors.push(`console: ${t}`);
  });
  const shot = (name, opts = {}) => page.screenshot({ path: join(SHOTS, `${label}-${name}.png`), fullPage: true, ...opts });

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
  check(`[${label}] login lands on the Command Center`, new URL(page.url()).pathname === "/games" || new URL(page.url()).pathname === "/", page.url());

  // --- every route ---
  for (const route of [...PRIMARY, ...SECONDARY]) {
    await visit(page, route, label, errors);
    if (isMobile) {
      const o = await overflow(page);
      const required = NO_OVERFLOW_REQUIRED.includes(route);
      check(`[${label}] ${route} has no horizontal overflow${required ? " (required)" : ""}`, !o, o ? JSON.stringify(o) : "");
    }
    await shot(slug(route));
    if (["/", "/results", "/games/FIX-G1", "/parlays", "/builder"].includes(route)) await shot(`${slug(route)}-viewport`, { fullPage: false });
  }

  // --- 375px check for the critical routes ---
  if (isMobile) {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const route of NO_OVERFLOW_REQUIRED) {
      await page.goto(`${BASE}${route}`);
      await settle(page);
      const o = await overflow(page);
      check(`[375px] ${route} has no horizontal overflow`, !o, o ? JSON.stringify(o) : "");
    }
    await page.setViewportSize(viewport);
  }

  // --- Command Center specifics ---
  let text = await visit(page, "/", label, errors);
  check(`[${label}] command center: explicit empty high-confidence message`, text.includes("No selection met the high-confidence criteria for this slate. That is a valid research outcome."));
  check(`[${label}] command center: three game cards`, (await page.locator('[data-testid="game-card"]').count()) === 3);
  check(`[${label}] command center: no_picks_reason is shown`, (await page.locator('[data-testid="no-picks-reason"]').first().innerText()).includes("FIXTURE: all 3 evaluated selections were rejected"));
  check(`[${label}] command center: game with two picks`, (await page.locator('[data-game-id="FIX-G1"] [data-testid="pick-row"]').count()) === 2);
  check(`[${label}] command center: probability with interval`, /58\.2%\s*\[53\.2–63\.2\]/.test(text), "expected 58.2% [53.2–63.2]");
  check(`[${label}] command center: tipoff shown in ET`, /\d{1,2}:\d{2}\s?(AM|PM) ET/.test(text));
  check(`[${label}] command center: unavailable values use the explicit marker`, (await page.locator('[aria-label="not available"]').count()) > 0);
  check(`[${label}] date selector lists available dates`, (await page.locator('[data-testid="date-selector"] option').count()) >= 3);
  if (isMobile) {
    check(`[${label}] bottom navigation visible`, await page.locator('[data-testid="bottom-nav"]').isVisible());
    await page.click('[data-testid="more-button"]');
    await page.waitForSelector('[role="dialog"]');
    check(`[${label}] More sheet lists remaining pages`, (await page.locator('[role="dialog"] a').count()) >= 15);
    await shot("more-sheet", { fullPage: false });
    await page.keyboard.press("Escape");
  } else {
    check(`[${label}] sidebar visible with 12 primary items`, (await page.locator('[data-testid="sidebar"] nav a').count()) >= 12);
  }

  // --- date navigation (historical date keeps original edition) ---
  await page.click('button[aria-label="Previous day"]');
  await page.waitForURL(/date=\d{4}-\d{2}-\d{2}/);
  await settle(page);
  text = await page.evaluate(() => document.body.innerText);
  check(`[${label}] previous-day arrow puts the date in the URL and loads the historical slate`, /historical date/.test(text) && text.includes("MIA"));
  await shot("command-center-historical");

  // --- Parlays ---
  await visit(page, "/parlays", label, errors);
  check(`[${label}] parlays: eight tabs`, (await page.locator('[role="tab"]').count()) === 8);
  check(`[${label}] parlays: 2-Leg count from counts`, (await page.locator('[data-tab="double"]').innerText()).replace(/\s+/g, " ").includes("2-Leg 3"));
  check(`[${label}] parlays: three combo cards`, (await page.locator('[data-testid="combo-card"]').count()) === 3);
  check(`[${label}] parlays: invalidated combo flagged`, (await page.locator('[data-testid="combo-invalidated"]').count()) === 1);
  await page.locator('[data-combo-uid="FIX-D1"] [data-testid="combo-toggle"]').click();
  await page.waitForSelector('[data-combo-uid="FIX-D1"] [data-testid="combo-detail"]');
  let detail = await page.locator('[data-combo-uid="FIX-D1"] [data-testid="combo-detail"]').innerText();
  check(`[${label}] parlays: no-quote text`, detail.includes("No verified combined sportsbook quote — research only"));
  check(`[${label}] parlays: reference price label`, /Arithmetic product of leg prices — not a sportsbook quote/i.test(detail));
  check(`[${label}] parlays: independent vs adjusted probability`, /Independent product/i.test(detail) && /Correlation-adjusted/i.test(detail));
  if (isMobile) {
    const o = await overflow(page);
    check(`[${label}] parlays expanded card has no horizontal overflow`, !o, o ? JSON.stringify(o) : "");
  }
  await shot("parlays-expanded");
  await page.locator('[data-combo-uid="FIX-D2"] [data-testid="combo-toggle"]').click();
  detail = await page.locator('[data-combo-uid="FIX-D2"] [data-testid="combo-detail"]').innerText();
  check(`[${label}] parlays: observed quote shown when present`, /Observed combined quote/i.test(detail) && !detail.includes("No verified combined sportsbook quote"));
  await page.click('[data-tab="quad"]');
  await settle(page);
  check(`[${label}] parlays: empty category has explicit empty state`, (await page.locator('[data-state="empty"]').innerText()).includes("No 4-leg combination met the research criteria"));
  await page.click('[data-tab="picks"]');
  await settle(page);
  check(`[${label}] parlays: individual picks tab lists qualified selections`, (await page.locator('[data-testid="selection-card"]').count()) === 3);
  await page.locator('[data-testid="evidence-toggle"]').first().click();
  check(`[${label}] selection: evidence panel expands`, await page.locator('[data-testid="evidence-panel"]').first().isVisible());
  check(`[${label}] selection: evidence meter is labelled separately`, /Evidence\s*72\s*\/100/.test((await page.locator('[data-testid="evidence-meter"]').first().innerText()).replace(/\n/g, " ")));
  await shot("parlays-picks-evidence");

  // --- Game page ---
  await visit(page, "/games/FIX-G1", label, errors);
  await page.click('[data-testid="toggle-all-selections"]');
  check(`[${label}] game: rejected selections listed with reasons`, (await page.locator('[data-testid="rejection-inline"]').first().innerText()).includes("FIXTURE: edge below the minimum threshold."));
  await shot("game-all-selections");

  // --- Results ---
  text = await visit(page, "/results", label, errors);
  check(`[${label}] results: all six engine rows`, ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "FIVE", "SIX"].every((e) => text.includes(`${e} ·`)));
  check(`[${label}] results: empty engines say n=0`, (await page.locator('[data-testid="engine-empty"]:visible').count()) === 3);
  check(`[${label}] results: API disclaimer rendered`, (await page.locator('[data-testid="results-disclaimer"]').innerText()).startsWith("FIXTURE disclaimer"));
  check(`[${label}] results: charts rendered`, (await page.locator('[data-testid="calibration-chart"] svg').count()) > 0 && (await page.locator('[data-testid="equity-chart"] svg').count()) > 0);
  check(`[${label}] results: winning and losing tickets both listed`, /Win/i.test(text) && /Loss/i.test(text) && (await page.locator('[data-testid="forensic-report"]').count()) === 2);
  await page.locator('[data-testid="results-filters"] select').nth(1).selectOption("QUAD");
  await settle(page);
  await page.waitForFunction(() => /no settled records match these filters/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] results: filter with no records shows n=0 state`, /n=0 — no settled records match these filters/.test(await page.evaluate(() => document.body.innerText)));

  // --- Builder ---
  await visit(page, "/builder", label, errors);
  const openDrawer = async () => {
    if (!isMobile) return;
    const d = page.locator('[data-testid="builder-drawer"]');
    if ((await d.getAttribute("data-open")) !== "1") await page.click('[data-testid="builder-drawer-toggle"]');
  };
  const closeDrawer = async () => {
    if (!isMobile) return;
    const d = page.locator('[data-testid="builder-drawer"]');
    if ((await d.getAttribute("data-open")) === "1") await page.click('[data-testid="builder-drawer-toggle"]');
  };
  const evalLoc = page.locator('[data-testid="builder-evaluation"]:visible');
  check(`[${label}] builder: qualified selections offered`, (await page.locator('[data-testid="builder-add"]').count()) === 3);
  const evalRequests = [];
  page.on("request", (r) => {
    if (r.url().includes("/builder/evaluate")) evalRequests.push(r.postData());
  });
  await page.locator('[data-testid="builder-add"]').first().click();
  await page.locator('[data-testid="builder-add"]').first().click(); // list re-renders; first remaining "Add"
  await openDrawer();
  await evalLoc.waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] builder: evaluation shown after adding two legs`, (await evalLoc.count()) === 1);
  check(`[${label}] builder: POST /builder/evaluate was called`, evalRequests.length >= 1, `calls=${evalRequests.length}`);
  const joint2 = (await page.locator('[data-testid="builder-joint"]:visible').innerText().catch(() => "")).replace(/\s+/g, " ");
  check(`[${label}] builder: joint probability with interval`, /\d+\.\d%\s*\[\d+\.\d–\d+\.\d\]/.test(joint2), joint2);
  check(`[${label}] builder: reliable combination shows no unreliable banner`, (await page.locator('[data-testid="unreliable-banner"]:visible').count()) === 0);
  await shot("builder-two-legs", isMobile ? { fullPage: false } : {});
  // add a third leg → re-evaluated
  await closeDrawer();
  const callsBefore = evalRequests.length;
  await page.locator('[data-testid="builder-add"]').first().click();
  await openDrawer();
  await page.waitForFunction((prev) => {
    const el = [...document.querySelectorAll('[data-testid="builder-joint"]')].find((e) => e.offsetParent !== null);
    return el && el.textContent.replace(/\s+/g, " ") !== prev;
  }, joint2, { timeout: 8000 }).catch(() => {});
  const joint3 = (await page.locator('[data-testid="builder-joint"]:visible').innerText().catch(() => "")).replace(/\s+/g, " ");
  check(`[${label}] builder: re-evaluated on change`, evalRequests.length > callsBefore && joint3 !== joint2, `${joint2} -> ${joint3}`);
  check(`[${label}] builder: three legs listed`, (await page.locator('[data-testid="builder-legs"]:visible li').count()) === 3);
  // remove a leg
  await page.locator('[data-testid="builder-remove"]:visible').last().click();
  await page.waitForFunction(() => {
    const ul = [...document.querySelectorAll('[data-testid="builder-legs"]')].find((e) => e.offsetParent !== null);
    return ul && ul.querySelectorAll("li").length === 2;
  }, null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] builder: leg removed`, (await page.locator('[data-testid="builder-legs"]:visible li').count()) === 2);
  await evalLoc.waitFor({ timeout: 8000 }).catch(() => {});
  // save as paper ticket
  const saveResp = page.waitForResponse((r) => r.url().endsWith("/api/v1/paper/tickets") && r.request().method() === "POST");
  await page.locator('[data-testid="builder-evaluation"]:visible [data-testid="save-ticket"] button').click();
  const resp = await saveResp;
  check(`[${label}] builder: POST /paper/tickets succeeded with CSRF header`, resp.status() === 200 && resp.request().headers()["x-csrf-token"] === "fixture-csrf-token", `status ${resp.status()}`);
  await page.locator('[data-testid="save-ticket-ok"]:visible').waitFor({ timeout: 8000 }).catch(() => {});
  const savedText = await page.locator('[data-testid="save-ticket-ok"]:visible').innerText().catch(() => "");
  check(`[${label}] builder: save confirmation shown`, /Saved as paper ticket #\d+/.test(savedText), savedText);
  await shot("builder-saved", isMobile ? { fullPage: false } : {});
  // unreliable banner: switch to all evaluated and add an unqualified leg
  await closeDrawer();
  await page.locator('select').filter({ hasText: "All evaluated" }).first().selectOption("all");
  await page.locator('[data-testid="builder-option"]', { hasText: "FIXTURE Player B Under 8.5 REB" }).locator('[data-testid="builder-add"]').click();
  await openDrawer();
  await page.locator('[data-testid="unreliable-banner"]:visible').waitFor({ timeout: 8000 }).catch(() => {});
  check(`[${label}] builder: warning banner when reliable is false`, (await page.locator('[data-testid="unreliable-banner"]:visible').count()) === 1);
  check(`[${label}] builder: API warnings listed`, (await page.locator('[data-testid="builder-warnings"]:visible').count()) === 1);
  await shot("builder-unreliable", isMobile ? { fullPage: false } : {});
  if (isMobile) {
    const o = await overflow(page);
    check(`[${label}] builder has no horizontal overflow`, !o, o ? JSON.stringify(o) : "");
  }
  // load a researched combo
  await closeDrawer();
  await page.locator('[data-testid="builder-load"]').first().click();
  await openDrawer();
  await page.waitForTimeout(700);
  check(`[${label}] builder: load a combination from /combos`, (await page.locator('[data-testid="builder-legs"]:visible li').count()) === 2);
  check(`[${label}] builder flow raised no page/console errors`, errors.length === 0, errors.join(" | "));

  // --- saved ticket appears; saving from a combo card works ---
  text = await visit(page, "/tickets", label, errors);
  const m = savedText.match(/#(\d+)/);
  check(`[${label}] tickets: saved ticket is listed as open`, Boolean(m) && (await page.locator(`[data-ticket-id="${m?.[1]}"]`).count()) === 1);
  await shot("tickets-open");
  await page.click('[data-tab="settled"]');
  await settle(page);
  check(`[${label}] tickets: settled win and loss with forensic reports`, (await page.locator('[data-testid="forensic-report"]').count()) === 2);
  await shot("tickets-settled");

  await visit(page, "/exposure", label, errors);
  text = await page.evaluate(() => document.body.innerText);
  check(`[${label}] exposure: simulation block compares both figures`, /P\(at least one ticket wins\)/i.test(text) && /Expected aggregate P&L/i.test(text));
  check(`[${label}] exposure: never describes tickets as independent`, !/independent/i.test(text.replace(/FIXTURE note:[^\n]*/g, "")));
  await shot("exposure-with-tickets");

  // --- admin pause toggle (POST with CSRF) ---
  await visit(page, "/admin", label, errors);
  await page.click('[data-testid="pause-toggle"]');
  await page.waitForFunction(() => /Resume research/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  check(`[${label}] admin: pause toggle round-trips`, /Paused/i.test(await page.locator('[data-testid="pause-control"]').innerText()));
  await page.click('[data-testid="pause-toggle"]');
  await page.waitForFunction(() => /Pause research/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});

  // --- editions diff ---
  await visit(page, "/research/daily", label, errors);
  check(`[${label}] editions: three editions listed`, (await page.locator('[data-testid="edition-row"]').count()) === 3);
  check(`[${label}] editions: diff rendered`, (await page.locator('[data-testid="edition-diff"]').count()) === 1);
  check(`[${label}] editions: full edition rendered`, (await page.locator('[data-testid="edition-full"]').count()) === 1);

  // --- redirects ---
  await page.goto(`${BASE}/today`);
  check(`[${label}] /today redirects to /`, new URL(page.url()).pathname === "/", page.url());
  await page.goto(`${BASE}/research`);
  check(`[${label}] /research redirects to /research/daily`, new URL(page.url()).pathname === "/research/daily", page.url());

  // --- logout ---
  await page.goto(`${BASE}/settings`);
  await settle(page);
  if (isMobile) await page.click('[data-testid="more-button"]');
  await Promise.all([page.waitForURL((u) => u.pathname === "/login"), page.locator('[data-testid="logout"]:visible').click()]);
  await page.goto(`${BASE}/`);
  check(`[${label}] logout clears the session`, new URL(page.url()).pathname === "/login", page.url());

  await context.close();
}

const browser = await chromium.launch();
try {
  await runViewport(browser, "desktop", { width: 1440, height: 900 });
  await runViewport(browser, "mobile", { width: 390, height: 844 });
} finally {
  await browser.close();
}

console.log(`\nSmoke result: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
