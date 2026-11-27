# GIZER NBA — handoff (2026-11-27, about 16:40 UTC / 11:40 AM ET)

For any session picking up work, including a Claude Code session on the owner's Mac. Read `CLAUDE.md` first;
its rules are not repeated here. Status words are used as defined there.

## Where things are

| Item | Status |
|---|---|
| Production (`production` branch, Server M, https://nba.gizergroup.com) | `91cee9e` = 0.7.3, DEPLOYED by the updater (all GitHub checks green). Includes risk policy 1.2 and player model 1.1.0 |
| Player props back in top picks (0.7.3, D-040) | IMPLEMENTED, TESTED on development data (161 backend tests pass; on the 2026-11-25 snapshot, props in top picks went from 0 to 10). **Not active on production until the owner runs the evaluation job below.** Forward accuracy NOT VERIFIED |
| Project Aesthetic "Courtside" redesign, 0.8.0 | Owner APPROVED (sidebar kept exactly as before; team logos and player photos kept and added to picks). Merged to `main`; smoke 3697/0, backend 164/0 |
| GIZER LIVE | DEPLOYED. First real live-game check: tonight's games (2026-11-27). NOT VERIFIED on a real game yet |
| JARVIS, CORTEX | DEPLOYED and answering (budget: USD 100 lifetime, D-024) |

## Owner actions waiting

1. **Switch the server to player model 1.1.0** (about 10 minutes, before tonight's reboot). From a Mac Terminal:
   ```bash
   ssh <your usual server login>
   ```
   ```bash
   cd /opt/gizer-nba && docker compose exec worker gizer run-job weekly_evaluation
   ```
   The next edition (12 PM, 3 PM ET or pregame) then includes qualifying player props. If skipped, the weekly
   evaluation job does it on its schedule.
2. **Server reboot (Server M first, then L)**: only after tonight's games end (after about 1:30 AM ET), after item 1
   has finished. GIZER containers must restart on their own; then check:
   ```bash
   cd /opt/gizer-nba && docker compose ps
   ```
   ```bash
   scripts/smoke.sh https://nba.gizergroup.com
   ```
   ```bash
   systemctl list-timers | grep gizer
   ```
   A reboot of Server M has never been tested; someone should watch it.
3. Done: redesign approved.
4. Still open from earlier: change the site password (`bash scripts/reset-owner.sh` on the server), delete the old
   Anthropic API key in the Console, make the repository private (owner decided): follow `RUNBOOK.md` → "Private repository" BEFORE
   flipping it, or the server stops receiving updates.

## Branches

| Branch | Meaning |
|---|---|
| `main` | All finished work. Currently equal to `production` |
| `production` | What Server M runs. Promote only verified commits with green checks: `git push origin <sha>:production`. Never force-push |
| `feature/project-aesthetic` | Redesign. Do not merge until the owner approves the sidebar screenshots |
| `fix/prop-calibration` | Already merged into `main`; can be deleted |

## What changed today (details in `CHANGELOG.md`, `docs/DECISIONS.md`)

* **0.7.3 / D-040:** top picks had become team bets only. The points-type player models were overconfident
  and failed validation, and prop calibration only covered lines near the player's average, so almost no prop could
  reach 65%. The variance now includes minutes volatility, and calibration uses seven lines on both sides. The gate
  and risk policy 1.2 (65% floor) are unchanged. Watch for one thing: on the test slate 7 of 10 prop picks were
  three-pointer props on Kalshi.
* **Redesign:** light "Courtside" look, Archivo font (self-hosted), Radix Dialog for overlays (decisions D-038, D-039
  on the design branch). Every one of the 36 pages keeps its address.

## Known open work

* Kalshi markets page is slow on the server: backend query slimming (`docs/design/aesthetic/05-KALSHI-PAGE-DIAGNOSIS.md`).
* Redesign weaknesses listed in `docs/design/aesthetic/07-APP-INTEGRATION.md` (design branch).
* CORTEX benchmark: only 64 of 204 questions map to records; keys unreviewed.

## Working on the Mac

```bash
git clone https://github.com/llamanftstaking-glitch/nba.git
```
```bash
cd nba && git checkout main && git pull
```
Backend setup and tests need a local Postgres (see `README.md`); frontend: `cd apps/web && npm ci && npm run build`.
Never put `.env`, the API key or passwords in the repository or in chat.

## Note on CI (2026-11-27)
The secret scan on `d002c8e` reported one finding in `prototypes/aesthetic/src/data/dataset.json`: the string
`20261125-v1-afternoon`, an edition key (a public identifier), matched the generic "api key" pattern. Reviewed: not
a credential. The scanner configuration was not changed. With the owner's go-ahead, production was promoted from the
next commit, whose own checks passed; `d002c8e` itself was never promoted.
