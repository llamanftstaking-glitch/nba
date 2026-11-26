# Risk Policy — `gizer-risk-1.2`

The policy is the constant `RISK_POLICY` in `apps/api/gizer/research.py`, applied by `guard()` (Agent 16,
"GIZER GUARD"). It is version-controlled; there is no runtime switch, API or prompt that changes it.
`tests/test_governance.py` fails if this document and the code disagree on the version.

## Classifications

| Classification | Meaning |
|---|---|
| high_confidence | Strongest tier. May be empty; currently always empty (see gate below). |
| standard | Qualified research candidate. Eligible for ranked picks, combinations and paper testing. |
| watchlist | Point estimate above break-even but the uncertainty interval is not. Not qualified. |
| insufficient_evidence | Sample or calibration support too thin to state uncertainty. |
| rejected | Failed a hard rule or shows no positive difference versus the quoted price. |
| invalidated | Was qualified in an earlier edition; a later edition recorded a material change. The original is kept. |

## Hard rejection rules (any one rejects)

* No production model that passed the walk-forward gate for the market family.
* No verified market quote with a price, or the quote was not re-verified within 12 hours.
* No injury snapshot within 8 hours; box-score history more than 3 days behind completed games.
* The player is listed out / suspended / injured reserve.
* |model probability − break-even| > 10 percentage points — treated as model or data error, not opportunity.

* A record whose **only** failures are freshness failures is classified `stale` rather than `rejected`.

## Qualifying price band (added in 1.1)

A selection whose break-even probability is below 15% or above 85% cannot rise above `watchlist`. Model tail
estimates are the least reliable part of a predictive distribution, and Kalshi lists many long-shot and
near-certain thresholds; this rule only ever removes qualified selections.

## Evidence quality score (0–100) — **not a probability**

| Component | Max | Rule |
|---|---|---|
| Model validation | 25 | production model that passed the gate |
| Data freshness | 20 | box scores current (10) + injury snapshot fresh (10) |
| Sample size | 20 | linear to 30 prior games |
| Calibration support | 15 | ≥200 out-of-sample observations in the probability bin (15), ≥30 (8) |
| Market quote | 10 | verified within 3h (10), within 12h (5) |
| Availability | 10 | reduced when a rotation player (≥24 projected minutes) is unavailable or uncertain |

## Tier thresholds

* **standard**: evidence ≥ 65 and the *lower* bound of the probability interval is above break-even.
* **watchlist**: evidence ≥ 50 and the point estimate is above break-even.
* **high_confidence**: evidence ≥ 85, lower bound ≥ break-even + 2 points, no availability concern, **and**
  forward paper evidence for the same market group and model version: ≥ 200 settled paper singles whose observed
  hit rate is within 4 points of the mean predicted probability. Backtests alone never unlock this tier.

Probability intervals are the Wilson interval of the observed out-of-sample frequency in the calibration bin
containing the model probability, re-centred by that bin's calibration error.

## Ranking (top five per game)

Qualified selections only, ordered by tier, then lower-bound margin over break-even, then evidence score.
One slot per underlying view (spread and moneyline share a slot). Fewer than five is normal; zero is normal.

## Combinations

Built only from ranked qualified selections (pool of at most 10). Conflicting or near-duplicate legs are
excluded. Joint probability comes from the correlation engine (see MODEL-CARDS.md). Six-leg combinations are
always experimental (never above watchlist). A combination is `paper_testing` only when it is cross-game with an
observed price on every leg (the reference price is the arithmetic product of leg prices and is labelled as
not a sportsbook quote); same-game combinations have no verified combined quote and are `research_only`
(hit rate is tracked, simulated return is not).

## Quote origin

Provider-sourced quotes are evaluated normally. Owner-entered prices are evaluated but can never reach
high-confidence, score at most 5/10 on the market-quote component, carry an explicit "not independently verified"
note, and are never auto-ticketed. Hypothetical thresholds are always rejected as selections (they exist for
descriptive history only). See `docs/data/PLAYER-PROPS.md`.

## Paper testing

Fixed virtual units (default 1). No stake scaling by confidence or by previous results, no martingale, no
loss chasing. Tickets cannot be created after tipoff. Auto-recorded: every newly qualified selection and the
top 3 qualified combinations per engine and structure. Settlement rules `gizer-v1`: postponed game or
player did-not-play → void; exact line → push; a pushed/void leg drops out of a combination.

## Prohibited

Real-money wagering, sportsbook credentials, account funding, automated bet submission — none of these exist
in the codebase, and adding any of them requires explicit owner approval and a constitution change.

## 1.2 — top picks by probability (owner decision D-037, 2026-11-26)
* The ranked "top picks" list contains only qualified selections whose **model probability is at least 65%**
  (`top_picks.min_prob`), at most five per game, one side per market. Combinations and automatic paper tickets are
  built only from that list.
* Order is most likely first: the lower end of the model's probability interval, then the margin over the price,
  then evidence. Before 1.2 the order was margin over the price alone, which put long shots at the top.
* Every other gate is unchanged and still applies: evidence score, a positive margin at the lower end of the interval,
  the maximum plausible edge of 10 points, the 15% to 85% break-even band, freshness, and candidate models staying research-only.
* Consequence of the unchanged gates: a 65%+ selection qualifies only when the market prices it at roughly 55% to 85%
  (favourite-priced contracts). The list is shorter, and a slate can have none.
* A model probability of 65% is the model's estimate, not an observed hit rate. The models are not yet validated
  against market prices; the forward paper record is what will show whether 65% means 65%.

