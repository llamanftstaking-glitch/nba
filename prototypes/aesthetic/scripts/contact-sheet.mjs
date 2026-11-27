#!/usr/bin/env node
// Builds two labelled overview images for one concept from screenshots made by shots.mjs:
//   contact-desktop.png  the seven 1440x900 shots in a grid
//   contact-mobile.png   the seven 390x844 shots in a row
//
//   node scripts/contact-sheet.mjs <a|b|c>

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadPlaywright, PAGES, CONCEPTS } from './_playwright.mjs'

const concept = process.argv[2]
if (!CONCEPTS.includes(concept)) {
  console.error('usage: node scripts/contact-sheet.mjs <a|b|c>')
  process.exit(2)
}
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/design/aesthetic/screenshots', concept)
const NAMES = { a: 'Concept A · Premium Sports Editorial', b: 'Concept B · Professional Intelligence Terminal', c: 'Concept C · JARVIS-First' }

function sheet({ vp, tileW, tileH, columns, title }) {
  const tiles = PAGES.map((p) => {
    const file = join(DIR, `${p.name}-${vp}.png`)
    const inner = existsSync(file)
      ? `<img src="${pathToFileURL(file).href}" width="${tileW}" height="${tileH}">`
      : `<div class="missing" style="width:${tileW}px;height:${tileH}px">missing: ${p.name}-${vp}.png</div>`
    return `<figure><figcaption>/${concept}/${p.path} <span>${p.name}</span></figcaption>${inner}</figure>`
  }).join('')
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:28px;background:#18181a;color:#f2f2f2;font:15px/1.3 system-ui,sans-serif;width:max-content}
    h1{font-size:20px;margin:0 0 20px;font-weight:600}
    h1 small{font-weight:400;color:#a8a8a8;margin-left:12px;font-size:14px}
    .grid{display:grid;grid-template-columns:repeat(${columns},${tileW}px);gap:24px}
    figure{margin:0} figcaption{margin:0 0 8px;font-weight:600} figcaption span{color:#a8a8a8;font-weight:400;margin-left:8px}
    img{display:block;border:1px solid #3a3a3d}
    .missing{display:flex;align-items:center;justify-content:center;border:1px dashed #777;color:#aaa;box-sizing:border-box}
  </style><h1>${NAMES[concept]}<small>${title} · design prototype on a data snapshot</small></h1><div class="grid">${tiles}</div>`
}

const { chromium } = loadPlaywright()
const browser = await chromium.launch()
const tmp = mkdtempSync(join(tmpdir(), 'contact-'))
try {
  const jobs = [
    { out: 'contact-desktop.png', vp: '1440x900', tileW: 720, tileH: 450, columns: 4, title: 'desktop 1440x900' },
    { out: 'contact-mobile.png', vp: '390x844', tileW: 390, tileH: 844, columns: 7, title: 'mobile 390x844' },
  ]
  for (const job of jobs) {
    const html = join(tmp, `${job.out}.html`)
    writeFileSync(html, sheet(job))
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load' })
    await page.screenshot({ path: join(DIR, job.out), fullPage: true })
    await page.close()
    console.log(`wrote ${join(DIR, job.out)}`)
  }
} finally {
  await browser.close()
  rmSync(tmp, { recursive: true, force: true })
}
