// Types transcribed from docs/architecture/API-CONTRACT.md (v1). Do not add fields that the contract does not define.

export type Classification =
  | "high_confidence"
  | "standard"
  | "watchlist"
  | "insufficient_evidence"
  | "rejected"
  | "invalidated"
  | "stale";

export type TeamRef = { id: number; abbr: string; name: string; logo_url: string | null };

export type Market =
  | "spread"
  | "total"
  | "moneyline"
  | "player_pts"
  | "player_reb"
  | "player_ast"
  | "player_fg3m";

export type EvidenceComponent = { name: string; score: number; max: number; note: string };

export type Selection = {
  id: number;
  key: string;
  edition_id: number;
  game_id: string;
  game_label: string;
  market: Market;
  market_label: string;
  subject_type: "team" | "game" | "player";
  subject_id: number | null;
  subject_name: string;
  team_abbr: string | null;
  side: "home" | "away" | "over" | "under";
  line: number | null;
  price_american: number | null;
  book: string | null;
  quote_at: string | null;
  projection: number | null;
  prob: number | null;
  prob_low: number | null;
  prob_high: number | null;
  breakeven: number | null;
  edge: number | null;
  sample_size: number | null;
  evidence_score: number | null;
  evidence: { components: EvidenceComponent[]; supporting: string[]; opposing: string[] };
  classification: string;
  rejection_reasons: string[];
  rank_in_game: number | null;
  model: { id: number; name: string; version: string; status: string } | null;
  verified_at: string;
  invalidated: boolean;
  invalidation_reason: string | null;
  /** Descriptive historical statistics (NOT predictions). null for team/game markets. */
  context: SelectionContext | null;
  origin: QuoteOrigin;
};

export type LineupStatus = "confirmed" | "projected" | "unknown";
export type QuoteOrigin = "provider" | "owner_entered" | "hypothetical";
export type SelectionContext = {
  l5: number | null;
  l10: number | null;
  l20: number | null;
  season_avg: number | null;
  proj_min: number | null;
  lineup_role: "starter" | "bench" | null;
  lineup_status: LineupStatus | null;
};
export type PlayerRef = {
  id: number;
  name: string;
  team_abbr: string | null;
  position: string | null;
  jersey: string | null;
  headshot_url: string | null;
};

export type ComboLeg = {
  selection_id: number;
  label: string;
  game_id: string;
  game_label: string;
  market: string;
  subject_name: string;
  side: string;
  line: number | null;
  price_american: number | null;
  prob: number | null;
  prob_low: number | null;
  prob_high: number | null;
  classification: string;
  evidence_score: number | null;
  sample_size: number | null;
  supporting: string[];
  opposing: string[];
};

export type ComboEngine = "DOUBLE" | "TRIPLE" | "QUAD" | "FIVE" | "SIX";

export type Combo = {
  uid: string;
  engine: ComboEngine;
  n_legs: number;
  structure: "SGP" | "CROSS" | "MIXED";
  name: string;
  legs: ComboLeg[];
  joint_prob: number | null;
  joint_low: number | null;
  joint_high: number | null;
  independent_prob: number | null;
  correlation: {
    method: string;
    seed: number | null;
    draws: number | null;
    mc_se: number | null;
    assessment: string;
    pairwise: { a: string; b: string; rho: number }[];
    shared_risks: string[];
  };
  observed_quote: { decimal: number; american: number; book: string; at: string } | null;
  reference_price: { decimal: number; american: number; note: string } | null;
  evidence_score: number | null;
  weakest_assumption: string | null;
  classification: string;
  designation: "research_only" | "paper_testing";
  rejection_reasons: string[];
  invalidation_conditions: string[];
  created_at: string;
  validated_at: string;
  invalidated: boolean;
  invalidation_reason: string | null;
};

export type BuilderEvaluation = Combo & { warnings: string[]; reliable: boolean };

export type InjuryRow = {
  player_id: number | null;
  player_name: string;
  team_abbr: string | null;
  status: string;
  detail: string | null;
  comment: string | null;
  source: string;
  source_published_at: string | null;
  ingested_at: string;
  headshot_url: string | null;
  game_label: string | null;
  previous_status: string | null;
  stale: boolean;
};

export type Quote = {
  market: string;
  side: string;
  line: number | null;
  price_american: number | null;
  book: string;
  at: string;
};

export type GameEnvironment = {
  proj_home_points: number;
  proj_away_points: number;
  proj_total: number;
  proj_margin: number;
  proj_pace: number;
  total_p10: number;
  total_p90: number;
  notes: string[];
};

export type GameCard = {
  id: string;
  date: string;
  tipoff_utc: string | null;
  status: "scheduled" | "live" | "final" | "postponed";
  home: TeamRef;
  away: TeamRef;
  home_points: number | null;
  away_points: number | null;
  venue: string | null;
  label: string;
  injuries: { home: InjuryRow[]; away: InjuryRow[] };
  lineup_status: string;
  research_completeness: { score: number; items: { name: string; ok: boolean; note: string }[] };
  environment: GameEnvironment | null;
  quotes: Quote[];
  top_picks: Selection[];
  n_evaluated: number;
  n_rejected: number;
  no_picks_reason: string | null;
  lineup: { home: { status: LineupStatus; verified_at: string | null }; away: { status: LineupStatus; verified_at: string | null } };
  props: { quoted_markets: number; players_projected: number };
};

export type EditionKind = "morning" | "midday" | "afternoon" | "pregame" | "final" | "update";
export type EditionRef = { id: number; key: string; kind: EditionKind; version: number; published_at: string };
export type EditionChange = { type: string; text: string };
export type EditionListItem = EditionRef & { counts: Record<string, number>; changes: EditionChange[] };

export type EditionDetail = EditionRef & {
  game_date: string;
  summary: {
    slate: unknown;
    narrative: string[];
    limitations: string[];
    unresolved: string[];
    rejected: { label: string; reasons: string[] }[];
    counts: Record<string, number>;
  };
  changes: EditionChange[];
  content_sha256: string;
  /** Only high_confidence / standard / watchlist rows (max 150). */
  selections: Selection[];
  selection_counts: Record<string, number>;
  combos: Combo[];
};

export type TicketSettlement = {
  result: "win" | "loss" | "push" | "void" | "unresolved";
  pnl_units: number | null;
  settled_at: string;
  leg_results: { label: string; result: string; actual: number | null }[];
  forensic: { verdict: string; findings: string[] };
};

export type Ticket = {
  id: number;
  kind: "single" | "combo";
  engine: string;
  structure: string;
  source: string;
  game_date: string;
  combo_uid: string | null;
  legs: ComboLeg[];
  model_prob: number | null;
  prob_low: number | null;
  prob_high: number | null;
  price_decimal: number | null;
  price_basis: "observed_quote" | "leg_product_reference" | "none";
  classification: string;
  stake_units: number;
  created_at: string;
  settlement: TicketSettlement | null;
};

export type Summary = {
  tickets: number;
  settled: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  unresolved: number;
  hit_rate: number | null;
  hit_rate_ci: [number, number] | null;
  avg_model_prob: number | null;
  staked_units: number;
  pnl_units: number | null;
  roi: number | null;
  roi_ci: [number, number] | null;
  max_drawdown_units: number | null;
  priced_tickets: number;
};

export type CalibrationBucket = {
  bucket: string;
  n: number;
  predicted: number;
  observed: number | null;
  ci: [number, number] | null;
};

export type ResultsResponse = {
  summary: Summary;
  by_engine: ({ engine: string } & Summary)[];
  by_structure: ({ structure: string } & Summary)[];
  calibration: CalibrationBucket[];
  equity_curve: { date: string; pnl_units: number; cumulative: number }[];
  selection_outcomes: { n: number; note: string };
  items: Ticket[];
  total: number;
  disclaimer: string;
};

export type CommandCenter = {
  date: string;
  is_today: boolean;
  available_dates: string[];
  edition: EditionRef | null;
  editions: EditionRef[];
  slate: { n_games: number; games: GameCard[] };
  counts: {
    markets_analyzed: number;
    qualified_selections: number;
    combinations: number;
    high_confidence: number;
    rejected: number;
  };
  high_confidence: Selection[];
  injury_changes: { text: string; at: string }[];
  latest_refresh_at: string | null;
  model_readiness: { family: string; name: string; version: string; status: string; ready: boolean; note: string }[];
  paper_performance: Summary;
  agents: { ok: number; failed: number; never_run: number };
  findings: { finding_uid: string; hypothesis: string; status: string }[];
  warnings: string[];
  lineups_summary: { confirmed: number; projected: number; unknown: number };
  props_summary: { provider_configured: boolean; quoted_markets: number; manual_entries: number; players_projected: number; message: string };
};

export type ExposureShare = { tickets: number; share: number };
export type Exposure = {
  date: string;
  n_tickets: number;
  players: ({ name: string } & ExposureShare)[];
  teams: ({ abbr: string } & ExposureShare)[];
  games: ({ label: string } & ExposureShare)[];
  selections: ({ label: string } & ExposureShare)[];
  shared_assumptions: string[];
  pairwise: { a: string; b: string; shared_legs: number; rho: number | null }[];
  simulation: {
    draws: number;
    seed: number;
    p_at_least_one: number | null;
    p_all_lose: number | null;
    expected_pnl_units: number | null;
    pnl_p10: number | null;
    pnl_p90: number | null;
    independent_p_at_least_one: number | null;
  } | null;
  notes: string[];
};

export type TeamFormStats = {
  record: string;
  last_10: string;
  points_per_game: number;
  opp_points_per_game: number;
  off_rating: number | null;
  def_rating: number | null;
  pace: number | null;
  last_10_points_per_game: number;
  last_10_opp_points_per_game: number;
  games_in_sample: number;
};
/** `{}` when the team has no history. */
export type TeamForm = Partial<TeamFormStats>;
export type PlayerProj = {
  player_id: number;
  player_name: string;
  team_abbr: string | null;
  stat: "pts" | "reb" | "ast" | "fg3m";
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  proj_min: number;
  n_games: number;
  injury_status: string | null;
};

export type GameDetail = {
  game: GameCard;
  team_form: { home: TeamForm; away: TeamForm };
  player_projections: PlayerProj[];
  selections: Selection[];
  sgp: Combo[];
  /** Counts by classification for the whole game; `selections` itself is bounded. */
  selection_counts: Record<string, number>;
  h2h: { date: string; home_abbr: string; away_abbr: string; home_points: number | null; away_points: number | null }[];
  agent_reports: { agent: string; at: string; summary: string }[];
  unresolved: string[];
};

export type ComboCategory = "double" | "triple" | "quad" | "five" | "six" | "sgp" | "cross";
export type CombosResponse = {
  edition: EditionRef | null;
  category: string;
  counts: Record<string, number>;
  items: Combo[];
};
export type SelectionsResponse = { edition: EditionRef | null; items: Selection[]; total: number; counts: Record<string, number> };

export type PlayerListItem = {
  id: number;
  name: string;
  team_abbr: string | null;
  position: string | null;
  games: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  fg3m: number | null;
  last_game_date: string | null;
};

export type PlayerDetail = {
  player: PlayerRef;
  next_game: { game_id: string; label: string; date: string; tipoff_utc: string | null; opp_abbr: string; is_home: boolean } | null;
  lineup: { role: "starter" | "bench" | null; status: LineupStatus } | null;
  markets: PropRow[];
  sample: { games: number };
  splits: {
    label: string;
    games: number;
    min: number | null;
    pts: number | null;
    reb: number | null;
    ast: number | null;
    fg3m: number | null;
    stl: number | null;
    blk: number | null;
    tov: number | null;
  }[];
  game_log: {
    date: string;
    opp_abbr: string;
    is_home: boolean;
    min: number | null;
    pts: number | null;
    reb: number | null;
    ast: number | null;
    fg3m: number | null;
    stl: number | null;
    blk: number | null;
    tov: number | null;
  }[];
  projections: {
    stat: string;
    mean: number | null;
    p10: number | null;
    p50: number | null;
    p90: number | null;
    game_label: string;
    model_version: string;
    created_at: string;
  }[];
  forecast_accuracy: { stat: string; n: number; mae: number | null; coverage_80: number | null }[];
  injury: InjuryRow | null;
};

export type TeamListItem = TeamRef & {
  games: number | null;
  wins: number | null;
  losses: number | null;
  off_rtg: number | null;
  def_rtg: number | null;
  pace: number | null;
};

export type TeamDetail = {
  team: TeamListItem;
  recent: { date: string; opp_abbr: string; is_home: boolean; points: number | null; opp_points: number | null }[];
  roster: {
    id: number;
    name: string;
    position: string | null;
    games: number | null;
    min: number | null;
    pts: number | null;
    reb: number | null;
    ast: number | null;
  }[];
  injuries: InjuryRow[];
};

export type InjuriesResponse = {
  as_of: string | null;
  source: string;
  items: InjuryRow[];
  changes: { text: string; at: string }[];
};

export type ModelItem = {
  id: number;
  family: string;
  name: string;
  version: string;
  status: string;
  training_period: string | null;
  calibration_period: string | null;
  evaluation_period: string | null;
  limitations: string | string[] | null;
  promoted_by: string | null;
  promoted_at: string | null;
  latest_evaluation: { n_obs: number; metrics: Record<string, number | null>; passed: boolean } | null;
};

export type BacktestItem = {
  id: number;
  family: string;
  model_name: string;
  kind: string;
  period: string | null;
  n_obs: number | null;
  metrics: Record<string, unknown>;
  passed: boolean | null;
  notes: string | null;
  created_at: string;
};

export type Finding = {
  finding_uid: string;
  hypothesis: string;
  supporting: string[];
  contradicting: string[];
  sample_size: number | null;
  proposed_experiment: string | null;
  result: string | null;
  limitations: string | null;
  status: string;
  created_at: string;
};

export type ResearchLab = {
  findings: Finding[];
  experiments: BacktestItem[];
  correlation: { pairs: { a: string; b: string; rho: number; n: number }[]; notes: string[] } | null;
};

export type AgentItem = {
  id: string;
  number: number;
  name: string;
  role: string;
  trigger: string;
  deterministic: boolean;
  status: "ok" | "failed" | "abstained" | "never_run";
  last_execution_at: string | null;
  last_success_at: string | null;
  duration_ms: number | null;
  last_summary: string | null;
  error: string | null;
  next_run_at: string | null;
  provider_calls: number | null;
};

export type DataHealth = {
  providers: {
    provider: string;
    configured: boolean;
    status: string;
    last_success_at: string | null;
    last_error_at: string | null;
    calls_this_month: number | null;
    quota_used: number | null;
    quota_limit: number | null;
    monthly_cost_usd: number | null;
  }[];
  coverage: {
    season: string | number;
    games: number | null;
    games_with_box: number | null;
    player_rows: number | null;
    first_date: string | null;
    last_date: string | null;
  }[];
  freshness: { name: string; at: string | null; age_minutes: number | null; max_age_minutes: number | null; ok: boolean }[];
  warnings: string[];
};

export type Operations = {
  paused: boolean;
  heartbeats: { worker: string; role: string; beat_at: string | null; alive: boolean }[];
  schedule: { name: string; description: string; next_run_et: string | null }[];
  recent_jobs: {
    id: number | string;
    name: string;
    status: string;
    attempts: number | null;
    created_at: string;
    finished_at: string | null;
    error: string | null;
  }[];
  dead_letter: number;
};

export type SettingsResponse = {
  timezone: string;
  paper_unit: number | string;
  risk_policy: Record<string, unknown>;
  providers_configured: Record<string, boolean>;
  llm_enabled: boolean;
  env: string;
};

export type AuthUser = { email: string; role: string };
export type AuthResponse = { user: AuthUser; csrf: string };
export type ReadyResponse = {
  status: "ready" | "degraded";
  checks: { database: boolean; worker: boolean; scheduler: boolean };
};

// ---------- V3: player intelligence, props, lineups ----------
export type StatKey = "min" | "pts" | "reb" | "ast" | "fg3m" | "stl" | "blk" | "tov" | "pra" | "pr" | "pa" | "ra";
export type WindowKey = "L3" | "L5" | "L10" | "L15" | "L20" | "L30" | "season" | "prev_season" | "regular_season" | "playoffs";
export type StatSummary = { mean: number; median: number; min: number; max: number; sd: number | null; p25: number; p75: number };
export type AveragesWindow = {
  key: WindowKey;
  label: string;
  requested: number | null;
  games: number;
  missed: number | null;
  small_sample: boolean;
  available: boolean;
  note: string | null;
  stats: Record<string, StatSummary>;
};
export type AveragesResponse = { definition: string; windows: AveragesWindow[] };

export type GameLogRow = {
  game_id: string;
  date: string;
  opp_abbr: string;
  is_home: boolean;
  starter: boolean | null;
  result: "W" | "L" | null;
  team_points: number | null;
  opp_points: number | null;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  fg3m: number;
  stl: number;
  blk: number;
  tov: number;
  pra: number;
  fga: number;
  fta: number;
  usage: number | null;
};
export type GameLogsResponse = { items: GameLogRow[]; total: number; missed: { date: string; opp_abbr: string; reason: string }[]; source: string };

export type ThresholdGame = {
  game_id: string;
  date: string;
  opp_abbr: string;
  is_home: boolean;
  starter: boolean | null;
  min: number;
  value: number;
  outcome: "over" | "under" | "equal";
};
export type Threshold = {
  player_id: number;
  stat: string;
  line: number;
  window: string;
  measurement: "A";
  label: string;
  n: number;
  over: number;
  under: number;
  equal: number;
  frequency_over: number | null;
  average: number | null;
  games: ThresholdGame[];
  market_history: { available: false; reason: string } | { available: true; n: number; over: number; under: number; push: number };
  notes: string[];
};

export type SplitRow = {
  group: string;
  label: string;
  games: number;
  small_sample: boolean;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  fg3m: number | null;
  pra: number | null;
};
export type SplitsResponse = { splits: SplitRow[]; notes: string[] };

export type PropRow = {
  player_id: number;
  player_name: string;
  headshot_url: string | null;
  team_abbr: string;
  opp_abbr: string;
  game_id: string;
  game_label: string;
  market: string;
  stat: string;
  line: number | null;
  over_price: number | null;
  under_price: number | null;
  book: string | null;
  origin: QuoteOrigin | null;
  quote_at: string | null;
  l5: number | null;
  l10: number | null;
  l20: number | null;
  season_avg: number | null;
  n_games: number;
  hist_over: number | null;
  hist_n: number | null;
  proj_min: number | null;
  projection: number | null;
  p10: number | null;
  p90: number | null;
  availability: string;
  lineup_role: "starter" | "bench" | null;
  lineup_status: LineupStatus;
  model_ready: boolean;
  model_status: string;
  selection: { id: number; side: string; classification: string; prob: number | null; prob_low: number | null; prob_high: number | null } | null;
  updated_at: string | null;
};
export type PropMarketInfo = { key: string; label: string; stat: string; operational: boolean; note: string | null };
export type PlayerPropsResponse = {
  date: string;
  markets: PropMarketInfo[];
  quote_status: { provider_configured: boolean; message: string };
  items: PropRow[];
  total: number;
};

export type ManualEntry = {
  id: number;
  game_id: string;
  game_label: string;
  player_id: number;
  player_name: string;
  market: string;
  line: number;
  over_price: number | null;
  under_price: number | null;
  book: string | null;
  origin: "owner_entered" | "hypothetical";
  observed_at: string | null;
  source_ref: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  withdrawn: boolean;
};
export type ManualEntryBody = {
  game_id: string;
  player_id: number;
  market: string;
  line: number;
  over_price?: number;
  under_price?: number;
  odds_format?: "american" | "decimal";
  origin: "owner_entered" | "hypothetical";
  book?: string;
  observed_at?: string;
  source_ref?: string;
  note?: string;
};

export type LineupPlayer = {
  player_id: number | null;
  name: string;
  headshot_url: string | null;
  jersey: string | null;
  position: string | null;
  role: "starter" | "bench";
  availability: string;
  injury_detail: string | null;
  proj_min: number | null;
  recent_min: number | null;
  starts_last10: number | null;
};
export type TeamLineup = {
  team: TeamRef;
  status: LineupStatus;
  source: string;
  verified_at: string | null;
  note: string;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
  unavailable: LineupPlayer[];
};
export type LineupGame = {
  game: { id: string; label: string; tipoff_utc: string | null; status: string; home: TeamRef; away: TeamRef };
  home: TeamLineup;
  away: TeamLineup;
};
export type LineupsResponse = { date: string; games: LineupGame[] };
export type GameLineups = { game_id: string; home: TeamLineup; away: TeamLineup };
export type LineupHistory = { items: { at: string; team_abbr: string; status: LineupStatus; change: string; source: string }[] };

export type ProviderInfo = {
  provider: string;
  name: string;
  categories: string[];
  configured: boolean;
  credential: "present" | "missing" | "not_required";
  status: string;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  calls_this_month: number;
  quota_used: number;
  quota_limit: number | null;
  monthly_cost_usd: number;
  limitations: string[];
  setup: string;
};

export type StrategyGroup = { key: string; label: string; kind: "market" | "engine" | "structure" } & Summary;
export type StrategiesResponse = {
  groups: StrategyGroup[];
  forecast: { stat: string; n: number; mae: number | null; coverage_80: number | null }[];
  disclaimer: string;
};

// ---------- Core Intelligence V1: Kalshi, minutes, availability events ----------
export type KalshiInterpretation = "normalized" | "unsupported" | "unmatched";
export type KalshiMarketRow = {
  ticker: string;
  event_ticker: string;
  series: string;
  game_id: string;
  game_label: string | null;
  kind: "player" | "game" | "total" | "spread" | "other";
  market: string | null;
  stat: string | null;
  stat_label: string | null;
  player_id: number | null;
  player_name: string | null;
  team_abbr: string | null;
  title: string;
  threshold: number | null;
  comparator: string | null;
  contract_type: string | null;
  interpretation: KalshiInterpretation;
  interpretation_note: string | null;
  protected: boolean;
  status: string;
  open_time: string | null;
  close_time: string | null;
  yes_bid: number | null;
  yes_ask: number | null;
  no_bid: number | null;
  no_ask: number | null;
  last_price: number | null;
  volume: number | null;
  open_interest: number | null;
  yes_ask_size: number | null;
  yes_bid_size: number | null;
  price: number | null;
  first_observed: number | null;
  first_observed_at: string | null;
  change_since_first: number | null;
  high: number | null;
  low: number | null;
  spread: number | null;
  windows: Record<"5m" | "15m" | "30m" | "60m" | "3h", number | null>;
  observations: number;
  last_observed_at: string | null;
  first_seen_at: string;
};
export type KalshiSync = { last_sync_at: string | null; age_minutes: number | null; poll_minutes: number; stale: boolean; note: string };
export type KalshiMarketsResponse = {
  date: string;
  sync: KalshiSync;
  counts: { total: number; normalized: number; unsupported: number; unmatched: number };
  events: { game_id: string; label: string }[];
  items: KalshiMarketRow[];
  total: number;
  notes: string[];
};
export type KalshiSeriesPoint = {
  at: string;
  price: number | null;
  yes_bid: number | null;
  yes_ask: number | null;
  last_price: number | null;
  spread: number | null;
  volume: number | null;
  open_interest: number | null;
  status: string | null;
};
export type KalshiTimelineEvent = {
  at: string;
  type: "availability" | "lineup" | "market_status";
  own_player: boolean;
  text: string;
  source: string | null;
  source_published_at: string | null;
};
export type KalshiHistoryWindow = { n: number; over: number; under: number; equal: number; frequency_over: number | null; average: number | null };
export type KalshiResearch = {
  player: { id: number; name: string; headshot_url: string | null; position: string | null } | null;
  model_ready: boolean;
  projection: { mean: number | null; p10: number | null; p90: number | null; proj_min: number | null; created_at: string | null } | null;
  selections: { id: number; side: string; classification: string; prob: number | null; prob_low: number | null; prob_high: number | null; breakeven: number | null; rejection_reasons: string[] }[];
  note: string;
};
export type KalshiMarketDetail = {
  market: KalshiMarketRow;
  rules: { primary: string | null; secondary: string | null; settlement_note: string };
  series: KalshiSeriesPoint[];
  timeline: KalshiTimelineEvent[];
  history: Partial<Record<"L5" | "L10" | "L20" | "season", KalshiHistoryWindow>> | null;
  research: KalshiResearch | null;
  sync: KalshiSync;
  notes: string[];
};

export type MinutesRow = {
  player_id: number;
  player_name: string;
  headshot_url: string | null;
  position: string | null;
  team_abbr: string | null;
  opp_abbr: string | null;
  game_id: string | null;
  availability: string;
  injury_detail: string | null;
  lineup_role: "starter" | "bench" | null;
  lineup_status: LineupStatus;
  proj_min: number | null;
  proj_min_low: number | null;
  proj_min_high: number | null;
  tier: string | null;
  season_avg: number | null;
  season_median: number | null;
  l3: number | null;
  l5: number | null;
  l10: number | null;
  l20: number | null;
  min_l10: number | null;
  max_l10: number | null;
  sd_l10: number | null;
  starts_l10: number | null;
  starts_season: number | null;
  bench_season: number | null;
  games_season: number;
  games_all: number;
  role_change: number | null;
  returned_recently: boolean;
  last_gap_days: number;
  restriction: string | null;
  last_game_date: string;
  classification: string;
  classification_label: string;
  classification_reason: string;
  source_updated_at: string | null;
};
export type MinutesModel = { name: string; version: string; status: string } | null;
export type MinutesMeta = { model: MinutesModel; uncertainty: string; restrictions_note: string; tiers: string[]; rules: Record<string, number> };
export type MinutesResponse = { date: string; items: MinutesRow[]; total: number } & MinutesMeta;
export type PlayerMinutesResponse = { profile: MinutesRow | null } & MinutesMeta;

export type InjuryChange = {
  at: string;
  player_id: number | null;
  player_name: string;
  headshot_url: string | null;
  team_abbr: string | null;
  previous_status: string | null;
  current_status: string | null;
  previous_class: string | null;
  current_class: string | null;
  material: boolean;
  detail: string | null;
  game_id: string | null;
  game_label: string | null;
  source: string | null;
  source_published_at: string | null;
  lineup_changes: string[];
  records_to_reassess: number;
  qualified_records_affected: number;
};
export type InjuryChangesResponse = { date: string; items: InjuryChange[]; notes: string[] };
