import { http } from "./api";

/** GIZER CORTEX: the knowledge library and the profiles computed from stored box scores. Read-only. */

export const CONCEPT_KINDS = ["rule", "statistic", "offense", "defense", "role", "concept", "context", "market", "method", "live"] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];
export type Verification = "checked_against_source" | "authored_not_checked";

export type ConceptShort = {
  slug: string;
  title: string;
  department: number;
  department_name: string;
  kind: string;
  summary: string;
  ruleset: string;
  verification: string;
  version: number;
  sources: string[];
  score?: number;
};
export type ConceptList = { mode: "browse" | "search"; query?: string; method?: string; items: ConceptShort[]; total: number };
export type ConceptSource = { key: string; title: string; url: string | null; note: string | null };
export type Concept = Omit<ConceptShort, "sources"> & {
  body: string;
  formula: string | null;
  season_note: string | null;
  updated_at: string | null;
  limitations: string[];
  when_not_to_use: string | null;
  player_responsibilities: string | string[] | null;
  common_responses: string | string[] | null;
  observable_in_our_data: string[];
  data_gaps: string[];
  evaluation_questions: string[];
  related: { slug: string; title: string }[];
  sources: ConceptSource[];
};

export type BenchmarkSummary = {
  questions: number;
  target: number;
  by_category: Record<string, number>;
  by_type: Record<string, number>;
  by_split: Record<string, number>;
  reviewed_by_a_person: number;
  note: string;
};
export type BenchmarkRun = { id: number | string; kind: string; split: string | null; model: string | null; n: number | null; score: number | null; cost_usd: number | null; created_at: string; by_category?: Record<string, unknown> | null; misses?: unknown[] | null };
export type Benchmark = BenchmarkSummary & {
  runs: BenchmarkRun[];
  recent_retrievals: { query: string; returned: string[]; method: string; ms: number | null; caller: string | null; at: string }[];
  sample_questions: { id: string; category: string; type: string; question: string; choices: string[] | null }[];
  how_to_run: string;
};

export type CortexOverview = {
  knowledge_records: number;
  records_checked_against_a_source: number;
  records_authored_not_checked: number;
  departments: { id: number; name: string; records: number }[];
  by_kind: Record<string, number>;
  sources_indexed: number;
  sources_opened_by_author: number;
  player_profiles_available: number;
  team_profiles_available: number;
  coaching_profiles_available: number;
  coaching_note: string;
  research_findings: Record<string, number>;
  unresolved_hypotheses: number;
  last_knowledge_update: string | null;
  retrievals_logged: number;
  benchmark: BenchmarkSummary;
  benchmark_runs: BenchmarkRun[];
  season: string;
  not_built: string[];
};

export type CortexSource = { key: string; title: string; publisher: string | null; url: string | null; league: string | null; kind: string | null; reliability: string | null; permission: string | null; accessed: string | null; access_result: string | null; records_citing: number };

export type CortexPlayerRow = { player_id: number; name: string; team_abbr: string | null; position: string | null; headshot_url: string | null; games: number | null; minutes: number | null };
export type SeasonLine = {
  games: number | null;
  minutes_total: number | null;
  mpg: number | null;
  usage: number | null;
  usage_games: number | null;
  pts36: number | null;
  reb36: number | null;
  ast36: number | null;
  fg3m36: number | null;
  stl36: number | null;
  blk36: number | null;
  tov36: number | null;
  fga36: number | null;
  fta36: number | null;
  true_shooting_pct: number | null;
  start_share: number | null;
  starts_known_games: number | null;
  minutes_sd: number | null;
};
export type PlayerDna = {
  identity: { player_id: number; name: string; team: string | null; team_id: number | null; position: string | null; jersey: string | null; headshot_url: string | null; last_game_date: string | null; not_held: string[] };
  season: string;
  team_history: { season: string; team: string; games: number; first: string | null; last: string | null }[];
  generated_at: string | null;
  method: string | null;
  available: boolean;
  note?: string | null;
  season_line?: SeasonLine | null;
  recent_10?: { games: number | null; mpg: number | null; pts: number | null; reb: number | null; ast: number | null; usage: number | null } | null;
  archetypes?: { key: string; label: string; rule: string }[];
  archetype_status?: string | null;
  teammate_context?: { teammate: string; games_with: number; games_without: number; usage_with: number | null; usage_without: number | null; small_sample: boolean }[] | null;
  tactical_profile?: { available: boolean; reason: string } | null;
  not_available?: string[];
  notes?: string[];
};

export type CortexTeamRow = { team_id: number; abbr: string; name: string; profile_available: boolean };
export type TeamRotation = {
  games: number | null;
  players_10_plus_minutes_per_game: number | null;
  rotation_length_range: [number, number] | null;
  games_with_confirmed_starters: number | null;
  starter_minutes_avg: number | null;
  bench_points_per_game: number | null;
  distinct_starting_fives: number | null;
  most_used_starting_fives: { players: string[]; games: number }[];
  minutes_leaders: { player_id: number | null; name: string; games: number; mpg: number | null }[];
  first_substitution: { games_observed_live: number; average_minutes_into_game?: number | null; note?: string | null } | null;
};
export type TeamDna = {
  team_id: number;
  abbr: string;
  name: string;
  season: string;
  generated_at: string | null;
  method: string | null;
  available: boolean;
  note?: string | null;
  record?: { games: number; wins: number; losses: number; home: string | null; away: string | null; points_per_game: number | null; points_allowed_per_game: number | null; point_differential: number | null } | null;
  ratings?: { games_with_possessions: number | null; pace_possessions_per_game: number | null; offensive_rating: number | null; defensive_rating: number | null; net_rating: number | null; note: string | null } | null;
  shot_volume?: { three_pointers_made_per_game: number | null; field_goal_attempts_per_game: number | null; free_throw_attempts_per_game: number | null; turnovers_per_game: number | null } | null;
  rotation?: TeamRotation | null;
  coach?: { identity: string | null; note: string } | null;
  tactical_identity?: { available: boolean; reason: string } | null;
  not_available?: string[];
  notes?: string[];
};

export type Finding = { uid: string; hypothesis: string; supporting: string[]; contradicting: string[]; sample_size: number | string | null; proposed_experiment: string | null; result: string | null; limitations: string | string[] | null; status: string; source: string | null };

export type ConceptFilters = { q?: string; department?: number | string; kind?: string; verification?: string; limit?: number; offset?: number };

export const cortex = {
  overview: () => http.get<CortexOverview>("/cortex/overview"),
  concepts: (f: ConceptFilters = {}) => http.get<ConceptList>("/cortex/concepts", { q: f.q || undefined, department: f.department || undefined, kind: f.kind || undefined, verification: f.verification || undefined, limit: f.limit, offset: f.offset }),
  concept: (slug: string) => http.get<Concept>(`/cortex/concepts/${encodeURIComponent(slug)}`),
  sources: () => http.get<{ items: CortexSource[] }>("/cortex/sources"),
  players: (q?: string, limit = 60) => http.get<{ season: string; items: CortexPlayerRow[] }>("/cortex/players", { q: q || undefined, limit }),
  playerDna: (id: number | string) => http.get<PlayerDna>(`/cortex/players/${id}/dna`),
  teams: () => http.get<{ season: string; items: CortexTeamRow[] }>("/cortex/teams"),
  teamDna: (id: number | string) => http.get<TeamDna>(`/cortex/teams/${id}/dna`),
  research: (status?: string) => http.get<{ items: Finding[]; note: string }>("/cortex/research", { status: status || undefined, limit: 100 }),
  benchmark: () => http.get<Benchmark>("/cortex/benchmark"),
};

export const KIND_LABELS: Record<string, string> = {
  rule: "Rule",
  statistic: "Statistic",
  offense: "Offense",
  defense: "Defense",
  role: "Role",
  concept: "Concept",
  context: "Context",
  market: "Market",
  method: "Method",
  live: "Live game",
};
export const kindLabel = (k: string): string => KIND_LABELS[k] ?? k.replace(/_/g, " ");

export const VERIFICATION_LABELS: Record<string, string> = { checked_against_source: "Checked against source", authored_not_checked: "Not checked" };

/** Free text from the API: "opened and read …" is the only state treated as read. */
export const sourceWasOpened = (accessResult: string | null | undefined): boolean => /^opened and read/i.test((accessResult ?? "").trim());

export const CORTEX_TABS = [
  ["overview", "Overview"],
  ["encyclopedia", "Encyclopedia"],
  ["playbook", "Playbook"],
  ["player-dna", "Player DNA"],
  ["team-dna", "Team DNA"],
  ["coach-dna", "Coach DNA"],
  ["statistics", "Statistics"],
  ["research", "Research Journal"],
  ["sources", "Sources"],
  ["coverage", "Coverage"],
  ["evaluations", "Evaluations"],
] as const;

/** A field that is a sentence in some records and a list in others. */
export const asList = (v: string | string[] | null | undefined): string[] => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]).filter((s) => s.trim().length > 0);
