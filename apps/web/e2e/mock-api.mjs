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
    context: o.market.startsWith("player_")
      ? o.projection == null
        ? { l5: null, l10: null, l20: null, season_avg: null, proj_min: null, lineup_role: null, lineup_status: null }
        : { l5: +(o.projection * 1.04).toFixed(1), l10: +(o.projection * 0.99).toFixed(1), l20: +(o.projection * 0.97).toFixed(1), season_avg: +(o.projection * 0.96).toFixed(1), proj_min: 33, lineup_role: "starter", lineup_status: "projected" }
      : null,
    origin: o.origin ?? "provider",
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
    { id: 3, key: `FIXTURE-${TODAY}-update-v1`, kind: "update", version: 1, published_at: iso(45) },
  ],
  [YESTERDAY]: [{ id: 90, key: `FIXTURE-${YESTERDAY}-final-v1`, kind: "final", version: 1, published_at: iso(60 * 20) }],
};
const editionCounts = (n) => ({ selections: n, qualified: Math.min(3, n), combinations: n > 5 ? 5 : 2, rejected: Math.max(0, n - 6) });

// ---------- games ----------
const inj = (name, team, status, detail = null) => ({
  player_id: null, player_name: name, team_abbr: team, status, detail, comment: detail ? "FIXTURE comment: synthetic report." : null,
  source: "FIXTURE-injury-feed", source_published_at: detail ? iso(200) : null, ingested_at: iso(190),
  headshot_url: null, game_label: { DET: "DET @ ORL", ORL: "DET @ ORL", BOS: "BOS @ NYK", NYK: "BOS @ NYK", LAL: "LAL @ DEN", DEN: "LAL @ DEN" }[team] ?? null,
  previous_status: status === "Out" ? "Questionable" : null, stale: status !== "Probable",
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
    lineup: { home: { status: "projected", verified_at: iso(60) }, away: { status: "projected", verified_at: iso(60) } },
    props: { quoted_markets: 3, players_projected: 2 },
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
    lineup: { home: { status: "projected", verified_at: iso(60) }, away: { status: "unknown", verified_at: null } },
    props: { quoted_markets: 0, players_projected: 1 },
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
    lineup: { home: { status: "confirmed", verified_at: iso(20) }, away: { status: "projected", verified_at: iso(60) } },
    props: { quoted_markets: 2, players_projected: 1 },
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
    lineup: { home: { status: "confirmed", verified_at: iso(60 * 20) }, away: { status: "confirmed", verified_at: iso(60 * 20) } },
    props: { quoted_markets: 0, players_projected: 0 },
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


// ---------- V3: player intelligence, props, lineups ----------
const headshot = (name, color) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${color}"/><circle cx="40" cy="30" r="14" fill="#cbd5e1"/><rect x="16" y="50" width="48" height="34" rx="16" fill="#cbd5e1"/><text x="40" y="76" font-size="9" font-family="sans-serif" text-anchor="middle" fill="#0d1720">FIXTURE</text></svg>`)}`;
const JERSEY = { 9001: "2", 9002: "22", 9003: "4", 9004: null, 9005: "15", 9010: "14" };
const HEAD = { 9001: headshot("A", "#1d42ba"), 9002: headshot("B", "#0077c0"), 9005: headshot("E", "#0e2240") }; // others → initials fallback
const playerRef = (p) => ({ id: p.id, name: p.name, team_abbr: p.team_abbr, position: p.position, jersey: JERSEY[p.id] ?? null, headshot_url: HEAD[p.id] ?? null });
const OPP = { DET: "ORL", ORL: "DET", BOS: "NYK", NYK: "BOS", LAL: "DEN", DEN: "LAL", MIA: "CHI", CHI: "MIA" };
const GAME_OF = { DET: G1, ORL: G1, BOS: G2, NYK: G2, LAL: G3, DEN: G3 };

// deterministic synthetic game logs (newest first), 24 appearances per player with history
const rnd = (seed) => { let x = seed % 2147483647; return () => (x = (x * 48271) % 2147483647) / 2147483647; };
const LOGS = new Map();
for (const p of PLAYERS) {
  if (p.games == null) { LOGS.set(p.id, []); continue; }
  const r = rnd(p.id * 7919);
  const n = p.id === 9003 ? 7 : 24;
  const opps = ["ORL", "BOS", "NYK", "LAL", "DEN", "MIA", "CHI", "DET"].filter((o) => o !== p.team_abbr);
  LOGS.set(p.id, Array.from({ length: n }, (_, i) => {
    const v = (base, spread) => Math.max(0, Math.round(base + (r() - 0.5) * 2 * spread));
    const pts = v(p.pts, 9), reb = v(p.reb, 4), ast = v(p.ast, 4);
    const tp = 100 + Math.round(r() * 25), op = 100 + Math.round(r() * 25);
    return { game_id: `FIX-LOG-${p.id}-${i}`, date: shift(TODAY, -(1 + i * 2 + (i > 9 ? 3 : 0))), opp_abbr: opps[i % opps.length], is_home: i % 2 === 0, starter: p.id === 9002 ? i % 3 !== 0 : i === 5 ? null : true,
      result: tp === op ? null : tp > op ? "W" : "L", team_points: tp, opp_points: op,
      min: v(p.min, 5), pts, reb, ast, fg3m: v(p.fg3m, 2), stl: v(1, 1), blk: v(0.6, 1), tov: v(2.5, 2), pra: pts + reb + ast, fga: v(p.pts * 0.75, 4), fta: v(4, 3), usage: i % 6 === 0 ? null : +(0.2 + r() * 0.1).toFixed(3) };
  }));
}
const statOf = (g, stat) => ({ pr: g.pts + g.reb, pa: g.pts + g.ast, ra: g.reb + g.ast }[stat] ?? g[stat] ?? 0);
const WINDOW_N = { L3: 3, L5: 5, L10: 10, L15: 15, L20: 20, L30: 30 };
const filterLogs = (id, q) => (LOGS.get(Number(id)) ?? []).filter((g) => (!q.venue || (q.venue === "home") === g.is_home) && (!q.role || (q.role === "starter") === (g.starter === true)) && (!q.opponent || g.opp_abbr === q.opponent));
const pick = (logs, win) => (WINDOW_N[win] ? logs.slice(0, WINDOW_N[win]) : logs);
const avg = (logs, stat) => (logs.length ? +(logs.reduce((a, g) => a + statOf(g, stat), 0) / logs.length).toFixed(1) : null);
const STATS = ["min", "pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "pra", "pr", "pa", "ra"];
function summary(logs, stat) {
  const xs = logs.map((g) => statOf(g, stat)).sort((a, b) => a - b);
  const qt = (f) => xs[Math.min(xs.length - 1, Math.floor(f * (xs.length - 1) + 0.5))];
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean: +mean.toFixed(1), median: qt(0.5), min: xs[0], max: xs[xs.length - 1], sd: xs.length < 2 ? null : +Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)).toFixed(2), p25: qt(0.25), p75: qt(0.75) };
}
function averages(id) {
  const logs = LOGS.get(Number(id));
  if (!logs) return null;
  const win = (key, label, requested, rows, extra = {}) => ({ key, label, requested, games: rows.length, missed: requested ? (key === "L10" ? 2 : 0) : null, small_sample: rows.length < 8, available: rows.length > 0, note: rows.length === 0 ? "FIXTURE: no appearances in this window" : null, stats: rows.length ? Object.fromEntries(STATS.map((s) => [s, summary(rows, s)])) : {}, ...extra });
  return {
    definition: "FIXTURE definition: per-game averages over the player's most recent appearances; games the player missed are not counted as zeros.",
    windows: [
      ...Object.entries(WINDOW_N).map(([k, n]) => win(k, k, n, logs.slice(0, n))),
      win("season", "Season", null, logs),
      win("prev_season", "Previous season", null, [], { note: "FIXTURE: previous season not loaded" }),
      win("playoffs", "Playoffs", null, [], { note: "FIXTURE: not ingested" }),
    ],
  };
}
function threshold(id, q) {
  const stat = q.get("stat") || "pts", line = Number(q.get("line") ?? 0), window = q.get("window") || "L10";
  const logs = pick(filterLogs(id, { venue: q.get("venue"), role: q.get("role") }), window);
  const games = logs.map((g) => { const value = statOf(g, stat); return { game_id: g.game_id, date: g.date, opp_abbr: g.opp_abbr, is_home: g.is_home, starter: g.starter, min: g.min, value, outcome: value > line ? "over" : value < line ? "under" : "equal" }; }).reverse();
  const c = (o) => games.filter((g) => g.outcome === o).length;
  return { player_id: Number(id), stat, line, window, measurement: "A", label: "FIXTURE: Historical results versus today's selected threshold (descriptive)", n: games.length, over: c("over"), under: c("under"), equal: c("equal"),
    frequency_over: games.length ? +(c("over") / games.length).toFixed(3) : null, average: avg(logs, stat), games,
    market_history: Number(id) === 9001 && stat === "pts" ? { available: true, n: 6, over: 4, under: 2, push: 0 } : { available: false, reason: "FIXTURE: no historical quoted lines are stored for this player and market." },
    notes: ["FIXTURE note: counts of past games are descriptive and are not a probability.", "FIXTURE note: the threshold is applied to past games regardless of the line quoted at the time."] };
}
function splits(id) {
  const logs = LOGS.get(Number(id));
  if (!logs) return null;
  const row = (group, label, rows) => ({ group, label, games: rows.length, small_sample: rows.length < 8, ...Object.fromEntries(["min", "pts", "reb", "ast", "fg3m", "pra"].map((s) => [s, avg(rows, s)])) });
  return { splits: logs.length ? [row("venue", "Home", logs.filter((g) => g.is_home)), row("venue", "Away", logs.filter((g) => !g.is_home)), row("role", "Starter", logs.filter((g) => g.starter === true)), row("role", "Bench", logs.filter((g) => g.starter === false)), row("result", "Wins", logs.filter((g) => g.result === "W")), row("rest", "Back-to-back", logs.slice(0, 3))] : [], notes: ["FIXTURE note: rows flagged small sample have fewer than 8 games."] };
}

const PROP_MARKETS = [
  ...["pts", "reb", "ast", "fg3m", "pra"].map((k) => ({ key: `player_${k}`, label: `FIXTURE ${k.toUpperCase()}`, stat: k, operational: true, note: null })),
  { key: "player_stl", label: "FIXTURE STL", stat: "stl", operational: false, note: "FIXTURE: no registered model for steals" },
];
let manualId = 700;
const MANUAL = [
  { id: ++manualId, game_id: "FIX-G1", game_label: "DET @ ORL", player_id: 9001, player_name: "FIXTURE Player A", market: "player_ast", line: 8.5, over_price: -120, under_price: 100, book: "FIXTUREBOOK-2", origin: "owner_entered", observed_at: iso(70), source_ref: "FIXTURE screenshot ref", note: "FIXTURE seed entry", created_by: USER.email, created_at: iso(69), withdrawn: false },
];
function propRows() {
  const mk = (pid, stat, o = {}) => {
    const p = PLAYERS.find((x) => x.id === pid), logs = LOGS.get(pid) ?? [], g = GAME_OF[p.team_abbr];
    const manual = MANUAL.find((m) => !m.withdrawn && m.player_id === pid && m.market === `player_${stat}`);
    const line = manual ? manual.line : (o.line ?? null);
    const last10 = logs.slice(0, 10);
    const sel = TODAY_SELECTIONS.find((s) => s.subject_id === pid && s.market === `player_${stat}`);
    const has = logs.length > 0;
    return { player_id: pid, player_name: p.name, headshot_url: HEAD[pid] ?? null, team_abbr: p.team_abbr, opp_abbr: OPP[p.team_abbr], game_id: g.game_id, game_label: g.game_label, market: `player_${stat}`, stat,
      line, over_price: manual ? manual.over_price : (o.over ?? null), under_price: manual ? manual.under_price : (o.under ?? null), book: manual ? manual.book : (o.book ?? null), origin: manual ? manual.origin : (o.origin ?? null), quote_at: line == null ? null : iso(40),
      l5: avg(logs.slice(0, 5), stat), l10: avg(last10, stat), l20: avg(logs.slice(0, 20), stat), season_avg: avg(logs, stat), n_games: logs.length,
      hist_over: line == null || !has ? null : last10.filter((x) => statOf(x, stat) > line).length, hist_n: line == null || !has ? null : last10.length,
      proj_min: has ? 33 : null, projection: has ? +(avg(last10, stat) * 1.02).toFixed(1) : null, p10: has ? +(avg(last10, stat) * 0.6).toFixed(1) : null, p90: has ? +(avg(last10, stat) * 1.45).toFixed(1) : null,
      availability: pid === 9004 ? "Questionable" : "available", lineup_role: !has ? null : pid === 9002 ? "bench" : "starter", lineup_status: pid === 9005 ? "confirmed" : pid === 9003 ? "unknown" : "projected",
      model_ready: stat !== "pra" && has, model_status: stat === "pra" ? "FIXTURE: candidate, not promoted" : has ? "production" : "FIXTURE: insufficient history",
      selection: sel ? { id: sel.id, side: sel.side, classification: sel.classification, prob: sel.prob, prob_low: sel.prob_low, prob_high: sel.prob_high } : null, updated_at: has ? iso(38) : null };
  };
  const B = "FIXTUREBOOK";
  const base = [
    [9001, "pts", { line: 24.5, over: -105, under: -115, book: B, origin: "provider" }],
    [9001, "ast", {}],
    [9002, "reb", { line: 8.5, over: -118, under: 102, book: B, origin: "provider" }],
    [9003, "ast", {}],
    [9004, "fg3m", {}],
    [9005, "pts", { line: 27.5, over: -112, under: -108, book: "Kalshi", origin: "provider" }],
    [9005, "pra", { line: 46.5, origin: "hypothetical" }],
  ];
  // a manual entry for a player/market that has no row yet adds one
  const extra = MANUAL.filter((m) => !m.withdrawn && m.game_id !== "FIX-Y1" && GAME_OF[PLAYERS.find((x) => x.id === m.player_id)?.team_abbr] && !base.some(([i, k]) => i === m.player_id && `player_${k}` === m.market)).map((m) => [m.player_id, m.market.replace("player_", ""), {}]);
  const seen = new Set();
  return [...base, ...extra].filter(([i, k]) => !seen.has(`${i}:${k}`) && seen.add(`${i}:${k}`)).map(([i, k, o]) => mk(i, k, o));
}
function playerProps(q, gameId) {
  let items = (q.get("date") && q.get("date") !== TODAY) ? [] : propRows();
  const gid = gameId ?? q.get("game_id");
  if (gid) items = items.filter((r) => r.game_id === gid);
  if (q.get("team")) items = items.filter((r) => r.team_abbr === q.get("team"));
  if (q.get("market")) items = items.filter((r) => r.market === q.get("market"));
  if (q.get("q")) items = items.filter((r) => r.player_name.toLowerCase().includes(q.get("q").toLowerCase()));
  if (q.get("quoted") === "true") items = items.filter((r) => r.origin !== null);
  return { date: q.get("date") || TODAY, markets: PROP_MARKETS, quote_status: { provider_configured: true, message: "FIXTURE: provider quotes cover DET @ ORL and LAL @ DEN only." }, ...page(items, q) };
}
function createManual(body) {
  const p = PLAYERS.find((x) => x.id === Number(body.player_id)), g = GAMES_TODAY.find((x) => x.id === body.game_id);
  if (!p || !g || !PROP_MARKETS.some((m) => m.key === body.market) || typeof body.line !== "number" || !["owner_entered", "hypothetical"].includes(body.origin)) return { __status: 422, ...err("invalid", "FIXTURE: unknown game, player or market, or the line is not a number.") };
  if (body.origin === "owner_entered" && body.over_price == null && body.under_price == null) return { __status: 422, ...err("invalid", "FIXTURE: an owner-entered quote needs at least one price.") };
  const entry = { id: ++manualId, game_id: g.id, game_label: g.label, player_id: p.id, player_name: p.name, market: body.market, line: body.line, over_price: body.over_price ?? null, under_price: body.under_price ?? null, book: body.book ?? null, origin: body.origin, observed_at: body.observed_at ?? null, source_ref: body.source_ref ?? null, note: body.note ?? null, created_by: USER.email, created_at: new Date().toISOString(), withdrawn: false };
  MANUAL.unshift(entry);
  return { entry };
}

const lp = (pid, role, o = {}) => { const p = PLAYERS.find((x) => x.id === pid); return { player_id: pid, name: p.name, headshot_url: HEAD[pid] ?? null, jersey: JERSEY[pid] ?? null, position: p.position, role, availability: "available", injury_detail: null, proj_min: 33, recent_min: p.min, starts_last10: role === "starter" ? 10 : 3, ...o }; };
const gen = (team, i, role, o = {}) => ({ player_id: null, name: `FIXTURE ${team} ${role === "starter" ? "S" : "R"}${i}`, headshot_url: null, jersey: String(10 + i), position: ["G", "G", "F", "F", "C"][i % 5], role, availability: "available", injury_detail: null, proj_min: role === "starter" ? 30 - i : 14, recent_min: role === "starter" ? 29.5 - i : null, starts_last10: role === "starter" ? 9 : 0, ...o });
function teamLineup(abbr) {
  const team = T[abbr];
  const out = allGames().flatMap((g) => [...g.injuries.home, ...g.injuries.away]).filter((i) => i.team_abbr === abbr && /out|doubt/i.test(i.status)).map((i) => ({ player_id: null, name: i.player_name, headshot_url: null, jersey: null, position: null, role: "bench", availability: i.status, injury_detail: i.detail, proj_min: null, recent_min: null, starts_last10: null }));
  const own = PLAYERS.filter((p) => p.team_abbr === abbr && p.games != null);
  if (abbr === "BOS") return { team, status: "unknown", source: "FIXTURE: no basis", verified_at: null, note: "FIXTURE: no recent confirmed starting five is on record.", starters: [], bench: own.map((p) => lp(p.id, "bench", { proj_min: null })), unavailable: out };
  const status = abbr === "DEN" || abbr === "CHI" || abbr === "MIA" ? "confirmed" : "projected";
  const starters = [...own.filter((p) => p.id !== 9002).map((p) => lp(p.id, "starter")), ...[1, 2, 3, 4, 5].map((i) => gen(abbr, i, "starter"))].slice(0, 5);
  if (abbr === "DET") starters[1] = { ...starters[1], name: "FIXTURE Player G", availability: "Questionable", injury_detail: "FIXTURE knee" };
  return { team, status, source: status === "confirmed" ? "FIXTURE box score" : "FIXTURE projection (last confirmed five + injury report)", verified_at: status === "confirmed" ? iso(20) : iso(60), note: status === "confirmed" ? "FIXTURE: starters listed in the source box score." : "FIXTURE: projected by GIZER; not an official lineup.", starters, bench: [...own.filter((p) => p.id === 9002).map((p) => lp(p.id, "bench")), gen(abbr, 6, "bench"), gen(abbr, 7, "bench", { proj_min: null })], unavailable: out };
}
const gameLineups = (g) => ({ home: teamLineup(g.home.abbr), away: teamLineup(g.away.abbr) });

const PROVIDERS = [
  { provider: "FIXTURE-stats", name: "FIXTURE Stats Feed", categories: ["schedule", "box scores"], configured: true, credential: "not_required", status: "ok", last_success_at: iso(50), last_error_at: null, last_error: null, calls_this_month: 1840, quota_used: 1840, quota_limit: null, monthly_cost_usd: 0, limitations: ["FIXTURE: box scores arrive after the final buzzer."], setup: "FIXTURE: no credential needed." },
  { provider: "FIXTURE-quotes", name: "FIXTURE Quotes API", categories: ["game quotes", "player props"], configured: true, credential: "present", status: "degraded", last_success_at: iso(40), last_error_at: iso(55), last_error: "FIXTURE: HTTP 429 from provider.", calls_this_month: 320, quota_used: 320, quota_limit: 500, monthly_cost_usd: 30, limitations: ["FIXTURE: free tier covers two books.", "FIXTURE: no historical lines."], setup: "FIXTURE: set FIXTURE_QUOTES_API_KEY in the server .env and restart the worker." },
  { provider: "FIXTURE-lineups", name: "FIXTURE Lineups Feed", categories: ["starting lineups"], configured: false, credential: "missing", status: "not_configured", last_success_at: null, last_error_at: null, last_error: null, calls_this_month: 0, quota_used: 0, quota_limit: 1000, monthly_cost_usd: 0, limitations: [], setup: "FIXTURE: set FIXTURE_LINEUPS_API_KEY in the server .env." },
];
PROVIDERS.push({ provider: "kalshi", name: "FIXTURE Kalshi (public market data)", categories: ["exchange prices"], configured: true, credential: "not_required", status: "ok", last_success_at: iso(14), last_error_at: null, last_error: null, calls_this_month: 8640, quota_used: 8640, quota_limit: null, monthly_cost_usd: 0, limitations: ["FIXTURE: polled about every 5 minutes; not a streaming feed."], setup: "FIXTURE: no credential needed for public market data." });
const strat = (key, label, kind, s) => ({ key, label, kind, ...zeroSummary(), ...s });
const STRATEGIES = {
  groups: [
    strat("spread", "FIXTURE Spread", "market", { tickets: 14, settled: 13, wins: 7, losses: 6, hit_rate: 0.538, hit_rate_ci: [0.291, 0.768], avg_model_prob: 0.561, staked_units: 13, pnl_units: 0.37, roi: 0.028, roi_ci: [-0.4, 0.46], priced_tickets: 13, unresolved: 1 }),
    strat("player_pts", "FIXTURE Player points", "market", { tickets: 9, settled: 8, wins: 5, losses: 3, hit_rate: 0.625, hit_rate_ci: null, avg_model_prob: 0.557, staked_units: 8, priced_tickets: 0, unresolved: 1 }),
    strat("player_reb", "FIXTURE Player rebounds", "market", {}),
    ...BY_ENGINE.map((e) => strat(e.engine.toLowerCase(), e.engine, "engine", e)).map(({ engine, ...r }) => r),
    ...BY_STRUCTURE.map((e) => strat(e.structure.toLowerCase(), e.structure, "structure", e)).map(({ structure, ...r }) => r),
  ],
  forecast: [{ stat: "pts", n: 412, mae: 5.21, coverage_80: 0.78 }, { stat: "reb", n: 398, mae: 2.04, coverage_80: 0.81 }, { stat: "ast", n: 12, mae: null, coverage_80: null }],
  disclaimer: "FIXTURE disclaimer: strategy results are simulated in virtual units. Groups with few settled records carry wide intervals.",
};


// ---------- Core Intelligence V1: Kalshi, minutes, availability events ----------
// Kalshi sync is deliberately stale in the fixtures (14 minutes old against a 5 minute poll).
const KSYNC = { last_sync_at: iso(14), age_minutes: 14, poll_minutes: 5, stale: true, note: "FIXTURE: prices are polled about every 5 minutes and stored as observations; the last poll is overdue." };
const kSeries = (prices, { bidAsk = true, startMin = 240, step = 30 } = {}) => prices.map((pr, i) => ({ at: iso(startMin - i * step), price: pr, yes_bid: bidAsk ? +(pr - 0.02).toFixed(3) : null, yes_ask: bidAsk ? +(pr + 0.02).toFixed(3) : null, last_price: +(pr - 0.01).toFixed(3), spread: bidAsk ? 0.04 : null, volume: 400 + i * 310, open_interest: 900 + i * 120, status: "open" }));
function kRow(o) {
  const ser = o.series ?? [];
  const first = ser[0]?.price ?? null, last = ser[ser.length - 1]?.price ?? null;
  const back = (n) => (ser.length > n ? +(last - ser[ser.length - 1 - n].price).toFixed(3) : null);
  const g = { "FIX-G1": "DET @ ORL", "FIX-G2": "BOS @ NYK", "FIX-G3": "LAL @ DEN" }[o.game_id] ?? null;
  const lastPt = ser[ser.length - 1];
  return {
    ticker: o.ticker, event_ticker: `KXFIX-${o.game_id}`, series: "KXFIXTURE", game_id: o.game_id, game_label: g,
    kind: o.kind, market: o.market ?? null, stat: o.stat ?? null, stat_label: o.stat_label ?? null, player_id: o.player_id ?? null, player_name: o.player_name ?? null, team_abbr: o.team_abbr ?? null,
    title: o.title, threshold: o.threshold ?? null, comparator: o.comparator ?? null, contract_type: o.contract_type ?? "threshold",
    interpretation: o.interpretation ?? "normalized", interpretation_note: o.interpretation_note ?? null, protected: Boolean(o.protected),
    status: "open", open_time: iso(600), close_time: tip(TODAY, 3),
    yes_bid: lastPt?.yes_bid ?? null, yes_ask: lastPt?.yes_ask ?? null, no_bid: lastPt?.yes_ask == null ? null : +(1 - lastPt.yes_ask).toFixed(3), no_ask: lastPt?.yes_bid == null ? null : +(1 - lastPt.yes_bid).toFixed(3), last_price: lastPt?.last_price ?? null,
    volume: lastPt?.volume ?? null, open_interest: lastPt?.open_interest ?? null, yes_ask_size: lastPt ? 120 : null, yes_bid_size: lastPt ? 85 : null,
    price: last, first_observed: first, first_observed_at: ser[0]?.at ?? null, change_since_first: first == null ? null : +(last - first).toFixed(3),
    high: ser.length ? Math.max(...ser.map((x) => x.price)) : null, low: ser.length ? Math.min(...ser.map((x) => x.price)) : null, spread: lastPt?.spread ?? null,
    windows: { "5m": null, "15m": back(1) == null ? null : +(back(1) / 2).toFixed(3), "30m": back(1), "60m": back(2), "3h": back(6) },
    observations: ser.length, last_observed_at: lastPt?.at ?? null, first_seen_at: ser[0]?.at ?? iso(240), _series: ser,
  };
}
const KALSHI = [
  kRow({ ticker: "KXFIX-A-PTS25", game_id: "FIX-G1", kind: "player", market: "player_pts", stat: "pts", stat_label: "FIXTURE Points", player_id: 9001, player_name: "FIXTURE Player A", team_abbr: "DET", title: "FIXTURE Player A: 25+ points", threshold: 24.5, comparator: ">= 25", series: kSeries([0.5, 0.52, 0.51, 0.55, 0.58, 0.56, 0.57, 0.6, 0.565]) }),
  kRow({ ticker: "KXFIX-A-PTS30", game_id: "FIX-G1", kind: "player", market: "player_pts", stat: "pts", stat_label: "FIXTURE Points", player_id: 9001, player_name: "FIXTURE Player A", team_abbr: "DET", title: "FIXTURE Player A: 30+ points", threshold: 29.5, comparator: ">= 30", series: kSeries([0.27, 0.25, 0.24], { startMin: 90 }) }),
  kRow({ ticker: "KXFIX-A-DD", game_id: "FIX-G1", kind: "player", stat: null, stat_label: "FIXTURE Double double", player_id: 9001, player_name: "FIXTURE Player A", team_abbr: "DET", title: "FIXTURE Player A: Double Double (protected)", contract_type: "protected", protected: true, interpretation: "unsupported", interpretation_note: "FIXTURE: protected double-double contract; settlement terms differ from a plain stat threshold, so GIZER tracks the price but does not evaluate it.", series: kSeries([0.33, 0.35, 0.34], { startMin: 90 }) }),
  kRow({ ticker: "KXFIX-E-REB10", game_id: "FIX-G3", kind: "player", market: "player_reb", stat: "reb", stat_label: "FIXTURE Rebounds", player_id: 9005, player_name: "FIXTURE Player E", team_abbr: "DEN", title: "FIXTURE Player E: 10+ rebounds", threshold: 9.5, comparator: ">= 10", series: kSeries([0.71], { startMin: 14, bidAsk: false }) }),
  kRow({ ticker: "KXFIX-G1-ML", game_id: "FIX-G1", kind: "game", market: "moneyline", stat_label: "FIXTURE Winner", team_abbr: "DET", title: "FIXTURE DET at ORL: Detroit wins", comparator: "wins", contract_type: "winner", series: kSeries([0.46, 0.45, 0.44, 0.44], { startMin: 120 }) }),
  kRow({ ticker: "KXFIX-G3-TOT", game_id: "FIX-G3", kind: "total", market: "total", stat_label: "FIXTURE Total points", title: "FIXTURE LAL at DEN: over 229.5 points", threshold: 229.5, comparator: "> 229.5", series: kSeries([0.5, 0.5, 0.52], { startMin: 90 }) }),
  kRow({ ticker: "KXFIX-G2-MISC", game_id: "FIX-G2", kind: "other", stat_label: null, title: "FIXTURE BOS at NYK: first basket scorer bundle", interpretation: "unmatched", interpretation_note: null, series: kSeries([0.12, 0.12], { startMin: 60 }) }),
];
const kPublic = ({ _series, ...r }) => r;
function kalshiMarkets(q) {
  const date = q.get("date") || TODAY;
  let items = date === TODAY ? KALSHI : [];
  for (const k of ["game_id", "kind", "market", "interpretation"]) if (q.get(k)) items = items.filter((r) => r[k] === q.get(k));
  if (q.get("player_id")) items = items.filter((r) => String(r.player_id) === q.get("player_id"));
  if (q.get("q")) items = items.filter((r) => `${r.title} ${r.player_name ?? ""}`.toLowerCase().includes(q.get("q").toLowerCase()));
  const sort = q.get("sort") || "volume";
  items = [...items].sort((a, b) => sort === "movement" ? Math.abs(b.change_since_first ?? 0) - Math.abs(a.change_since_first ?? 0) : sort === "player" ? (a.player_name ?? "~").localeCompare(b.player_name ?? "~") || (a.threshold ?? 0) - (b.threshold ?? 0) : sort === "spread" ? (b.spread ?? -1) - (a.spread ?? -1) : (b.volume ?? 0) - (a.volume ?? 0));
  const all = date === TODAY ? KALSHI : [];
  const c = (i) => all.filter((r) => r.interpretation === i).length;
  const pg = page(items.map(kPublic), q);
  return { date, sync: KSYNC, counts: { total: all.length, normalized: c("normalized"), unsupported: c("unsupported"), unmatched: c("unmatched") }, events: date === TODAY ? GAMES_TODAY.map((g) => ({ game_id: g.id, label: g.label })) : [], ...pg,
    notes: ["FIXTURE note: Kalshi contracts are thresholds with their own settlement rules, not sportsbook over/under lines.", "FIXTURE note: a market price is the bid/ask midpoint when both exist, otherwise the last trade."] };
}
function kalshiDetail(ticker) {
  const r = KALSHI.find((x) => x.ticker === ticker) ?? LG.kalshi.find((x) => x.ticker === ticker);
  if (!r) return null;
  const logs = r.player_id ? (LOGS.get(r.player_id) ?? []) : [];
  const hist = (n) => { const rows = n ? logs.slice(0, n) : logs; const vals = rows.map((g) => statOf(g, r.stat)); const over = vals.filter((v) => v > r.threshold).length, equal = vals.filter((v) => v === r.threshold).length; return { n: rows.length, over, under: rows.length - over - equal, equal, frequency_over: rows.length ? +(over / rows.length).toFixed(3) : null, average: avg(rows, r.stat) }; };
  const sel = r.ticker === "KXFIX-A-PTS25" ? S.g1b : null;
  const normalized = r.interpretation === "normalized";
  return {
    market: kPublic(r),
    rules: { primary: `FIXTURE rule: if ${r.title.replace("FIXTURE ", "")} is recorded in the official box score, the market resolves to Yes.`, secondary: r.protected ? "FIXTURE secondary rule: if the player does not play, the protected contract resolves at the last traded price." : r.kind === "other" ? null : "FIXTURE secondary rule: overtime counts. A postponed game voids the market.", settlement_note: "FIXTURE: rules are reproduced as listed by the exchange; GIZER does not interpret them beyond the threshold shown." },
    series: r._series,
    timeline: r.game_id === "FIX-G1" ? [
      { at: iso(150), type: "availability", own_player: false, text: "FIXTURE Player F (ORL): Questionable → Out", source: "FIXTURE-injury-feed", source_published_at: iso(155) },
      { at: iso(75), type: "lineup", own_player: r.player_id === 9001, text: "FIXTURE: DET projected lineup updated — FIXTURE Player A listed as starter", source: "FIXTURE projection", source_published_at: null },
      { at: iso(400), type: "market_status", own_player: r.player_id === 9001, text: "FIXTURE: market opened", source: "FIXTURE exchange", source_published_at: null },
    ] : [],
    history: normalized && r.player_id && r.threshold != null && logs.length ? { L5: hist(5), L10: hist(10), L20: hist(20), season: hist(0) } : null,
    research: normalized && r.player_id ? {
      player: { id: r.player_id, name: r.player_name, headshot_url: HEAD[r.player_id] ?? null, position: PLAYERS.find((p) => p.id === r.player_id)?.position ?? null },
      model_ready: r.stat === "pts",
      projection: r.ticker === "KXFIX-E-REB10" ? null : { mean: 26.8, p10: 16.6, p90: 37.8, proj_min: 33, created_at: iso(45) },
      selections: sel ? [{ id: sel.id, side: "over", classification: "standard", prob: 0.561, prob_low: 0.511, prob_high: 0.611, breakeven: 0.565, rejection_reasons: [] }, { id: 99001, side: "under", classification: "rejected", prob: 0.439, prob_low: 0.389, prob_high: 0.489, breakeven: 0.435, rejection_reasons: ["FIXTURE: edge below the minimum threshold."] }] : [],
      note: "FIXTURE note: the model was fitted without market prices; its probability is not derived from the Kalshi price.",
    } : null,
    sync: KSYNC,
    notes: ["FIXTURE note: prices are stored observations from periodic polls.", "FIXTURE note: events on the timeline are context only."],
  };
}

const MIN_MODEL = { name: "FIXTURE-minutes-ridge", version: "0.1.0", status: "candidate" };
const MIN_META = { model: MIN_MODEL, uncertainty: "FIXTURE: the minutes band is the candidate model's 80% range and has not passed validation.", restrictions_note: "FIXTURE: minutes restrictions are only shown when a source states one; none is inferred.", tiers: ["35+", "30–34.9", "25–29.9", "20–24.9", "Below 20"], rules: { role_change_min_diff: 6, returned_gap_days: 10 } };
const MIN_CLASS = { 9001: ["high_minute_starter", "FIXTURE High-minute starter", "FIXTURE: started 10 of the last 10 and averaged over 34 minutes."], 9002: ["variable", "FIXTURE Variable role", "FIXTURE: minutes ranged widely over the last 10 games and the role alternated between starter and bench."], 9003: ["returning", "FIXTURE Returning", "FIXTURE: 14 days since the previous appearance; minutes may be managed."], 9004: ["uncertain", "FIXTURE Uncertain", "FIXTURE: no appearances in the data and listed Questionable."], 9005: ["stable_starter", "FIXTURE Stable starter", "FIXTURE: starts consistently with low minute variance."] };
function minutesRow(p) {
  const logs = LOGS.get(p.id) ?? [];
  const m = (n) => avg(n ? logs.slice(0, n) : logs, "min");
  const l10 = logs.slice(0, 10).map((g) => g.min);
  const mean = l10.reduce((a, b) => a + b, 0) / (l10.length || 1);
  const [cls, label, reason] = MIN_CLASS[p.id] ?? ["secondary", "FIXTURE Secondary", "FIXTURE: bench role."];
  const has = logs.length > 0, g = GAME_OF[p.team_abbr];
  const proj = has ? +(m(10) * 0.98).toFixed(1) : null;
  return { player_id: p.id, player_name: p.name, headshot_url: HEAD[p.id] ?? null, position: p.position, team_abbr: p.team_abbr, opp_abbr: OPP[p.team_abbr] ?? null, game_id: g?.game_id ?? null,
    availability: p.id === 9004 ? "Questionable" : "available", injury_detail: p.id === 9004 ? "FIXTURE wrist" : null, lineup_role: !has ? null : p.id === 9002 ? "bench" : "starter", lineup_status: p.id === 9005 ? "confirmed" : p.id === 9003 ? "unknown" : "projected",
    proj_min: proj, proj_min_low: has && p.id !== 9003 ? +(proj - 5).toFixed(1) : null, proj_min_high: has && p.id !== 9003 ? +(proj + 4).toFixed(1) : null,
    tier: !has ? null : proj >= 35 ? "35+" : proj >= 30 ? "30–34.9" : proj >= 25 ? "25–29.9" : "20–24.9",
    season_avg: m(0), season_median: has ? [...logs.map((x) => x.min)].sort((a, b) => a - b)[Math.floor(logs.length / 2)] : null, l3: m(3), l5: m(5), l10: m(10), l20: m(20),
    min_l10: has ? Math.min(...l10) : null, max_l10: has ? Math.max(...l10) : null, sd_l10: l10.length > 1 ? +Math.sqrt(l10.reduce((a, b) => a + (b - mean) ** 2, 0) / (l10.length - 1)).toFixed(1) : null,
    starts_l10: has ? logs.slice(0, 10).filter((x) => x.starter === true).length : null, starts_season: has ? logs.filter((x) => x.starter === true).length : null, bench_season: has ? logs.filter((x) => x.starter === false).length : null, games_season: logs.length, games_all: logs.length,
    role_change: p.id === 9002 ? 7.2 : null, returned_recently: p.id === 9003, last_gap_days: p.id === 9003 ? 14 : 2, restriction: null, last_game_date: has ? logs[0].date : "",
    classification: cls, classification_label: label, classification_reason: reason, source_updated_at: has ? iso(38) : null };
}
function minutesList(q) {
  const date = q.get("date") || TODAY;
  let items = date === TODAY ? PLAYERS.filter((p) => GAME_OF[p.team_abbr]).map(minutesRow) : [];
  if (q.get("team")) items = items.filter((r) => r.team_abbr === q.get("team"));
  if (q.get("classification")) items = items.filter((r) => r.classification === q.get("classification"));
  if (q.get("q")) items = items.filter((r) => r.player_name.toLowerCase().includes(q.get("q").toLowerCase()));
  const key = q.get("sort") || "proj_min", dir = q.get("order") === "asc" ? 1 : -1;
  items.sort((a, b) => (a[key] == null) - (b[key] == null) || (typeof a[key] === "string" ? a[key].localeCompare(b[key]) : (a[key] ?? 0) - (b[key] ?? 0)) * dir);
  return { date, ...page(items, q), ...MIN_META };
}
const INJURY_CHANGES = [
  { at: iso(150), player_id: null, player_name: "FIXTURE Player F", headshot_url: null, team_abbr: "ORL", previous_status: "Questionable", current_status: "Out", previous_class: "uncertain", current_class: "out", material: true, detail: "FIXTURE ankle", game_id: "FIX-G1", game_label: "DET @ ORL", source: "FIXTURE-injury-feed", source_published_at: iso(155), lineup_changes: ["FIXTURE: ORL projected starter replaced by FIXTURE ORL S2"], records_to_reassess: 3, qualified_records_affected: 2 },
  { at: iso(210), player_id: null, player_name: "FIXTURE Player I", headshot_url: null, team_abbr: "DEN", previous_status: null, current_status: "Doubtful", previous_class: null, current_class: "unlikely", material: true, detail: "FIXTURE hamstring", game_id: "FIX-G3", game_label: "LAL @ DEN", source: "FIXTURE-injury-feed", source_published_at: null, lineup_changes: [], records_to_reassess: 1, qualified_records_affected: 0 },
  { at: iso(300), player_id: 9001, player_name: "FIXTURE Player A", headshot_url: HEAD[9001], team_abbr: "DET", previous_status: "Probable", current_status: "Available", previous_class: "likely", current_class: "available", material: false, detail: null, game_id: "FIX-G1", game_label: "DET @ ORL", source: "FIXTURE-injury-feed", source_published_at: iso(305), lineup_changes: [], records_to_reassess: 0, qualified_records_affected: 0 },
];


// ---------- bounded /selections (page-audit contract) ----------
const CLASS_RANK = { high_confidence: 0, standard: 0, watchlist: 1, stale: 2, insufficient_evidence: 3, rejected: 4, invalidated: 5 };
const isQual = (x) => (x.classification === "standard" || x.classification === "high_confidence") && !x.invalidated;
function selectionsPage(all, q) {
  let items = [...all].sort((a, b) => (CLASS_RANK[a.classification] ?? 9) - (CLASS_RANK[b.classification] ?? 9) || (a.rank_in_game ?? 99) - (b.rank_in_game ?? 99));
  for (const k of ["market", "game_id"]) if (q.get(k)) items = items.filter((x) => x[k] === q.get(k));
  if (q.get("q")) items = items.filter((x) => `${x.market_label} ${x.subject_name}`.toLowerCase().includes(q.get("q").toLowerCase()));
  const counts = { ranked: items.filter((x) => isQual(x) && x.rank_in_game != null && x.rank_in_game <= 5).length };
  for (const x of items) counts[x.classification] = (counts[x.classification] ?? 0) + 1;
  const c = q.get("classification");
  if (c === "qualified") items = items.filter(isQual);
  else if (c) items = items.filter((x) => x.classification === c);
  if (q.get("ranked") === "true") items = items.filter((x) => isQual(x) && x.rank_in_game != null && x.rank_in_game <= 5);
  const limit = Math.max(1, Math.min(1000, Number(q.get("limit") ?? 200)));
  const offset = Math.max(0, Number(q.get("offset") ?? 0));
  return { items: items.slice(offset, offset + limit), total: items.length, counts };
}
const classCounts = (rows) => rows.reduce((m, x) => ((m[x.classification] = (m[x.classification] ?? 0) + 1), m), {});

// ---------- LARGE SLATE MODE ----------
// Production carries thousands of rows per slate. `MOCK_LARGE=1`, or POST /api/v1/__mock/large {"on":true}
// on the mock itself, swaps today's slate for a large synthetic one so the smoke suite can assert that no page
// renders an unbounded list. Everything is generated deterministically and prefixed FIXTURE.
let LARGE = process.env.MOCK_LARGE === "1";
const XT = Object.fromEntries([["ATL", "Atlanta Hawks"], ["BKN", "Brooklyn Nets"], ["CHA", "Charlotte Hornets"], ["CLE", "Cleveland Cavaliers"], ["DAL", "Dallas Mavericks"], ["GSW", "Golden State Warriors"], ["HOU", "Houston Rockets"], ["IND", "Indiana Pacers"], ["LAC", "LA Clippers"], ["MEM", "Memphis Grizzlies"]].map(([abbr, name], i) => [abbr, { id: 20 + i, abbr, name, logo_url: null }]));
const ALLT = { ...T, ...XT };
const LPAIRS = [["DET", "ORL"], ["BOS", "NYK"], ["LAL", "DEN"], ["MIA", "CHI"], ["ATL", "BKN"], ["CHA", "CLE"], ["DAL", "GSW"], ["HOU", "IND"], ["LAC", "MEM"]];
const LG = (() => {
  const games = LPAIRS.map(([a, h], i) => ({
    id: `FIX-L${i + 1}`, date: TODAY, tipoff_utc: tip(TODAY, i % 4), status: "scheduled", home: ALLT[h], away: ALLT[a], home_points: null, away_points: null, venue: `FIXTURE Large Arena ${i + 1}`, label: `${a} @ ${h}`,
    injuries: { home: [inj(`FIXTURE L${i + 1} Injured H`, h, "Out", "FIXTURE ankle")], away: [inj(`FIXTURE L${i + 1} Injured A`, a, "Questionable", "FIXTURE knee")] },
    lineup_status: "Starting lineups: projected", research_completeness: { score: 80, items: [{ name: "Box scores", ok: true, note: "" }, { name: "Starting lineups", ok: false, note: "FIXTURE: projected only" }] },
    environment: { proj_home_points: 112, proj_away_points: 109, proj_total: 221, proj_margin: 3, proj_pace: 99, total_p10: 203, total_p90: 239, notes: [] },
    quotes: quotes(2.5, 221.5), top_picks: [], n_evaluated: 0, n_rejected: 0, no_picks_reason: null,
    lineup: { home: { status: "projected", verified_at: iso(60) }, away: { status: "projected", verified_at: iso(60) } }, props: { quoted_markets: 70, players_projected: 22 },
  }));
  const players = [];
  const sels = [];
  const stats = ["pts", "reb", "ast", "fg3m"];
  games.forEach((g, gi) => {
    for (let k = 0; k < 20; k++) players.push({ id: 20000 + gi * 100 + k, name: `FIXTURE L${gi + 1} Player ${k + 1}`, team_abbr: k < 10 ? g.away.abbr : g.home.abbr, position: ["G", "G", "F", "F", "C"][k % 5], game: g });
    for (let n = 0; n < 178; n++) {
      const pl = players[gi * 20 + (n % 20)], st = stats[n % 4], line = 4.5 + (n % 9) * 3;
      const classification = n < 20 ? "standard" : n < 105 ? "watchlist" : n < 106 ? "stale" : n < 136 ? "insufficient_evidence" : "rejected";
      const o = sel({ game_id: g.id, game_label: g.label, edition_id: 500, market: `player_${st}`, market_label: `FIXTURE ${pl.name.replace("FIXTURE ", "")} Over ${line} ${st.toUpperCase()}`, subject_id: pl.id, subject_name: pl.name, team_abbr: pl.team_abbr, side: "over", line, price_american: -110 + (n % 7) * 10, book: "Kalshi", projection: line + 1, prob: 0.5 + (n % 10) / 100, breakeven: 0.52, sample_size: 40 + n, evidence_score: 50 + (n % 50), classification, rank: n < 5 ? n + 1 : n < 20 ? n + 1 : null, rejection_reasons: classification === "rejected" ? ["FIXTURE: no positive expected difference versus the quoted price."] : classification === "insufficient_evidence" ? ["FIXTURE: sample below the minimum."] : [] });
      sels.push(o);
    }
    g.top_picks = sels.filter((x) => x.game_id === g.id && x.rank_in_game != null && x.rank_in_game <= 5);
    g.n_evaluated = 178; g.n_rejected = 42;
  });
  const bigMetrics = (i) => ({ ece: 0.02 + i / 1000, brier: 0.23, log_loss: 0.66, n_eval: 7000 + i, n_train: 13000, n_calibration: 5500, coverage_80: 0.9, coverage_80_expected: 0.907, best_baseline_mae: 1.45, mae_ratio_vs_best_baseline: 0.99 + i / 500, pseudo_line_note: "FIXTURE: pseudo lines are rolling medians because no historical quoted lines are stored; this note is deliberately long.",
    calibration: Array.from({ length: 20 }, (_, b) => ({ bucket: `${(b * 5)}-${b * 5 + 5}%`, n: 300 + b, predicted: +(b * 0.05 + 0.025).toFixed(3), observed: +(b * 0.05 + 0.03).toFixed(3), ci_low: +(b * 0.05).toFixed(3), ci_high: +(b * 0.05 + 0.06).toFixed(3) })),
    same_player: Object.fromEntries(Array.from({ length: 66 }, (_, k) => [`s${k % 11}|s${Math.floor(k / 6)}x${k}`, +(Math.sin(k) / 2).toFixed(4)])),
    validation: { rows: Array.from({ length: 30 }, (_, k) => ({ pair: `FIXTURE pair ${k}`, n: 7000, copula: 0.24, observed: 0.22, independence: 0.21 })), summary_note: "FIXTURE validation note" } });
  const models = Array.from({ length: 26 }, (_, i) => ({ id: 300 + i, family: `player_${stats[i % 4]}`, name: `FIXTURE-large-model-${i}`, version: "1.0.0", status: i % 3 ? "candidate" : "production", training_period: "2023-10 to 2025-04", calibration_period: "2025-10 to 2026-01", evaluation_period: "2026-01 to 2026-04", limitations: "FIXTURE: synthetic.", promoted_by: null, promoted_at: null, latest_evaluation: { n_obs: 7000 + i, metrics: bigMetrics(i), passed: i % 3 === 0 } }));
  const backtests = Array.from({ length: 27 }, (_, i) => ({ id: 400 + i, family: `player_${stats[i % 4]}`, model_name: `FIXTURE-large-model-${i} 1.0.0`, kind: i % 2 ? "walk_forward" : "holdout", period: "FIXTURE estimate<2026-03-29; validate>=2026-03-29", n_obs: 2000 + i, metrics: bigMetrics(i), passed: i % 2 === 0, notes: "FIXTURE: large-mode backtest.", created_at: iso(60 * 24 + i) }));
  const combosOf = (n, k, sgp) => Array.from({ length: n }, (_, i) => {
    const pick = sgp ? sels.filter((x) => x.game_id === games[i % 9].id).slice(i, i + k) : Array.from({ length: k }, (_, j) => sels[((i + j) % 9) * 178 + i]);
    return combo(`FIX-LARGE-${sgp ? "SGP" : k}-${i}`, `GIZER ${sgp ? "SGP" : ENGINE[k]} #${i + 1}`, pick);
  });
  const combos = { double: combosOf(12, 2), triple: combosOf(12, 3), quad: combosOf(8, 4), five: combosOf(8, 5), six: combosOf(8, 6), sgp: combosOf(18, 2, true), cross: combosOf(30, 2) };
  const kalshi = [];
  players.forEach((pl, pi) => { if (pi % 20 < 8) for (let t = 0; t < 9; t++) { const st = stats[t % 4], th = 5 + t * 3; if (kalshi.length < 640) kalshi.push(kRow({ ticker: `KXFIX-L-${pl.id}-${st}-${th}`, game_id: pl.game.id, kind: "player", market: `player_${st}`, stat: st, stat_label: `FIXTURE ${st.toUpperCase()}`, player_id: pl.id, player_name: pl.name, team_abbr: pl.team_abbr, title: `${pl.name}: ${th}+ ${st}`, threshold: th - 0.5, comparator: `>= ${th}`, interpretation: t === 8 ? "unsupported" : "normalized", interpretation_note: t === 8 ? "FIXTURE: escalator contract." : null, series: kSeries([Math.max(0.03, 0.9 - t * 0.1), Math.max(0.03, 0.88 - t * 0.1)], { startMin: 30 }) })); } });
  for (const k of kalshi) { k.game_label = games.find((g) => g.id === k.game_id)?.label ?? null; }
  const minutes = players.map((pl, i) => ({ ...minutesRow({ id: 9001, name: "x", team_abbr: "DET", position: pl.position }), player_id: pl.id, player_name: pl.name, headshot_url: null, team_abbr: pl.team_abbr, opp_abbr: pl.game.home.abbr === pl.team_abbr ? pl.game.away.abbr : pl.game.home.abbr, game_id: pl.game.id, proj_min: +(36 - (i % 20) * 1.4).toFixed(1), classification: "secondary", classification_label: "FIXTURE Secondary", classification_reason: "FIXTURE: large-mode row." }));
  return { games, players, sels, models, backtests, combos, kalshi, minutes };
})();
for (const x of LG.sels) SEL_BY_ID.set(x.id, x);
const LEDITION = { id: 500, key: `FIXTURE-${TODAY}-large-v1`, kind: "update", version: 1, published_at: iso(20) };
const lcounts = () => ({ ...classCounts(LG.sels), qualified: LG.sels.filter((x) => x.rank_in_game != null && x.rank_in_game <= 5 && isQual(x)).length, combinations: 48, markets_analyzed: LG.sels.length, not_qualified_total: LG.sels.filter((x) => !isQual(x) && x.classification !== "watchlist").length });
const lchanges = () => Array.from({ length: 200 }, (_, i) => ({ type: i % 2 ? "market_move" : "reclassified", text: `FIXTURE change ${i + 1}: FIXTURE L${(i % 9) + 1} Player ${(i % 20) + 1} line moved.` }));
function largeRoute(method, path, q) {
  if (method !== "GET") return undefined;
  if (path === "/games") return { date: TODAY, games: LG.games };
  if (path === "/command-center") { const c = commandCenter(TODAY); return { ...c, edition: LEDITION, editions: [LEDITION], slate: { n_games: 9, games: LG.games }, counts: { markets_analyzed: LG.sels.length, qualified_selections: 180, combinations: 48, high_confidence: 0, rejected: 378 }, lineups_summary: { confirmed: 0, projected: 18, unknown: 0 } }; }
  if (path === "/selections") return { edition: LEDITION, ...selectionsPage(LG.sels, q) };
  if (path === "/combos") { const cat = q.get("category") || "double"; return { edition: LEDITION, category: cat, counts: Object.fromEntries(Object.entries(LG.combos).map(([k, v]) => [k, v.length])), items: LG.combos[cat] ?? [] }; }
  if (path === "/editions") return { items: [{ ...LEDITION, counts: lcounts(), changes: lchanges() }] };
  if (path === "/editions/500") {
    const bounded = LG.sels.filter((x) => isQual(x) || x.classification === "watchlist").sort((a, b) => (CLASS_RANK[a.classification] - CLASS_RANK[b.classification]) || (a.rank_in_game ?? 99) - (b.rank_in_game ?? 99)).slice(0, 150);
    return { ...LEDITION, game_date: TODAY, summary: { slate: { n_games: 9 }, narrative: ["FIXTURE narrative for the large slate."], limitations: ["FIXTURE: synthetic large slate."], unresolved: [], rejected: LG.sels.filter((x) => x.classification === "rejected").slice(0, 200).map((x) => ({ label: x.market_label, reasons: x.rejection_reasons })), counts: lcounts() }, changes: lchanges(), content_sha256: "f".repeat(64), selections: bounded, selection_counts: classCounts(LG.sels), combos: Object.values(LG.combos).flat().slice(0, 48) };
  }
  const gm = path.match(/^\/games\/(FIX-L\d+)(\/.*)?$/);
  if (gm) {
    const g = LG.games.find((x) => x.id === gm[1]);
    if (!g) return undefined;
    const mine = LG.sels.filter((x) => x.game_id === g.id);
    if (!gm[2]) return { game: g, team_form: { home: {}, away: {} }, player_projections: LG.players.filter((p) => p.game === g).flatMap((p) => ["pts", "reb", "ast", "fg3m"].map((stat) => ({ player_id: p.id, player_name: p.name, team_abbr: p.team_abbr, stat, mean: 12, p10: 6, p50: 12, p90: 19, proj_min: 28, n_games: 40, injury_status: null }))), selections: [...mine.filter((x) => isQual(x) || x.classification === "watchlist"), ...mine.filter((x) => !isQual(x) && x.classification !== "watchlist").slice(0, 60)], selection_counts: classCounts(mine), sgp: LG.combos.sgp.filter((c) => c.legs[0]?.game_id === g.id), h2h: [], agent_reports: [], unresolved: [] };
    if (gm[2] === "/player-props") { const rows = LG.players.filter((p) => p.game === g).flatMap((p) => ["pts", "reb", "ast"].map((st) => ({ ...propRows()[0], player_id: p.id, player_name: p.name, headshot_url: null, team_abbr: p.team_abbr, opp_abbr: "OPP", game_id: g.id, game_label: g.label, market: `player_${st}`, stat: st, book: "Kalshi", selection: null }))); return { date: TODAY, markets: PROP_MARKETS, quote_status: { provider_configured: true, message: "FIXTURE: 640 player contracts quoted on Kalshi for this slate (polled)." }, ...page(rows, q) }; }
    if (gm[2] === "/lineups") return { game_id: g.id, home: { ...teamLineup("ORL"), team: g.home }, away: { ...teamLineup("DET"), team: g.away } };
    if (gm[2] === "/lineup-history") return { items: [] };
    return undefined;
  }
  if (path === "/kalshi/markets") {
    let items = LG.kalshi;
    for (const k of ["game_id", "kind", "market", "interpretation"]) if (q.get(k)) items = items.filter((r) => r[k] === q.get(k));
    if (q.get("player_id")) items = items.filter((r) => String(r.player_id) === q.get("player_id"));
    if (q.get("q")) items = items.filter((r) => r.title.toLowerCase().includes(q.get("q").toLowerCase()));
    return { date: TODAY, sync: KSYNC, counts: { total: LG.kalshi.length, normalized: LG.kalshi.filter((r) => r.interpretation === "normalized").length, unsupported: LG.kalshi.filter((r) => r.interpretation === "unsupported").length, unmatched: 0 }, events: LG.games.map((g) => ({ game_id: g.id, label: g.label })), ...page(items.map(kPublic), q), notes: ["FIXTURE note: large slate."] };
  }
  if (path === "/minutes") { let items = [...PLAYERS.filter((p) => [9001, 9005].includes(p.id)).map(minutesRow).map((r) => ({ ...r, proj_min: 40 })), ...LG.minutes]; if (q.get("team")) items = items.filter((r) => r.team_abbr === q.get("team")); if (q.get("q")) items = items.filter((r) => r.player_name.toLowerCase().includes(q.get("q").toLowerCase())); return { date: TODAY, ...page(items, q), ...MIN_META }; }
  if (path === "/player-props") { const rows = LG.players.flatMap((p) => ["pts", "reb"].map((st) => ({ ...propRows()[0], player_id: p.id, player_name: p.name, headshot_url: null, team_abbr: p.team_abbr, opp_abbr: "OPP", game_id: p.game.id, game_label: p.game.label, market: `player_${st}`, stat: st, book: "Kalshi", selection: null }))); return { date: TODAY, markets: PROP_MARKETS, quote_status: { provider_configured: true, message: "FIXTURE: 640 player contracts quoted on Kalshi for this slate (polled)." }, ...page(rows, q) }; }
  if (path === "/lineups") return { date: TODAY, games: LG.games.map((g) => ({ game: { id: g.id, label: g.label, tipoff_utc: g.tipoff_utc, status: g.status, home: g.home, away: g.away }, home: { ...teamLineup("ORL"), team: g.home }, away: { ...teamLineup("DET"), team: g.away } })) };
  if (path === "/injuries") { const items = [...LG.games.flatMap((g) => [...g.injuries.away, ...g.injuries.home].map((r) => ({ ...r, game_label: g.label }))), ...Array.from({ length: 60 }, (_, i) => ({ ...inj(`FIXTURE Off-slate Player ${i}`, ["PHX", "SAS", "UTA", "WAS", "TOR", "POR"][i % 6], "Out", "FIXTURE"), game_label: null }))]; return { as_of: iso(30), source: "FIXTURE-injury-feed", items, changes: [] }; }
  if (path === "/injuries/changes") return { date: TODAY, items: Array.from({ length: 30 }, (_, i) => ({ ...INJURY_CHANGES[0], player_name: `FIXTURE L Change ${i}`, game_id: LG.games[i % 9].id, game_label: LG.games[i % 9].label, material: i % 2 === 0 })).filter((c) => q.get("material") !== "true" || c.material), notes: ["FIXTURE note: large slate."] };
  if (path === "/models") return { items: LG.models };
  if (path === "/backtests") return { items: LG.backtests };
  if (path === "/research-lab") return { findings: [], experiments: LG.backtests, correlation: { pairs: Array.from({ length: 199 }, (_, i) => ({ a: `FIXTURE stat ${i % 11}`, b: `FIXTURE stat ${i % 7}`, rho: +(Math.cos(i) / 2).toFixed(3), n: 7000 })), notes: ["FIXTURE note."] } };
  return undefined;
}


// ---------- JARVIS (assistant, memory, briefings, AI budget) ----------
const VIEWER = { email: "viewer@fixture.test", role: "viewer" };
const J = { state: "ready", convId: 40, msgId: 900, memId: 60, briefId: 80, reqId: 3000 };
const J_MODELS = { standard: "FIXTURE-sonnet-model", deep: "FIXTURE-opus-model", light: "FIXTURE-haiku-model" };
const J_MSG = { ready: "FIXTURE: assistant ready; model provider reachable.", provider_unavailable: "FIXTURE: no provider key is configured on the server.", budget_limited: "FIXTURE: the lifetime AI budget has reached its suspend line.", paused: "FIXTURE: AI requests are paused by the owner." };
const POLICY = { lifetime_cap_usd: 100, suspend_at_usd: 95, daily_cap_usd: 5, allocations: { sonnet: 60, haiku: 15, opus: 15, dev: 10 }, per_request_cap_usd: { standard: 0.5, deep: 2, light: 0.1 }, paused: false, buffer_released: false, notifications: true, updated_at: iso(600), updated_by: USER.email };
const SPEND = { spent: 12.3456, today: 0.4321 };
const jarvisState = () => { const st = POLICY.paused ? "paused" : J.state; return { state: st, message: J_MSG[st], models: J_MODELS, models_verified: true, budget: { spent_usd: +SPEND.spent.toFixed(4), remaining_usd: +(POLICY.lifetime_cap_usd - SPEND.spent).toFixed(4), usable_usd: +(POLICY.suspend_at_usd - SPEND.spent).toFixed(4), today_usd: +SPEND.today.toFixed(4), state: st === "budget_limited" ? "budget_limited" : st === "paused" ? "paused" : "ok" }, daily_cap_usd: POLICY.daily_cap_usd, lifetime_cap_usd: POLICY.lifetime_cap_usd }; };
const CONVS = [];
function resolveContext(c = {}) {
  const out = {};
  const g = allGames().find((x) => x.id === c.game_id) ?? LG.games.find((x) => x.id === c.game_id);
  if (g) out.game = { game_id: g.id, label: g.label, date: g.date };
  const p = PLAYERS.find((x) => String(x.id) === String(c.player_id));
  if (p) out.player = { player_id: p.id, name: p.name, team: p.team_abbr };
  const k = KALSHI.find((x) => x.ticker === c.ticker);
  if (k) out.kalshi_market = { ticker: k.ticker, title: k.title };
  if (c.selection_id != null && SEL_BY_ID.has(Number(c.selection_id))) out.selection = { record_id: Number(c.selection_id) };
  if (c.combo_id != null && Object.values(C).some((x) => x.uid === c.combo_id)) out.combination = { record_id: c.combo_id };
  if (c.date) out.date = c.date;
  if (c.page) out.page = c.page;
  return out;
}
const convRef = ({ messages, tool_activity, ...c }) => c;
const SUGGESTIONS = [
  { label: "FIXTURE: Today's slate overview", text: "Give me the slate overview for today." },
  { label: "FIXTURE: Injury changes that matter", text: "Which injury changes are material today?" },
  { label: "Budget status", text: "/budget" },
  { label: "System health", text: "/health" },
  { label: "FIXTURE: Biggest Kalshi moves", text: "Which Kalshi contracts moved most today?" },
];
const MEMORY = [
  { id: ++J.memId, category: "research", status: "verified", subject_type: "player", subject_id: 9001, text: "FIXTURE memory: FIXTURE Player A has started every game in the stored sample.", sources: ["FIXTURE box scores"], observed_on: TODAY, created_by: "jarvis", created_at: iso(300) },
  { id: ++J.memId, category: "preference", status: "preference", subject_type: null, subject_id: null, text: "FIXTURE memory: the owner prefers tables over prose for slate summaries.", sources: [], observed_on: null, created_by: USER.email, created_at: iso(900) },
];
const BRIEFINGS = [
  { id: ++J.briefId, kind: "morning", date: TODAY, text: "## FIXTURE morning briefing\n\n- 3 games on the slate\n- **1** material injury change\n\n| Game | Lineups |\n|---|---|\n| DET @ ORL | projected |", generator: "FIXTURE-haiku-model", cost_usd: 0.0123, created_at: iso(400) },
  { id: ++J.briefId, kind: "overnight", date: TODAY, text: "FIXTURE overnight briefing: no settled paper tickets changed overnight.", generator: "deterministic", cost_usd: 0, created_at: iso(700) },
];
const J_EVENTS = [
  { id: 1, kind: "availability", severity: "alert", title: "FIXTURE Player F (ORL): Questionable → Out", detail: "FIXTURE ankle; 3 research records to reassess.", game_date: TODAY, occurred_at: iso(150) },
  { id: 2, kind: "lineup", severity: "notice", title: "FIXTURE: DET projected lineup updated", detail: null, game_date: TODAY, occurred_at: iso(75) },
  { id: 3, kind: "system", severity: "info", title: "FIXTURE: afternoon edition published", detail: "FIXTURE detail.", game_date: TODAY, occurred_at: iso(45) },
];
const BREQS = Array.from({ length: 6 }, (_, i) => ({ id: ++J.reqId, at: iso(30 + i * 40), status: ["settled", "settled", "released", "reserved", "assumed", "settled"][i], bucket: ["sonnet", "haiku", "opus", "sonnet", "sonnet", "dev"][i], model: Object.values(J_MODELS)[i % 3], task: ["jarvis.chat", "briefing.morning", "jarvis.deep", "jarvis.chat", "jarvis.chat", "dev.eval"][i], reserved_usd: 0.05 + i / 100, actual_usd: i === 2 || i === 3 ? null : 0.031 + i / 200, input_tokens: 4200 + i * 100, output_tokens: 600 + i * 10, cache_read_tokens: i % 2 ? 3000 : 0, cache_write_tokens: 0, attempt: 1, routing: { handler: "model" }, error: i === 2 ? "FIXTURE: provider timeout; reservation released." : null, conversation_id: null }));
const usage = (key, n, u) => ({ key, requests: n, usd: u, input_tokens: n * 4200, output_tokens: n * 610, cache_read_tokens: n * 1500, cache_write_tokens: n * 200 });
function aiBudget() {
  const st = jarvisState();
  return { policy: POLICY, spent_usd: st.budget.spent_usd, pending_usd: 0.12, remaining_usd: st.budget.remaining_usd, usable_usd: st.budget.usable_usd, today_usd: st.budget.today_usd, month_usd: 9.87, state: st.budget.state,
    checkpoints: [10, 25, 50, 75, 90].map((pct) => ({ pct, usd: pct, reached: SPEND.spent >= pct })),
    buckets: [["sonnet", 8.1], ["haiku", 1.9], ["opus", 1.6], ["dev", 0.75]].map(([bucket, used_usd]) => ({ bucket, allocation_usd: POLICY.allocations[bucket], used_usd })),
    by_model: [usage(J_MODELS.standard, 210, 8.1), usage(J_MODELS.light, 340, 1.9), usage(J_MODELS.deep, 9, 1.6)], by_task: [usage("jarvis.chat", 190, 7.2), usage("briefing.morning", 60, 1.1), usage("jarvis.deep", 9, 1.6)], by_agent: [usage("jarvis", 199, 8.8), usage("briefing-writer", 300, 2.4)],
    requests: 559, input_tokens: 2347800, output_tokens: 340990, cache_read_tokens: 838500, cache_write_tokens: 111800, cache_savings_usd: 2.2641, avg_usd_per_day: 0.8817, est_days_remaining: 94,
    daily: Array.from({ length: 30 }, (_, i) => ({ date: shift(TODAY, -(29 - i)), requests: 10 + (i * 7) % 30, usd: +(0.2 + ((i * 37) % 100) / 100).toFixed(4) })),
    prices: { [J_MODELS.standard]: { in: 3, out: 15, cache_read: 0.3, cache_write: 3.75 }, [J_MODELS.light]: { in: 1, out: 5, cache_read: 0.1, cache_write: 1.25 }, [J_MODELS.deep]: { in: 15, out: 75, cache_read: 1.5, cache_write: 18.75 } },
    notes: ["FIXTURE note: prices are per million tokens as configured on the server.", "FIXTURE note: requests stop at the suspend line unless the safety buffer is released."], assistant: st };
}
const OWNER_ONLY = () => ({ __status: 403, ...err("forbidden", "FIXTURE: this area is available to the owner account only.") });
function jarvisRoute(method, path, q, body, role) {
  const owner = role === "owner";
  if (path === "/__mock/jarvis") { if (method === "POST" && body.state) J.state = body.state; return { state: J.state }; }
  if (method === "GET") {
    if (path === "/jarvis/state") return jarvisState();
    if (path === "/jarvis/suggestions") { const ctx = resolveContext(Object.fromEntries(q)); return { context: ctx, items: [...(ctx.game ? [{ label: `FIXTURE: What matters in ${ctx.game.label}?`, text: `What matters most in ${ctx.game.label}?` }] : []), ...(ctx.player ? [{ label: `FIXTURE: ${ctx.player.name} minutes outlook`, text: `What is the minutes outlook for ${ctx.player.name}?` }] : []), ...SUGGESTIONS] }; }
    if (path === "/jarvis/tools") return { items: [{ name: "get_slate", label: "FIXTURE: Reading the slate", group: "slate", description: "FIXTURE", writes: false }], total: 1, note: "FIXTURE note." };
    if (path === "/jarvis/conversations") return { items: [...CONVS].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, Number(q.get("limit") ?? 30)).map(convRef) };
    const cm = path.match(/^\/jarvis\/conversations\/(\d+)$/);
    if (cm) return CONVS.find((c) => String(c.id) === cm[1]) ?? { __status: 404, ...err("not_found", "FIXTURE: conversation not found.") };
    if (path === "/jarvis/memory") return { items: MEMORY };
    if (path === "/jarvis/briefings") return { items: BRIEFINGS };
    if (path === "/jarvis/events") return q.get("kind") === "milestone_reached" ? { items: LV.milestones.map(milestoneView).filter((m) => m.reached).map((m) => ({ id: 5000 + m.id, kind: "milestone_reached", severity: "notice", title: `FIXTURE: ${m.player_name} reached ${m.threshold} ${m.stat}`, detail: { notify: m.notify, milestone_id: m.id }, game_date: TODAY, occurred_at: m.reached_at })) } : { items: J_EVENTS };
    if (path === "/admin/ai-budget") return owner ? aiBudget() : OWNER_ONLY();
    if (path === "/admin/ai-budget/requests") return owner ? { items: BREQS.slice(0, Number(q.get("limit") ?? 50)) } : OWNER_ONLY();
  }
  if (method === "POST") {
    if (!owner && (path.startsWith("/jarvis/") || path === "/admin/ai-budget")) return OWNER_ONLY();
    if (path === "/jarvis/conversations") { const now = new Date().toISOString(); const c = { id: ++J.convId, title: null, context: resolveContext(body.context), created_at: now, updated_at: now, messages: [], tool_activity: [] }; CONVS.push(c); return convRef(c); }
    const dm = path.match(/^\/jarvis\/conversations\/(\d+)\/delete$/);
    if (dm) { const i = CONVS.findIndex((c) => String(c.id) === dm[1]); if (i < 0) return { __status: 404, ...err("not_found", "FIXTURE: conversation not found.") }; CONVS.splice(i, 1); return { deleted: true }; }
    if (path === "/jarvis/memory") { if (!body.text || !body.category) return { __status: 422, ...err("invalid", "FIXTURE: category and text are required.") }; const m = { id: ++J.memId, category: body.category, status: body.status ?? (body.category === "preference" ? "preference" : "hypothesis"), subject_type: body.subject_type ?? null, subject_id: body.subject_id ?? null, text: String(body.text), sources: [], observed_on: null, created_by: USER.email, created_at: new Date().toISOString() }; MEMORY.unshift(m); return m; }
    const mm = path.match(/^\/jarvis\/memory\/(\d+)\/delete$/);
    if (mm) { const i = MEMORY.findIndex((m) => String(m.id) === mm[1]); if (i >= 0) MEMORY.splice(i, 1); return { deleted: true }; }
    if (path === "/jarvis/briefings/run") { if (body.kind === "postgame") return { created: false, reason: "FIXTURE: no games are final yet, so there is nothing to brief." }; const b = { id: ++J.briefId, kind: body.kind, date: TODAY, text: `FIXTURE ${body.kind} briefing generated on request.`, generator: "deterministic", cost_usd: 0, created_at: new Date().toISOString() }; BRIEFINGS.unshift(b); return { created: true, id: b.id, generator: b.generator, cost_usd: 0 }; }
    if (path === "/admin/ai-budget") {
      if (body.lifetime_cap_usd !== undefined && body.lifetime_cap_usd > 100) return { __status: 422, ...err("invalid", "FIXTURE: the lifetime cap cannot exceed the authorised $100.") };
      const cap = body.lifetime_cap_usd ?? POLICY.lifetime_cap_usd;
      if (body.allocations && Object.values(body.allocations).reduce((a, b) => a + b, 0) > cap) return { __status: 422, ...err("invalid", "FIXTURE: allocations exceed the lifetime cap.") };
      Object.assign(POLICY, body, { updated_at: new Date().toISOString(), updated_by: USER.email });
      return POLICY;
    }
  }
  return undefined;
}
const IMAGE_STORE = new Map(); // message id → [{type, bytes}]
const IMAGE_MEDIA = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const looksLikeImage = (b) => b.length > 8 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.subarray(0, 3).toString() === "GIF" || b.subarray(8, 12).toString() === "WEBP");
/** Streaming reply for POST /jarvis/conversations/{id}/messages (text/event-stream). */
function jarvisStream(res, conv, body) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  const text = String(body.text ?? "");
  const now = () => new Date().toISOString();
  const images = Array.isArray(body.images) ? body.images : [];
  const userMsg = { id: ++J.msgId, role: "user", text, model: null, stop_reason: null, sources: [], cost_usd: null, created_at: now(), tool_calls: [], images: images.length };
  conv.messages.push(userMsg);
  if (images.length) IMAGE_STORE.set(String(userMsg.id), images.map((im) => ({ type: im.media_type, bytes: Buffer.from(String(im.data), "base64") })));
  if (!conv.title) conv.title = text.slice(0, 60);
  conv.updated_at = now();
  const emit = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const finish = (model, answer, cost, sources) => { const m = { id: ++J.msgId, role: "assistant", text: answer, model, stop_reason: "end_turn", sources, cost_usd: cost, created_at: now(), tool_calls: [] }; conv.messages.push(m); conv.updated_at = now(); emit({ type: "done", message_id: m.id, model, cost_usd: cost, sources, stop_reason: "end_turn" }); res.end(); };
  const slash = text.trim().startsWith("/") && images.length === 0; // slash commands are ignored when an image is attached
  const bad = images.find((im) => !IMAGE_MEDIA.includes(im.media_type) || !looksLikeImage(Buffer.from(String(im.data ?? ""), "base64")));
  if (bad || text.includes("trigger-invalid-image")) {
    conv.messages.pop(); // a rejected turn is not stored
    IMAGE_STORE.delete(String(userMsg.id));
    emit({ type: "status", state: "processing", routing: { handler: "model", reason: "FIXTURE" }, model: J_MODELS.standard });
    return setTimeout(() => { emit({ type: "error", code: "invalid_image", message: "FIXTURE: the attached image could not be read. Attach a PNG, JPEG, WebP or GIF under 1.5 MB.", cost_usd: 0 }); res.end(); }, 120);
  }
  if (images.length) {
    const model = J_MODELS.standard, cost = 0.0584;
    const labels = [["read_image", "FIXTURE: Reading the attached slip"], ["find_player", "Looking up the player"], ["get_projections", "Loading model projections"], ["evaluate_combination", "Evaluating the combination"]];
    const sources = labels.slice(1).map(([tool, label]) => ({ tool, label, args: { source: "attached image" } }));
    const answer = `## FIXTURE slip analysis\n\nLegs read from the attached slip (${images.length} image${images.length === 1 ? "" : "s"}):\n\n| Leg | Line | Model probability |\n|---|---|---|\n| FIXTURE Player A Over PTS | 24.5 | 56.1% |\n| FIXTURE Player E Under PTS | 27.5 | 57.3% |\n\n- Joint estimate comes from the combination evaluator\n- Nothing here is a recommendation`;
    const seq = [() => emit({ type: "status", state: "processing", routing: { handler: "model", mode: "standard", reason: "FIXTURE: image attached" }, model }), ...labels.flatMap(([tool, label], k) => [() => emit({ type: "tool_start", id: `i${k}`, tool, label, args: {} }), () => emit({ type: "tool_end", id: `i${k}`, tool, ok: true, ms: 30 + k * 11 })]), () => emit({ type: "text", delta: answer.slice(0, 90) }), () => emit({ type: "text", delta: answer.slice(90) }), () => emit({ type: "usage", cost_usd: cost, total_cost_usd: cost, input_tokens: 6100, output_tokens: 280, cache_read_tokens: 0 }), () => { SPEND.spent += cost; SPEND.today += cost; finish(model, answer, cost, sources); }];
    let k = 0;
    const step = () => { if (res.destroyed) return; seq[k++](); if (k < seq.length) setTimeout(step, 70); };
    return step();
  }
  if (text.includes("trigger-budget-error")) {
    emit({ type: "status", state: "processing", routing: { handler: "model", mode: "standard", reason: "FIXTURE" }, model: J_MODELS.standard });
    return setTimeout(() => { J.state = "budget_limited"; emit({ type: "error", code: "lifetime_cap", message: "FIXTURE: the lifetime AI budget cap has been reached; no model request was sent.", state: "budget_limited", cost_usd: 0 }); res.end(); }, 150);
  }
  if (text.includes("trigger-drop")) { emit({ type: "status", state: "processing", routing: { handler: "model" }, model: J_MODELS.standard }); emit({ type: "text", delta: "FIXTURE partial " }); return setTimeout(() => res.end(), 150); } // the stream ends without a terminal event
  if (slash) {
    emit({ type: "status", state: "processing", routing: { handler: "command", tool: "budget_status", reason: "FIXTURE: slash command" }, model: "deterministic" });
    emit({ type: "tool_start", id: "t1", tool: "budget_status", label: "FIXTURE: Reading the AI budget ledger", args: {} });
    return setTimeout(() => { emit({ type: "tool_end", id: "t1", tool: "budget_status", ok: true, ms: 12 }); const st = jarvisState(); const ans = `**FIXTURE budget**\n\n- Spent: $${st.budget.spent_usd.toFixed(2)}\n- Remaining: $${st.budget.remaining_usd.toFixed(2)}`; emit({ type: "text", delta: ans }); finish("deterministic", ans, 0, [{ tool: "budget_status", label: "FIXTURE: Reading the AI budget ledger", args: {} }]); }, 120);
  }
  if (jarvisState().state !== "ready") { emit({ type: "error", code: jarvisState().state === "paused" ? "paused" : "provider_unavailable", message: jarvisState().message, state: jarvisState().state }); return res.end(); }
  const deep = body.mode === "deep", model = deep ? J_MODELS.deep : J_MODELS.standard, cost = deep ? 0.2145 : 0.0312;
  const parts = ["## FIXTURE slate summary\n\n", "Three games are on the slate. ", "**One** material injury change was recorded.\n\n", "| Game | Lineup status | Qualified |\n", "|---|---|---|\n| DET @ ORL | projected | 2 |\n", "| LAL @ DEN | confirmed | 1 |\n\n", "- Source data is `FIXTURE` only\n- Figures come from stored records"];
  const sources = [{ tool: "get_slate", label: "FIXTURE: Reading the slate", args: { date: TODAY } }, { tool: "get_injury_changes", label: "FIXTURE: Inspecting the injury report", args: { date: TODAY, material: true } }];
  const steps = [
    () => emit({ type: "status", state: "processing", routing: { handler: "model", mode: deep ? "deep" : "standard", reason: "FIXTURE" }, model }),
    () => emit({ type: "tool_start", id: "t1", tool: "get_slate", label: sources[0].label, args: sources[0].args }),
    () => emit({ type: "tool_end", id: "t1", tool: "get_slate", ok: true, ms: 41 }),
    () => emit({ type: "tool_start", id: "t2", tool: "get_injury_changes", label: sources[1].label, args: sources[1].args }),
    () => emit({ type: "tool_end", id: "t2", tool: "get_injury_changes", ok: true, ms: 67 }),
    ...parts.map((delta) => () => emit({ type: "text", delta })),
    () => emit({ type: "usage", cost_usd: cost, total_cost_usd: cost, input_tokens: 4200, output_tokens: 310, cache_read_tokens: 3000 }),
    () => { SPEND.spent += cost; SPEND.today += cost; conv.tool_activity.push(...sources.map((x, i) => ({ ...x, ok: true, error: null, ms: i ? 67 : 41, truncated: false, at: now() }))); finish(model, parts.join(""), cost, sources); },
  ];
  let i = 0;
  const tick = () => { if (res.destroyed) return; steps[i++](); if (i < steps.length) setTimeout(tick, 110); };
  tick();
}


// ---------- GIZER LIVE (observed in-game data) ----------
// FIX-G1 is a scripted game. POST /api/v1/__mock/live {phase, stale, streamError} moves it:
// 0 scheduled → 1 live Q1 → 2 halftime → 3 live Q3 → 4 final. Follows and milestones persist in memory.
const LV = { phase: 0, stale: false, streamError: false, version: 1, follows: { game: new Set(), player: new Set(), team: new Set() }, milestones: [], msId: 300, streams: new Set() };
const PH = [
  { status: "scheduled", label: "Scheduled", period: null, pl: "", clock: null, home: null, away: null, hl: [], al: [], plays: 0, elapsed: 0, f: 0 },
  { status: "live", label: "Live", period: 1, pl: "Q1", clock: "6:12", home: 14, away: 12, hl: [14], al: [12], plays: 12, elapsed: 348, f: 0.12 },
  { status: "halftime", label: "Halftime", period: 2, pl: "Q2", clock: null, home: 52, away: 49, hl: [28, 24], al: [25, 24], plays: 60, elapsed: 1440, f: 0.5 },
  { status: "live", label: "Live", period: 3, pl: "Q3", clock: "4:05", home: 70, away: 66, hl: [28, 24, 18], al: [25, 24, 17], plays: 80, elapsed: 1915, f: 0.66 },
  { status: "final", label: "Final", period: 4, pl: "Q4", clock: null, home: 104, away: 99, hl: [28, 24, 26, 26], al: [25, 24, 22, 28], plays: 120, elapsed: 2880, f: 1 },
];
const fresh = (started) => (LV.stale && started ? { observed_at: iso(4), provider_updated_at: iso(4.2), age_s: 240, stale: true, feed: "stale" } : { observed_at: iso(0.15), provider_updated_at: iso(0.3), age_s: 9, stale: false, feed: started ? "ok" : "not_started" });
function liveRow(g) {
  const ph = g.id === "FIX-G1" ? PH[LV.phase] : g.id === "FIX-G3" || g.status === "final" ? { ...PH[4], home: g.home_points ?? 112, away: g.away_points ?? 107 } : PH[0];
  const started = ph.status !== "scheduled";
  return { game_id: g.id, label: g.label, game_date: g.date, tipoff_utc: g.tipoff_utc, venue: g.venue, status: ph.status, status_label: ph.label, period: ph.period, period_label: ph.pl, clock: ph.clock,
    home: { team_id: g.home.id, abbr: g.home.abbr, name: g.home.name, score: ph.home, linescores: ph.hl }, away: { team_id: g.away.id, abbr: g.away.abbr, name: g.away.name, score: ph.away, linescores: ph.al },
    version: g.id === "FIX-G1" ? LV.version : 1, followed: LV.follows.game.has(g.id), favorite_team: LV.follows.team.has(g.home.id) || LV.follows.team.has(g.away.id), ...fresh(started), _ph: ph };
}
const pubRow = ({ _ph, ...r }) => r;
const POLL_NOTE = "FIXTURE: scores are read from a public feed by the server about every 15 seconds while games are in progress. They are delayed observations.";
function scoreboard(date) {
  const games = (GAMES[date] ?? []).map(liveRow);
  const rank = (r) => (r.followed || r.favorite_team ? 0 : r.status === "live" ? 1 : r.status === "halftime" ? 2 : r.status === "scheduled" ? 3 : 4);
  games.sort((a, b) => rank(a) - rank(b));
  return { date, prev: shift(date, -1), next: shift(date, 1), today: TODAY, live_count: games.filter((r) => ["live", "overtime", "halftime", "end_period"].includes(r.status)).length, server_time: new Date().toISOString(), poll_note: POLL_NOTE, games: games.map(pubRow) };
}
const liveGame = (id) => allGames().find((g) => g.id === id) ?? (LARGE ? LG.games.find((g) => g.id === id) : undefined);
const LNAMES = { away: ["FIXTURE Player A", "FIXTURE Player G", "FIXTURE DET S3", "FIXTURE DET S4", "FIXTURE DET S5", "FIXTURE DET R6", "FIXTURE DET R7", "FIXTURE DET R8"], home: ["FIXTURE ORL S1", "FIXTURE ORL S2", "FIXTURE ORL S3", "FIXTURE ORL S4", "FIXTURE ORL S5", "FIXTURE Player B", "FIXTURE ORL R7", "FIXTURE ORL R8"] };
const LPID = { "FIXTURE Player A": 9001, "FIXTURE Player B": 9002 };
function boxTeam(g, side, ph) {
  const t = g[side];
  const live = ph.status === "live";
  const players = LNAMES[side].map((name, i) => {
    const starter = i < 5, dnp = i === 7, k = dnp ? 0 : ph.f * (starter ? 1 : 0.5);
    const n = (base) => (dnp ? null : Math.round(base * k));
    const pts = n(26 - i * 3), reb = n(9 - i), ast = n(8 - i), fgm = n(9 - i), fga = n(18 - i), fg3m = n(3), fg3a = n(7), ftm = n(4), fta = n(5), pf = dnp ? null : i === 3 ? Math.min(5, Math.ceil(ph.f * 5)) : Math.round(ph.f * 2);
    return { espn_athlete_id: `${t.abbr}-${i}`, player_id: LPID[name] ?? null, team_id: t.id, name, position: ["G", "G", "F", "F", "C", "G", "F", "C"][i], jersey: String(i + 1), headshot_url: HEAD[LPID[name]] ?? null, starter, role: starter ? "starter" : "bench", dnp, ejected: false,
      on_court: dnp ? false : ph.status === "scheduled" ? null : i === 4 ? null : starter, /* kept after the final, as the source does */ minutes: dnp ? null : +(34 * k).toFixed(0) * 1, pts, reb, ast, stl: n(2), blk: i === 2 ? null : n(1), tov: n(3), pf, fgm, fga, fg3m, fg3a, ftm, fta, oreb: n(2), dreb: n(6),
      plus_minus: i === 1 ? null : dnp ? null : Math.round((side === "home" ? 5 : -5) * ph.f + (i % 3) - 1), pra: dnp ? null : pts + reb + ast, pr: dnp ? null : pts + reb, pa: dnp ? null : pts + ast, ra: dnp ? null : reb + ast,
      fg_pct: dnp || !fga ? null : +((fgm / fga) * 100).toFixed(1), fg3_pct: null, ft_pct: dnp || !fta ? null : +((ftm / fta) * 100).toFixed(1), true_shooting_pct: dnp || !fga ? null : +((pts / (2 * (fga + 0.44 * fta))) * 100).toFixed(1),
      foul_trouble: dnp ? null : i === 3 && pf >= 3, pregame: i < 3 ? { proj_min: 33 - i, pts: 24 - i * 3, reb: 8 - i, ast: 7 - i, fg3m: 2.1, published_at: iso(300) } : null };
  });
  const sum = (k) => players.reduce((a, r) => a + (r[k] ?? 0), 0);
  return { team_id: t.id, abbr: t.abbr, name: t.name, players, totals: Object.fromEntries(["pts", "reb", "ast", "stl", "blk", "tov", "pf", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb"].map((k) => [k, sum(k)])) };
}
function livePlays(g, ph) {
  const out = [];
  let h = 0, a = 0;
  const kinds = ["made", "missed", "rebound", "foul", "substitution", "made", "turnover", "free_throw"];
  for (let i = 1; i <= ph.plays; i++) {
    const elapsed = Math.round((ph.elapsed * i) / Math.max(1, ph.plays)), period = Math.min(4, Math.floor((elapsed - 1) / 720) + 1), left = period * 720 - elapsed;
    const side = i % 2 ? "home" : "away", kind = kinds[i % kinds.length], t = g[side], name = LNAMES[side][i % 5];
    const scoring = kind === "made" || kind === "free_throw", val = kind === "made" ? 2 : kind === "free_throw" ? 1 : 0;
    if (scoring) side === "home" ? (h += val) : (a += val);
    const text = { made: `FIXTURE: ${name} makes jump shot`, missed: `FIXTURE: ${name} misses jump shot`, rebound: `FIXTURE: ${name} defensive rebound`, foul: `FIXTURE: ${name} personal foul`, substitution: `FIXTURE: ${LNAMES[side][5]} enters the game for ${name}`, turnover: `FIXTURE: ${name} bad pass turnover`, free_throw: `FIXTURE: ${name} makes free throw 1 of 1` }[kind];
    out.push({ event_id: `${g.id}-${i}`, sequence: i, period, clock: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`, elapsed_s: elapsed, team_id: t.id, team_side: side, kind, type_text: kind, text, scoring, score_value: val, home_score: h, away_score: a, player_ids: LPID[name] ? [LPID[name]] : [], provider_at: iso(1), ingested_at: iso(0.9), corrected: i === 5 });
  }
  return out;
}
function liveCenter(g) {
  const r = liveRow(g), ph = r._ph, started = ph.status !== "scheduled";
  const plays = livePlays(g, ph);
  const lead = (side) => { const p = boxTeam(g, side, ph).players[0]; return { pts: { player_id: p.player_id, name: p.name, value: p.pts }, reb: { player_id: p.player_id, name: p.name, value: p.reb }, ast: side === "home" ? null : { player_id: p.player_id, name: p.name, value: p.ast } }; };
  return { ...pubRow(r), mode: !started ? "pregame" : ph.status === "final" ? "final" : "live", team_stats: {}, leaders: started ? { home: lead("home"), away: lead("away") } : null,
    momentum: started ? { lead_changes: 3, ties: 2, largest_lead: { home: 7, away: 4 }, runs: [{ team: "home", points: 8, start_s: 100, end_s: 220 }], note: "FIXTURE: observed scoring events only. No win probability is computed.", points: plays.filter((p) => p.scoring).length } : null,
    last_plays: [...plays].reverse().slice(0, 8), plays_count: plays.length,
    summaries: LV.phase >= 2 && g.id === "FIX-G1" ? [{ kind: "half", text: "FIXTURE summary: ORL led 52-49 at the half; FIXTURE Player A had the most points for DET.", created_at: iso(5) }] : [], poll_note: POLL_NOTE, notes: ["FIXTURE note: pregame research is unchanged by anything observed during the game.", "FIXTURE note: a value the source has not published is shown as missing."] };
}
function liveSub(g, sub, q) {
  const r = liveRow(g), ph = r._ph, started = ph.status !== "scheduled";
  if (sub === "boxscore") return { game_id: g.id, status: ph.status, period: ph.period, available: started, home: boxTeam(g, "home", ph), away: boxTeam(g, "away", ph), notes: ["FIXTURE note: on-court status is derived from substitutions; unknown is shown as unknown."], ...fresh(started) };
  if (sub === "play-by-play") {
    let items = livePlays(g, ph);
    const f = q.get("filter") || "all";
    if (f === "scoring") items = items.filter((p) => p.scoring);
    if (f === "fouls") items = items.filter((p) => p.kind === "foul");
    if (f === "substitutions") items = items.filter((p) => p.kind === "substitution");
    if (q.get("team_id")) items = items.filter((p) => String(p.team_id) === q.get("team_id"));
    if (q.get("player_id")) items = items.filter((p) => p.player_ids.map(String).includes(q.get("player_id")));
    const total = items.length;
    if (q.get("after_sequence")) items = items.filter((p) => p.sequence > Number(q.get("after_sequence")));
    if ((q.get("order") || "desc") === "desc") items = [...items].reverse();
    const limit = Number(q.get("limit") ?? 50), offset = Number(q.get("offset") ?? 0);
    return { game_id: g.id, total, items: items.slice(offset, offset + limit), note: "FIXTURE note: play text is the source's wording.", ...fresh(started) };
  }
  if (sub === "rotations") {
    const el = ph.elapsed;
    const team = (side, determinable) => ({ team_id: g[side].id, abbr: g[side].abbr, determinable, problems: determinable ? [] : ["FIXTURE: a substitution event is missing"], note: determinable ? "FIXTURE: derived from the published starting five and substitution events." : "FIXTURE: on-court stints cannot be determined for this team because the substitution chain is incomplete.",
      players: determinable && started ? LNAMES[side].slice(0, 7).map((name, i) => { const starter = i < 5; const stints = starter ? [{ start_s: 0, end_s: Math.min(el, 420) }, ...(el > 600 ? [{ start_s: 600, end_s: ph.status === "live" ? null : el }] : [])] : el > 420 ? [{ start_s: 420, end_s: Math.min(el, 600) }] : []; const mins = +(stints.reduce((a2, x) => a2 + ((x.end_s ?? el) - x.start_s), 0) / 60).toFixed(1); return { espn_athlete_id: `${g[side].abbr}-${i}`, player_id: LPID[name] ?? null, name, starter, role: starter ? "starter" : "bench", on_court: starter, stints, minutes_by_period: { 1: +(Math.min(mins, 10)).toFixed(1) }, minutes: mins, pf: i === 3 ? 4 : 1, foul_trouble: i === 3, proj_min: i < 3 ? 33 - i : null, minutes_vs_projection: i < 3 ? +(mins - (33 - i)).toFixed(1) : null }; }) : [] });
    return { game_id: g.id, status: ph.status, period: ph.period, elapsed_s: el, home: team("home", true), away: team("away", false), notes: ["FIXTURE note: projected minutes are the pregame projection, kept as published."] };
  }
  if (sub === "team-stats") return { game_id: g.id, home: { team_id: g.home.id, abbr: g.home.abbr }, away: { team_id: g.away.id, abbr: g.away.abbr }, available: started, items: started ? [{ key: "fg", label: "FIXTURE Field goals", home: "20-44", away: "18-45", home_value: 20, away_value: 18 }, { key: "fgpct", label: "FIXTURE Field goal %", home: "45", away: "40", home_value: 45, away_value: 40 }, { key: "reb", label: "FIXTURE Rebounds", home: "24", away: "21", home_value: 24, away_value: 21 }, { key: "tov", label: "FIXTURE Turnovers", home: null, away: "7", home_value: null, away_value: 7 }] : [], not_published: ["FIXTURE Bench points"] };
  if (sub === "momentum") { const pts = livePlays(g, ph).filter((p) => p.scoring).map((p) => ({ t: p.elapsed_s, period: p.period, home: p.home_score, away: p.away_score, diff: p.home_score - p.away_score })); return { points: pts, lead_changes: 3, ties: 2, largest_lead: { home: 7, away: 4 }, runs: [{ team: "home", points: 8, start_s: 100, end_s: 220 }], note: "FIXTURE: observed scoring events only. No win probability is computed." }; }
  return undefined;
}
function milestoneView(m) {
  const g = GAMES_TODAY[0], ph = liveRow(g)._ph, started = ph.status !== "scheduled";
  const row = started ? [...boxTeam(g, "home", ph).players, ...boxTeam(g, "away", ph).players].find((r) => r.player_id === m.player_id) : null;
  const current = row ? (m.stat === "min" ? row.minutes : row[m.stat] ?? null) : null;
  const reached = current != null && current >= m.threshold;
  return { ...m, player_name: PLAYERS.find((p) => p.id === m.player_id)?.name ?? "FIXTURE player", current, remaining: current == null ? null : Math.max(0, +(m.threshold - current).toFixed(1)), reached, reached_at: reached ? iso(1) : null, reached_value: reached ? current : null, game_status: row ? ph.status : null, observed_at: row ? fresh(true).observed_at : null, note: row ? null : "FIXTURE: no game in progress for this player." };
}
function playerLive(pid) {
  const p = PLAYERS.find((x) => String(x.id) === String(pid));
  if (!p) return null;
  const g = GAMES_TODAY[0], r = liveRow(g), ph = r._ph, started = ph.status !== "scheduled";
  const line = started ? [...boxTeam(g, "home", ph).players, ...boxTeam(g, "away", ph).players].find((x) => x.player_id === p.id) ?? null : null;
  return { player_id: p.id, name: p.name, headshot_url: HEAD[p.id] ?? null, date: TODAY, followed: LV.follows.player.has(p.id), live: line ? { game_id: g.id, label: g.label, status: ph.status, status_label: ph.label, period: ph.period, period_label: ph.pl, clock: ph.clock, line, ...fresh(true) } : null, milestones: LV.milestones.filter((m) => m.player_id === p.id).map(milestoneView) };
}
function liveRoute(method, path, q, body, role) {
  const date = q.get("date") || TODAY;
  if (path === "/__mock/live") { if (method === "POST") { for (const k of ["phase", "stale", "streamError"]) if (body[k] !== undefined) LV[k] = body[k]; LV.version++; if (LV.streamError) for (const r of LV.streams) r.end(); /* ended, not destroyed: a destroyed upstream socket hangs behind the Next proxy */ } return { phase: LV.phase, stale: LV.stale, streamError: LV.streamError, version: LV.version }; }
  if (method === "GET") {
    if (path === "/live/scoreboard" || path === "/live/games") return LARGE && date === TODAY ? { ...scoreboard(date), live_count: 0, games: LG.games.map((g) => pubRow(liveRow({ ...g, status: "scheduled" }))) } : scoreboard(date);
    const gm = path.match(/^\/live\/games\/([^/]+)(?:\/([a-z-]+))?$/);
    if (gm && gm[2] !== "stream") { const g = liveGame(decodeURIComponent(gm[1])); if (!g) return { __status: 404, ...err("not_found", "FIXTURE: game not found in the live feed.") }; return gm[2] ? (liveSub(g, gm[2], q) ?? { __status: 404, ...err("not_found", "FIXTURE: unknown live resource.") }) : liveCenter(g); }
    const pm = path.match(/^\/live\/players\/(\d+)$/);
    if (pm) return playerLive(pm[1]) ?? { __status: 404, ...err("not_found", "FIXTURE: player not found.") };
    if (path === "/live/watchlist") { const ids = new Set([...LV.follows.player, ...LV.milestones.map((m) => m.player_id)]); const players = [...ids].map((id) => playerLive(id)).filter(Boolean).map((p) => ({ player_id: p.player_id, name: p.name, team_abbr: PLAYERS.find((x) => x.id === p.player_id)?.team_abbr ?? null, headshot_url: p.headshot_url, live: p.live, milestones: p.milestones })); const games = scoreboard(date).games.filter((r) => r.followed || r.favorite_team); return { date, games, players, teams: Object.values(T).filter((t) => LV.follows.team.has(t.id)).map((t) => ({ team_id: t.id, abbr: t.abbr, name: t.name })), counts: { games: games.length, players: players.length, teams: LV.follows.team.size } }; }
    if (path === "/live/milestones") return { date, items: LV.milestones.map(milestoneView), stats: ["pts", "reb", "ast", "fg3m", "stl", "blk", "min", "pra", "pr", "pa", "ra", "double_double"] };
    if (path === "/live/research-tracker") {
      const g = GAMES_TODAY[0], ph = liveRow(g)._ph, started = ph.status !== "scheduled";
      const rows = started ? [...boxTeam(g, "home", ph).players, ...boxTeam(g, "away", ph).players] : [];
      const items = tickets.filter((t) => t.game_date === TODAY).map((t) => ({ ticket_id: t.id, kind: t.kind, engine: t.engine, structure: t.structure, classification: t.classification, created_at: t.created_at, status: t.settlement ? "settled" : "pending", settlement: t.settlement ? { result: t.settlement.result, settled_at: t.settlement.settled_at, reason: null } : null,
        legs: t.legs.map((l) => { const sel0 = SEL_BY_ID.get(l.selection_id); const row = rows.find((r) => r.player_id === sel0?.subject_id); const stat = l.market.replace("player_", ""); const current = row && l.game_id === g.id ? (row[stat] ?? null) : null; const lr = l.game_id === g.id ? liveRow(g) : liveRow(liveGame(l.game_id) ?? g); return { label: l.label, market: l.market, side: l.side, line: l.line, game_id: l.game_id, game_label: l.game_label, subject_id: sel0?.subject_id ?? null, current, current_basis: current == null ? null : "FIXTURE live box score", difference_to_line: current == null || l.line == null ? null : +(current - l.line).toFixed(1), game_status: lr.status, status_label: lr.status_label, period_label: lr.period_label, clock: lr.clock, observation: lr.status === "scheduled" ? "not_started" : lr.status === "final" ? "final_awaiting_settlement" : "in_progress", observed_at: lr.status === "scheduled" ? null : lr.observed_at, stale: lr.stale }; }) }));
      return { date, total: items.length, notes: ["FIXTURE note: a leg has an outcome only once its ticket is settled.", "FIXTURE note: current values are observations from the box score."], items };
    }
  }
  if (method === "POST" && path.startsWith("/live/")) {
    if (role !== "owner") return { __status: 403, ...err("forbidden", "FIXTURE: following requires the owner account.") };
    const fm = path.match(/^\/live\/watchlist\/(follow|unfollow)$/);
    if (fm) { const set = LV.follows[body.kind]; if (!set) return { __status: 422, ...err("invalid", "FIXTURE: unknown kind.") }; const ref = body.kind === "game" ? String(body.ref_id) : Number(body.ref_id); fm[1] === "follow" ? set.add(ref) : set.delete(ref); LV.version++; return { following: fm[1] === "follow", kind: body.kind, ref_id: body.ref_id }; }
    if (path === "/live/milestones") { if (!PLAYERS.some((p) => p.id === Number(body.player_id)) || typeof body.threshold !== "number" || body.threshold <= 0) return { __status: 422, ...err("invalid", "FIXTURE: a known player and a threshold above zero are required.") }; const m = { id: ++LV.msId, player_id: Number(body.player_id), stat: body.stat, threshold: body.threshold, game_date: body.date ?? TODAY, notify: Boolean(body.notify) }; LV.milestones.push(m); return milestoneView(m); }
    const dm = path.match(/^\/live\/milestones\/(\d+)\/delete$/);
    if (dm) { const i = LV.milestones.findIndex((m) => String(m.id) === dm[1]); if (i >= 0) LV.milestones.splice(i, 1); return { deleted: true }; }
  }
  return undefined;
}
/** GET /live/games/{id}/stream — text/event-stream of GameRow on version change, keep-alives between. */
function liveStream(res, g) {
  if (LV.streamError) { res.writeHead(503, { "Content-Type": "application/json" }); return res.end(JSON.stringify(err("unavailable", "FIXTURE: stream unavailable."))); }
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  LV.streams.add(res);
  let sent = -1, n = 0;
  const tick = () => { if (res.destroyed) return; const r = { ...pubRow(liveRow(g)), followed: false, favorite_team: null }; /* frames are not per-user */ const v = `${LV.version}:${LV.phase}:${LV.stale}`; if (v !== sent) { sent = v; res.write(`data: ${JSON.stringify(r)}\n\n`); } else if (++n % 5 === 0) res.write(": keep-alive\n\n"); };
  tick();
  const iv = setInterval(tick, 400);
  res.on("close", () => { clearInterval(iv); LV.streams.delete(res); });
}

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
    warnings: isToday ? ["FIXTURE: injury report is 190 minutes old (maximum 60).", "FIXTURE: provider 'FIXTURE-lineups' is not configured; lineups are projected, not official."] : [],
    lineups_summary: isToday ? { confirmed: 1, projected: 4, unknown: 1 } : { confirmed: 2, projected: 0, unknown: 0 },
    props_summary: isToday
      ? { provider_configured: true, quoted_markets: propRows().filter((r) => r.origin).length, manual_entries: MANUAL.filter((m) => !m.withdrawn).length, players_projected: 4, message: "FIXTURE: quotes cover part of the slate; BOS @ NYK has no quoted player markets." }
      : { provider_configured: false, quoted_markets: 0, manual_entries: 0, players_projected: 0, message: "FIXTURE: no player prop quotes were stored for this date. Enter a market manually to research it." },
  };
}

function gameDetail(id) {
  const game = allGames().find((g) => g.id === id);
  if (!game) return null;
  const sels = [...SEL_BY_ID.values()].filter((s) => s.game_id === id);
  const form = (i) => ({ record: i ? "12-9" : "11-9", last_10: i ? "6-4" : "4-6", points_per_game: 112.4 + i, opp_points_per_game: 110.8 - i, off_rating: 113.4 + i, def_rating: i ? 110.9 : null, pace: 98.2 + i, last_10_points_per_game: 114.0 + i, last_10_opp_points_per_game: 111.2, games_in_sample: 20 + i });
  return {
    game,
    team_form: id === "FIX-G2" ? { home: {}, away: {} } : { home: form(1), away: form(0) },
    player_projections: sels.filter((s) => s.subject_type === "player" && s.projection != null).flatMap((s) => {
      const base = { player_id: s.subject_id, player_name: s.subject_name, team_abbr: s.team_abbr, proj_min: 33, n_games: s.sample_size ?? 0, injury_status: s.subject_id === 9001 ? null : s.subject_id === 9002 ? "Questionable" : null };
      const k = s.market.replace("player_", "");
      const mk = (stat, mean) => ({ ...base, stat, mean: +mean.toFixed(1), p10: +(mean * 0.62).toFixed(1), p50: +(mean * 0.98).toFixed(1), p90: +(mean * 1.41).toFixed(1) });
      return [mk(k, s.projection), ...(k === "pts" ? [mk("reb", 5.1), mk("ast", 7.2)] : [])];
    }),
    selections: sels, selection_counts: classCounts(sels),
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
  if (sels.length < 1) return null;
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
    player: playerRef(p),
    next_game: (() => { const g = GAMES_TODAY.find((x) => x.home.abbr === p.team_abbr || x.away.abbr === p.team_abbr); return g ? { game_id: g.id, label: g.label, date: g.date, tipoff_utc: g.tipoff_utc, opp_abbr: g.home.abbr === p.team_abbr ? g.away.abbr : g.home.abbr, is_home: g.home.abbr === p.team_abbr } : null; })(),
    lineup: p.games == null ? null : { role: p.id === 9002 ? "bench" : "starter", status: p.id === 9005 ? "confirmed" : "projected" },
    markets: propRows().filter((r) => r.player_id === p.id),
    sample: { games: (LOGS.get(p.id) ?? []).length },
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
  if (path === "/__mock/large") { if (method === "POST") LARGE = Boolean(body.on); return { large: LARGE }; }
  if (LARGE && date === TODAY) { const r = largeRoute(method, path, q); if (r !== undefined) return r; }
  if (method === "GET") {
    if (path === "/command-center") return commandCenter(date);
    if (path === "/games") return { date, games: GAMES[date] ?? [] };
    {
      const m = path.match(/^\/games\/([^/]+)\/(player-props|lineups|lineup-history)$/);
      if (m) {
        const g = allGames().find((x) => x.id === decodeURIComponent(m[1]));
        if (!g) return { __status: 404, ...err("not_found", "FIXTURE: game not found.") };
        if (m[2] === "player-props") return playerProps(q, g.id);
        if (m[2] === "lineups") return { game_id: g.id, ...gameLineups(g) };
        return { items: g.id === "FIX-G2" ? [] : [{ at: iso(60), team_abbr: g.away.abbr, status: "projected", change: "FIXTURE: projection created from the last confirmed five.", source: "FIXTURE projection" }, { at: iso(20), team_abbr: g.home.abbr, status: g.lineup.home.status, change: "FIXTURE: FIXTURE Player F removed after the injury report.", source: "FIXTURE injury feed" }] };
      }
      const pm = path.match(/^\/players\/(\d+)\/(averages|game-logs|threshold|splits|minutes)$/);
      if (pm) {
        const id = pm[1];
        if (!PLAYERS.some((p) => String(p.id) === id)) return { __status: 404, ...err("not_found", "FIXTURE: player not found.") };
        if (pm[2] === "minutes") { const pl = PLAYERS.find((p) => String(p.id) === id); return { profile: GAME_OF[pl.team_abbr] ? minutesRow(pl) : null, ...MIN_META }; }
        if (pm[2] === "averages") return averages(id);
        if (pm[2] === "threshold") return threshold(id, q);
        if (pm[2] === "splits") return splits(id);
        const rows = filterLogs(id, { venue: q.get("venue"), role: q.get("role"), opponent: q.get("opponent") });
        return { ...page(rows, q), missed: rows.length ? [{ date: shift(TODAY, -8), opp_abbr: "MIA", reason: "FIXTURE: injury (ankle)" }, { date: shift(TODAY, -22), opp_abbr: "CHI", reason: "FIXTURE: rest" }] : [], source: "FIXTURE box scores" };
      }
    }
    if (path === "/kalshi/markets") return kalshiMarkets(q);
    if (path.startsWith("/kalshi/markets/")) return kalshiDetail(decodeURIComponent(path.slice(16))) ?? { __status: 404, ...err("not_found", "FIXTURE: Kalshi market not found.") };
    if (path === "/minutes") return minutesList(q);
    if (path === "/injuries/changes") {
      const items = date === TODAY ? INJURY_CHANGES.filter((c) => q.get("material") !== "true" || c.material) : [];
      return { date, items, notes: ["FIXTURE note: a change is material when it moves a player across the available / unavailable boundary or changes a projected starter.", "FIXTURE note: records to reassess are research records that referenced the player or game before the change."] };
    }
    if (path === "/player-props") return playerProps(q);
    if (path === "/player-props/manual") return { items: date === TODAY ? MANUAL : [] };
    if (path === "/lineups") return { date, games: (GAMES[date] ?? []).map((g) => ({ game: { id: g.id, label: g.label, tipoff_utc: g.tipoff_utc, status: g.status, home: g.home, away: g.away }, ...gameLineups(g) })) };
    if (path === "/data-health/providers") return { items: PROVIDERS };
    if (path === "/performance/strategies") return STRATEGIES;
    if (path.startsWith("/games/")) return gameDetail(decodeURIComponent(path.slice(7))) ?? { __status: 404, ...err("not_found", "FIXTURE: game not found.") };
    if (path === "/selections") {
      const eds = EDITIONS[date] ?? [];
      return { edition: eds[eds.length - 1] ?? null, ...selectionsPage(SELECTIONS[date] ?? [], q) };
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
          counts: { ...editionCounts(sels.length), not_qualified_total: sels.filter((x) => !isQual(x) && x.classification !== "watchlist").length },
        },
        changes: id === 1 || id === 90 ? [] : [{ type: "line_move", text: "FIXTURE: FIXTURE ORL +2.5 moved." }],
        content_sha256: `${String(id).padStart(4, "f")}a9c1e77b05d2f64833ce1b0d9a4e6f7c81b2d3e4f5a6b7c8d9e0f1a2b3c4`.slice(0, 64),
        selections: sels.filter((x) => isQual(x) || x.classification === "watchlist"), selection_counts: classCounts(sels), combos,
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
    if (path === "/player-props/manual") return createManual(body);
    {
      const m = path.match(/^\/player-props\/manual\/(\d+)\/withdraw$/);
      if (m) {
        const e = MANUAL.find((x) => x.id === Number(m[1]));
        if (!e) return { __status: 404, ...err("not_found", "FIXTURE: manual entry not found.") };
        e.withdrawn = true;
        return { ok: true };
      }
    }
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
      const who = body.password === PASSWORD ? (body.email === USER.email ? USER : body.email === VIEWER.email ? VIEWER : null) : null;
      if (who) return send(res, 200, { user: who, csrf: CSRF }, { "Set-Cookie": `gizer_session=${who.role === "owner" ? "fixture-session" : "fixture-viewer"}; HttpOnly; Path=/; SameSite=Lax` });
      return send(res, 401, err("unauthenticated", "FIXTURE: invalid credentials."));
    }
    const cookie = req.headers.cookie ?? "";
    const role = /(?:^|;\s*)gizer_session=fixture-session(?:;|$)/.test(cookie) ? "owner" : /(?:^|;\s*)gizer_session=fixture-viewer(?:;|$)/.test(cookie) ? "viewer" : null;
    if (!role) return send(res, 401, err("unauthenticated", "FIXTURE: session cookie missing."));
    if (method !== "GET" && method !== "POST") return send(res, 405, err("method_not_allowed", "FIXTURE: the API only allows GET and POST."));
    if (method === "POST" && req.headers["x-csrf-token"] !== CSRF) return send(res, 403, err("csrf", "FIXTURE: missing or invalid X-CSRF-Token."));
    if (path === "/auth/me") return send(res, 200, { user: role === "owner" ? USER : VIEWER, csrf: CSRF });
    if (path === "/auth/logout") return send(res, 200, { ok: true }, { "Set-Cookie": "gizer_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax" });

    const sm = method === "POST" ? path.match(/^\/jarvis\/conversations\/(\d+)\/messages$/) : null;
    if (sm) {
      if (role !== "owner") return send(res, 403, err("forbidden", "FIXTURE: this area is available to the owner account only."));
      const conv = CONVS.find((c) => String(c.id) === sm[1]);
      if (!conv) return send(res, 404, err("not_found", "FIXTURE: conversation not found."));
      const imgs = Array.isArray(body.images) ? body.images : [];
      if (imgs.length > 3) return send(res, 422, err("invalid", "FIXTURE: at most 3 images can be attached to one message."));
      if (imgs.some((im) => String(im.data ?? "").length > 2_100_000)) return send(res, 422, err("invalid", "FIXTURE: an attached image is larger than the 1.5 MB limit."));
      if (String(body.text ?? "").includes("trigger-422")) return send(res, 422, err("invalid", "FIXTURE: the message body exceeds the allowed size."));
      if (!String(body.text ?? "").trim() && imgs.length === 0) return send(res, 422, err("invalid", "FIXTURE: text is required when no image is attached."));
      return jarvisStream(res, conv, body);
    }
    const st = method === "GET" ? path.match(/^\/live\/games\/([^/]+)\/stream$/) : null;
    if (st) { const g = liveGame(decodeURIComponent(st[1])); if (!g) return send(res, 404, err("not_found", "FIXTURE: game not found.")); return liveStream(res, g); }
    if (path.startsWith("/live/") || path === "/__mock/live") { const lr = liveRoute(method, path, url.searchParams, body, role); if (lr !== undefined) { const code = lr.__status ?? 200; delete lr.__status; return send(res, code, lr); } }
    const im = method === "GET" ? path.match(/^\/jarvis\/messages\/(\d+)\/images\/(\d+)$/) : null;
    if (im) {
      const img = role === "owner" ? IMAGE_STORE.get(im[1])?.[Number(im[2])] : null;
      if (!img) return send(res, 404, err("not_found", "FIXTURE: image not found."));
      res.writeHead(200, { "Content-Type": img.type, "Cache-Control": "private, max-age=3600", "Content-Length": img.bytes.length });
      return res.end(img.bytes);
    }
    if (path.startsWith("/jarvis/") || path.startsWith("/admin/ai-budget") || path === "/__mock/jarvis") {
      const jr = jarvisRoute(method, path, url.searchParams, body, role);
      if (jr !== undefined) { const st = jr.__status ?? 200; delete jr.__status; return send(res, st, jr); }
    }

    const out = route(method, path, url.searchParams, body);
    const status = out.__status ?? 200;
    delete out.__status;
    send(res, status, out);
  });
});

server.listen(PORT, () => {
  console.log(`[mock-api] FIXTURE API listening on http://localhost:${PORT}/api/v1 (today=${TODAY})`);
});
