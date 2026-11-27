# PROJECT AESTHETIC 05 — Kalshi Market Watch: why the owner sees loading skeletons

Date: 2026-11-27. Scope: `/kalshi-intelligence` and `/kalshi-intelligence/[ticker]`. No code was changed.

**Evidence base.** Source code (paths below); a local production build of the web app against the fixture API,
where the list request was delayed, hung and failed on purpose with Playwright request interception; and one
synthetic memory measurement of the backend's row objects (no database involved). **Production was not reachable:
no timing, row count, log line or memory figure from Server M appears in this document.** The facts about
production volume (about 5,500 contracts per slate, a growing append-only snapshot table, a server short of memory,
two API worker processes) were supplied with the task and are taken as given.

## 1. Diagnosis

**Most probable cause: slow API response from `GET /api/v1/kalshi/markets`, made visible as an indefinite skeleton
by a frontend that has no time limit and shows nothing but grey bars while it waits.** Confidence: high for the
mechanism (it follows from the code), not verified for the magnitude on Server M.

In one paragraph: to return 50 rows, the handler loads every contract of the slate as a full ORM object, then
loads **every price observation ever stored for those contracts** as full ORM objects, computes movement for all of
them in Python, sorts, and only then slices one page. The result is kept per worker process for at most the current
clock minute and is discarded whenever a new observation arrives. The browser waits with no timeout; if the answer
takes longer than 30 seconds the Next.js proxy cuts it, the client silently tries once more, and only after roughly
a minute does an error replace the skeleton.

## 2. The request path, with the code

| Step | Where | What happens |
|---|---|---|
| 1 | `apps/web/app/(app)/kalshi-intelligence/page.tsx:33-34` | `useQuery(["kalshi-markets", params], api.kalshiMarkets(params), placeholderData: prev)` with `limit: 50`, `sort: "volume"`, `date` |
| 2 | same file, lines 44-55 and 105 | The sync line and the four tiles render only `if (d)`; the table area is `QueryView`, which shows `LoadingState` (8 grey bars) while `query.isPending` |
| 3 | `apps/web/lib/api.ts:103-126` | `fetch()` with no `AbortController` and no timeout. A request that never answers stays pending for ever |
| 4 | `apps/web/components/shell/providers.tsx:15-20` | Transport errors and 5xx are retried once (React Query default delay about 1 s); 4xx are not retried |
| 5 | `apps/web/next.config.mjs:15-17` | `/api/v1/*` is proxied by the Next.js server to the API. No `proxyTimeout` is configured, so Next's default applies: `proxyTimeout || 30000` ms (`node_modules/next/dist/server/lib/router-utils/proxy-request.js:37`, Next 15.5.29) |
| 6 | Reverse proxy | `infrastructure/proxy/nginx-nba.gizergroup.com.conf:22` sets 60 s; Server M actually uses a Caddy container (DEPLOYMENT.md), whose timeout was not seen |
| 7 | `apps/api/Dockerfile:17`, `docker-compose.yml` (`api` service) | `uvicorn … --workers 2`; container `mem_limit: 1500m`, `cpus: 2` |
| 8 | `apps/api/gizer/api_core.py:54-104` `kalshi_markets` | See §3 |
| 9 | `apps/api/gizer/kalshi.py:359-364` `snapshots_for` | `select(KalshiSnapshot).where(ticker.in_(tickers)).order_by(id)` — whole entities, no time bound, one `IN` list with every ticker of the slate |
| 10 | `apps/api/gizer/kalshi.py:332-356` `movement` | Per contract: filters the list for today, and scans the full list once per window (5 windows) |

## 3. Why the endpoint is expensive

Line references are to `apps/api/gizer/api_core.py` unless stated.

1. **Unbounded read (lines 75-80, `kalshi.py:359-364`).** Contracts are discovered for today and tomorrow
   (`observe(days_ahead=1)`, `kalshi.py:230`), polled every 5 minutes (`config.py:30`), and a snapshot row is
   appended whenever any of the tracked fields changes, including volume and resting sizes (`SNAP_FIELDS`,
   `kalshi.py:210`). A liquid contract can therefore gain a row at nearly every poll for up to about a day and a
   half. The list handler reads all of them for all contracts of the slate. With 5,500 contracts this is somewhere
   between tens of thousands and more than a million rows per build; the real number is **not verified**.
2. **Whole ORM entities.** `select(KalshiSnapshot)` materialises a mapped object with 13 columns per row.
   Synthetic measurement in this repository's virtualenv (objects constructed in Python, no database, `tracemalloc`):
   110,000 objects ≈ 190 MB, 550,000 ≈ 940 MB, 1,650,000 ≈ 2.8 GB — about 1.7 kB per observation. The API
   container is limited to 1,500 MB for two worker processes that also hold the selections, props and stamp caches.
   At a few hundred thousand observations one build approaches the container limit on its own. (Timings from that
   run are not quoted: they were taken with memory tracing on and without a database, so they do not represent the
   endpoint.) `select(KalshiMarket)` likewise loads `rules_primary` and `rules_secondary` (`Text`) for all 5,500
   contracts although the list never returns them.
3. **Everything is computed before pagination (lines 89-104).** `limit=50` slices the finished list. Counts, the
   events list and the sort all need the full row set as the code is written.
4. **The cache barely helps (lines 81-89).** The key contains the request filters, the current minute
   (`now.replace(second=0, microsecond=0)`), `max(kalshi_snapshots.id)` and the contract count. So an entry lives at
   most until the minute changes, is invalidated by every poll that stores anything, is separate in each of the two
   worker processes, and is separate for every distinct filter combination and every distinct search string (the
   search box debounces at 300 ms, so each pause while typing is a new key and a new full contract load). At most
   six entries are kept. In steady state, the first request in each minute in each worker pays the full price.
5. **No single-flight.** Two requests that miss the same key at the same time both run `build()`. The Overview
   page issues the same call (`app/(app)/page.tsx:61`, `api.kalshiMarkets({ date, limit: 1 })`) just to fill one
   tile, so simply landing on the home page triggers the full build, and opening the Kalshi page while that is in
   flight can start a second one.
6. **It blocks the worker.** The handler is a synchronous function, so it runs in a thread, but building rows is
   CPU-bound Python and holds the GIL (one Python thread runs at a time); other requests handled by the same worker (scoreboard polling
   every 15–60 s, `/auth/me`, the other pages' queries) wait behind it. With two workers, two concurrent builds
   stall the whole API. This would explain skeletons on other pages while the Kalshi page is open. NOT VERIFIED on
   the server.
7. **Memory pressure turns slow into failed.** If a build pushes the container past `mem_limit`, the kernel kills a
   worker; the in-flight requests fail at the proxy, the client retries once into a cold worker, and the cycle
   repeats. Whether this happens on Server M is NOT VERIFIED (`docker inspect` → `OOMKilled`, restart counts and
   `dmesg` would show it).
8. **Indexes.** The model declares single-column indexes on `kalshi_snapshots.ticker` and `.observed_at`
   (`db.py:178-179`) and no composite `(ticker, id)` or `(ticker, observed_at)` index. With a 5,500-element `IN`
   list the planner may well choose a sequential scan of the whole table, whose cost then grows with every day of
   history rather than with the slate. NOT VERIFIED (needs `EXPLAIN ANALYZE` on the server).

The changelog entry for 0.4.6 reports this endpoint at 0.55 s cold and 0.02 s warm "measured locally on a real
slate … Not measured on Server M". That measurement predates two days of accumulated observations on a server
slate and says nothing about production.

**The detail endpoint** (`kalshi_market_detail`, lines 107-166) is a different case: one ticker through the ticker
index, one contract's observations, four descriptive history windows and three small lookups. It is cheap by
itself. It will still appear to hang whenever the worker is busy with a list build (point 6), and its timeline
query reads every `availability_change` event since 12 hours before the first observation and filters by team in
Python (lines 124-130), which grows over time. Secondary.

## 4. What the browser does while waiting (measured locally)

Local build, fixture API, list request intercepted in Playwright:

| Simulated condition | Observed |
|---|---|
| Response delayed | Page shows the title, the description and the filter bar; **no sync line, no tiles**; eight grey bars in the Contracts panel. Nothing says what is loading or for how long |
| Request never answered | Still the same skeleton at 5 s, 20 s and 45 s. No message, no timeout, no error |
| HTTP 502 | Two requests were sent (one automatic retry), then within 4 s: "Could not load this data — Request failed (502) (HTTP 502)" with a Retry button |

Combining this with the 30-second proxy limit in step 5: on production a build that takes longer than 30 s would
give about 30 s of skeleton, an invisible retry, another 30 s of skeleton, and then the error box — a minute of
grey bars. A build that takes 5–25 s gives a skeleton of that length on the first visit of each minute. Either is
consistent with "I see loading skeletons". Which one the owner experiences is NOT VERIFIED.

Once data has arrived, changing a filter keeps the previous rows on screen (`placeholderData`) with **no
indication that they are stale or that a request is running**; if that request then takes 20 s the page looks
unresponsive rather than loading. That is a second, quieter form of the same defect.

## 5. Classification against the six candidate causes

| Candidate | Verdict | Evidence for | Evidence against |
|---|---|---|---|
| **Slow API response** | **Primary cause (probable; not measured in production)** | §3: unbounded read of all observations for about 5,500 contracts as ORM objects, computed before pagination, cache lifetime under a minute and per process, no single-flight, the home page triggers the same build; memory measurement shows the object graph alone can approach the container limit | No production timing was available. The only recorded timing (0.55 s) is local and on smaller data |
| **Frontend loading-state bug** | **Contributing cause (verified locally)** | §4: no client timeout; an unanswered request shows a skeleton indefinitely; header information is withheld until the whole list arrives; the automatic retry doubles the wait; stale rows on filter change are unmarked | The state logic is not wrong in the narrow sense: with a prompt API response the page renders correctly (fixture: 7 contracts, immediate), and a failed response does produce an error box with Retry |
| **Network failure** | Not the origin; a consequence in the slow case | A proxy timeout at 30 s or a killed worker reaches the browser as a 5xx or a dropped connection | A plain network failure does not produce a lasting skeleton: `lib/api.ts:119` turns it into `ApiError(0, "network_error")`, it is retried once and the error box appears within seconds (measured with 502). The owner reports skeletons, not error boxes |
| **Unavailable historical records** | Rejected | — | Missing observations do not block the page: `movement([])` returns nulls and zero observations (`kalshi.py:334-336`) and the row renders with dashes. An empty slate gives the empty state "No Kalshi contracts match these filters", not a skeleton. The problem is too many historical records being read, not too few being available |
| **Incorrect query parameters** | Rejected | — | The page sends `date, game_id, kind, market, interpretation, q, sort, limit=50, offset`; every one is a declared parameter of the handler (lines 55-57), `sort` values match the handler's table (lines 90-92), `limit` is within `1..500`. A bad value would return 422, which is not retried and renders the error box immediately. The fixture run issues the same request shape successfully |
| **Provider outage** | Rejected | — | The read path never calls Kalshi: both handlers only query the database. If Kalshi were down, `observe()` would record a failed series and store nothing (`kalshi.py:244-248`), the page would load from stored rows and show "Stale" (`_sync`, lines 44-52; threshold `max(3 × poll, 20)` minutes). An outage would make the page no slower |

Residual uncertainty: if the owner sees the skeleton **for ever** rather than for up to a minute, something in the
chain is holding the connection open longer than Next's 30 s default (for example a different proxy timeout, or a
tab that keeps re-requesting). That distinction needs one observation on the server and is not answerable from here.

## 6. How to confirm on Server M (read-only; owner-run)

These read state and change nothing. They are suggestions, not actions taken.

1. Row counts: total rows in `kalshi_snapshots`; rows per day; for today's slate, the number of contracts and the
   number of snapshot rows whose ticker belongs to it; the maximum rows for a single ticker.
2. Time one request from inside the web container or with a signed-in browser's network panel: time to first byte
   of `/api/v1/kalshi/markets?limit=50&sort=volume`, first call and an immediate second call, then again after the
   minute changes.
3. `EXPLAIN (ANALYZE, BUFFERS)` of the snapshot query for the slate's tickers: index scan or sequential scan, rows
   read, time.
4. `docker stats` during a request; `docker inspect` of the API container for `OOMKilled` and `RestartCount`;
   API container logs for worker restarts ("Child process died" / "Started server process").
5. In the browser network panel: does the request end with 200 after N seconds, with 500/502/504 after 30 or 60 s,
   or does it stay pending?

## 7. Fix list

Ordered by effect per unit of work. None was implemented. Items marked **(decision)** need an entry in
`docs/DECISIONS.md` before work starts because they add a table or change observable semantics.

### Backend

| # | Change | Why | Notes |
|---|---|---|---|
| B1 | **Bound the observations read.** Load only rows with `observed_at >= min(start of today ET, now − 3 h)`, plus the latest earlier row per ticker (needed so "price N minutes ago" still resolves just after midnight) | Cuts the read from the contract's whole life to what `movement()` uses | `movement()` currently falls back to all history when there is no observation today (`today = [...] or snaps`, `kalshi.py:338`). Keep that behaviour explicitly or decide that "first observed today" is null in that case **(decision)** |
| B2 | **Select columns, not entities.** `select(ticker, observed_at, yes_bid, yes_ask, last_price, volume, open_interest, yes_bid_size, yes_ask_size, no_bid, no_ask, status)` as tuples; for contracts, exclude `rules_primary` / `rules_secondary` from the list query | Removes ORM identity-map and instance overhead, by far the largest share of the memory measured above | `price_of` already accepts dicts (`kalshi.py:325-326`); adapt `movement` to plain rows |
| B3 | **Page before computing.** Filter, sort and paginate in SQL, then compute movement for the 50 rows on the page. Counts by interpretation and the events list are two small `GROUP BY` queries | 50 contracts instead of 5,500 per request | Sorting by volume, spread or movement in SQL needs the latest observation per contract: `DISTINCT ON (ticker) … ORDER BY ticker, id DESC`, or B5 |
| B4 | **Composite index** `(ticker, id)` (or `(ticker, observed_at)`) on `kalshi_snapshots` | Makes "latest per ticker", "first today per ticker" and B1 index-only range scans instead of table scans | A migration; additive. On a large live table create it concurrently. Adding an index to an append-only table does not alter its rows |
| B5 | **Per-contract summary table** maintained by `observe()` in the worker: current price, bid/ask, volume, open interest, first observation today, high/low today, prices at the five window offsets or the ids needed to derive them, observation count, last observed time **(decision)** | The list becomes one indexed query on about 5,500 small rows with SQL sort and pagination; no process cache needed; identical answers from both workers | It is a derived, recomputable projection of the append-only observations, not a replacement. Document it as such in `docs/data/KALSHI.md`; give it a rebuild command; keep the "first observed is not an opening price" wording |
| B6 | **Single-flight and saner cache key** if a process cache remains: one mutex per key so concurrent misses wait for one build; do not put the search string in the key (filter cached rows instead); do not put the minute in the key, recompute the time-window fields from cached observations instead | Stops duplicate builds and per-keystroke rebuilds | Unnecessary once B3/B5 exist |
| B7 | **A cheap summary endpoint** (`/kalshi/summary?date=`: counts, events, sync) for the Overview tile and for the page header | The home page stops triggering the full list build; the Kalshi page can show sync status and counts at once | Additive API; update `API-CONTRACT.md` |
| B8 | **Time limits and measurement.** A database statement timeout for API sessions (for example 15 s) returning a 503 with a clear message; log duration, contracts and observations read for this endpoint | A runaway query fails visibly and quickly instead of occupying a worker; the next regression is seen in logs | Order the limits: database 15 s < browser 20 s < Next proxy 30 s < edge proxy |
| B9 | **Detail endpoint:** filter availability events by team/game in SQL; cap or downsample the series beyond a few hundred points | Keeps the detail view flat as history grows | Lower priority |
| B10 | **Volume control without deleting anything:** consider not appending a snapshot when only resting sizes changed, or partitioning the table by day **(decision)** | Slows the growth that makes every unbounded read worse | Changes what counts as an observation; needs the owner. Do not delete rows: the table is append-only |

B1 + B2 are small, local changes and should be enough to remove the multi-second builds. B3/B4 or B5 make the
endpoint independent of slate size. Tests to add with any of them: a slate with thousands of contracts and
hundreds of observations each must answer within a stated budget and return the same `first_observed`,
`change_since_first`, `high`, `low` and window values as the current implementation on the same data.

### Frontend

| # | Change | Why |
|---|---|---|
| F1 | **Client timeout and cancellation** in `lib/api.ts`: pass React Query's `signal` to `fetch`, add an `AbortController` deadline (about 20 s) that raises `ApiError(0, "timeout", "The server did not answer within 20 seconds.")` | No request can leave a skeleton up for ever; navigating away cancels work in flight |
| F2 | **A skeleton that resolves.** Shape it like the table (header row plus eight rows at row height). After about 4 s add a sentence under it: "Still loading. The server is reading price observations for this slate." At the deadline replace it with the error state and Retry | The owner always knows what is happening and what to do |
| F3 | **Render what is already known.** Header, filter bar, game list (from the `/games` query the shell already has) and, with B7, sync status and counts appear immediately; only the table waits | The page is usable and informative during a slow list |
| F4 | **Mark stale rows** while a new filter or page is loading: keep the previous rows but dim them and show "Updating…" beside the count (`isPlaceholderData` / `isFetching`); announce it with `aria-busy` | Removes the "nothing happened" state after a filter change |
| F5 | **No silent retry for this query** (`retry: false`, or retry only `network_error`), and show the HTTP status and elapsed time in the error | A 30-second proxy timeout is not doubled to 60 s |
| F6 | **Three different empty states:** no contracts stored for this date; no observation has ever been synced (`sync.last_sync_at` null); filters match nothing (with "Clear filters") | Today all three read "No Kalshi contracts match these filters" |
| F7 | **Overview tile** uses the summary endpoint (B7) and fails on its own without affecting the page | The landing page no longer depends on the heaviest request in the app |
| F8 | **Detail drawer and page:** same timeout and staged message; show the contract title from the list row at once while the detail loads | The drawer is not a blank sheet with bars |
| F9 | **Set `experimental.proxyTimeout` explicitly** in `next.config.mjs` (or document that the default is 30 s) so the chain of limits in B8 is deliberate | Today the 30 s limit is an undocumented default |
| F10 | **Test the states:** add a slow, a hung and a failing mode for this endpoint to `e2e/mock-api.mjs` and assert in the smoke test that the skeleton is replaced by a message or an error within the deadline | The behaviour measured in §4 becomes a regression test |

## 8. Three-sentence summary

The Kalshi list endpoint rebuilds rows for every contract on the slate, reading every stored observation as ORM
objects before it paginates, and its cache lasts under a minute per worker, so on production volumes each first
request is slow and memory-heavy and can stall or kill one of the two API workers. The page has no request timeout
and shows only grey bars until the whole list arrives, so a slow answer looks like an endless skeleton (about a
minute of it before an error if the 30-second Next.js proxy limit is hit and the silent retry runs). It is not a
provider outage, a parameter mismatch or missing history; the fix is to bound and slim the read (today's
observations, selected columns, paginate first or a summary table) and to give the page a deadline, a message and
header content that does not wait for the table.
