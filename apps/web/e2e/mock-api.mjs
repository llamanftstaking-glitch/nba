#!/usr/bin/env node
// GIZER NBA — mock API for local development and the smoke test ONLY.
//
// A dependency-free Node http server that implements docs/architecture/API-CONTRACT.md with
// obviously synthetic data (everything a model would produce is prefixed "FIXTURE").
// It is never imported by application code. Run: `node e2e/mock-api.mjs` (port 8000, override with MOCK_API_PORT).
//
// Login: owner@fixture.test / fixture-password

import http from "node:http";

const PORT = Number(process.env.MOCK_API_PORT ?? 8000);
const CSRF = "fixture-csrf-token";
const USER = { email: "owner@fixture.test", role: "owner" };
const PASSWORD = "fixture-password";

// ---------- dates (America/New_York) ----------
const etDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
const NOW = new Date();
const TODAY = etDate(NOW);
const shift = (ymd, days) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
};
const YESTERDAY = shift(TODAY, -1);
const TWO_AGO = shift(TODAY, -2);
const iso = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
const tip = (ymd, hourUtc) => `${shift(ymd, 1)}T0${hourUtc}:00:00Z`; // evening ET == early next day UTC

// ---------- teams ----------
const logo = (abbr, color) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="${color}"/><text x="20" y="25" font-size="12" font-family="monospace" text-anchor="middle" fill="#fff">${abbr}</text></svg>`,
  )}`;
const T = {
  DET: { id: 1, abbr: "DET", name: "Detroit Pistons", logo_url: logo("DET", "#1d42ba") },
  ORL: { id: 2, abbr: "ORL", name: "Orlando Magic", logo_url: logo("ORL", "#0077c0") },
  BOS: { id: 3, abbr: "BOS", name: "Boston Celtics", logo_url: null }, // null → text fallback
  NYK: { id: 4, abbr: "NYK", name: "New York Knicks", logo_url: logo("NYK", "#f58426") },
  LAL: { id: 5, abbr: "LAL", name: "Los Angeles Lakers", logo_url: logo("LAL", "#552583") },
  DEN: { id: 6, abbr: "DEN", name: "Denver Nuggets", logo_url: null },
  MIA: { id: 7, abbr: "MIA", name: "Miami Heat", logo_url: logo("MIA", "#98002e") },
  CHI: { id: 8, abbr: "CHI", name: "Chicago Bulls", logo_url: logo("CHI", "#ce1141") },
};

const MODEL = { id: 11, name: "FIXTURE-props-gbm", version: "0.3.1", status: "candidate" };
const MODEL_GAME = { id: 12, name: "FIXTURE-game-elo", version: "0.2.0", status: "candidate" };

// ---------- selections ----------
let selId = 100;
function sel(o) {
  const id = ++selId;
  return {
    id,
    key: `FIXTURE-${o.game_id}-${o.market}-${id}`,
    edition_id: o.edition_id ?? 3,
    game_id: o.game_id,
    game_label: o.game_label,
    market: o.market,
    market_label: o.market_label,
    subject_type: o.market.startsWith("player_") ? "player" : o.market === "total" ? "game" : "team",
    subject_id: o.subject_id ?? null,
    subject_name: o.subject_name,
    team_abbr: o.team_abbr ?? null,
    side: o.side,
    line: o.line ?? null,
    price_american: o.price_american ?? null,
    book: o.book ?? null,
    quote_at: o.book ? iso(40) : null,
    projection: o.projection ?? null,
    prob: o.prob ?? null,
    prob_low: o.prob == null ? null : +(o.prob - 0.05).toFixed(3),
    prob_high: o.prob == null ? null : +(o.prob + 0.05).toFixed(3),
    breakeven: o.breakeven ?? null,
    edge: o.prob != null && o.breakeven != null ? +(o.prob - o.breakeven).toFixed(3) : null,
    sample_size: o.sample_size ?? null,
    evidence_score: o.evidence_score ?? null,
    evidence: {
      components:
        o.evidence_score == null
          ? []
          : [
              { name: "FIXTURE sample depth", score: Math.round(o.evidence_score * 0.3), max: 30, note: "FIXTURE note: synthetic observation count." },
              { name: "FIXTURE calibration", score: Math.round(o.evidence_score * 0.4), max: 40, note: "FIXTURE note: synthetic calibration window." },
              { name: "FIXTURE data freshness", score: Math.round(o.evidence_score * 0.3), max: 30, note: "" },
            ],
      supporting: o.supporting ?? ["FIXTURE supporting point: synthetic pace trend.", "FIXTURE supporting point: synthetic matchup split."],
      opposing: o.opposing ?? ["FIXTURE opposing point: synthetic small recent sample."],
    },
    classification: o.classification,
    rejection_reasons: o.rejection_reasons ?? [],
    rank_in_game: o.rank ?? null,
    model: o.model === null ? null : (o.model ?? MODEL),
    verified_at: iso(35),
    invalidated: Boolean(o.invalidated),
    invalidation_reason: o.invalidated ? "FIXTURE: line moved beyond tolerance after the edition was published." : null,
  };
}

const G1 = { game_id: "FIX-G1", game_label: "DET @ ORL" };
const G2 = { game_id: "FIX-G2", game_label: "BOS @ NYK" };
const G3 = { game_id: "FIX-G3", game_label: "LAL @ DEN" };

const S = {
  g1a: sel({ ...G1, market: "spread", market_label: "FIXTURE ORL +2.5", subject_name: "Orlando Magic", team_abbr: "ORL", side: "home", line: 2.5, price_american: -110, book: "FIXTUREBOOK", projection: 1.4, prob: 0.582, breakeven: 0.524, sample_size: 412, evidence_score: 72, classification: "standard", rank: 1, model: MODEL_GAME }),
  g1b: sel({ ...G1, market: "player_pts", market_label: "FIXTURE Player A Over 24.5 PTS", subject_id: 9001, subject_name: "FIXTURE Player A", team_abbr: "DET", side: "over", line: 24.5, price_american: -105, book: "FIXTUREBOOK", projection: 26.8, prob: 0.561, breakeven: 0.512, sample_size: 58, evidence_score: 64, classification: "standard", rank: 2 }),
  g1c: sel({ ...G1, market: "total", market_label: "FIXTURE Over 213.5", subject_name: "DET @ ORL", side: "over", line: 213.5, price_american: -112, book: "FIXTUREBOOK", projection: 214.1, prob: 0.512, breakeven: 0.528, sample_size: 390, evidence_score: 55, classification: "rejected", rejection_reasons: ["FIXTURE: edge below the minimum threshold.", "FIXTURE: interval includes the break-even probability."], model: MODEL_GAME }),
  g1d: sel({ ...G1, market: "player_reb", market_label: "FIXTURE Player B Under 8.5 REB", subject_id: 9002, subject_name: "FIXTURE Player B", team_abbr: "ORL", side: "under", line: 8.5, price_american: 102, book: "FIXTUREBOOK", projection: 7.9, prob: 0.547, breakeven: 0.495, sample_size: 31, evidence_score: 48, classification: "watchlist" }),
  g2a: sel({ ...G2, market: "moneyline", market_label: "FIXTURE NYK moneyline", subject_name: "New York Knicks", team_abbr: "NYK", side: "home", price_american: 120, book: "FIXTUREBOOK", prob: 0.44, breakeven: 0.455, sample_size: 388, evidence_score: 51, classification: "rejected", rejection_reasons: ["FIXTURE: model probability below break-even."], model: MODEL_GAME }),
  g2b: sel({ ...G2, market: "player_ast", market_label: "FIXTURE Player C Over 6.5 AST", subject_id: 9003, subject_name: "FIXTURE Player C", team_abbr: "BOS", side: "over", line: 6.5, price_american: -118, book: "FIXTUREBOOK", projection: 6.9, prob: 0.53, breakeven: 0.541, sample_size: 12, evidence_score: 22, classification: "insufficient_evidence", rejection_reasons: ["FIXTURE: sample size below the minimum (n=12)."] }),
  // every nullable field is null here on purpose
  g2c: sel({ ...G2, market: "player_fg3m", market_label: "FIXTURE Player D Over 2.5 3PM", subject_id: 9004, subject_name: "FIXTURE Player D", team_abbr: "NYK", side: "over", classification: "insufficient_evidence", rejection_reasons: ["FIXTURE: no verified quote and no projection available."], model: null, supporting: [], opposing: [] }),
  g3a: sel({ ...G3, market: "player_pts", market_label: "FIXTURE Player E Under 27.5 PTS", subject_id: 9005, subject_name: "FIXTURE Player E", team_abbr: "DEN", side: "under", line: 27.5, price_american: -108, book: "FIXTUREBOOK", projection: 25.6, prob: 0.573, breakeven: 0.519, sample_size: 64, evidence_score: 68, classification: "standard", rank: 1 }),
  g3b: sel({ ...G3, market: "spread", market_label: "FIXTURE LAL +6.5", subject_name: "Los Angeles Lakers", team_abbr: "LAL", side: "away", line: 6.5, price_american: -110, book: "FIXTUREBOOK", projection: -5.1, prob: 0.551, breakeven: 0.524, sample_size: 402, evidence_score: 58, classification: "watchlist", invalidated: true, model: MODEL_GAME }),
  g3c: sel({ ...G3, market: "total", market_label: "FIXTURE Under 229.5", subject_name: "LAL @ DEN", side: "under", line: 229.5, price_american: -110, book: "FIXTUREBOOK", projection: 229.9, prob: 0.497, breakeven: 0.524, sample_size: 402, evidence_score: 50, classification: "rejected", rejection_reasons: ["FIXTURE: negative edge."], model: MODEL_GAME }),
};
const TODAY_SELECTIONS = Object.values(S);
const SEL_BY_ID = new Map(TODAY_SELECTIONS.map((s) => [s.id, s]));

// ---------- combos ----------
const leg = (s) => ({
  selection_id: s.id, label: s.market_label, game_id: s.game_id, game_label: s.game_label, market: s.market,
  subject_name: s.subject_name, side: s.side, line: s.line, price_american: s.price_american,
  prob: s.prob, prob_low: s.prob_low, prob_high: s.prob_high, classification: s.classification,
  evidence_score: s.evidence_score, sample_size: s.sample_size,
  supporting: s.evidence.supporting, opposing: s.evidence.opposing,
});
const dec = (a) => (a == null ? null : a > 0 ? 1 + a / 100 : 1 + 100 / -a);
const toAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)));
const ENGINE = { 2: "DOUBLE", 3: "TRIPLE", 4: "QUAD", 5: "FIVE", 6: "SIX" };

function combo(uid, name, sels, extra = {}) {
  const legs = sels.map(leg);
  const probs = legs.map((l) => l.prob);
  const ind = probs.every((p) => p != null) ? probs.reduce((a, b) => a * b, 1) : null;
  const games = new Set(legs.map((l) => l.game_id));
  const structure = games.size === 1 ? "SGP" : games.size === legs.length ? "CROSS" : "MIXED";
  const joint = ind == null ? null : +(ind * (structure === "CROSS" ? 1 : 1.06)).toFixed(4);
  const prices = legs.map((l) => dec(l.price_american));
  const refDec = prices.every((p) => p != null) ? +prices.reduce((a, b) => a * b, 1).toFixed(3) : null;
  return {
    uid, engine: ENGINE[legs.length] ?? "SIX", n_legs: legs.length, structure, name, legs,
    joint_prob: joint,
    joint_low: joint == null ? null : +(joint - 0.045).toFixed(4),
    joint_high: joint == null ? null : +(joint + 0.045).toFixed(4),
    independent_prob: ind == null ? null : +ind.toFixed(4),
    correlation: {
      method: "FIXTURE gaussian copula (synthetic)", seed: 20240, draws: 20000, mc_se: 0.0034,
      assessment: structure === "CROSS" ? "FIXTURE: legs are in different games; dependence assumed weak but not zero." : "FIXTURE: legs share a game; positive dependence modelled.",
      pairwise: legs.length >= 2 ? [{ a: legs[0].label, b: legs[1].label, rho: structure === "CROSS" ? 0.02 : 0.21 }] : [],
      shared_risks: structure === "CROSS" ? ["FIXTURE: both legs depend on the same synthetic pace model."] : ["FIXTURE: same game script drives both legs.", "FIXTURE: one injury report affects every leg."],
    },
    observed_quote: null,
    reference_price: refDec == null ? null : { decimal: refDec, american: toAmerican(refDec), note: "FIXTURE: product of the leg prices; correlation is not priced in." },
    evidence_score: Math.min(...legs.map((l) => l.evidence_score ?? 0)),
    weakest_assumption: "FIXTURE: assumes the synthetic rotation stays unchanged.",
    classification: "standard", designation: "paper_testing",
    rejection_reasons: [],
    invalidation_conditions: ["FIXTURE: any leg line moves by more than 1.0.", "FIXTURE: a listed starter is ruled out."],
    created_at: iso(50), validated_at: iso(30), invalidated: false, invalidation_reason: null,
    ...extra,
  };
}

const C = {
  d1: combo("FIX-D1", "GIZER DOUBLE #1", [S.g1a, S.g3a]),
  d2: combo("FIX-D2", "GIZER DOUBLE #2", [S.g1b, S.g3a], {
    observed_quote: { decimal: 3.55, american: 255, book: "FIXTUREBOOK", at: iso(33) },
  }),
  d3: combo("FIX-D3", "GIZER DOUBLE #3", [S.g1a, S.g3b], {
    classification: "invalidated", invalidated: true,
    invalidation_reason: "FIXTURE: leg FIXTURE LAL +6.5 was invalidated after a line move.",
  }),
  t1: combo("FIX-T1", "GIZER TRIPLE #1", [S.g1a, S.g1b, S.g3a], { classification: "watchlist", designation: "research_only" }),
  s1: combo("FIX-S1", "GIZER SGP #1", [S.g1a, S.g1b], { designation: "research_only" }),
};
const COMBOS = {
  double: [C.d1, C.d2, C.d3], triple: [C.t1], quad: [], five: [], six: [],
  sgp: [C.s1], cross: [C.d1, C.d2, C.d3],
};
const comboCounts = () => Object.fromEntries(Object.entries(COMBOS).map(([k, v]) => [k, v.length]));

// ---------- editions ----------
const EDITIONS = {
  [TODAY]: [
    { id: 1, key: `FIXTURE-${TODAY}-morning-v1`, kind: "morning", version: 1, published_at: iso(420) },
    { id: 2, key: `FIXTURE-${TODAY}-midday-v1`, kind: "midday", version: 1, published_at: iso(180) },
    { id: 3, key: `FIXTURE-${TODAY}-afternoon-v1`, kind: "afternoon", version: 1, published_at: iso(45) },
  ],
  [YESTERDAY]: [{ id: 90, key: `FIXTURE-${YESTERDAY}-final-v1`, kind: "final", version: 1, published_at: iso(60 * 20) }],
};
const editionCounts = (n) => ({ selections: n, qualified: Math.min(3, n), combinations: n > 5 ? 5 : 2, rejected: Math.max(0, n - 6) });

// ---------- games ----------
const inj = (name, team, status, detail = null) => ({
  player_id: null, player_name: name, team_abbr: team, status, detail, comment: detail ? "FIXTURE comment: synthetic report." : null,
  source: "FIXTURE-injury-feed", source_published_at: detail ? iso(200) : null, ingested_at: iso(190),
});
const quotes = (line, total) => [
  { market: "spread", side: "home", line, price_american: -110, book: "FIXTUREBOOK", at: iso(40) },
  { market: "spread", side: "away", line: -line, price_american: -110, book: "FIXTUREBOOK", at: iso(40) },
  { market: "total", side: "over", line: total, price_american: -112, book: "FIXTUREBOOK", at: iso(40) },
  { market: "total", side: "under", line: total, price_american: -108, book: "FIXTUREBOOK", at: iso(40) },
  { market: "moneyline", side: "home", line: null, price_american: null, book: "FIXTUREBOOK", at: iso(40) },
];

const GAMES_TODAY = [
  {
    id: "FIX-G1", date: TODAY, tipoff_utc: tip(TODAY, 0), status: "scheduled", home: T.ORL, away: T.DET,
    home_points: null, away_points: null, venue: "FIXTURE Arena One", label: "DET @ ORL",
    injuries: { home: [inj("FIXTURE Player F", "ORL", "Out", "FIXTURE ankle")], away: [inj("FIXTURE Player G", "DET", "Questionable", "FIXTURE knee"), inj("FIXTURE Player H", "DET", "Probable")] },
    lineup_status: "Starting lineups: no provider configured",
    research_completeness: { score: 86, items: [
      { name: "Box scores", ok: true, note: "FIXTURE: through last night" },
      { name: "Injury report", ok: true, note: "FIXTURE: 190 min old" },
      { name: "Quotes", ok: true, note: "" },
      { name: "Starting lineups", ok: false, note: "FIXTURE: no provider configured" },
    ] },
    environment: { proj_home_points: 107.8, proj_away_points: 106.3, proj_total: 214.1, proj_margin: 1.5, proj_pace: 97.4, total_p10: 196.2, total_p90: 231.8, notes: ["FIXTURE: both teams on one day of rest."] },
    quotes: quotes(2.5, 213.5),
    top_picks: [S.g1a, S.g1b], n_evaluated: 4, n_rejected: 1, no_picks_reason: null,
  },
  {
    id: "FIX-G2", date: TODAY, tipoff_utc: null, status: "scheduled", home: T.NYK, away: T.BOS,
    home_points: null, away_points: null, venue: null, label: "BOS @ NYK",
    injuries: { home: [], away: [] },
    lineup_status: "Starting lineups: no provider configured",
    research_completeness: { score: 52, items: [
      { name: "Box scores", ok: true, note: "" },
      { name: "Injury report", ok: false, note: "FIXTURE: report older than the allowed maximum" },
      { name: "Quotes", ok: false, note: "FIXTURE: partial quotes only" },
      { name: "Starting lineups", ok: false, note: "FIXTURE: no provider configured" },
    ] },
    environment: null,
    quotes: [],
    top_picks: [], n_evaluated: 3, n_rejected: 3,
    no_picks_reason: "FIXTURE: all 3 evaluated selections were rejected — stale injury report and insufficient sample sizes.",
  },
  {
    id: "FIX-G3", date: TODAY, tipoff_utc: tip(TODAY, 2), status: "scheduled", home: T.DEN, away: T.LAL,
    home_points: null, away_points: null, venue: "FIXTURE Arena Three", label: "LAL @ DEN",
    injuries: { home: [inj("FIXTURE Player I", "DEN", "Doubtful", "FIXTURE hamstring")], away: [] },
    lineup_status: "Starting lineups: no provider configured",
    research_completeness: { score: 78, items: [
      { name: "Box scores", ok: true, note: "" },
      { name: "Injury report", ok: true, note: "" },
      { name: "Quotes", ok: true, note: "" },
      { name: "Starting lineups", ok: false, note: "FIXTURE: no provider configured" },
    ] },
    environment: { proj_home_points: 117.5, proj_away_points: 112.4, proj_total: 229.9, proj_margin: 5.1, proj_pace: 100.2, total_p10: 211.0, total_p90: 248.4, notes: [] },
    quotes: quotes(-6.5, 229.5),
    top_picks: [S.g3a], n_evaluated: 3, n_rejected: 1, no_picks_reason: null,
  },
];

const Y1 = { game_id: "FIX-Y1", game_label: "MIA @ CHI" };
const YS = {
  a: sel({ ...Y1, edition_id: 90, market: "spread", market_label: "FIXTURE CHI -1.5", subject_name: "Chicago Bulls", team_abbr: "CHI", side: "home", line: -1.5, price_american: -110, book: "FIXTUREBOOK", projection: 3.2, prob: 0.57, breakeven: 0.524, sample_size: 400, evidence_score: 70, classification: "standard", rank: 1, model: MODEL_GAME }),
  b: sel({ ...Y1, edition_id: 90, market: "player_pts", market_label: "FIXTURE Player J Over 19.5 PTS", subject_id: 9010, subject_name: "FIXTURE Player J", team_abbr: "MIA", side: "over", line: 19.5, price_american: -115, book: "FIXTUREBOOK", projection: 21.0, prob: 0.56, breakeven: 0.535, sample_size: 49, evidence_score: 61, classification: "standard", rank: 2 }),
};
const GAMES_YESTERDAY = [
  {
    id: "FIX-Y1", date: YESTERDAY, tipoff_utc: tip(YESTERDAY, 0), status: "final", home: T.CHI, away: T.MIA,
    home_points: 109, away_points: 104, venue: "FIXTURE Arena Yesterday", label: "MIA @ CHI",
    injuries: { home: [], away: [] }, lineup_status: "Starting lineups: no provider configured",
    research_completeness: { score: 90, items: [{ name: "Box scores", ok: true, note: "" }] },
    environment: { proj_home_points: 110.1, proj_away_points: 106.9, proj_total: 217.0, proj_margin: 3.2, proj_pace: 98.0, total_p10: 199.0, total_p90: 235.0, notes: [] },
    quotes: [], top_picks: [YS.a, YS.b], n_evaluated: 2, n_rejected: 0, no_picks_reason: null,
  },
];
for (const s of Object.values(YS)) SEL_BY_ID.set(s.id, s);
const GAMES = { [TODAY]: GAMES_TODAY, [YESTERDAY]: GAMES_YESTERDAY };
const SELECTIONS = { [TODAY]: TODAY_SELECTIONS, [YESTERDAY]: Object.values(YS) };
const allGames = () => Object.values(GAMES).flat();

// ---------- tickets ----------
let ticketId = 500;
const tickets = [
  {
    id: ++ticketId, kind: "combo", engine: "DOUBLE", structure: "CROSS", source: "FIXTURE-seed", game_date: TODAY, combo_uid: "FIX-D1",
    legs: C.d1.legs, model_prob: C.d1.joint_prob, prob_low: C.d1.joint_low, prob_high: C.d1.joint_high,
    price_decimal: C.d1.reference_price.decimal, price_basis: "leg_product_reference", classification: "standard", stake_units: 1,
    created_at: iso(25), settlement: null,
  },
  {
    id: ++ticketId, kind: "single", engine: "SINGLE", structure: "CROSS", source: "FIXTURE-seed", game_date: YESTERDAY, combo_uid: null,
    legs: [leg(YS.a)], model_prob: 0.57, prob_low: 0.52, prob_high: 0.62, price_decimal: 1.909, price_basis: "observed_quote",
    classification: "standard", stake_units: 1, created_at: iso(60 * 26),
    settlement: {
      result: "win", pnl_units: 0.91, settled_at: iso(60 * 12),
      leg_results: [{ label: YS.a.market_label, result: "win", actual: 5 }],
      forensic: { verdict: "FIXTURE verdict: outcome consistent with the model interval.", findings: ["FIXTURE finding: final margin +5 versus projected +3.2.", "FIXTURE finding: no late injury news affected the leg."] },
    },
  },
  {
    id: ++ticketId, kind: "combo", engine: "DOUBLE", structure: "SGP", source: "FIXTURE-seed", game_date: YESTERDAY, combo_uid: "FIX-YD1",
    legs: [leg(YS.a), leg(YS.b)], model_prob: 0.338, prob_low: 0.29, prob_high: 0.386, price_decimal: null, price_basis: "none",
    classification: "watchlist", stake_units: 1, created_at: iso(60 * 26),
    settlement: {
      result: "loss", pnl_units: null, settled_at: iso(60 * 12),
      leg_results: [{ label: YS.a.market_label, result: "win", actual: 5 }, { label: YS.b.market_label, result: "loss", actual: 17 }],
      forensic: { verdict: "FIXTURE verdict: one leg missed; the miss was inside the stated interval.", findings: ["FIXTURE finding: FIXTURE Player J scored 17 against a 19.5 line (p10 was 14.0).", "FIXTURE finding: minutes were 4 below the projection."] },
    },
  },
];

// ---------- results ----------
const zeroSummary = () => ({ tickets: 0, settled: 0, wins: 0, losses: 0, pushes: 0, voids: 0, unresolved: 0, hit_rate: null, hit_rate_ci: null, avg_model_prob: null, staked_units: 0, pnl_units: null, roi: null, roi_ci: null, max_drawdown_units: null, priced_tickets: 0 });
const SUMMARY = { tickets: 41, settled: 38, wins: 17, losses: 19, pushes: 1, voids: 1, unresolved: 3, hit_rate: 0.472, hit_rate_ci: [0.319, 0.63], avg_model_prob: 0.486, staked_units: 38, pnl_units: -1.84, roi: -0.048, roi_ci: [-0.31, 0.21], max_drawdown_units: 5.2, priced_tickets: 30 };
const BY_ENGINE = [
  { engine: "SINGLE", ...zeroSummary(), tickets: 24, settled: 23, wins: 13, losses: 9, pushes: 1, hit_rate: 0.591, hit_rate_ci: [0.387, 0.767], avg_model_prob: 0.561, staked_units: 23, pnl_units: 1.92, roi: 0.083, roi_ci: [-0.29, 0.46], max_drawdown_units: 3.1, priced_tickets: 23, unresolved: 1 },
  { engine: "DOUBLE", ...zeroSummary(), tickets: 12, settled: 11, wins: 3, losses: 7, voids: 1, hit_rate: 0.3, hit_rate_ci: [0.108, 0.603], avg_model_prob: 0.318, staked_units: 11, pnl_units: -2.31, roi: -0.21, roi_ci: [-0.82, 0.4], max_drawdown_units: 4.0, priced_tickets: 7, unresolved: 1 },
  { engine: "TRIPLE", ...zeroSummary(), tickets: 5, settled: 4, wins: 1, losses: 3, hit_rate: 0.25, hit_rate_ci: null, avg_model_prob: 0.181, staked_units: 4, pnl_units: null, roi: null, roi_ci: null, max_drawdown_units: null, priced_tickets: 0, unresolved: 1 },
  { engine: "QUAD", ...zeroSummary() },
  { engine: "FIVE", ...zeroSummary() },
  { engine: "SIX", ...zeroSummary() },
];
const BY_STRUCTURE = [
  { structure: "SGP", ...zeroSummary(), tickets: 6, settled: 5, wins: 1, losses: 4, hit_rate: 0.2, hit_rate_ci: [0.036, 0.624], avg_model_prob: 0.29, staked_units: 5, pnl_units: -2.1, roi: -0.42, roi_ci: null, max_drawdown_units: 3.0, priced_tickets: 2, unresolved: 1 },
  { structure: "CROSS", ...zeroSummary(), tickets: 35, settled: 33, wins: 16, losses: 15, pushes: 1, voids: 1, hit_rate: 0.516, hit_rate_ci: [0.349, 0.68], avg_model_prob: 0.512, staked_units: 33, pnl_units: 0.26, roi: 0.008, roi_ci: [-0.3, 0.32], max_drawdown_units: 4.4, priced_tickets: 28, unresolved: 2 },
];
const CALIBRATION = [
  { bucket: "0.10-0.20", n: 4, predicted: 0.17, observed: 0.25, ci: [0.046, 0.699] },
  { bucket: "0.20-0.30", n: 0, predicted: 0.25, observed: null, ci: null },
  { bucket: "0.30-0.40", n: 9, predicted: 0.34, observed: 0.333, ci: [0.121, 0.646] },
  { bucket: "0.40-0.50", n: 3, predicted: 0.46, observed: 0.333, ci: null },
  { bucket: "0.50-0.60", n: 18, predicted: 0.556, observed: 0.611, ci: [0.386, 0.797] },
  { bucket: "0.60-0.70", n: 4, predicted: 0.63, observed: 0.5, ci: [0.15, 0.85] },
];
const EQUITY = (() => {
  const deltas = [0.91, -1, 0.87, -2, 1.74, -1, -1, 0.95, -2.3, 0.99];
  let cum = 0;
  return deltas.map((d, i) => {
    cum = +(cum + d).toFixed(2);
    return { date: shift(TODAY, -(deltas.length - i)), pnl_units: d, cumulative: cum };
  });
})();

// ---------- misc collections ----------
const PLAYERS = [
  ["FIXTURE Player A", "DET", "G", 9001, 58, 34.1, 25.9, 4.2, 8.8, 2.1],
  ["FIXTURE Player B", "ORL", "F", 9002, 31, 30.4, 14.2, 8.1, 3.0, 1.2],
  ["FIXTURE Player C", "BOS", "G", 9003, 12, 28.8, 16.9, 3.6, 6.7, 2.4],
  ["FIXTURE Player D", "NYK", "G", 9004, null, null, null, null, null, null],
  ["FIXTURE Player E", "DEN", "C", 9005, 64, 33.9, 26.3, 12.4, 9.1, 1.0],
  ["FIXTURE Player J", "MIA", "F", 9010, 49, 32.2, 20.4, 5.5, 4.1, 1.9],
].map(([name, team_abbr, position, id, games, min, pts, reb, ast, fg3m]) => ({ id, name, team_abbr, position, games, min, pts, reb, ast, fg3m, last_game_date: games == null ? null : YESTERDAY }));

const TEAMS = Object.values(T).map((t, i) => ({ ...t, games: 20 + i, wins: 12 - i, losses: 8 + 2 * i, off_rtg: 114.2 - i * 0.7, def_rtg: 111.0 + i * 0.4, pace: i === 7 ? null : 98.1 + i * 0.3 }));

const MODELS = [
  { id: 11, family: "player_props", name: "FIXTURE-props-gbm", version: "0.3.1", status: "candidate", training_period: "2021-10 to 2024-04", calibration_period: "2024-10 to 2025-01", evaluation_period: "2025-01 to 2025-04", limitations: "FIXTURE: synthetic model; minutes volatility is not modelled.", promoted_by: null, promoted_at: null, latest_evaluation: { n_obs: 4120, metrics: { brier: 0.2431, log_loss: 0.6794, ece: 0.021, coverage_80: null }, passed: true } },
  { id: 12, family: "game", name: "FIXTURE-game-elo", version: "0.2.0", status: "candidate", training_period: "2019-10 to 2024-04", calibration_period: null, evaluation_period: "2024-10 to 2025-04", limitations: "FIXTURE: synthetic model; no travel adjustment.", promoted_by: "owner@fixture.test", promoted_at: iso(60 * 24 * 9), latest_evaluation: { n_obs: 1230, metrics: { brier: 0.2466, log_loss: 0.6861, ece: 0.034 }, passed: false } },
  { id: 13, family: "correlation", name: "FIXTURE-copula", version: "0.1.0", status: "shadow", training_period: null, calibration_period: null, evaluation_period: null, limitations: null, promoted_by: null, promoted_at: null, latest_evaluation: null },
];
const BACKTESTS = [
  { id: 1, family: "player_props", model_name: "FIXTURE-props-gbm 0.3.1", kind: "walk_forward", period: "2025-01 to 2025-04", n_obs: 4120, metrics: { brier: 0.2431, hit_rate: 0.531, roi: -0.012, clv: null }, passed: true, notes: "FIXTURE: synthetic walk-forward run.", created_at: iso(60 * 24 * 3) },
  { id: 2, family: "game", model_name: "FIXTURE-game-elo 0.2.0", kind: "holdout", period: "2024-10 to 2025-04", n_obs: 1230, metrics: { brier: 0.2466, hit_rate: 0.512 }, passed: false, notes: null, created_at: iso(60 * 24 * 5) },
];
const FINDINGS = [
  { finding_uid: "FIX-F-001", hypothesis: "FIXTURE hypothesis: unders are mispriced on the second night of back-to-backs.", supporting: ["FIXTURE: synthetic split shows a 2.1 point drop."], contradicting: ["FIXTURE: effect disappears after 2023."], sample_size: 212, proposed_experiment: "FIXTURE: walk-forward test by season.", result: null, limitations: "FIXTURE: synthetic data.", status: "open", created_at: iso(60 * 30) },
  { finding_uid: "FIX-F-002", hypothesis: "FIXTURE hypothesis: assist props correlate with team pace above 0.2.", supporting: [], contradicting: [], sample_size: null, proposed_experiment: null, result: "FIXTURE: not supported (rho 0.07).", limitations: null, status: "rejected", created_at: iso(60 * 80) },
];
const AGENTS = [
  { id: "slate-scout", number: 1, name: "FIXTURE Slate Scout", role: "FIXTURE: collects the schedule and tipoff times.", trigger: "schedule 06:00 ET", deterministic: true, status: "ok", last_execution_at: iso(50), last_success_at: iso(50), duration_ms: 842, last_summary: "FIXTURE: 3 games found.", error: null, next_run_at: iso(-60 * 9), provider_calls: 2 },
  { id: "injury-desk", number: 2, name: "FIXTURE Injury Desk", role: "FIXTURE: ingests the injury report and flags changes.", trigger: "every 30 min", deterministic: true, status: "failed", last_execution_at: iso(190), last_success_at: iso(60 * 9), duration_ms: 30412, last_summary: null, error: "FIXTURE: provider timeout after 30 s.", next_run_at: iso(-10), provider_calls: 1 },
  { id: "market-reader", number: 3, name: "FIXTURE Market Reader", role: "FIXTURE: reads verified quotes.", trigger: "every 15 min", deterministic: true, status: "abstained", last_execution_at: iso(40), last_success_at: iso(40), duration_ms: 120, last_summary: "FIXTURE: abstained — partial quotes for BOS @ NYK.", error: null, next_run_at: iso(-5), provider_calls: 0 },
  { id: "forensics", number: 4, name: "FIXTURE Forensics", role: "FIXTURE: writes the report for each settled paper ticket.", trigger: "after settlement", deterministic: false, status: "never_run", last_execution_at: null, last_success_at: null, duration_ms: null, last_summary: null, error: null, next_run_at: null, provider_calls: null },
];
const DATA_HEALTH = {
  providers: [
    { provider: "FIXTURE-stats", configured: true, status: "ok", last_success_at: iso(50), last_error_at: null, calls_this_month: 1840, quota_used: 1840, quota_limit: 10000, monthly_cost_usd: 0 },
    { provider: "FIXTURE-quotes", configured: true, status: "degraded", last_success_at: iso(40), last_error_at: iso(55), calls_this_month: 320, quota_used: 320, quota_limit: 500, monthly_cost_usd: 30 },
    { provider: "FIXTURE-lineups", configured: false, status: "not_configured", last_success_at: null, last_error_at: null, calls_this_month: null, quota_used: null, quota_limit: null, monthly_cost_usd: null },
  ],
  coverage: [
    { season: "2023-24", games: 1230, games_with_box: 1230, player_rows: 26110, first_date: "2023-10-24", last_date: "2024-04-14" },
    { season: "2024-25", games: 1230, games_with_box: 1228, player_rows: 26034, first_date: "2024-10-22", last_date: "2025-04-13" },
  ],
  freshness: [
    { name: "Box scores", at: iso(60 * 11), age_minutes: 660, max_age_minutes: 1440, ok: true },
    { name: "Injury report", at: iso(190), age_minutes: 190, max_age_minutes: 60, ok: false },
    { name: "Quotes", at: iso(40), age_minutes: 40, max_age_minutes: 45, ok: true },
    { name: "Starting lineups", at: null, age_minutes: null, max_age_minutes: 120, ok: false },
  ],
  warnings: ["FIXTURE: injury report is older than the allowed maximum age."],
};
const operations = {
  paused: false,
  heartbeats: [
    { worker: "FIXTURE-worker-1", role: "worker", beat_at: iso(1), alive: true },
    { worker: "FIXTURE-scheduler", role: "scheduler", beat_at: iso(14), alive: false },
  ],
  schedule: [
    { name: "morning_edition", description: "FIXTURE: publish the morning edition.", next_run_et: "Tomorrow 9:00 AM ET" },
    { name: "injury_refresh", description: "FIXTURE: refresh the injury report.", next_run_et: null },
  ],
  recent_jobs: [
    { id: 9003, name: "publish_edition", status: "succeeded", attempts: 1, created_at: iso(46), finished_at: iso(45), error: null },
    { id: 9002, name: "injury_refresh", status: "failed", attempts: 3, created_at: iso(195), finished_at: iso(190), error: "FIXTURE: provider timeout after 30 s." },
    { id: 9001, name: "settle_tickets", status: "running", attempts: 1, created_at: iso(2), finished_at: null, error: null },
  ],
  dead_letter: 1,
};

// ---------- handlers ----------
const summaryNow = () => SUMMARY;

function commandCenter(date) {
  const games = GAMES[date] ?? [];
  const eds = EDITIONS[date] ?? [];
  const sels = SELECTIONS[date] ?? [];
  const isToday = date === TODAY;
  return {
    date, is_today: isToday, available_dates: [TODAY, YESTERDAY, TWO_AGO],
    edition: eds[eds.length - 1] ?? null, editions: eds,
    slate: { n_games: games.length, games },
    counts: {
      markets_analyzed: sels.length,
      qualified_selections: sels.filter((s) => ["standard", "high_confidence"].includes(s.classification) && !s.invalidated).length,
      combinations: isToday ? Object.values(C).length : 0,
      high_confidence: 0,
      rejected: sels.filter((s) => s.classification === "rejected").length,
    },
    high_confidence: [],
    injury_changes: isToday ? [{ text: "FIXTURE Player F (ORL): Questionable → Out", at: iso(200) }, { text: "FIXTURE Player I (DEN): added as Doubtful", at: iso(260) }] : [],
    latest_refresh_at: eds.length ? eds[eds.length - 1].published_at : null,
    model_readiness: [
      { family: "player_props", name: "FIXTURE-props-gbm", version: "0.3.1", status: "candidate", ready: true, note: "FIXTURE: passed the latest synthetic evaluation." },
      { family: "game", name: "FIXTURE-game-elo", version: "0.2.0", status: "candidate", ready: false, note: "FIXTURE: calibration check did not pass." },
    ],
    paper_performance: summaryNow(),
    agents: { ok: 1, failed: 1, never_run: 1 },
    findings: FINDINGS.map(({ finding_uid, hypothesis, status }) => ({ finding_uid, hypothesis, status })),
    warnings: isToday ? ["FIXTURE: injury report is 190 minutes old (maximum 60)."] : [],
  };
}

function gameDetail(id) {
  const game = allGames().find((g) => g.id === id);
  if (!game) return null;
  const sels = [...SEL_BY_ID.values()].filter((s) => s.game_id === id);
  const form = (i) => ({ games: 20 + i, wins: 11 - i, losses: 9 + i, off_rtg: 113.4 + i, def_rtg: 111.9 - i, pace: 98.2 + i, last10: i ? "6-4" : "4-6", rest_days: i ? 1 : null });
  return {
    game,
    team_form: { home: form(1), away: form(0) },
    player_projections: sels.filter((s) => s.subject_type === "player").map((s) => ({
      player_id: s.subject_id, player_name: s.subject_name, team_abbr: s.team_abbr, stat: s.market.replace("player_", ""),
      mean: s.projection, p10: s.projection == null ? null : +(s.projection * 0.62).toFixed(1), p50: s.projection == null ? null : +(s.projection * 0.98).toFixed(1), p90: s.projection == null ? null : +(s.projection * 1.41).toFixed(1),
    })),
    selections: sels,
    sgp: id === "FIX-G1" ? [C.s1] : [],
    h2h: id === "FIX-G2" ? [] : [
      { date: shift(TODAY, -40), home_abbr: game.away.abbr, away_abbr: game.home.abbr, home_points: 111, away_points: 104 },
      { date: shift(TODAY, -300), home_abbr: game.home.abbr, away_abbr: game.away.abbr, home_points: null, away_points: null },
    ],
    agent_reports: id === "FIX-G2" ? [] : [{ agent: "FIXTURE Slate Scout", at: iso(50), summary: "FIXTURE summary: synthetic pregame notes for this matchup." }],
    unresolved: id === "FIX-G1" ? ["FIXTURE: is FIXTURE Player G available tonight?"] : id === "FIX-G2" ? ["FIXTURE: injury report is stale.", "FIXTURE: no complete quote set."] : [],
  };
}

function evaluate(ids) {
  const sels = ids.map((id) => SEL_BY_ID.get(id)).filter(Boolean);
  if (sels.length < 2) return null;
  const warnings = [];
  const unqualified = sels.filter((s) => !["standard", "high_confidence"].includes(s.classification) || s.invalidated);
  if (unqualified.length) warnings.push(`FIXTURE: ${unqualified.length} leg(s) are not qualified selections.`);
  const games = new Set(sels.map((s) => s.game_id));
  if (games.size < sels.length) warnings.push("FIXTURE: legs share a game; outcomes are dependent.");
  if (sels.some((s) => s.prob == null)) warnings.push("FIXTURE: at least one leg has no model probability; the joint probability is unavailable.");
  if (sels.length >= 4) warnings.push("FIXTURE: four or more legs — interval is wide.");
  const reliable = unqualified.length === 0 && sels.every((s) => s.prob != null) && sels.length < 4;
  const c = combo(`FIX-EVAL-${ids.join("-")}`, `Builder ${ENGINE[sels.length] ?? "SIX"}`, sels, { designation: "research_only", classification: reliable ? "standard" : "watchlist" });
  return { ...c, warnings, reliable };
}

function saveTicket(body) {
  let legs, combo_uid = null, source = "builder", prob = null, low = null, high = null, price = null, basis = "none";
  if (body.combo_uid) {
    const c = Object.values(C).find((x) => x.uid === body.combo_uid);
    if (!c) return { status: 404, body: err("not_found", "FIXTURE: combination not found.") };
    legs = c.legs; combo_uid = c.uid; source = "combo"; prob = c.joint_prob; low = c.joint_low; high = c.joint_high;
    if (c.observed_quote) { price = c.observed_quote.decimal; basis = "observed_quote"; }
    else if (c.reference_price) { price = c.reference_price.decimal; basis = "leg_product_reference"; }
  } else if (Array.isArray(body.selection_ids) && body.selection_ids.length) {
    const sels = body.selection_ids.map((id) => SEL_BY_ID.get(id)).filter(Boolean);
    if (sels.length !== body.selection_ids.length) return { status: 404, body: err("not_found", "FIXTURE: selection not found.") };
    if (sels.some((s) => s.game_id === "FIX-Y1")) return { status: 409, body: err("game_started", "FIXTURE: the game has already started.") };
    legs = sels.map(leg);
    if (sels.length === 1) { prob = sels[0].prob; low = sels[0].prob_low; high = sels[0].prob_high; price = dec(sels[0].price_american); basis = price ? "observed_quote" : "none"; }
    else { const e = evaluate(body.selection_ids); prob = e.joint_prob; low = e.joint_low; high = e.joint_high; price = e.reference_price?.decimal ?? null; basis = price ? "leg_product_reference" : "none"; }
  } else return { status: 422, body: err("invalid", "FIXTURE: combo_uid or selection_ids is required.") };
  const games = new Set(legs.map((l) => l.game_id));
  const t = {
    id: ++ticketId, kind: legs.length === 1 ? "single" : "combo", engine: legs.length === 1 ? "SINGLE" : ENGINE[legs.length], structure: games.size === 1 && legs.length > 1 ? "SGP" : "CROSS",
    source, game_date: TODAY, combo_uid, legs, model_prob: prob, prob_low: low, prob_high: high, price_decimal: price, price_basis: basis,
    classification: "standard", stake_units: body.stake_units ?? 1, created_at: new Date().toISOString(), settlement: null,
  };
  tickets.unshift(t);
  return { status: 200, body: t };
}

function exposure(date) {
  const open = tickets.filter((t) => !t.settlement && t.game_date === date);
  const n = open.length;
  const tally = (keyFn) => {
    const m = new Map();
    for (const t of open) for (const k of new Set(t.legs.map(keyFn).filter(Boolean))) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ k, tickets: c, share: n ? c / n : 0 }));
  };
  const pairwise = [];
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const a = new Set(open[i].legs.map((l) => l.selection_id));
    const shared = open[j].legs.filter((l) => a.has(l.selection_id)).length;
    if (shared) pairwise.push({ a: `Paper ticket #${open[i].id}`, b: `Paper ticket #${open[j].id}`, shared_legs: shared, rho: pairwise.length ? null : 0.58 });
  }
  return {
    date, n_tickets: n,
    players: tally((l) => (l.market.startsWith("player_") ? l.subject_name : null)).map(({ k, ...r }) => ({ name: k, ...r })),
    teams: tally((l) => SEL_BY_ID.get(l.selection_id)?.team_abbr).map(({ k, ...r }) => ({ abbr: k, ...r })),
    games: tally((l) => l.game_label).map(({ k, ...r }) => ({ label: k, ...r })),
    selections: tally((l) => l.label).map(({ k, ...r }) => ({ label: k, ...r })),
    shared_assumptions: n ? ["FIXTURE: every ticket assumes the synthetic DET rotation is unchanged.", "FIXTURE: the same pace model feeds all legs."] : [],
    pairwise,
    simulation: n ? { draws: 20000, seed: 20240, p_at_least_one: 0.41, p_all_lose: 0.59, expected_pnl_units: -0.07, pnl_p10: -n, pnl_p90: n > 1 ? 2.4 : 2.1, independent_p_at_least_one: n > 1 ? 0.55 : null } : null,
    notes: [
      "FIXTURE note: tickets sharing a leg are dependent; adding overlapping tickets raises the chance of at least one win but not the expected aggregate result.",
      "FIXTURE note: all figures are in virtual paper units.",
    ],
  };
}

function playerDetail(id) {
  const p = PLAYERS.find((x) => String(x.id) === String(id));
  if (!p) return null;
  const games = p.games == null ? [] : Array.from({ length: 10 }, (_, i) => ({
    date: shift(TODAY, -(1 + i * 2)), opp_abbr: ["ORL", "BOS", "NYK", "LAL", "DEN"][i % 5], is_home: i % 2 === 0,
    min: i === 3 ? null : +(p.min + ((i * 7) % 5) - 2).toFixed(1), pts: Math.round(p.pts + ((i * 11) % 13) - 6), reb: Math.round(p.reb + ((i * 5) % 5) - 2),
    ast: Math.round(p.ast + ((i * 3) % 5) - 2), fg3m: (i * 3) % 5, stl: i % 3, blk: i % 2, tov: (i * 2) % 4,
  }));
  const split = (label, g, k) => ({ label, games: g, min: p.min, pts: p.pts == null ? null : +(p.pts * k).toFixed(1), reb: p.reb, ast: p.ast, fg3m: p.fg3m, stl: 1.1, blk: 0.4, tov: label === "Away" ? null : 2.6 });
  return {
    player: { id: p.id, name: p.name, team_abbr: p.team_abbr, position: p.position },
    sample: { games: p.games ?? 0 },
    splits: p.games == null ? [] : [split("Season", p.games, 1), split("Last 10", 10, 1.04), split("Home", Math.ceil(p.games / 2), 1.02), split("Away", Math.floor(p.games / 2), 0.98)],
    game_log: games,
    projections: p.games == null ? [] : [{ stat: "pts", mean: p.pts + 0.9, p10: +(p.pts * 0.6).toFixed(1), p50: p.pts + 0.4, p90: +(p.pts * 1.45).toFixed(1), game_label: "DET @ ORL", model_version: "FIXTURE-props-gbm 0.3.1", created_at: iso(45) }, { stat: "reb", mean: null, p10: null, p50: null, p90: null, game_label: "DET @ ORL", model_version: "FIXTURE-props-gbm 0.3.1", created_at: iso(45) }],
    forecast_accuracy: p.games == null ? [] : [{ stat: "pts", n: 41, mae: 5.21, coverage_80: 0.78 }, { stat: "ast", n: 3, mae: null, coverage_80: null }],
    injury: p.id === 9004 ? inj(p.name, p.team_abbr, "Questionable", "FIXTURE wrist") : null,
  };
}

function teamDetail(id) {
  const team = TEAMS.find((t) => String(t.id) === String(id));
  if (!team) return null;
  return {
    team,
    recent: Array.from({ length: 6 }, (_, i) => ({ date: shift(TODAY, -(1 + i * 2)), opp_abbr: TEAMS[(team.id + i) % TEAMS.length].abbr, is_home: i % 2 === 0, points: i === 5 ? null : 104 + ((i * 7) % 15), opp_points: i === 5 ? null : 101 + ((i * 11) % 17) })),
    roster: PLAYERS.filter((p) => p.team_abbr === team.abbr).map(({ id, name, position, games, min, pts, reb, ast }) => ({ id, name, position, games, min, pts, reb, ast })),
    injuries: allGames().flatMap((g) => [...g.injuries.home, ...g.injuries.away]).filter((i) => i.team_abbr === team.abbr),
  };
}

const err = (code, message) => ({ error: { code, message } });
const page = (items, q) => {
  const limit = Math.max(1, Math.min(200, Number(q.get("limit") ?? 50)));
  const offset = Math.max(0, Number(q.get("offset") ?? 0));
  return { items: items.slice(offset, offset + limit), total: items.length };
};

function route(method, path, q, body) {
  const date = q.get("date") || TODAY;
  if (method === "GET") {
    if (path === "/command-center") return commandCenter(date);
    if (path === "/games") return { date, games: GAMES[date] ?? [] };
    if (path.startsWith("/games/")) return gameDetail(decodeURIComponent(path.slice(7))) ?? { __status: 404, ...err("not_found", "FIXTURE: game not found.") };
    if (path === "/selections") {
      const eds = EDITIONS[date] ?? [];
      let items = SELECTIONS[date] ?? [];
      for (const k of ["classification", "market", "game_id"]) if (q.get(k)) items = items.filter((s) => s[k] === q.get(k));
      return { edition: eds[eds.length - 1] ?? null, items };
    }
    if (path === "/combos") {
      const category = q.get("category") || "double";
      const eds = EDITIONS[date] ?? [];
      const isToday = date === TODAY;
      return { edition: eds[eds.length - 1] ?? null, category, counts: isToday ? comboCounts() : Object.fromEntries(Object.keys(COMBOS).map((k) => [k, 0])), items: isToday ? (COMBOS[category] ?? []) : [] };
    }
    if (path === "/editions") {
      const eds = EDITIONS[date] ?? [];
      return { items: eds.map((e, i) => ({ ...e, counts: editionCounts(date === TODAY ? 6 + i * 2 : 2), changes: i === 0 ? [] : [{ type: "line_move", text: `FIXTURE: FIXTURE ORL +2.5 moved from +${(3.5 - i * 0.5).toFixed(1)}.` }, { type: "added", text: "FIXTURE: 2 selections added after the injury refresh." }] })) };
    }
    if (path.startsWith("/editions/")) {
      const id = Number(path.slice(10));
      const entry = Object.entries(EDITIONS).flatMap(([d, list]) => list.map((e) => [d, e])).find(([, e]) => e.id === id);
      if (!entry) return { __status: 404, ...err("not_found", "FIXTURE: edition not found.") };
      const [d, e] = entry;
      const all = SELECTIONS[d] ?? [];
      // earlier editions carry fewer selections and slightly different numbers so the diff view has content
      const sels = id === 1 ? all.slice(0, 6).map((s) => (s.id === S.g1a.id ? { ...s, line: 3.5, prob: 0.601, classification: "watchlist" } : s)) : id === 2 ? all.slice(0, 8) : all;
      const combos = d !== TODAY ? [] : id === 1 ? [C.s1] : id === 2 ? [C.d1, C.s1, { ...C.d3, classification: "standard", invalidated: false, invalidation_reason: null }] : Object.values(C);
      return {
        ...e, game_date: d,
        summary: {
          slate: { n_games: (GAMES[d] ?? []).length },
          narrative: ["FIXTURE narrative: synthetic slate summary paragraph one.", "FIXTURE narrative: no selection reached the high-confidence tier."],
          limitations: ["FIXTURE: starting lineups are not available.", "FIXTURE: all text here is synthetic."],
          unresolved: ["FIXTURE: availability of FIXTURE Player G."],
          rejected: sels.filter((s) => s.rejection_reasons.length).map((s) => ({ label: s.market_label, reasons: s.rejection_reasons })),
          counts: editionCounts(sels.length),
        },
        changes: id === 1 || id === 90 ? [] : [{ type: "line_move", text: "FIXTURE: FIXTURE ORL +2.5 moved." }],
        content_sha256: `${String(id).padStart(4, "f")}a9c1e77b05d2f64833ce1b0d9a4e6f7c81b2d3e4f5a6b7c8d9e0f1a2b3c4`.slice(0, 64),
        selections: sels, combos,
      };
    }
    if (path === "/paper/tickets") {
      let items = tickets;
      if (q.get("status") === "open") items = items.filter((t) => !t.settlement);
      if (q.get("status") === "settled") items = items.filter((t) => t.settlement);
      if (q.get("engine")) items = items.filter((t) => t.engine === q.get("engine"));
      return page(items, q);
    }
    if (path === "/results") {
      const engine = q.get("engine");
      const settled = tickets.filter((t) => t.settlement && (!engine || t.engine === engine));
      const emptyFilter = engine && ["QUAD", "FIVE", "SIX"].includes(engine);
      return {
        summary: emptyFilter ? zeroSummary() : engine ? BY_ENGINE.find((e) => e.engine === engine) : SUMMARY,
        by_engine: BY_ENGINE.map((e) => (engine && e.engine !== engine ? { engine: e.engine, ...zeroSummary() } : e)),
        by_structure: emptyFilter ? BY_STRUCTURE.map((s) => ({ structure: s.structure, ...zeroSummary() })) : BY_STRUCTURE,
        calibration: emptyFilter ? [] : CALIBRATION,
        equity_curve: emptyFilter ? [] : EQUITY,
        selection_outcomes: { n: emptyFilter ? 0 : 96, note: "FIXTURE: individual selection outcomes are tracked separately from tickets." },
        ...page(settled, q),
        disclaimer: "FIXTURE disclaimer: results are simulated in virtual units from paper tickets. Small samples carry wide intervals and past results do not predict future outcomes.",
      };
    }
    if (path === "/exposure") return exposure(date);
    if (path === "/players") {
      const needle = (q.get("q") ?? "").toLowerCase();
      return page(PLAYERS.filter((p) => (!needle || p.name.toLowerCase().includes(needle)) && (!q.get("team") || p.team_abbr === q.get("team"))), q);
    }
    if (path.startsWith("/players/")) return playerDetail(path.slice(9)) ?? { __status: 404, ...err("not_found", "FIXTURE: player not found.") };
    if (path === "/teams") return { items: TEAMS };
    if (path.startsWith("/teams/")) return teamDetail(path.slice(7)) ?? { __status: 404, ...err("not_found", "FIXTURE: team not found.") };
    if (path === "/injuries") return { as_of: iso(190), source: "FIXTURE-injury-feed", items: GAMES_TODAY.flatMap((g) => [...g.injuries.away, ...g.injuries.home]), changes: commandCenter(TODAY).injury_changes };
    if (path === "/models") return { items: MODELS };
    if (path === "/backtests") return { items: BACKTESTS };
    if (path === "/research-lab") return { findings: FINDINGS, experiments: BACKTESTS, correlation: { pairs: [{ a: "FIXTURE player_pts", b: "FIXTURE team total", rho: 0.312, n: 4120 }, { a: "FIXTURE player_ast", b: "FIXTURE pace", rho: 0.071, n: 3980 }], notes: ["FIXTURE note: synthetic correlation estimates."] } };
    if (path === "/agents") return { items: AGENTS };
    if (path === "/data-health") return DATA_HEALTH;
    if (path === "/operations") return operations;
    if (path === "/settings") return { timezone: "America/New_York", paper_unit: 1, risk_policy: { max_legs: 6, min_sample_size: 30, min_edge: 0.02, max_open_tickets_per_slate: 10, real_money_execution: false }, providers_configured: { "FIXTURE-stats": true, "FIXTURE-quotes": true, "FIXTURE-lineups": false }, llm_enabled: false, env: "fixture" };
  }
  if (method === "POST") {
    if (path === "/builder/evaluate") {
      const out = evaluate(Array.isArray(body.selection_ids) ? body.selection_ids : []);
      return out ?? { __status: 422, ...err("invalid", "FIXTURE: at least two known selection_ids are required.") };
    }
    if (path === "/paper/tickets") { const r = saveTicket(body); return { __status: r.status, ...r.body }; }
    if (path === "/operations/pause") { operations.paused = Boolean(body.paused); return { paused: operations.paused }; }
    if (path === "/auth/logout") return { ok: true };
  }
  return { __status: 404, ...err("not_found", `FIXTURE: no route for ${method} ${path}`) };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/v1")) return send(res, 404, err("not_found", "FIXTURE: unknown path."));
  const path = url.pathname.slice("/api/v1".length) || "/";
  const method = req.method ?? "GET";
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return send(res, 400, err("bad_json", "FIXTURE: invalid JSON.")); }

    if (path === "/health") return send(res, 200, { status: "ok" });
    if (path === "/health/ready") return send(res, 200, { status: "degraded", checks: { database: true, worker: true, scheduler: false } });
    if (path === "/auth/login" && method === "POST") {
      if (body.email === USER.email && body.password === PASSWORD) {
        return send(res, 200, { user: USER, csrf: CSRF }, { "Set-Cookie": "gizer_session=fixture-session; HttpOnly; Path=/; SameSite=Lax" });
      }
      return send(res, 401, err("unauthenticated", "FIXTURE: invalid credentials."));
    }
    const authed = /(?:^|;\s*)gizer_session=fixture-session(?:;|$)/.test(req.headers.cookie ?? "");
    if (!authed) return send(res, 401, err("unauthenticated", "FIXTURE: session cookie missing."));
    if (method === "POST" && req.headers["x-csrf-token"] !== CSRF) return send(res, 403, err("csrf", "FIXTURE: missing or invalid X-CSRF-Token."));
    if (path === "/auth/me") return send(res, 200, { user: USER, csrf: CSRF });
    if (path === "/auth/logout") return send(res, 200, { ok: true }, { "Set-Cookie": "gizer_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" });

    const out = route(method, path, url.searchParams, body);
    const status = out.__status ?? 200;
    delete out.__status;
    send(res, status, out);
  });
});

server.listen(PORT, () => {
  console.log(`[mock-api] FIXTURE API listening on http://localhost:${PORT}/api/v1 (today=${TODAY})`);
});
