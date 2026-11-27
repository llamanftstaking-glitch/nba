#!/usr/bin/env node
// Exports one real data snapshot from a locally running GIZER NBA API into
// src/data/dataset.json for the PROJECT AESTHETIC design prototypes.
//
//   node scripts/export-dataset.mjs
//
// Environment (all optional):
//   GIZER_API       default http://localhost:8010/api/v1
//   GIZER_EMAIL     default owner@local.test          (local development account only)
//   GIZER_PASSWORD  default local-owner-password-1    (local development account only)
//   SNAPSHOT_DATE   default 2026-11-25
//   FEATURED_GAME   default E401909319 (CLE @ NYK)
//
// Rules: values are copied from the API verbatim. Long arrays are cut (never padded) and
// every cut records the original length next to it as `<key>_total`. A failed endpoint is
// stored as { "error": "<status>" } and listed in meta.endpoint_errors. Read-only: GET only,
// apart from the login POST.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = process.env.GIZER_API ?? 'http://localhost:8010/api/v1'
const EMAIL = process.env.GIZER_EMAIL ?? 'owner@local.test'
const PASSWORD = process.env.GIZER_PASSWORD ?? 'local-owner-password-1'
const DATE = process.env.SNAPSHOT_DATE ?? '2026-11-25'
const FEATURED = process.env.FEATURED_GAME ?? 'E401909319'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/dataset.json')

const errors = []
let cookie = ''

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`login failed: ${r.status}`)
  cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

async function get(path) {
  try {
    const r = await fetch(`${API}${path}`, { headers: { cookie } })
    if (!r.ok) {
      errors.push({ path, status: r.status })
      return { error: String(r.status) }
    }
    return await r.json()
  } catch (e) {
    errors.push({ path, status: 'network' })
    return { error: 'network' }
  }
}

const ok = (v) => v && !v.error
/** Cut an array field in place and record the original length beside it. */
function cut(obj, key, n) {
  if (!obj || !Array.isArray(obj[key])) return obj
  if (obj[key].length > n) {
    obj[`${key}_total`] = obj[key].length
    obj[key] = obj[key].slice(0, n)
  }
  return obj
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]))
const r1 = (x) => Math.round(x * 10) / 10

await login()
const q = `date=${DATE}`

// ---- slate -----------------------------------------------------------------------------
const scoreboard = await get(`/live/scoreboard?${q}`)
const games = await get(`/games?${q}`)
const teams = await get('/teams')

// ---- featured game ---------------------------------------------------------------------
const fg = {
  id: FEATURED,
  live: await get(`/live/games/${FEATURED}`),
  boxscore: await get(`/live/games/${FEATURED}/boxscore`),
  play_by_play: await get(`/live/games/${FEATURED}/play-by-play?limit=120&order=desc`),
  rotations: await get(`/live/games/${FEATURED}/rotations`),
  team_stats: await get(`/live/games/${FEATURED}/team-stats`),
  momentum: await get(`/live/games/${FEATURED}/momentum`),
  research: await get(`/games/${FEATURED}`),
  lineups: await get(`/games/${FEATURED}/lineups`),
}
if (ok(fg.research)) {
  // The research page carries every evaluated selection (hundreds). Keep the first 24 in the
  // API's own order; selection_counts still holds the real totals.
  cut(fg.research, 'selections', 24)
}

// ---- featured players: the three top scorers of the featured game ------------------------
let featuredIds = []
if (ok(fg.boxscore)) {
  featuredIds = [...fg.boxscore.home.players, ...fg.boxscore.away.players]
    .filter((p) => p.player_id != null && !p.dnp)
    .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))
    .slice(0, 3)
    .map((p) => p.player_id)
}
const featured_players = []
for (const id of featuredIds) {
  const profile = await get(`/players/${id}`)
  if (ok(profile)) cut(profile, 'game_log', 40)
  featured_players.push({
    player_id: id,
    profile,
    averages: await get(`/players/${id}/averages`),
    game_logs: await get(`/players/${id}/game-logs?limit=20`),
    minutes: await get(`/players/${id}/minutes`),
    dna: await get(`/cortex/players/${id}/dna`),
    live: await get(`/live/players/${id}?${q}`),
  })
}

// ---- research ---------------------------------------------------------------------------
const players_index = await get('/players?limit=40')
const top_picks = await get(`/selections?${q}&ranked=true`)
const qualified = await get(`/selections?${q}&classification=qualified&limit=40`)
const parlays = {
  double: cut(await get(`/combos?${q}&category=double`), 'items', 8),
  sgp: cut(await get(`/combos?${q}&category=sgp`), 'items', 8),
}

// ---- Kalshi (read-only market reference) ---------------------------------------------------
const kalshiList = await get(`/kalshi/markets?${q}&limit=60&sort=volume`)
const kalshi = { list: kalshiList, details: {}, detail_tickers: { player: [], game: null } }
if (ok(kalshiList)) {
  const byVol = [...kalshiList.items].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
  const playerTickers = byVol.filter((m) => m.kind === 'player').slice(0, 3).map((m) => m.ticker)
  const gameTicker =
    (byVol.find((m) => m.kind === 'game' && m.game_id === FEATURED) ?? byVol.find((m) => m.kind === 'game'))?.ticker ?? null
  kalshi.detail_tickers = { player: playerTickers, game: gameTicker }
  for (const t of [...playerTickers, gameTicker].filter(Boolean)) {
    kalshi.details[t] = await get(`/kalshi/markets/${encodeURIComponent(t)}`)
  }
}

// ---- opportunity, availability, lineups -----------------------------------------------------
const minutes = await get(`/minutes?${q}&limit=40`)
const injuries = await get('/injuries')
if (ok(injuries) && ok(games)) {
  const playing = new Set(games.games.flatMap((g) => [g.home.abbr, g.away.abbr]))
  injuries.items_total = injuries.items.length
  injuries.items = injuries.items.filter((i) => playing.has(i.team_abbr))
  injuries.filter_note = 'Trimmed to the teams playing on the snapshot date.'
}
const injury_changes = await get(`/injuries/changes?${q}`)
const lineups = await get(`/lineups?${q}`)

// ---- edition ----------------------------------------------------------------------------
const editionList = await get(`/editions?${q}`)
let editionLatest = null
if (ok(editionList) && editionList.items.length) {
  const latestRef = [...editionList.items].sort((a, b) => b.version - a.version)[0]
  const full = await get(`/editions/${latestRef.id}`)
  if (ok(full)) {
    editionLatest = pick(full, ['id', 'key', 'kind', 'version', 'published_at', 'game_date', 'content_sha256', 'selection_counts'])
    editionLatest.counts = full.summary?.counts ?? null
    editionLatest.changes = full.changes
    cut(editionLatest, 'changes', 20)
    editionLatest.summary = pick(full.summary ?? {}, ['slate', 'narrative', 'limitations', 'unresolved', 'rejected'])
    cut(editionLatest.summary, 'rejected', 12)
    editionLatest.selections_in_edition = full.selections?.length ?? null
    editionLatest.combos_in_edition = full.combos?.length ?? null
  } else editionLatest = full
  for (const it of editionList.items) cut(it, 'changes', 20)
}
const edition = { list: editionList, latest: editionLatest }

// ---- results and live paper tracker ---------------------------------------------------------
const resultsFull = await get('/results')
const results = ok(resultsFull)
  ? pick(resultsFull, ['summary', 'by_engine', 'by_structure', 'calibration', 'equity_curve', 'selection_outcomes', 'total', 'disclaimer'])
  : resultsFull
const research_tracker = cut(await get(`/live/research-tracker?${q}`), 'items', 8)

// ---- CORTEX -------------------------------------------------------------------------------
const cortex = {
  overview: await get('/cortex/overview'),
  concepts: await get('/cortex/concepts?limit=24'),
  records: {},
}
for (const slug of ['true-shooting-percentage', 'drop-coverage', 'usage-percentage']) {
  cortex.records[slug] = await get(`/cortex/concepts/${slug}`)
}

// ---- JARVIS -------------------------------------------------------------------------------
const jarvis = {
  state: await get('/jarvis/state'),
  suggestions: await get('/jarvis/suggestions'),
  sample_conversation: null,
}
const ai_budget = await get('/admin/ai-budget')

// The sample conversation is a hand-written template. Every number in it is interpolated from
// records exported above (the `facts` list names each value and where it lives in this file),
// and the export aborts if a number in the answer text is not one of those facts.
const fp = featured_players[0]
if (fp && ok(fp.minutes) && ok(fp.dna) && ok(fp.averages) && ok(fp.live) && fp.live.live?.line) {
  const m = fp.minutes.profile
  const d = fp.dna
  const win = (k) => fp.averages.windows.find((w) => w.key === k)
  const l5 = win('L5')
  const l10 = win('L10')
  const line = fp.live.live.line
  const gameLabel = fp.live.live.label
  const base = 'featured_players[0]'
  const facts = [
    ['proj_min', m.proj_min, `${base}.minutes.profile.proj_min`],
    ['proj_min_low', m.proj_min_low, `${base}.minutes.profile.proj_min_low`],
    ['proj_min_high', m.proj_min_high, `${base}.minutes.profile.proj_min_high`],
    ['starts_l10', m.starts_l10, `${base}.minutes.profile.starts_l10`],
    ['min_l10', m.l10, `${base}.minutes.profile.l10`],
    ['sd_l10', m.sd_l10, `${base}.minutes.profile.sd_l10`],
    ['usage_season', d.season_line.usage, `${base}.dna.season_line.usage`],
    ['usage_games', d.season_line.usage_games, `${base}.dna.season_line.usage_games`],
    ['usage_recent_10', d.recent_10.usage, `${base}.dna.recent_10.usage`],
    ['true_shooting_season', d.season_line.true_shooting_pct, `${base}.dna.season_line.true_shooting_pct`],
    ['fga36', d.season_line.fga36, `${base}.dna.season_line.fga36`],
    ['pts_l5_mean', l5.stats.pts.mean, `${base}.averages.windows[key=L5].stats.pts.mean`],
    ['pts_l5_games', l5.games, `${base}.averages.windows[key=L5].games`],
    ['pts_l10_mean', l10.stats.pts.mean, `${base}.averages.windows[key=L10].stats.pts.mean`],
    ['pts_l10_min', l10.stats.pts.min, `${base}.averages.windows[key=L10].stats.pts.min`],
    ['pts_l10_max', l10.stats.pts.max, `${base}.averages.windows[key=L10].stats.pts.max`],
    ['pts_l10_games', l10.games, `${base}.averages.windows[key=L10].games`],
    ['live_min', line.minutes, `${base}.live.live.line.minutes`],
    ['live_pts', line.pts, `${base}.live.live.line.pts`],
    ['live_fgm', line.fgm, `${base}.live.live.line.fgm`],
    ['live_fga', line.fga, `${base}.live.live.line.fga`],
    ['live_fg3m', line.fg3m, `${base}.live.live.line.fg3m`],
    ['live_fg3a', line.fg3a, `${base}.live.live.line.fg3a`],
    ['live_ts', line.true_shooting_pct, `${base}.live.live.line.true_shooting_pct`],
    ['pregame_pts', line.pregame?.pts, `${base}.live.live.line.pregame.pts`],
  ]
  if (facts.every(([, v]) => v !== null && v !== undefined)) {
    const f = Object.fromEntries(facts.map(([k, v]) => [k, v]))
    const name = m.player_name
    const answer = [
      `**Minutes.** ${name} is classed as a ${m.classification_label.toLowerCase()}: he started ${f.starts_l10} of his last 10 and averaged ${f.min_l10} minutes over them (standard deviation ${f.sd_l10}). The minutes model (${fp.minutes.model.name} ${fp.minutes.model.version}, status: ${fp.minutes.model.status}) projects ${f.proj_min} minutes, with a band of ${f.proj_min_low} to ${f.proj_min_high}. That class is descriptive context, not a qualification rule.`,
      `**Usage and efficiency.** Season usage is ${f.usage_season}% across ${f.usage_games} games and ${f.usage_recent_10}% over his last 10, on ${f.fga36} field goal attempts per 36 minutes and ${f.true_shooting_season}% true shooting. We hold no touch, shot-zone or tracking data, so this is box-score opportunity only.`,
      `**Recent scoring.** He averaged ${f.pts_l5_mean} points over his last ${f.pts_l5_games} appearances and ${f.pts_l10_mean} over his last ${f.pts_l10_games} (low ${f.pts_l10_min}, high ${f.pts_l10_max}). These are historical frequencies from games he played, not probabilities.`,
      `**Observed on ${DATE} (${gameLabel}, ${fp.live.live.status_label}).** The polled box score shows ${f.live_pts} points in ${f.live_min} minutes on ${f.live_fgm}-of-${f.live_fga} shooting, ${f.live_fg3m}-of-${f.live_fg3a} from three, ${f.live_ts}% true shooting. The pregame projection shown beside it was ${f.pregame_pts} points; it is not revised after the fact.`,
    ].join('\n\n')

    // Guard: every numeric token in the answer must be an exported fact (or part of the date / model version).
    const allowed = new Set(facts.map(([, v]) => String(v)))
    for (const tok of [...DATE.split('-'), ...String(fp.minutes.model.version).split('.'), '10', '36']) allowed.add(String(Number(tok)))
    const unknown = (answer.match(/\d+(?:\.\d+)?/g) ?? []).filter((t) => !allowed.has(t) && !allowed.has(String(Number(t))))
    if (unknown.length) throw new Error(`sample conversation contains numbers that are not exported facts: ${unknown.join(', ')}`)

    jarvis.sample_conversation = {
      sample: true,
      sample_note:
        'Hand-written illustration for design prototypes. Not a recorded JARVIS exchange and not model output. Every number is copied from the records named in `facts`.',
      subject: { player_id: fp.player_id, name, team_abbr: m.team_abbr, headshot_url: m.headshot_url },
      messages: [
        {
          role: 'owner',
          text: `Give me the read on ${name}: minutes, usage and how he has been scoring lately.`,
        },
        {
          role: 'assistant',
          tool_activity: [
            { tool: 'get_projected_minutes', label: 'Loading minutes profile', status: 'done' },
            { tool: 'get_player_opportunity_profile', label: 'Loading usage and efficiency', status: 'done' },
            { tool: 'get_player_game_logs', label: 'Loading game logs', status: 'done' },
            { tool: 'get_live_boxscore', label: 'Reading the live box score', status: 'done' },
          ],
          text: answer,
          sources: [
            { label: 'Minutes profile', detail: `${fp.minutes.model.name} ${fp.minutes.model.version} (${fp.minutes.model.status})`, dataset_path: `${base}.minutes` },
            { label: 'Player DNA: usage and efficiency', detail: `Season ${d.season}, computed from stored box scores`, dataset_path: `${base}.dna` },
            { label: 'Historical averages', detail: 'Windows count appearances; a missed game is never a zero', dataset_path: `${base}.averages` },
            { label: 'Observed box score', detail: `${gameLabel}, provider updated ${fp.live.live.provider_updated_at}`, dataset_path: `${base}.live` },
          ],
          limitations: [
            'Historical frequencies are descriptive, not probabilities.',
            'No touch, shot-zone, tracking or matchup data is held.',
            'The observed box score was polled, not real-time.',
          ],
        },
      ],
      facts: facts.map(([key, value, dataset_path]) => ({ key, value, dataset_path })),
    }
  }
}
if (!jarvis.sample_conversation) {
  errors.push({ path: 'jarvis.sample_conversation', status: 'inputs missing' })
  jarvis.sample_conversation = { error: 'inputs missing' }
}

const dataset = {
  meta: {
    snapshot_date: DATE,
    exported_at: new Date().toISOString(),
    note: 'Real records exported from the GIZER NBA development database for design prototypes. Not live. Not for production.',
    featured_game_id: FEATURED,
    featured_player_ids: featuredIds,
    timezone: 'America/New_York',
    trimming: 'Long arrays are cut, never padded. A cut array has its original length beside it as <key>_total.',
    endpoint_errors: errors,
  },
  scoreboard,
  games,
  featured_game: fg,
  teams,
  featured_players,
  players_index,
  top_picks,
  qualified,
  parlays,
  kalshi,
  minutes,
  injuries,
  injury_changes,
  lineups,
  edition,
  results,
  research_tracker,
  cortex,
  jarvis,
  ai_budget,
}

mkdirSync(dirname(OUT), { recursive: true })
const text = JSON.stringify(dataset)
writeFileSync(OUT, text)
const kb = (s) => `${r1(Buffer.byteLength(typeof s === 'string' ? s : JSON.stringify(s)) / 1024)} KB`
console.log(`wrote ${OUT}  ${kb(text)}`)
for (const [k, v] of Object.entries(dataset)) console.log(`  ${k.padEnd(18)} ${kb(v)}`)
console.log(errors.length ? `endpoint errors: ${JSON.stringify(errors)}` : 'endpoint errors: none')
