// Shared, READ-ONLY data access for the three concepts. Nothing visual lives here.
// The dataset is one real snapshot exported by scripts/export-dataset.mjs (see README.md here).
//
// Conventions inherited from the API contract:
//   * null means "not available": show an explicit unavailable state, never a placeholder number.
//   * Timestamps are ISO-8601 UTC; dates are YYYY-MM-DD in America/New_York; display times in ET.
//   * Probabilities are floats 0..1. evidence_score is 0..100 evidence quality, never a probability.
//   * Types are deliberately loose (`[k: string]: any` tails). The JSON is the source of truth.

import dataset from './dataset.json'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = { [k: string]: any }
type Maybe<T> = T | null

export type Classification =
  | 'high_confidence' | 'standard' | 'watchlist' | 'insufficient_evidence' | 'rejected' | 'invalidated'

export interface TeamRef { id: number; abbr: string; name: string; logo_url: Maybe<string> }
export interface Team extends TeamRef {
  games: number; wins: number; losses: number; off_rtg: number; def_rtg: number; pace: number
}

export interface PlayerRef extends Loose {
  id?: number; player_id?: number; name?: string; player_name?: string
  team_abbr?: Maybe<string>; position?: Maybe<string>; jersey?: Maybe<string>; headshot_url?: Maybe<string>
}

export interface LiveTeamSide { team_id: number; abbr: string; name: string; score: Maybe<number>; linescores: number[] }
/** One game on the observed (polled) scoreboard. */
export interface ScoreboardGame extends Loose {
  game_id: string; label: string; game_date: string; tipoff_utc: Maybe<string>; venue: Maybe<string>
  status: 'scheduled' | 'live' | 'final' | 'postponed'; status_label: string
  period: Maybe<number>; period_label: Maybe<string>; clock: Maybe<string>
  home: LiveTeamSide; away: LiveTeamSide
  followed: boolean; observed_at: string; provider_updated_at: Maybe<string>; age_s: number; stale: boolean; feed: string
}

export interface InjuryRow extends Loose {
  player_id: Maybe<number>; player_name: string; team_abbr: Maybe<string>; status: string
  detail: Maybe<string>; comment: Maybe<string>; source: string; source_published_at: Maybe<string>
  ingested_at: string; headshot_url: Maybe<string>; game_label: Maybe<string>; previous_status: Maybe<string>; stale: boolean
}

export interface Selection extends Loose {
  id: number; key: string; edition_id: number; game_id: string; game_label: string
  market: string; market_label: string
  subject_type: 'team' | 'game' | 'player'; subject_id: Maybe<number>; subject_name: string; team_abbr: Maybe<string>
  side: 'home' | 'away' | 'over' | 'under'; line: Maybe<number>
  price_american: Maybe<number>; book: Maybe<string>; quote_at: Maybe<string>
  projection: Maybe<number>; prob: Maybe<number>; prob_low: Maybe<number>; prob_high: Maybe<number>
  breakeven: Maybe<number>; edge: Maybe<number>; sample_size: Maybe<number>; evidence_score: Maybe<number>
  evidence: { components: { name: string; score: number; max: number; note: string }[]; supporting: string[]; opposing: string[] }
  classification: Classification | string; rejection_reasons: string[]; rank_in_game: Maybe<number>
  model: Maybe<{ id: number; name: string; version: string; status: string }>
  verified_at: string; invalidated: boolean; invalidation_reason: Maybe<string>
  context: Maybe<{ l5: Maybe<number>; l10: Maybe<number>; l20: Maybe<number>; season_avg: Maybe<number>; proj_min: Maybe<number>; lineup_role: Maybe<string>; lineup_status: Maybe<string> }>
  origin: 'provider' | 'owner_entered' | 'hypothetical'
}

export interface ComboLeg extends Loose {
  selection_id: number; label: string; game_id: string; game_label: string; market: string; subject_name: string
  side: string; line: Maybe<number>; price_american: Maybe<number>
  prob: Maybe<number>; prob_low: Maybe<number>; prob_high: Maybe<number>
  classification: string; evidence_score: Maybe<number>; sample_size: Maybe<number>; supporting: string[]; opposing: string[]
}
export interface Combo extends Loose {
  uid: string; engine: string; n_legs: number; structure: 'SGP' | 'CROSS' | 'MIXED'; name: string; legs: ComboLeg[]
  joint_prob: Maybe<number>; joint_low: Maybe<number>; joint_high: Maybe<number>; independent_prob: Maybe<number>
  correlation: Loose
  observed_quote: Maybe<{ decimal: number; american: number; book: string; at: string }>
  /** Arithmetic product of leg prices. NOT a quote. */
  reference_price: Maybe<{ decimal: number; american: number; note: string }>
  evidence_score: Maybe<number>; weakest_assumption: Maybe<string>; classification: string
  designation: 'research_only' | 'paper_testing'; rejection_reasons: string[]; invalidation_conditions: string[]
}

export interface EditionRef { id: number; key: string; kind: string; version: number; published_at: string }

export interface GameCard extends Loose {
  id: string; date: string; tipoff_utc: Maybe<string>; status: string
  home: TeamRef; away: TeamRef; home_points: Maybe<number>; away_points: Maybe<number>; venue: Maybe<string>; label: string
  injuries: { home: InjuryRow[]; away: InjuryRow[] }
  lineup_status: string
  lineup: { home: { status: string; verified_at: Maybe<string> }; away: { status: string; verified_at: Maybe<string> } }
  props: { quoted_markets: number; players_projected: number }
  research_completeness: { score: number; items: { name: string; ok: boolean; note: string }[] }
  environment: Maybe<{ proj_home_points: number; proj_away_points: number; proj_total: number; proj_margin: number; proj_pace: number; total_p10: number; total_p90: number; notes: string[] }>
  quotes: { market: string; side: string; line: Maybe<number>; price_american: Maybe<number>; book: string; at: string }[]
  top_picks: Selection[]; n_evaluated: number; n_rejected: number; no_picks_reason: Maybe<string>
}

/** One player line in the observed box score. `pregame` is the projection published before tipoff. */
export interface BoxPlayer extends Loose {
  player_id: Maybe<number>; team_id: number; name: string; position: Maybe<string>; jersey: Maybe<string>
  starter: boolean; dnp: boolean; role: Maybe<string>; minutes: Maybe<number>
  pts: Maybe<number>; reb: Maybe<number>; ast: Maybe<number>; stl: Maybe<number>; blk: Maybe<number>; tov: Maybe<number>; pf: Maybe<number>
  fgm: Maybe<number>; fga: Maybe<number>; fg3m: Maybe<number>; fg3a: Maybe<number>; ftm: Maybe<number>; fta: Maybe<number>
  plus_minus: Maybe<number>; true_shooting_pct: Maybe<number>; headshot_url: Maybe<string>
  pregame: Maybe<{ proj_min: Maybe<number>; pts: Maybe<number>; reb: Maybe<number>; ast: Maybe<number>; fg3m: Maybe<number>; published_at: string }>
}
export interface BoxSide { team_id: number; abbr: string; name: string; players: BoxPlayer[]; totals: Record<string, number> }

export interface Play extends Loose {
  event_id: string; sequence: number; period: number; clock: Maybe<string>; elapsed_s: number
  team_side: Maybe<'home' | 'away'>; kind: string; type_text: string; text: string
  scoring: boolean; score_value: number; home_score: number; away_score: number; player_ids: number[]
}

export interface RotationPlayer extends Loose {
  player_id: Maybe<number>; name: string; starter: boolean; on_court: Maybe<boolean>
  stints: { start_s: number; end_s: Maybe<number> }[]; minutes_by_period: Record<string, number>
  minutes: Maybe<number>; proj_min: Maybe<number>; minutes_vs_projection: Maybe<number>
}

export interface LineupPlayer extends Loose {
  player_id: Maybe<number>; name: string; jersey: Maybe<string>; position: Maybe<string>; role: string
  proj_min: Maybe<number>; recent_min: Maybe<number>; availability: Maybe<string>; injury_detail: Maybe<string>
  starts_last10: Maybe<number>; headshot_url: Maybe<string>
}
/** status is 'confirmed' only from a box score; 'projected' must always be labelled not official. */
export interface LineupSide extends Loose {
  team: TeamRef; status: 'confirmed' | 'projected' | 'unknown'; source: Maybe<string>; verified_at: Maybe<string>; note: Maybe<string>
  starters: LineupPlayer[]; bench: LineupPlayer[]; unavailable: LineupPlayer[]
}

export interface FeaturedGame {
  id: string
  /** /live/games/{id}: score by quarter, leaders, team_stats, momentum, last_plays, summaries. */
  live: ScoreboardGame & Loose
  boxscore: { home: BoxSide; away: BoxSide; available: boolean; notes: string[] } & Loose
  play_by_play: { total: number; items: Play[]; note: string } & Loose
  rotations: { home: { abbr: string; determinable: boolean; note: string; players: RotationPlayer[] } & Loose; away: { abbr: string; determinable: boolean; note: string; players: RotationPlayer[] } & Loose; notes: string[] } & Loose
  team_stats: { items: { key: string; label: string; home: string; away: string; home_value: Maybe<number>; away_value: Maybe<number> }[]; not_published: string[] } & Loose
  momentum: { points: { t: number; period: number; home: number; away: number; diff: number }[]; lead_changes: number; ties: number; largest_lead: { home: number; away: number }; runs: { team: 'home' | 'away'; points: number; start_s: number; end_s: number }[]; note: string } & Loose
  /** /games/{id} research page; `selections` is cut to 24 (see selections_total and selection_counts). */
  research: { game: GameCard; team_form: { home: Loose; away: Loose }; player_projections: Loose[]; selections: Selection[]; selections_total?: number; selection_counts: Record<string, number>; sgp: Combo[]; h2h: Loose[]; agent_reports: { agent: string; at: string; summary: string }[]; unresolved: string[] }
  lineups: { game_id: string; home: LineupSide; away: LineupSide }
}

export interface AverageWindow extends Loose {
  key: string; label: string; requested: Maybe<number>; games: number; missed: number; small_sample: boolean; available: boolean
  /** stat key -> distribution. Keys: min, pts, reb, ast, fg3m, stl, blk, tov, pra, pr, pa, ra. */
  stats: Record<string, { mean: number; median: number; min: number; max: number; sd: number; p25: number; p75: number }>
}
export interface MinutesProfile extends Loose {
  player_id: number; player_name: string; headshot_url: Maybe<string>; position: Maybe<string>; team_abbr: Maybe<string>; opp_abbr: Maybe<string>
  availability: Maybe<string>; lineup_role: Maybe<string>; lineup_status: Maybe<string>
  proj_min: Maybe<number>; proj_min_low: Maybe<number>; proj_min_high: Maybe<number>; tier: Maybe<string>
  season_avg: Maybe<number>; l3: Maybe<number>; l5: Maybe<number>; l10: Maybe<number>; l20: Maybe<number>; sd_l10: Maybe<number>
  starts_l10: Maybe<number>; classification: Maybe<string>; classification_label: Maybe<string>; classification_reason: Maybe<string>
}
export interface FeaturedPlayer {
  player_id: number
  /** /players/{id}: player, next_game, sample, splits, game_log (cut to 40), projections, injury. */
  profile: { player: PlayerRef & { id: number; name: string }; sample: { games: number }; splits: Loose[]; game_log: Loose[]; game_log_total?: number; projections: Loose[]; injury: Maybe<InjuryRow> } & Loose
  averages: { definition: string; windows: AverageWindow[] }
  game_logs: { items: Loose[]; total: number; missed: { date: string; opp_abbr: string; reason: string }[]; source: string }
  minutes: { model: { name: string; version: string; status: string }; uncertainty: string; restrictions_note: string; tiers: string[]; rules: Loose; profile: MinutesProfile } & Loose
  /** CORTEX Player DNA: computed profile. Archetypes are descriptive conventions, not predictions. */
  dna: { identity: Loose; season: string; season_line: Loose; recent_10: Loose; archetypes: { key: string; label: string; rule: string }[]; teammate_context: Loose[]; not_available: string[]; notes: string[] } & Loose
  live: { player_id: number; name: string; live: Maybe<{ game_id: string; label: string; status: string; status_label: string; line: BoxPlayer } & Loose>; milestones: Loose[] } & Loose
}

/** A Kalshi contract snapshot. Prices are 0..1. `first_observed` is NOT an opening price. */
export interface KalshiMarket extends Loose {
  ticker: string; event_ticker: string; series: string; game_id: Maybe<string>; game_label: Maybe<string>
  kind: 'game' | 'player' | string; market: string; stat: Maybe<string>; stat_label: Maybe<string>
  player_id: Maybe<number>; player_name: Maybe<string>; team_abbr: Maybe<string>; title: string
  threshold: Maybe<number>; comparator: Maybe<string>; interpretation: 'normalized' | 'unsupported' | string; status: string
  yes_bid: Maybe<number>; yes_ask: Maybe<number>; no_bid: Maybe<number>; no_ask: Maybe<number>; last_price: Maybe<number>
  price: Maybe<number>; first_observed: Maybe<number>; first_observed_at: Maybe<string>; change_since_first: Maybe<number>
  high: Maybe<number>; low: Maybe<number>; spread: Maybe<number>; volume: Maybe<number>; open_interest: Maybe<number>
  windows: Record<string, Maybe<number>>; observations: number
}
export interface KalshiDetail extends Loose {
  market: KalshiMarket
  rules: { primary: string; secondary: Maybe<string>; settlement_note: Maybe<string> }
  /** Append-only polled observations, oldest first. */
  series: { at: string; price: Maybe<number>; yes_bid: Maybe<number>; yes_ask: Maybe<number>; last_price: Maybe<number>; spread: Maybe<number>; volume: Maybe<number>; open_interest: Maybe<number>; status: string }[]
  timeline: { at: string; type: string; own_player: boolean; text: string; source: string }[]
  /** Historical frequencies (descriptive, never a probability). null for game contracts. */
  history: Maybe<Record<string, { n: number; over: number; under: number; equal: number; frequency_over: number; average: number }>>
  research: Maybe<Loose>
}

export interface Concept extends Loose {
  slug: string; title: string; department: number; department_name: string; kind: string; summary: string
  verification: string; sources: any[]; formula: Maybe<string>; body?: string; limitations?: string[]; related?: { slug: string; title: string }[]
}

export interface SampleConversation {
  sample: true
  sample_note: string
  subject: { player_id: number; name: string; team_abbr: Maybe<string>; headshot_url: Maybe<string> }
  messages: {
    role: 'owner' | 'assistant'; text: string
    tool_activity?: { tool: string; label: string; status: string }[]
    sources?: { label: string; detail: string; dataset_path: string }[]
    limitations?: string[]
  }[]
  facts: { key: string; value: number; dataset_path: string }[]
}

export interface Dataset {
  meta: { snapshot_date: string; exported_at: string; note: string; featured_game_id: string; featured_player_ids: number[]; timezone: string; trimming: string; endpoint_errors: { path: string; status: string | number }[] }
  scoreboard: { date: string; prev: string; next: string; today: string; games: ScoreboardGame[]; live_count: number; server_time: string; poll_note: string }
  games: { date: string; games: GameCard[] }
  featured_game: FeaturedGame
  teams: { items: Team[] }
  featured_players: FeaturedPlayer[]
  players_index: { items: (PlayerRef & { id: number; name: string; games: number; min: number; pts: number; reb: number; ast: number; fg3m: number; last_game_date: string })[]; total: number }
  top_picks: { edition: Maybe<EditionRef>; items: Selection[]; total: number; counts: Record<string, number> }
  qualified: { edition: Maybe<EditionRef>; items: Selection[]; total: number; counts: Record<string, number> }
  parlays: { double: { edition: Maybe<EditionRef>; category: string; counts: Record<string, number>; items: Combo[]; items_total?: number }; sgp: { edition: Maybe<EditionRef>; category: string; counts: Record<string, number>; items: Combo[]; items_total?: number } }
  kalshi: {
    list: { date: string; sync: { last_sync_at: string; age_minutes: number; poll_minutes: number; stale: boolean; note: string }; counts: Record<string, number>; events: { game_id: string; label: string }[]; items: KalshiMarket[]; total: number; notes: string[] }
    details: Record<string, KalshiDetail>
    detail_tickers: { player: string[]; game: Maybe<string> }
  }
  minutes: { date: string; model: { name: string; version: string; status: string }; uncertainty: string; restrictions_note: string; tiers: string[]; rules: Loose; items: MinutesProfile[]; total: number }
  injuries: { as_of: Maybe<string>; source: string; items: InjuryRow[]; items_total: number; filter_note: string; changes: { text: string; at: string }[] }
  injury_changes: { date: string; items: Loose[]; notes: string[] }
  lineups: { date: string; games: { game: Loose; home: LineupSide; away: LineupSide }[] }
  edition: {
    list: { items: (EditionRef & { counts: Record<string, number>; changes: { type: string; text: string }[]; changes_total?: number })[] }
    latest: Maybe<EditionRef & { game_date: string; content_sha256: string; counts: Record<string, number>; selection_counts: Record<string, number>; changes: { type: string; text: string }[]; changes_total?: number; summary: { slate: Loose; narrative: string[]; limitations: string[]; unresolved: string[]; rejected: { label: string; reasons: string[] }[]; rejected_total?: number }; selections_in_edition: number; combos_in_edition: number }>
  }
  results: { summary: Loose; by_engine: Loose[]; by_structure: Loose[]; calibration: { bucket: string; n: number; predicted: number; observed: number; ci: number[] }[]; equity_curve: { date: string; pnl_units: number; cumulative: number }[]; selection_outcomes: Loose; total: number; disclaimer: string }
  research_tracker: { date: string; items: Loose[]; items_total?: number; total: number; notes: string[] }
  cortex: { overview: Loose; concepts: { mode: string; items: Concept[]; total: number }; records: Record<string, Concept> }
  jarvis: { state: Loose; suggestions: { context: Loose; items: { label: string; text: string }[] }; sample_conversation: SampleConversation }
  ai_budget: Loose
}

export const data = dataset as unknown as Dataset

// ---- convenience handles --------------------------------------------------------------------
export const featuredGame = data.featured_game
/** The player every concept's /player page shows. */
export const featuredPlayer = data.featured_players[0]

// ---- pure helpers ---------------------------------------------------------------------------
const TEAMS_BY_ABBR: Record<string, Team> = Object.fromEntries(data.teams.items.map((t) => [t.abbr, t]))
const TEAMS_BY_ID: Record<number, Team> = Object.fromEntries(data.teams.items.map((t) => [t.id, t]))

export function teamByAbbr(abbr: string | null | undefined): Team | null {
  return abbr ? (TEAMS_BY_ABBR[abbr.toUpperCase()] ?? null) : null
}

export function teamById(id: number | null | undefined): Team | null {
  return id != null ? (TEAMS_BY_ID[id] ?? null) : null
}

/** Logo URL for a team abbreviation from the dataset's teams, or null when not held. */
export function teamLogo(abbr: string | null | undefined): string | null {
  return teamByAbbr(abbr)?.logo_url ?? null
}

/** Headshot URL for any record that carries `headshot_url`, or null. Never substitutes another image. */
export function playerHeadshot(player: { headshot_url?: string | null } | null | undefined): string | null {
  return player?.headshot_url ?? null
}

/**
 * A smaller rendition of an ESPN headshot (same image, resized by the CDN) for avatars and lists.
 * Returns the original URL when it is not an ESPN CDN path, and null when there is none.
 */
export function playerHeadshotSized(player: { headshot_url?: string | null } | null | undefined, width = 260): string | null {
  const url = playerHeadshot(player)
  if (!url) return null
  const m = url.match(/^https:\/\/a\.espncdn\.com(\/i\/headshots\/.+)$/)
  if (!m) return url
  return `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${width}&h=${Math.round((width * 436) / 600)}`
}

const TIME_ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
const DATE_ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })

/** "7:30 PM ET" for an ISO timestamp, or null when the value is missing or unparseable. */
export function fmtTimeET(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${TIME_ET.format(d)} ET`
}

/** "Nov 25" (America/New_York) for an ISO timestamp, or null. */
export function fmtDateET(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : DATE_ET.format(d)
}

/** "62%" from a 0..1 value, or null when the value is not available. */
export function fmtPct(p: number | null | undefined, digits = 0): string | null {
  return p == null ? null : `${(p * 100).toFixed(digits)}%`
}

/** "+146" / "-110" from an American price, or null. */
export function fmtAmerican(price: number | null | undefined): string | null {
  return price == null ? null : price > 0 ? `+${price}` : String(price)
}
