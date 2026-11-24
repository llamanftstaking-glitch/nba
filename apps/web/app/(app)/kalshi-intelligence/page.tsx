"use client";

import { CandlestickChart, Eye, Hash, Layers } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KalshiDrawer, KalshiSyncStatus, KalshiTable } from "@/components/kalshi";
import { Tile } from "@/components/summary";
import { Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useSelectedDate } from "@/lib/date";
import { fmtInt, propMarketName } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";

const LIMIT = 50;
const MARKETS = ["player_pts", "player_reb", "player_ast", "player_fg3m", "player_stl", "player_blk", "player_tov", "player_pra", "player_pr", "player_pa", "player_ra", "moneyline", "spread", "total"];

export default function KalshiPage() {
  const date = useSelectedDate();
  const [text, setText] = useState("");
  const [game, setGame] = useState("");
  const [kind, setKind] = useState("");
  const [market, setMarket] = useState("");
  const [interp, setInterp] = useState("");
  const [sort, setSort] = useState("volume");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const search = useDebounced(text.trim(), 300);
  const params = { date, game_id: game || undefined, kind: kind || undefined, market: market || undefined, interpretation: interp || undefined, q: search || undefined, sort, limit: LIMIT, offset };
  const q = useQuery({ queryKey: ["kalshi-markets", params], queryFn: () => api.kalshiMarkets(params), placeholderData: (prev) => prev });
  const set = (fn: (v: string) => void) => (e: { target: { value: string } }) => {
    fn(e.target.value);
    setOffset(0);
  };
  const d = q.data;

  return (
    <div className="space-y-5">
      <PageHeader title="Kalshi Market Watch" sub="Observed Kalshi contract prices for the slate. Contracts are thresholds with their own rules — not sportsbook over/under lines. A market price is not a GIZER probability." />
      {d && <KalshiSyncStatus sync={d.sync} />}

      {d && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="kalshi-tiles">
          <Tile icon={CandlestickChart} label="Contracts">{fmtInt(d.counts.total)}</Tile>
          <Tile icon={Layers} label="Normalised" sub="evaluated by GIZER">{fmtInt(d.counts.normalized)}</Tile>
          <Tile icon={Eye} label="Tracked only" sub={`${fmtInt(d.counts.unsupported)} unsupported · ${fmtInt(d.counts.unmatched)} unmatched`}>
            {fmtInt(d.counts.unsupported + d.counts.unmatched)}
          </Tile>
          <Tile icon={Hash} label="Events">{fmtInt(d.events.length)}</Tile>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60 md:grid-cols-4 xl:grid-cols-7" data-testid="kalshi-filters">
        <Field label="Search" className="col-span-2">
          <Input type="search" placeholder="Player or contract" value={text} onChange={set(setText)} data-testid="kalshi-search" />
        </Field>
        <Field label="Game">
          <Select value={game} onChange={set(setGame)} data-testid="kalshi-game">
            <option value="">All games</option>
            {(d?.events ?? []).map((e) => (
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
            <option value="unsupported">Tracked only · unsupported</option>
            <option value="unmatched">Tracked only · unmatched</option>
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

      <Panel title="Contracts" icon={CandlestickChart} right={d ? <span className="num">{d.items.length} shown · {d.total} matching</span> : undefined}>
        <QueryView query={q} rows={8} isEmpty={(r) => r.items.length === 0} empty={<EmptyState title="No Kalshi contracts match these filters." icon={CandlestickChart} />}>
          {(r) => (
            <>
              <KalshiTable rows={r.items} onOpen={(m) => setOpen(m.ticker)} />
              <Pagination offset={offset} limit={LIMIT} total={r.total} onChange={setOffset} />
              {r.notes.length > 0 && (
                <ul className="mt-3 space-y-0.5 text-xs text-muted" data-testid="kalshi-notes">
                  {r.notes.map((n, i) => (
                    <li key={i}>· {n}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </QueryView>
      </Panel>

      <KalshiDrawer ticker={open} onClose={() => setOpen(null)} />
    </div>
  );
}
