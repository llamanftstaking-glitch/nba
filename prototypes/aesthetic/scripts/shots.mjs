#!/usr/bin/env node
// Screenshots one concept's seven required pages at seven viewports.
//
//   node scripts/shots.mjs <a|b|c>            (dev or preview server must be running on :4310)
//   node scripts/shots.mjs a --only game,player      limit to some pages
//   BASE_URL=http://localhost:4310 node scripts/shots.mjs b
//
// Output: docs/design/aesthetic/screenshots/<concept>/<page>-<w>x<h>.png   (viewport)
//         .../<page>-1440x900-full.png and <page>-390x844-full.png          (full page)
// deviceScaleFactor is 2 at 1440x900 and 390x844, 1 elsewhere.
// Prints, per page and viewport: horizontal overflow, console errors, failed requests.

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPlaywright, PAGES, CONCEPTS } from './_playwright.mjs'

const concept = process.argv[2]
if (!CONCEPTS.includes(concept)) {
  console.error('usage: node scripts/shots.mjs <a|b|c> [--only page,page]')
  process.exit(2)
}
const onlyIdx = process.argv.indexOf('--only')
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1].split(',') : null
const pages = only ? PAGES.filter((p) => only.includes(p.name)) : PAGES

const BASE = (process.env.BASE_URL ?? 'http://localhost:4310').replace(/\/$/, '')
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/design/aesthetic/screenshots', concept)
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
]
const HI_DPI = new Set(['1440x900', '390x844'])

const { chromium } = loadPlaywright()
const browser = await chromium.launch()
let problems = 0

for (const [width, height] of VIEWPORTS) {
  const vp = `${width}x${height}`
  const full = HI_DPI.has(vp)
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: full ? 2 : 1 })
  for (const pg of pages) {
    const page = await context.newPage()
    const errors = []
    const failed = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('requestfailed', (r) => failed.push(`${r.url()} (${r.failure()?.errorText ?? 'failed'})`))
    page.on('response', (r) => r.status() >= 400 && failed.push(`${r.url()} (HTTP ${r.status()})`))

    const url = `${BASE}/${concept}/${pg.path}`
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 })
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      // Fonts and images settled (remote logos and headshots included), then a beat for entry motion.
      await page
        .evaluate(async () => {
          await document.fonts.ready
          const pending = [...document.images].filter((i) => !i.complete)
          await Promise.race([
            Promise.all(pending.map((i) => new Promise((res) => ((i.onload = res), (i.onerror = res))))),
            new Promise((res) => setTimeout(res, 8000)),
          ])
        })
        .catch(() => {})
      await page.waitForTimeout(700)

      const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
      }))
      await page.screenshot({ path: `${OUT}/${pg.name}-${vp}.png`, fullPage: false })
      if (full) await page.screenshot({ path: `${OUT}/${pg.name}-${vp}-full.png`, fullPage: true })

      const bad = m.overflow || errors.length || failed.length || m.brokenImages.length
      if (bad) problems++
      console.log(
        `${bad ? 'CHECK' : 'ok   '} ${pg.name.padEnd(9)} ${vp.padEnd(9)} ` +
          `h-overflow: ${m.overflow ? `YES (${m.scrollWidth} > ${m.clientWidth})` : 'no'} | ` +
          `console errors: ${errors.length} | failed requests: ${failed.length} | broken images: ${m.brokenImages.length}`,
      )
      for (const e of errors) console.log(`        console: ${e}`)
      for (const f of failed) console.log(`        request: ${f}`)
      for (const b of m.brokenImages) console.log(`        image:   ${b}`)
    } catch (e) {
      problems++
      console.log(`FAIL  ${pg.name.padEnd(9)} ${vp.padEnd(9)} ${e.message.split('\n')[0]}`)
    }
    await page.close()
  }
  await context.close()
}
await browser.close()
console.log(`\n${pages.length * VIEWPORTS.length} page/viewport checks, ${problems} needing attention. Screenshots: ${OUT}`)
