"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KalshiDrawer, KalshiSyncStatus, KalshiTable } from "@/components/kalshi";
import { Tile } from "@/components/summary";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { useSelectedDate } from "@/lib/date";
import { fmtInt, propMarketName } from "@/lib/format";
import { useGames } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";

const LIMIT = 50;
/** After this long without an answer the page says so and offers Retry or Keep waiting. */
const SLOW_AFTER_MS = 8000;
const MARKETS = ["player_pts", "player_reb", "player_ast", "player_fg3m", "player_stl", "player_blk", "player_tov", "player_pra", "player_pr", "player_pa", "player_ra", "moneyline", "spread", "total"];

/** Seconds since `since` (a timestamp), ticking once a second while `active`. */
function useElapsed(active: boolean, since: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, since]);
  return active ? Math.max(0, Math.round((now - since) / 1000)) : 0;
}

export default function KalshiPage() {
  const date = useSelectedDate();
  const [text, setText] = useState("");
  const sp = useSearchParams();
  const [game, setGame] = useState(sp.get("game_id") ?? "");
  const [kind, setKind] = useState("");
  const [market, setMarket] = useState("");
  const [interp, setInterp] = useState("");
  const [sort, setSort] = useState("volume");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const search = useDebounced(text.trim(), 300);
  const params = { date, game_id: game || undefined, kind: kind || undefined, market: market || undefined, interpretation: interp || undefined, q: search || undefined, sort, limit: LIMIT, offset };
  // No silent retry: a slow list must not be doubled behind the owner's back. Cancelled when the page is left.
  const q = useQuery({ queryKey: ["kalshi-markets", params], queryFn: ({ signal }) => api.kalshiMarkets(params, signal), placeholderData: (prev) => prev, retry: false });
  // The game list for the filter comes from the slate the shell already holds, so the filters work before the table answers.
  const games = useGames(date);
  const set = (fn: (v: string) => void) => (e: { target: { value: string } }) => {
    fn(e.target.value);
    setOffset(0);
  };
  const d = q.data;
  const waiting = q.isFetching;
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [patience, setPatience] = useState(SLOW_AFTER_MS);
  const key = JSON.stringify(params);
  useEffect(() => {
    if (!waiting) return;
    setStartedAt(Date.now());
    setPatience(SLOW_AFTER_MS);
  }, [waiting, key]);
  const elapsed = useElapsed(waiting, startedAt);
  const slow = waiting && elapsed * 1000 >= patience;
  const stale = waiting && Boolean(d) && q.isPlaceholderData;
  const filtered = Boolean(game || kind || market || interp || search);
  const clear = () => {
    setText("");
    setGame("");
    setKind("");
    setMarket("");
    setInterp("");
    setOffset(0);
  };
  const events = d?.events ?? (games.data?.games ?? []).map((g) => ({ game_id: g.id, label: g.label }));

  return (
    <div className="space-y-9">
      <PageHeader title="Kalshi Market Watch" sub="Observed Kalshi contract prices for the slate, read-only. Contracts are thresholds with their own rules, not sportsbook over/under lines. A market price is not a GIZER probability." />

      {/* Sync status has its own slot and never waits for the table to draw. */}
      {d ? (
        <KalshiSyncStatus sync={d.sync} />
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted" data-testid="kalshi-sync-pending" role="status">
          <span className="slot text-muted">{q.isError ? "Sync unknown" : "Checking sync"}</span>
          {q.isError ? "The last sync time could not be read because the contract list did not load." : "The last sync time arrives with the contract list. Prices are polled, not a continuous feed."}
        </p>
      )}

      {d && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 border-y border-line py-4 md:grid-cols-4" data-testid="kalshi-tiles">
          <Tile label="Contracts">{fmtInt(d.counts.total)}</Tile>
          <Tile label="Normalised" sub="evaluated by GIZER">{fmtInt(d.counts.normalized)}</Tile>
          <Tile label="Tracked only" sub={`${fmtInt(d.counts.unsupported)} unsupported, ${fmtInt(d.counts.unmatched)} unmatched`}>
            {fmtInt(d.counts.unsupported + d.counts.unmatched)}
          </Tile>
          <Tile label="Events">{fmtInt(d.events.length)}</Tile>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4 xl:grid-cols-7" data-testid="kalshi-filters">
        <Field label="Search" className="col-span-2">
          <Input type="search" placeholder="Player or contract" value={text} onChange={set(setText)} data-testid="kalshi-search" />
        </Field>
        <Field label="Game">
          <Select value={game} onChange={set(setGame)} data-testid="kalshi-game">
            <option value="">All games</option>
            {events.map((e) => (
              <option key={e.game_id} value={e.game_id}>{e.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Kind">
          <Select value={kind} onChange={set(setKind)} data-testid="kalshi-kind">
            <option value="">All kinds</option>
            <option value="player">Player</option>
            <option value="game">Game</option>
            <option value="total">Total</option>
            <option value="spread">Spread</option>
          </Select>
        </Field>
        <Field label="Stat / market">
          <Select value={market} onChange={set(setMarket)}>
            <option value="">All markets</option>
            {MARKETS.map((m) => (
              <option key={m} value={m}>{propMarketName(m)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Interpretation">
          <Select value={interp} onChange={set(setInterp)} data-testid="kalshi-interp">
            <option value="">All</option>
            <option value="normalized">Normalised</option>
            <option value="unsupported">Tracked only, unsupported</option>
            <option value="unmatched">Tracked only, unmatched</option>
          </Select>
        </Field>
        <Field label="Sort">
          <Select value={sort} onChange={set(setSort)} data-testid="kalshi-sort">
            <option value="volume">Volume</option>
            <option value="movement">Movement</option>
            <option value="player">Player</option>
            <option value="spread">Spread</option>
          </Select>
        </Field>
      </div>

      <Panel
        title="Contracts"
        right={
          d ? (
            <span className="num" data-testid="kalshi-count">
              {d.items.length} shown, {d.total} matching{stale ? ". Updating…" : ""}
            </span>
          ) : undefined
        }
      >
        <div aria-busy={waiting} data-testid="kalshi-list" data-state={q.isError ? "error" : !d ? (slow ? "slow" : "loading") : stale ? "updating" : "ready"}>
          {/* Waiting: one line that says what is happening and for how long, and at the deadline a choice. Never bars alone. */}
          {waiting && (!d || stale) && (
            <div className="mb-4 max-w-[68ch]" role="status" data-testid={slow ? "kalshi-slow" : "kalshi-loading"}>
              <div className="relative h-0.5 overflow-hidden bg-line" aria-hidden>
                <div className="absolute inset-y-0 w-1/4 bg-ink motion-safe:animate-[loading-bar_1.4s_ease-in-out_infinite]" />
              </div>
              {slow ? (
                <>
                  <p className="mt-3 text-base font-bold text-ink">Still loading… this list is large.</p>
                  <p className="mt-0.5 text-sm text-muted">
                    The server has been reading price observations for {elapsed} seconds. {d ? "The rows below are from the previous request." : "Nothing is wrong with your filters."} You can start the request again or give it more time.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      onClick={() => {
                        setStartedAt(Date.now());
                        setPatience(SLOW_AFTER_MS);
                        void q.refetch({ cancelRefetch: true });
                      }}
                      data-testid="kalshi-retry"
                    >
                      Retry
                    </Button>
                    <Button onClick={() => setPatience((p) => p + 15000)} data-testid="kalshi-keep-waiting">
                      Keep waiting
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">{d ? "Updating the list for these filters…" : `Loading contracts for this slate… ${elapsed > 1 ? `${elapsed} s` : ""}`}</p>
              )}
            </div>
          )}

          {q.isError && !waiting ? (
            <ErrorState title="The contract list did not load" error={q.error} onRetry={() => void q.refetch()} />
          ) : d ? (
            d.items.length === 0 ? (
              d.sync.last_sync_at === null && !filtered ? (
                <EmptyState title="Nothing has been synced from Kalshi yet.">Contracts appear here after the first poll stores an observation.</EmptyState>
              ) : filtered ? (
                <EmptyState title="No Kalshi contracts match these filters.">
                  <button type="button" className="link min-h-[44px] text-sm text-ink" onClick={clear} data-testid="kalshi-clear">
                    Clear filters
                  </button>
                </EmptyState>
              ) : (
                <EmptyState title="No Kalshi contracts are stored for this date.">Contracts are discovered for today and tomorrow when the poll runs.</EmptyState>
              )
            ) : (
              <div className={stale ? "text-muted" : undefined}>
                <KalshiTable rows={d.items} onOpen={(m) => setOpen(m.ticker)} />
                <Pagination offset={offset} limit={LIMIT} total={d.total} onChange={setOffset} />
                {d.notes.length > 0 && (
                  <ul className="mt-4 max-w-[76ch] space-y-1 text-sm text-faint" data-testid="kalshi-notes">
                    {d.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )
          ) : null}
        </div>
      </Panel>

      <KalshiDrawer ticker={open} onClose={() => setOpen(null)} />
    </div>
  );
}
