# Roadmap

Status words: VERIFIED · IMPLEMENTED · TESTED · DEPLOYED · IN PROGRESS · BLOCKED · NOT VERIFIED.
Current state and blockers live in PROJECT-STATE.md; this file is the plan.

## Next (unblocks the most)
1. **Deploy to Server M** — BLOCKED on server access. Follow DEPLOYMENT.md; complete its verification checklist.
2. **Server M inventory** (OS, CPU/RAM/GPU, Docker services, proxy, ports) — BLOCKED on access; template in `docs/operations/SERVER-M-INVENTORY.md`.
3. **Re-test data sources from Server M**: official NBA injury report PDF, stats.nba.com via `nba_api`.
4. **Owner decision: prop odds provider** (The Odds API key or a licensed alternative) — enables Player Props research.
5. **Run CI on GitHub** and act on `pip-audit` / `npm audit` / gitleaks results.

## Research
* Historical odds acquisition (licensed) → market-anchored blend: the model earns weight against the no-vig
  price only if it improves out-of-sample Brier; closing-line-value tracking; de-vig method comparison.
* Minutes model reacting to teammate absences (injury-driven role changes); opponent adjustment for player stats.
* More markets: steals, blocks, turnovers, combined stats; playoffs data.
* Team model: rest/travel features only if they pass a feature-admission gate (positive lift in every fold).
* Correlation: player-pair-specific estimates with shrinkage; blowout/overtime scenario conditioning.
* Hierarchical / Bayesian player models as challengers.

## Platform
* Second factor (TOTP) or proxy-level access control; off-host encrypted backups.
* Play-by-play, lineup combinations, starting lineup snapshots (needs an authorized provider).
* Optional LLM narrator (rephrasing only, spend-capped) — owner approval required.
* Load test; alerting (email/push) on dead-letter jobs and stale heartbeats.

## Milestone 9 — forward validation (starts at deployment)
Operate in paper-testing mode. Review weekly. Do not claim an advantage before the forward sample supports it;
the high-confidence tier unlocks only through the gate in RISK-POLICY.md.
