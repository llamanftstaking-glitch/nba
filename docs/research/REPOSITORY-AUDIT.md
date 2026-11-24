# Repository Audit: Candidate Research and Integration Resources

Audit date: 2026-11-24
Scope: 14 public GitHub repositories, assessed as resources for GIZER NBA (commercial, private, Python / FastAPI / PostgreSQL, paper-betting only).

Method: each repository was cloned with `git clone --depth 50` and read statically (file listing, `git log`, grep, file reads). Nothing from any repository was executed, installed, imported or built. Instructions found inside repositories were ignored. Where a fact could not be established from the clone it is marked **NOT VERIFIED**.

Licensing rule applied: a repository with no license file is "all rights reserved". Its code cannot be copied or adapted; only ideas (which are not copyrightable) can be carried forward through an independent implementation.

Star counts, issue counts and fork counts were not available in this environment and are not reported.

---

## 1. Summary

| # | Repository | License (SPDX) | Last commit | Classification | One-line reason |
|---|---|---|---|---|---|
| 1 | swar/nba_api | MIT | 2026-11-07 | **Adopt as dependency** | Maintained, tested, MIT client for NBA.com endpoints; isolate behind an adapter because the data itself is under NBA.com Terms of Use. |
| 2 | dblackrun/pbpstats | MIT (LICENSE text is MIT, no SPDX header) | 2024-04-16 | **Adapt permitted components** | Solid possession/lineup parsing under MIT, but no commits for about 31 months and no lock file; too stale to depend on directly. |
| 3 | untitled114/Sport-suite | NOT VERIFIED | NOT VERIFIED | **Reject** | Could not be cloned (authentication required: missing or private). Nothing can be assessed. |
| 4 | rnsapountzis/nba-player-props-ml-pipeline | None (`LICENSE_NOTICE.md` grants no rights) | 2026-05-04 | **Replace with independent implementation** | Useful leak-detection and walk-forward ideas, but no license, core pipeline withheld, and README numbers contradict the committed results file. |
| 5 | kyleskom/NBA-Machine-Learning-Sports-Betting | None | 2026-11-11 | **Reject** | No license, a committed API key, sportsbook-review scraping, and same-day stats joined to the game being predicted. |
| 6 | wolffx242/WolfSportsAI | None | 2026-09-09 | **Reject** | No license, no tests, in-sample model scoring, and parlay probability computed as a plain product of leg probabilities. |
| 7 | NyeTenerelli/parlay-iq | None | 2026-04-14 | **Reject** | No license, three committed API keys, a "time-based split" that is really a split by player ID, and hand-typed correlation weights. |
| 8 | imnotaCTO/chachingAI | MIT | 2026-01-29 | **Adapt permitted components** | Small, clean, MIT Gaussian-copula same-game-parlay maths with tests; distribution choice and sample sizes need our own validation. |
| 9 | Wynne2/True_Prob_AI | None | 2026-11-22 | **Study as architectural reference** | The most rigorous design of the set (point-in-time rebuild, market-anchored blend, CLV ledger, honest negative results), but unlicensed. |
| 10 | LucasB19/NBA-Injury-Report | MIT | 2026-07-21 | **Adapt permitted components** | MIT parser and validator for the official NBA injury-report PDF; the committed headshots and logos must not be taken. |
| 11 | cpsanzone/nba-player-projection-backtester | None | 2025-12-27 | **Reject** | Single notebook on synthetic random data, in-sample grid search, independence assumed, and unsupported ROI claims. |
| 12 | ericdubrow7/NBA_ODDS_SHOP | None | 2026-11-07 | **Replace with independent implementation** | Good consensus-edge and line-shopping method with an honest out-of-sample result, but unlicensed and built on ESPN's unofficial API. |
| 13 | proplineapi/propline-mcp | MIT | 2026-11-22 | **Study as architectural reference** | TypeScript MCP wrapper for a commercial odds vendor; useful tool-surface design, wrong stack, vendor data provenance unknown. |
| 14 | the-odds-api/samples-python | None | 2025-06-16 | **Replace with independent implementation** | Six trivial sample scripts with no license; write our own client from the vendor's public API documentation. |

---

## 2. Findings per repository

### 2.1 swar/nba_api

- **Existence:** cloned successfully.
- **License:** `LICENSE` is MIT (Copyright 2018 Swar Patel). `pyproject.toml` declares `license = "MIT"`.
- **Activity:** last commit 2026-11-07. All 50 fetched commits fall between 2026-10-22 and 2026-11-07 (48 in October, 2 in November), 44 by the maintainer and 6 by Dependabot. Older cadence NOT VERIFIED (shallow clone).
- **Size and structure:** 35 MB working tree; 314 `.py`, 290 `.md`, 152 `.yaml`. Source in `src/nba_api/{stats,live,library}`; version 1.12.0; `requires-python >=3.10`.
- **Tests and CI:** yes. 265 tracked files under `tests/` (`tests/unit`, `tests/integration/{canary,smoke,snapshots}`). Workflows: `.github/workflows/ci.yml`, `canary.yml`, `canary-report.yml`, `release.yml`, `pr-title.yml`.
- **Data sources and rights:** NBA.com (`stats.nba.com` and the live CDN endpoints). The client sends a browser `User-Agent` and `Referer: https://www.nba.com/` (`src/nba_api/stats/library/http.py`) and supports user-supplied proxies (`src/nba_api/library/proxy`, `src/nba_api/library/http.py`). The README states: "Data retrieved with this package comes from NBA.com and is subject to the NBA.com Terms of Use" and that the project is not affiliated with the NBA. **The MIT license covers the code only, not the data.** Commercial use of NBA.com data is a legal question for GIZER, not something this library resolves.
- **Modelling / leakage / parlays:** not applicable (data client only).
- **Performance claims:** none.
- **Secrets:** none found by pattern scan.
- **Dependencies:** runtime deps are ranges (`requests >=2.32.3,<3.0.0`, `pandas >=2.2.2` and up by Python version); `uv.lock` is committed for development.
- **Integration:** direct fit for a Python service. It is synchronous (`requests`), so calls must run in a worker or thread pool, not in the FastAPI event loop. NBA.com does not announce endpoint changes (README), so breakage is expected periodically.

**Classification: Adopt as dependency.** It is the only repository in the set that combines a permissive license, an active maintainer, a real test suite and canary monitoring. Adopt it pinned to an exact version, behind our own provider interface so it can be swapped for a licensed feed, with conservative rate limiting, no proxy rotation, and raw responses stored with fetch timestamps. The data-rights question (NBA.com Terms of Use for a commercial product) must be answered separately before any production use.

### 2.2 dblackrun/pbpstats

- **Existence:** cloned successfully.
- **License:** `LICENSE` contains the MIT text (Copyright 2019 Darryl Blackport) without the "MIT License" heading; `pyproject.toml` says `license = "MIT License"`.
- **Activity:** last commit 2024-04-16 ("update version"). Fetched history: 51 commits in 2020, 47 in 2021, 43 in 2022, 14 in 2023, 3 in 2024. Effectively dormant for about 31 months.
- **Size and structure:** 5.4 MB; 209 `.py`. Package `pbpstats/` with `client.py`, `data_loader/{stats_nba,data_nba,live}`, `resources/`, `objects/`, `overrides.py`. Version 1.3.11.
- **Tests and CI:** yes. `tests/` (data loaders, objects, resources, client) and `.github/workflows/ci.yaml` running tox on Python 3.8 to 3.11. The CI uses `actions/checkout@v1` and `setup-python@v2`, which are long out of date. Python 3.12+ support NOT VERIFIED.
- **Data sources and rights:** scrapes `stats.nba.com` and `data.nba.com` with browser-like headers (`pbpstats/__init__.py`, `pbpstats/data_loader/stats_nba/league_game_log/web.py`). Same NBA.com Terms of Use concern as nba_api. Whether the `data.nba.com` endpoints still respond is NOT VERIFIED.
- **Modelling / leakage / parlays:** not applicable.
- **Performance claims:** none ("All stats on pbpstats.com are derived from these stats" is a provenance statement).
- **Secrets:** none found.
- **Dependencies:** `requests = "^2.27.1"` only; no `poetry.lock` committed.
- **Integration:** pure Python, small dependency surface. The value is the possession and lineup-on-floor reconstruction and the event-ordering fixes, which are hard to reproduce.

**Classification: Adapt permitted components.** MIT permits reuse with attribution, and the possession parser is valuable for pace, lineup and on/off features. A direct runtime dependency on a package untouched since April 2024, with no lock file and CI pinned to Python 3.8 to 3.11, is a maintenance risk. Vendor or port the specific parsing logic we need, keep the MIT notice, and feed it from our own stored play-by-play rather than its built-in web loaders.

### 2.3 untitled114/Sport-suite

- **Existence:** **NOT VERIFIED.** Both `git clone` attempts and `git ls-remote` failed with:
  `fatal: could not read Username for 'https://github.com': terminal prompts disabled`
  GitHub asks for credentials when a repository is private, deleted, renamed or never existed; the error does not distinguish between these.
- Every other attribute (license, activity, contents, data sources, modelling, secrets): **NOT VERIFIED.** No description of its contents is given here.

**Classification: Reject.** Nothing can be assessed, so nothing can be used. If the owner later provides access or the correct name, it should be audited from scratch.

### 2.4 rnsapountzis/nba-player-props-ml-pipeline

- **Existence:** cloned successfully.
- **License:** none. `LICENSE_NOTICE.md` says the repo "is shared as a portfolio/technical showcase" and that the production pipeline, datasets and models "are not included". It grants no rights. All rights reserved.
- **Activity:** 7 commits, 2026-05-02 to 2026-05-04. Complete history (not shallow). No activity since.
- **Size and structure:** 128 KB; 4 Python files (1,502 lines): `validation/walk_forward.py`, `validation/leak_detection.py`, `validation/synthetic_vs_real_lines_sanity.py`, `features/prior_season_builder.py`, plus `docs/pipeline_architecture.md` and two results files. The training and feature code is withheld (README "Code Scope").
- **Tests and CI:** none.
- **Data sources and rights:** README names `nba_api` ("official stats endpoint scraping") and The Odds API. No data is committed. `results/synthetic_vs_real_summary.csv` is not a CSV: its bytes are a ZIP/XLSX container (`PK`, `docProps/app.xml`).
- **Methodology:** date-based expanding-window folds (`build_wf_folds` in `validation/walk_forward.py`), LightGBM / XGBoost / RandomForest / LogisticRegression averaged with equal weights. Imputer and scaler are fitted on the training fold only (`_train_wf_sklearn`).
- **Leakage evidence:**
  - In `train_wf_lgb` and `_train_wf_xgb` the **test fold is passed as the early-stopping validation set** (`valid_sets=[dval]` built from `X_test`), and AUC is then reported on that same fold. The number of boosting rounds is therefore tuned on the test data, which biases reported AUC upward.
  - Fold boundaries share a date: training uses `date < edge` and testing `date >= edge`, which is correct; no embargo gap is applied.
  - The leak detector itself (`canonical_gap_test`, `cross_temporal_peak_test`, `temporal_constancy_test`, `pre_ablation_gate` in `validation/leak_detection.py`) is a heuristic based on correlation thresholds (for example gap `< -0.03` means "LEAK"); it is a screening aid, not proof of cleanliness.
- **Unsupported claims:** README: "Validation AUC (form-streak model) PTS: 0.74 · REB: 0.73 · AST: 0.75", "OVER_LINE ... PTS 0.697", fold AUCs "0.80–0.86". The only committed evidence, `results/sample_wf_results.csv`, shows ensemble AUCs between 0.575 and 0.671 on training sets of 3,021 to 12,412 rows, against a claimed "~112K player-game rows". The README's "Model A" and "Model B" fold tables are identical digit for digit. The "IS_HOT" target is described as a streak label and may be partly determined by recent results already in the features; this is NOT VERIFIED because the target construction is withheld. The synthetic-line agreement table (correlation 0.985+) cannot be reproduced from the repo.
- **Secrets:** none found.
- **Dependencies:** `requirements.txt` lists five unpinned packages.
- **Parlays:** not addressed.
- **Integration:** nothing can be integrated; the files are illustrative excerpts.

**Classification: Replace with independent implementation.** The concepts are worth having: a pre-registration gate for new features, a lag-versus-current correlation screen, a temporal-constancy check that separates prior-season aggregates from leaks, and a "positive in every fold" shipping rule. The code has no license and the headline numbers are not supported by the committed results, so we implement the ideas ourselves, fix the early-stopping-on-test flaw (use an inner validation slice cut from the end of the training window), and treat the README metrics as unverified.

### 2.5 kyleskom/NBA-Machine-Learning-Sports-Betting

- **Existence:** cloned successfully.
- **License:** none. No LICENSE file and no license statement in `README.md`. All rights reserved.
- **Activity:** last commit 2026-11-11. Fetched history (51 commits, shallow): 40 in 2023, 6 in 2024, 2 in 2025, 3 in 2026. Sporadic maintenance.
- **Size and structure:** 133 MB, of which `Data/` is 129 MB (three committed SQLite databases: `Data/OddsData.sqlite`, `Data/TeamData.sqlite`, `Data/dataset.sqlite`) and `Models/` 3.5 MB (committed `.keras`, XGBoost `.json` and `.pkl` calibration files). 29 `.py` files under `src/`, `Flask/`, `Tests/`, `scripts/`.
- **Tests and CI:** five test files in `Tests/` (`test_create_games.py`, `test_expected_value.py`, `test_get_data.py`, `test_get_odds_data.py`, `test_kelly_criterion.py`). No CI configuration.
- **Data sources and rights:**
  - `stats.nba.com/stats/leaguedashteamstats` called directly with browser-spoofing headers (`config.toml` `data_url`, `src/Utils/tools.py`).
  - Sportsbook odds scraped from Sportsbook Review via the `sbrscrape` package (`src/DataProviders/SbrOddsProvider.py`, `src/Process-Data/Get_Odds_Data.py`), covering FanDuel, DraftKings, BetMGM and others. This is third-party scraping of sportsbook prices with no license.
  - Years of scraped odds and stats are redistributed in the committed SQLite files. Copying those databases would carry the same rights problem.
  - `Flask/app.py` calls a RapidAPI-hosted service.
  - The `.pkl` calibration files are pickles: loading them executes arbitrary code. They must never be loaded.
- **Methodology:** XGBoost and Keras models for moneyline and totals on team season-to-date averages. XGBoost scripts use chronological holdout (last 10%), `TimeSeriesSplit` walk-forward for random-search tuning, and a separate chronological calibration slice (`src/Train-Models/XGBoost_Model_ML.py`). The split design itself is sound.
- **Leakage evidence:**
  - **Same-day stats.** `src/Process-Data/Get_Data.py` stores, for each date D, a table of team season averages requested with `DateTo=D` (URL template in `config.toml`). `src/Process-Data/Create_Games.py` joins each game to the table for its own game date (`fetch_team_table(teams_con, date_str)` with `date_str = normalize_date(row.Date)`). Whenever that table was fetched after the games of day D finished (always true for backfills, and the routine fetch runs through "today"), the features include the result of the game being predicted. No one-day lag is applied anywhere in `Create_Games.py`.
  - **Line as feature.** The totals model keeps the `OU` line as a feature (`DROP_COLUMNS` in `src/Train-Models/XGBoost_Model_UO.py` does not drop `OU`). Whether the stored line is opening or closing is NOT VERIFIED; if closing, backtest results do not reflect a price that could have been bet.
  - Early stopping uses the validation fold inside CV (`train_model(..., early_stopping_rounds=60)`), which is acceptable for tuning but means CV loss is slightly optimistic.
- **Unsupported claims:** the README makes no numeric claim. Model filenames embed accuracy (`XGBoost_68.9%_ML_...`, `Trained-Model-ML-64.6_...`, `XGBoost_50.1%_UO_...`). A 68.9% moneyline accuracy is implausibly high for NBA pre-game prediction and is consistent with the same-day leak above. The totals figures (50.1%, 49.2%) are coin-flip.
- **Secrets:** **a RapidAPI key is committed in plain text at `Flask/app.py:78` and `Flask/app.py:155`** (value not reproduced here).
- **Dependencies:** `requirements.txt` is fully pinned, but to 2023 versions (`tensorflow==2.14.0`, `xgboost==2.0.0`, `pandas==2.1.1`, `scikit-learn==1.3.1`, `flask==3.0.0`, `sbrscrape==0.0.12`). No vulnerability scan was run.
- **Parlays:** none. `src/Utils/Kelly_Criterion.py` sizes single bets with full Kelly (percentage output), no fractional scaling or cap.
- **Integration:** SQLite with one table per date, hard-coded paths, script-style modules. Not compatible with our stack without a rewrite.

**Classification: Reject.** Without a license none of the code, data or model files can be used. Independently of licensing, the feature join leaks same-day results, the odds come from scraping a third-party odds site, a live credential is committed, and the model artefacts include pickles. The only transferable observation is structural (separate chronological train, calibration and test slices), which is standard practice and needs no reference to this repository.

### 2.6 wolffx242/WolfSportsAI

- **Existence:** cloned successfully.
- **License:** none. All rights reserved.
- **Activity:** 17 commits, 2026-08-30 to 2026-09-09 (complete history). No activity since. The root holds 23 `BUILD_INFO_V*.json` files and 21 version-note `.txt` files, indicating zip-drop releases rather than incremental development.
- **Size and structure:** 1.2 MB; 11 Python files, 3,362 lines, of which `app.py` (Streamlit) is 1,803. Others: `analytics.py`, `parlay.py`, `team_models.py`, `historical_bootstrap.py`, `odds_api.py`, `stats_sources.py`, `autopilot.py`, `database.py`. A SQLite file `data/wolfsports.db` is committed (no API-key strings found in it by `strings`).
- **Tests and CI:** none.
- **Data sources and rights:** The Odds API with a user-supplied key (`odds_api.py`), `nba_api` player logs (`stats_sources.py`), `nflreadpy`. No scraping of sportsbooks, no proxies. The app stores the user's key via Streamlit secrets or a local settings file (`app.py:48-54`, `app.py:1750-1764`).
- **Methodology:**
  - Team markets: logistic regression on one-hot home/away team, line and market probability (`team_models.py`).
  - "Historical bootstrap": gradient-boosted models on rolling last-5 / last-10 form with a chronological 80/20 split (`historical_bootstrap.py:177-190`).
  - Props: normal approximation on recency-weighted game logs (decay 0.90), mixed 60/40 with raw hit rate, then blended with no-vig market consensus with weight capped at 0.65 (`analytics.py` `perf_prob`, `blend`).
- **Leakage / evaluation flaws:**
  - `team_models.py:61` fits the model and computes Brier score on the same rows (`model.fit(X,y); p=model.predict_proba(X)`). The stored "brier" is in-sample.
  - `market_prob` is a feature of the team model, so the model is a recalibration of the market, not an independent estimate.
  - The README itself notes that its historical hit-rate view is a "today's-line simulation, not historical ATS".
- **Unsupported claims:** no numeric performance claims. The README includes the disclaimer "No pick or parlay is guaranteed." Letter grades ("A+", "A", "B") in `analytics.py` `conf` are fixed thresholds with no calibration evidence.
- **Secrets:** none found in source.
- **Dependencies:** lower-bounded ranges, some upper-bounded (`pandas>=2.1,<3`); several open-ended (`nba_api>=1.4`, `requests>=2.31`, `polars>=0.20`). No lock file.
- **Parlays:** **independence assumed.** `parlay.py` `build` computes `combined_prob = np.prod(legs.model_prob)`. Correlation is handled only by a default rule of one leg per game (`allow_same=False`) and a contradiction filter; when the user enables same-game legs the product is still used. Supports up to 16 legs with a ranking score built from hand-set weights (`score`).
- **Integration:** Streamlit monolith on SQLite; no reusable service layer.

**Classification: Reject.** No license, no tests, in-sample scoring presented as a model metric, and a parlay engine that multiplies marginal probabilities. The two reasonable ideas in it (median no-vig consensus across books; shrinking a stats-based estimate toward the market by sample size) are generic and appear in better form in True_Prob_AI and NBA_ODDS_SHOP.

### 2.7 NyeTenerelli/parlay-iq

- **Existence:** cloned successfully.
- **License:** none. All rights reserved.
- **Activity:** a single commit on 2026-04-14 (complete history).
- **Size and structure:** 196 KB; 13 Python files, 3,427 lines, in `pipeline/` (`data_collector.py`, `feature_engineering.py`, `player_model.py`, `team_model.py`, `game_model.py`, `parlay_engine.py`, `parlayiq_pipeline.py`, `fetch_odds.py`), `app/dashboard.py`, `run_pipeline.py`, `test_odds.py`.
- **Tests and CI:** none. `test_odds.py` is a 12-line script that calls a live API, not a test.
- **Data sources and rights:** `nba_api` (with request delays, `pipeline/data_collector.py`), TheRundown via RapidAPI (`pipeline/parlayiq_pipeline.py:56`) and an odds endpoint in `pipeline/fetch_odds.py`. The README admits "The pipeline currently does not have a working odds feed" and falls back to "-110 on both sides, implied line from rolling averages".
- **Methodology:** XGBoost regressors for player PTS/REB/AST, team score and pace, and a game over/under classifier.
- **Leakage / evaluation flaws:**
  - `pipeline/player_model.py:50` sorts by `['PLAYER_ID','GAME_DATE']`, and line 139 takes the first 80% of rows as training under the comment "Time-based split". With that sort order the split is by **player ID, not by time**: the test set is the last 20% of players, whose games overlap the training period. `pipeline/team_model.py:87,140` does the same by `TEAM_ID`.
  - Features are lagged with `shift(1)` and the target is additionally `shift(-1)` (`player_model.py:52-74,107-111`), so features that stop at game t-1 are matched to the result of game t+1. This is not a leak but drops the most recent game from every prediction.
  - `pipeline/game_model.py` fits the imputer on the whole dataset before splitting ("Fit imputer on training data" is applied to `df`), and the feature list includes `LINE_MOVEMENT`, `REVERSE_LINE_MOVEMENT`, `PINNACLE_IMPLIED_PROB` and `public_pct_over`. If populated from historical closing data these would be closing-line features; the README says no odds feed works, so their content is NOT VERIFIED.
- **Unsupported claims:** the README promises "positive expected value (EV) parlay recommendations" and "correlation-aware probability estimates", then states that "EV calculations and Kelly sizing are not meaningful without real book lines" and that correlation weights are "starting estimates, not backtested values". It also discloses that parts were AI-generated and patched.
- **Secrets:** **three committed keys:** `pipeline/parlayiq_pipeline.py:334`, `pipeline/fetch_odds.py:5`, `test_odds.py:3` (values not reproduced here). `.gitignore` excludes `.env` and `config.py`, but the keys are in tracked source.
- **Dependencies:** no `requirements.txt`; an unpinned list in the README only.
- **Parlays:** `pipeline/parlay_engine.py` starts from the independent product and multiplies by `(1 + 0.05 × average pairwise weight)` using a hard-coded table (`CORRELATION_WEIGHTS`, for example `('player_pts','home_cover'): 0.40`). This is not a probability model: the adjustment is unrelated to the leg probabilities and is only kept valid by clamping to [0.01, 0.99]. Quarter Kelly is applied to the result.
- **Integration:** none practical.

**Classification: Reject.** Unlicensed, untested, single-commit prototype with committed credentials, a mislabelled non-temporal split, and a correlation adjustment with no statistical basis. It is useful only as a catalogue of mistakes to test against.

### 2.8 imnotaCTO/chachingAI

- **Existence:** cloned successfully.
- **License:** MIT (`LICENSE`, Copyright 2026 Daniel Son).
- **Activity:** 15 commits, 2026-01-28 to 2026-01-29 (complete history). Two days of work, none since.
- **Size and structure:** 476 KB; 26 Python files. Package `src/sgp_engine/` (1,309 lines: `modeling.py`, `simulation.py`, `odds.py`, `pace.py`, `matching.py`, `feature_engineering.py`, `pipeline.py`, `ingestion/{balldontlie,kaggle_nba,odds_api}.py`), `scripts/` (backtest, EV scan, historical odds download, a stdlib HTTP server), `ui/` static prototype, product spec and `docs/`.
- **Tests and CI:** four test files (`tests/test_modeling.py`, `test_simulation.py`, `test_pipeline.py`, `test_download_historical_odds.py`). No CI.
- **Data sources and rights:** BallDontLie API (`src/sgp_engine/ingestion/balldontlie.py`, paid key required for stats per README), The Odds API including historical endpoints (`ingestion/odds_api.py`, `scripts/download_historical_odds.py`), and a user-supplied Kaggle `PlayerStatistics.csv` (`ingestion/kaggle_nba.py`). All keys come from environment variables. No scraping, no proxies. The Kaggle dataset's own license is NOT VERIFIED (not in the repo).
- **Methodology:** each stat is modelled as a shifted lognormal fitted to `log1p` of game logs (`fit_lognormal_params`), correlations are estimated on the log scale (`lognormal_correlations`), the matrix is projected to positive semi-definite by eigenvalue clipping and re-normalised (`make_psd_correlation`), and joint outcomes are simulated through a Cholesky factor (`simulate_lognormal_copula`). Joint probability is the share of simulations in which every leg hits (`evaluate_legs`).
- **Leakage:** rolling and EMA features are lagged with `shift(1)` (`feature_engineering.py:46,70`). `scripts/backtest_props.py` filters logs to `date < cutoff` before fitting (`_filter_logs_before`, `_predict_minutes`). No random splits found. Whether the historical odds snapshots used in the backtest are pre-game or closing is NOT VERIFIED.
- **Statistical caveats:**
  - Lognormal is a continuous, strictly positive distribution; rebounds, assists, threes, steals and blocks are low-count and zero-inflated. Tail and zero behaviour will be wrong for those markets.
  - Correlations come from one player's own game log (the README example uses four games). Small-sample correlation estimates are noisy, and there is no shrinkage toward a prior.
  - A Gaussian copula has no tail dependence.
  - `ensure_psd` silently repairs a bad matrix rather than reporting it.
- **Unsupported claims:** none. The README describes capabilities only.
- **Secrets:** none found; examples use placeholders.
- **Dependencies:** lower bounds only (`numpy>=1.24`, `pandas>=2.0`, `scipy>=1.10`, `requests>=2.31`, `html5lib>=1.1`); no lock file.
- **Parlays:** correlation is modelled explicitly within a player's stat line. Cross-player and cross-game dependence handling is NOT VERIFIED beyond what the sample-matrix interface allows.
- **Integration:** `modeling.py` and `simulation.py` are dependency-light pure functions on NumPy arrays and would drop into a Python service unchanged. `scripts/api_server.py` is a stdlib `ThreadingHTTPServer` and is not something to reuse.

**Classification: Adapt permitted components.** The MIT license permits reuse with attribution, and the copula simulation, PSD projection and odds helpers are small, readable and tested. They are a starting point, not a finished model: we should replace lognormal marginals with count distributions where appropriate, pool and shrink correlations across players, and validate joint probabilities against graded outcomes before any use. The repository is a two-day project with no CI, so it should be vendored and owned, not depended on.

### 2.9 Wynne2/True_Prob_AI

- **Existence:** cloned successfully.
- **License:** none. No LICENSE file. The README calls `web/` "the commercial True Prob AI product". All rights reserved, and this is a direct commercial competitor's codebase.
- **Activity:** last commit 2026-11-22. All 50 fetched commits are dated 2026-11-19 to 2026-11-22 and all are authored as "Cursor Agent". Very high cadence, AI-agent authored. Earlier history NOT VERIFIED (shallow).
- **Size and structure:** 203 MB (170 MB `data/`, 27 MB `media/`). 217 `.py`, 413 `.json`, 260 `.md`. Layered layout: `domain/`, `providers/`, `services/`, `models/`, `odds/`, `engine/` (with `backtest/`, `candidate/`, `accuracy/`, `advisor/`), `arbitrage/`, `web/` (Starlette app with Stripe billing), `tests/`.
- **Tests and CI:** 40 test modules in `tests/`. `.github/workflows/tests.yml` runs `pytest -q -m "not live"` on Python 3.12.
- **Data sources and rights:** BallDontLie (paid tier), The Odds API, and the public Kalshi and Polymarket market-data APIs (`providers/`). An `nba_api` provider also exists (`providers/nba_api_provider.py`). No proxy or anti-bot code found. **Rights concern:** `data/cache/` (75 MB, 313 tracked files, including `data/cache/odds_history/` and `data/cache/balldontlie_history/`), `data/backtests/` (73 MB) and `data/predictions/` (23 MB) commit vendor-licensed odds and stats to a public repository. We must not copy any of it.
- **Methodology:**
  - Hand-weighted projection models per stat (`models/`), for example season average 35%, last-10 30%, last-5 20%, matchup 10%, trend 5% (README).
  - A market-anchored blend: the model's weight against the no-vig market is fitted per prop type with leave-one-date-out cross-validation, and set to zero when it does not beat the market (`engine/market_blend_fit.py`).
  - Point-in-time rebuild of inputs from box scores completed before tip-off, explicitly avoiding season-average endpoints that contain later games (`engine/backtest/asof.py`).
  - De-vig method comparison (multiplicative, additive, power, Shin) scored by date-clustered Brier with a Bonferroni bar (`engine/devig_compare.py`).
  - A prediction ledger, closing-price capture and grading (`engine/prediction_ledger.py`, `engine/clv.py`).
  - Prediction-market prices converted to fee-inclusive break-even odds (README "Prediction-market pricing").
- **Leakage:** no random splits found; evaluation is by date. Closing prices are used for CLV measurement, not as features (`engine/clv.py`). Leave-one-date-out CV lets later dates inform the fit for earlier ones, which is weaker than strict walk-forward; `docs/LAUNCH.md` reports a separate walk-forward test for the market correction. The correlation fit rests on "19 graded dates (Jan + Feb 2026)" (`engine/parlay_copula.py`), a small sample.
- **Claims:** the repository reports negative results against itself. `docs/LAUNCH.md`: corrected Brier 0.22254 against market 0.22282, "Not distinguishable from noise"; flat-stake return on flagged gaps "−19.2%, −1.2%, −16.2%"; "Candidate model: fitted blend weight 0 on every stat; its own gaps have lost money on live boards"; "the product sells transparency and speed ... not a proven edge". No unsupported positive claim was found. The product name "True Probability" is stronger than this evidence supports.
- **Secrets:** none found by pattern scan. `.env.example` and `.env.template` hold empty placeholders. The 170 MB of JSON under `data/` was not exhaustively inspected for embedded credentials: NOT VERIFIED.
- **Dependencies:** all lower bounds, no lock file (`requirements.txt`, 20 lines). Several entries could not be checked against a registry in this sandbox and should be verified before anyone installs them (for example `httpx2>=2.16.0`, `starlette>=1.10.0`): NOT VERIFIED.
- **Parlays:** the strongest treatment in the set. `engine/parlay_copula.py` computes joint probability with a Gaussian copula on latent normals, with correlations fitted from standardised residuals (actual minus projected) per prop-type pair, separately for "same player" and "same game, different player". The sign flips when one leg is an under, different games are treated as independent, and correlation is capped at 0.85. The module states it replaces an earlier "naive product × calibration factor × correlation penalty" heuristic. An older rule-based engine with fixed constants still exists (`engine/correlation_engine.py`).
- **Integration:** Python, but Starlette plus SQLite plus in-process jobs (`docs/LAUNCH.md` item 12), and no license. Not integrable.

**Classification: Study as architectural reference.** It cannot be copied, and its committed vendor data must not be touched. Its design decisions are the most useful in this audit: anchor on the de-vigged market and let a model earn weight only through out-of-sample Brier improvement, rebuild features as of tip-off, keep an append-only prediction ledger graded later for Brier and CLV, fit parlay correlation on residuals, and publish negative results. All of these are ideas we should implement independently on PostgreSQL. Its conclusion that a stats model added nothing over the market on its sample is itself a useful prior for our own expectations.

### 2.10 LucasB19/NBA-Injury-Report

- **Existence:** cloned successfully.
- **License:** MIT (`LICENSE`, "Copyright (c) 2026 Smart"; the README says "Copyright (c) 2026 Lucas Berry. SPDX-License-Identifier: MIT"). The two copyright names differ; the license grant is the same.
- **Activity:** 16 commits, 2026-02-08 to 2026-07-21 (complete history). Low cadence, last touched four months ago.
- **Size and structure:** 12 MB, almost all images: 534 files in `assets/player_headshots/` and 30 in `assets/team_logos/`. Code: 9 Python files, 2,439 lines. `injury_report_dashboard.py` (1,586 lines) holds fetching, PDF parsing and the Dash UI together; `validate_injury_report_csv.py` (224 lines) is a standalone data-quality validator; `scripts/assets/` syncs images; `api/injury-report.js` is a serverless handler.
- **Tests and CI:** four unittest files (`tests/`), about 200 lines. `.github/workflows/ci.yml` compiles, runs unit tests and validates CSVs; it also downloads images when they are missing.
- **Data sources and rights:**
  - The official NBA injury report page and PDFs (`https://official.nba.com/nba-injury-report-2025-26-season/`, `https://ak-static.cms.nba.com/referee/injury/`), fetched with a browser `User-Agent` and retry/backoff (`injury_report_dashboard.py:132-206`). The page URL is hard-coded to one season.
  - Player headshots from the NBA's CDN (`scripts/assets/sync_player_headshots.py:23`) and team logos from ESPN's CDN (`scripts/assets/sync_nba_assets.py:52`), committed to the repository. **These images are NBA, team and ESPN property; the repository's MIT license cannot license them.** Do not copy `assets/`.
  - No proxies or anti-bot bypass.
- **Modelling / leakage / parlays:** not applicable. One point matters for us: the report is republished through the day, and the parser extracts the report timestamp from the PDF URL (`parse_pdf_time_parts`, `parse_pdf_datetime`). Preserving that timestamp is what makes injury features point-in-time safe.
- **Unsupported claims:** the README says "Production-ready". With 1,586 lines in one module mixing scraping, parsing and UI, and about 200 lines of tests, that is generous.
- **Secrets:** none found.
- **Dependencies:** pinned in both `requirements.txt` and `pyproject.toml` (`pdfplumber==0.10.3`, `pandas==2.2.2`, `dash==2.15.0`, `nba_api==1.11.3`), with `uv.lock` committed. The two files disagree on `requests` (range in one, `==2.32.5` in the other).
- **Integration:** the parsing functions (`parse_rows_per_page`, `extract_rows_by_columns`, `extract_rows_from_tables_per_page`, `normalize_rows`, `deduplicate_rows`) and the validator (`validate_csv`, `_is_contaminated_reason`) are plain Python on `pdfplumber` and can be lifted out of the Dash module.

**Classification: Adapt permitted components.** MIT allows us to take the PDF row-extraction logic and the CSV validator with attribution, and injury availability is a high-value input for prop modelling. We should extract only the parser and validator, drop the Dash UI and every image asset, add our own tests against archived PDFs, store each report version with its publication timestamp, and confirm that automated retrieval of the official report is acceptable under NBA terms.

### 2.11 cpsanzone/nba-player-projection-backtester

- **Existence:** cloned successfully.
- **License:** none. All rights reserved.
- **Activity:** 11 commits, all on 2025-12-27 (complete history). Nothing since.
- **Size and structure:** 52 KB; one notebook (`NBA_Projection_Engine.ipynb`, four code cells) and `README.md`.
- **Tests and CI:** none.
- **Data sources:** the notebook reads per-player CSVs from absolute paths that are not in the repo (`/lebron_2023.csv` and similar) and, when absent, generates random data: `np.random.randint(10, 40, 20)` for points and similar for other stats, with random totals and spreads (cell 1, lines 63-88). No real odds are used anywhere.
- **Methodology:** a grid search over rolling window, a fixed downward adjustment to the rolling mean (for example points minus 2 to 6), spread and total filters; the hit rate of "actual ≥ adjusted line" is computed and the best-performing combinations are kept (cells 2-3). Rolling means are lagged with `shift(1)`.
- **Leakage / evaluation flaws:** the parameter combination is selected and reported on the same data, with no holdout. The search covers thousands of combinations across five stats, so the top hit rate is a selection artefact. Adjusted lines are invented; no market price exists for them, so "hit rate" says nothing about profitability.
- **Unsupported claims (README):** "hit rates above 95%"; "combining 3 high-confidence legs creates a composite wager that drastically outperforms the 50% implied probability"; "Real-World Win Rate to ~65%"; "I secured a 15% Edge over the sportsbook". None is supported by data or code in the repository. The stated +100 price for the parlay is an assumption hard-coded in cell 4 (`market_odds_american = 100`), not an observed price. A book prices alternate lines far shorter than the main line, so the comparison is not valid.
- **Secrets:** none.
- **Dependencies:** none declared.
- **Parlays:** **independence assumed.** Cell 4 computes `true_parlay_prob = (leg_win_rate / 100) ** num_legs`. The README simultaneously claims a "Correlation Edge" that lifts the win rate from 53.7% to about 65%, which contradicts the code and is not measured anywhere.
- **Integration:** none.

**Classification: Reject.** There is no license, no real data, no out-of-sample test and no market price, and the README's profitability statements are unsupported. It has no engineering or research value for GIZER beyond illustrating why selected in-sample hit rates must not be compared with an assumed price.

### 2.12 ericdubrow7/NBA_ODDS_SHOP

- **Existence:** cloned successfully.
- **License:** none. All rights reserved.
- **Activity:** 26 commits, 2026-10-25 to 2026-11-07 (complete history). Recent and active over that fortnight.
- **Size and structure:** 1 MB. A static site (`index.html`, `arbitrage.html`, `picks.html`, four `.js` files), eight Python scripts in `scripts/`, five notebooks, and a committed odds snapshot `data/player_props.json` (759 KB).
- **Tests and CI:** no tests. One workflow, `.github/workflows/refresh-odds.yml`, manually triggered, which fetches odds with a repository secret and commits the snapshot.
- **Data sources and rights:** The Odds API for live and historical props (`scripts/fetch_odds.py`, `scripts/fetch_historical_odds.py`; key from `ODDS_API_KEY` or browser localStorage). Player stats from ESPN's site API (`https://site.api.espn.com/...` in `scripts/fetch_player_stats.py:73`), which the README itself calls "unofficial and could change without notice". ESPN has not published terms permitting this use; treat it as unlicensed scraping. The committed snapshot redistributes vendor odds. No proxies.
- **Methodology:**
  - Line shopping: average decimal odds across books per player, market, side and line, and report the best book against the average.
  - Consensus edge: fair probability is the books' average no-vig probability; `edge = consensus_p × best_decimal_odds − 1`. A rule (edge above 2%, at least four books, main line) was "found on last season's odds (Jan-Apr) and fixed before looking at this season", with this season as the out-of-sample test and bootstrap intervals (`scripts/consensus_edge.py`).
  - Stat model: trained on the first half of last season, tested on the second half, retrained weekly through the test half (`scripts/stat_model.py`). Odds are not model inputs; they are compared afterwards (`scripts/line_model.py`).
- **Leakage:** `scripts/build_features.py` computes rolling values including the current game and then joins each row to "the latest snapshots strictly before its start time" (line 208), so a row does not see its own result. One documented exception: "teammates out" uses the box score for past games and the injury report for upcoming games. In training this encodes who actually did not play, which is known only after tip-off and is cleaner than a real pre-game report; this train/serve mismatch inflates the apparent value of that feature. Historical odds are one snapshot "30 min before tip", so results reflect near-closing prices that may not have been available earlier in the day.
- **Claims:** candid. README: "The rule isn't a proven edge: it lost money in this season's test so far, which the page says up front", and the per-player model "predicted worse" than the pooled one. No unsupported positive claims found.
- **Secrets:** none found; the README warns against hard-coding the key.
- **Dependencies:** no requirements file; `pip install pandas requests` in the README and workflow, unpinned.
- **Parlays:** none. The arbitrage page pairs best over with best under on the same line.
- **Integration:** browser JavaScript and standalone scripts writing CSVs; nothing reusable as a service.

**Classification: Replace with independent implementation.** The repository cannot be copied, but two methods are directly relevant and simple to rebuild: cross-book no-vig consensus as the baseline "model", and a pre-registered rule tested on a later season with bootstrap intervals. Its reported result, that the consensus-edge rule lost money out of sample, is worth recording as a prior. We should implement both ideas on our own odds store, use a licensed stats source in place of ESPN's unofficial API, and avoid the box-score-derived "teammates out" shortcut.

### 2.13 proplineapi/propline-mcp

- **Existence:** cloned successfully.
- **License:** MIT (`LICENSE`, Copyright 2026 PropLine; `package.json` `"license": "MIT"`).
- **Activity:** last commit 2026-11-22. Fetched 50 commits (shallow): 4 in August, 26 in September, 12 in October, 8 in November 2026. Actively maintained; package version 0.61.0.
- **Size and structure:** 320 KB; TypeScript. `src/server.ts` (2,355 lines, tool definitions), `src/client.ts` (697, HTTP client), `src/http.ts` (165, Streamable HTTP transport), `src/index.ts`. Docker and Fly.io deployment files.
- **Tests and CI:** **no tests.** Workflows `publish.yml` (npm publish with provenance, actions pinned by commit SHA) and `deploy-fly.yml`. There is no test or lint job.
- **Data sources and rights:** this is a thin client for the vendor's hosted API at prop-line.com. The README lists Bovada, FanDuel, DraftKings, Pinnacle, PrizePicks and Kalshi as upstream books. **How the vendor obtains those prices, and under what terms it may resell them, is not stated in the repository: NOT VERIFIED.** The MIT license covers this client only; data use is governed by the vendor's terms of service, which are not in the repo. Pricing tiers ("Hobby+", "Pro", "Streaming Lite+") gate most useful tools.
- **Modelling / leakage:** none in the repo; all computation happens on the vendor's servers. Tools such as `propline_get_event_ev`, `propline_grade_clv` and `propline_price_parlay` return vendor-computed values we cannot audit.
- **Unsupported claims:** README: "the model picks the right tool, calls the API, and answers from real data", "54 [sports] today", "50 tools". The first is marketing; the counts are NOT VERIFIED against the live service. A "book accuracy" tool is advertised without methodology.
- **Secrets:** none found. The client reads `PROPLINE_API_KEY` from the environment (`src/server.ts:40`). The HTTP transport accepts the key in a query string (`src/http.ts:15,58`), which can end up in logs; a shared demo key path exists when no key is set (`src/index.ts:24`). One tool, `propline_create_free_api_key`, is not read-only: it signs a user up with an email address.
- **Dependencies:** caret ranges (`@modelcontextprotocol/sdk ^1.30.0`) with `package-lock.json` committed and a `.npmrc` `min-release-age=7` supply-chain guard.
- **Parlays:** per the README, `propline_price_parlay` prices cross-game parlays from no-vig lines and flags same-game legs, and `propline_price_sgp` returns the book's own SGP price, the independent product and their ratio as a "correlation factor". That ratio (book SGP price divided by the product of single-leg prices) is a neat way to observe the market's implied correlation.
- **Integration:** Node/TypeScript and MCP. It does not belong inside a Python/FastAPI/PostgreSQL service. The underlying REST API could be called from Python directly, subject to the vendor's terms.

**Classification: Study as architectural reference.** The code is MIT but is the wrong language and only a pass-through to a paid service whose data provenance we could not verify. It is useful as a catalogue of what a props data product exposes (opening and closing lines, CLV grading against a de-vigged close, settlement including pushes and half-stakes, stable player IDs with alias lists, fail-closed matching, event-ID crosswalks). Whether to buy the vendor's API is a separate commercial and legal evaluation that requires reading its terms.

### 2.14 the-odds-api/samples-python

- **Existence:** cloned successfully.
- **License:** none. No LICENSE file and no license statement in the README. Published by the vendor as sample code, so reuse is presumably intended, but no rights are actually granted.
- **Activity:** 22 commits from 2019-11-30 to 2025-06-16 (complete history). Rarely updated; last touched 17 months ago.
- **Size and structure:** 44 KB; six scripts (`odds.py`, `event_odds.py`, `historical_odds.py`, `historical_event_odds.py`, `most_balanced.py`, `utilities.py`), `requirements.txt`, `Dockerfile`.
- **Tests and CI:** none.
- **Data sources and rights:** The Odds API v4 (`https://api.the-odds-api.com/v4/...`), a commercial licensed aggregator. Data use is governed by the vendor's terms and plan, not by this repo. No scraping. Historical endpoints require a paid plan.
- **Modelling / leakage / parlays:** not applicable.
- **Claims:** none beyond product description.
- **Secrets:** none. Scripts use the placeholder `'YOUR_API_KEY'` and a `--api-key` argument. Note that the key is sent as a query parameter (`'api_key': API_KEY`), so it will appear in request URLs and must be scrubbed from logs.
- **Dependencies:** `requests==2.32.4` (pinned).
- **Integration:** script-level examples with module-level side effects; no reusable client class, no retries, no quota handling beyond printing the usage headers.

**Classification: Replace with independent implementation.** The samples show the endpoint shapes and the quota headers, but they are unlicensed and too thin to reuse. A proper client (async HTTP, typed responses, quota tracking, retries, key redaction, raw-payload storage with fetch timestamps) should be written from the vendor's public API documentation. The Odds API itself remains a reasonable licensed odds source to evaluate; that decision rests on its terms and pricing, not on this repository.

---

## 3. Ideas carried into GIZER NBA

All of these are to be implemented independently unless the source is MIT-licensed and marked as adaptable above.

1. **Market-anchored probabilities.** Start from the cross-book no-vig consensus and give a stats model weight only where it improves out-of-sample Brier score; otherwise weight zero. (True_Prob_AI `engine/market_blend_fit.py`; NBA_ODDS_SHOP `scripts/consensus_edge.py`.)
2. **Point-in-time feature rebuild.** Recompute every input from box scores completed before tip-off; never use season-to-date endpoints for historical dates. (True_Prob_AI `engine/backtest/asof.py`; counter-example in kyleskom `src/Process-Data/Create_Games.py`.)
3. **Append-only prediction ledger with later grading.** Record every paper pick with the price taken, capture the last pre-tip price, then grade for Brier (model against market), flat ROI and CLV. (True_Prob_AI `engine/clv.py`, `engine/prediction_ledger.py`.)
4. **Parlay joint probability from a fitted dependence model.** Gaussian copula with correlations estimated from standardised residuals per prop-type pair, split into same-player and same-game, sign-flipped for unders; never a plain product for same-game legs. (True_Prob_AI `engine/parlay_copula.py`; MIT building blocks in chachingAI `src/sgp_engine/simulation.py` and `src/sgp_engine/modeling.py` `make_psd_correlation`.)
5. **Feature admission gate.** Before a feature enters a model: schema check, merge-key check (prior season only), lag-versus-current correlation screen, temporal-constancy check, collinearity cap, then a requirement of positive lift in every walk-forward fold. (nba-player-props-ml-pipeline `validation/leak_detection.py` `pre_ablation_gate`, `validation/walk_forward.py` `evaluate_ablation`.) Early stopping must use an inner slice of the training window, not the test fold.
6. **Pre-registered rules with a later-season test.** Fix selection rules on one season, evaluate on the next, report bootstrap intervals, and publish the result even when negative. (NBA_ODDS_SHOP `scripts/consensus_edge.py`.)
7. **De-vig method as an empirical choice.** Compare multiplicative, additive, power and Shin against outcomes with date-clustered errors before choosing one. (True_Prob_AI `engine/devig_compare.py`.)
8. **Timestamped injury-report ingestion with validation.** Parse the official PDF, keep the publication time of each version, and run a contamination and schema validator on every extract. (NBA-Injury-Report `injury_report_dashboard.py` `parse_pdf_time_parts`, `extract_rows_by_columns`; `validate_injury_report_csv.py`.)
9. **Possession-level play-by-play.** Lineups on floor and possession boundaries for pace, usage and on/off features. (pbpstats `pbpstats/resources/`, `pbpstats/data_loader/nba_possession_loader.py`.)
10. **Provider interface.** One abstract provider per data type with interchangeable implementations and a registry, so a scraped source can be replaced by a licensed one. (True_Prob_AI `providers/base_provider.py`, `providers/provider_registry.py`.)
11. **Market-implied correlation.** The ratio of a book's same-game-parlay price to the product of its single-leg prices is an observable check on our own correlation estimates. (propline-mcp `README.md`, `propline_price_sgp`.)
12. **Entity resolution.** Stable player IDs with a list of every spelling each book uses, and fail-closed matching when a name does not resolve. (propline-mcp `README.md`, `propline_search_players`.)

### Red flags to guard against in our own code

- Same-day statistics joined to the game being predicted (kyleskom `Create_Games.py`).
- A "time-based" split applied to data sorted by entity ID (parlay-iq `pipeline/player_model.py:50,139`).
- Early stopping or hyperparameter choice on the reported test fold (nba-player-props-ml-pipeline `validation/walk_forward.py`).
- Model metrics computed on training rows (WolfSportsAI `team_models.py:61`).
- Parlay probability as a product of marginals (WolfSportsAI `parlay.py`; nba-player-projection-backtester cell 4) or a product nudged by hand-typed weights (parlay-iq `pipeline/parlay_engine.py`).
- Training on box-score absences while serving on injury reports (NBA_ODDS_SHOP `scripts/build_features.py`).
- Credentials in tracked source (kyleskom `Flask/app.py:78,155`; parlay-iq `pipeline/parlayiq_pipeline.py:334`, `pipeline/fetch_odds.py:5`, `test_odds.py:3`).
- Vendor data and third-party images committed to a repository (True_Prob_AI `data/cache/`; kyleskom `Data/*.sqlite`; NBA-Injury-Report `assets/`).

---

## 4. Limits of this audit

- **Shallow clones.** Every repository was cloned with `--depth 50`. For five of them (nba_api, pbpstats, kyleskom, True_Prob_AI, propline-mcp) history beyond the fetched commits was not seen. Cadence statements describe the fetched history only. Secrets that were committed and later removed in older history would not be detected.
- **Default branch only.** Other branches and tags were not inspected (pbpstats develops on `develop`, per its README).
- **No execution.** No code was run, no tests were run, no dependency was installed, and no model or pickle file was loaded. Statements about behaviour come from reading source. Test suites were counted, not verified to pass.
- **No dependency vulnerability scan.** No scanner (pip-audit, npm audit, OSV or similar) was run. Remarks about dependencies concern pinning and age only. Package names were not checked against PyPI or npm.
- **Secret scanning was pattern-based.** A grep for common key assignments and key formats over text files, excluding lock files; notebooks were scanned in a second pass. It is not a substitute for a dedicated scanner, and large JSON data directories (notably True_Prob_AI `data/`) were not exhaustively inspected. Whether the committed keys that were found are still valid was not tested, and their values are deliberately not reproduced.
- **No GitHub metadata.** The GitHub API was unavailable, so stars, forks, issues, pull requests, releases, security advisories, contributor counts and archived status are unknown. The license shown is what is in the repository tree, not GitHub's detected license.
- **untitled114/Sport-suite was not audited at all** (clone failed with an authentication prompt). Its existence is unconfirmed.
- **Not legal advice.** License identification is from file contents. Conclusions about NBA.com, ESPN, sportsbook and vendor data rights are flags for legal review, not determinations. Vendor terms of service (The Odds API, PropLine, BallDontLie, Kalshi, Polymarket) were not read.
- **Large files were sampled.** `WolfSportsAI/app.py`, `True_Prob_AI` (217 Python files) and `propline-mcp/src/server.ts` were read selectively; findings cite the files actually examined. Absence of a finding in those repositories is not proof of absence.
- **Withheld code.** nba-player-props-ml-pipeline publishes excerpts only; its training pipeline, features and data could not be reviewed.
