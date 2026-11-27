"use client";

import { useState } from "react";
import { ProbScaleKey } from "@/components/prob";
import { SelectionHead, SelectionRow, SelectionsByGame } from "@/components/selection-row";
import { Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useSelectedDate } from "@/lib/date";
import { fmtDateTimeET, titleCase } from "@/lib/format";
import { useGames, useSelections } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";

const LIMIT = 25;
const TABS = [
  ["ranked", "Top picks", "No selection qualified for this slate. That is a valid research outcome."],
  ["qualified", "Qualified (all)", "No selection qualified for this slate."],
  ["watchlist", "Watchlist", "Nothing is on the watchlist for this slate."],
  ["stale", "Stale", "No selection is stale. Selections become stale only when a freshness check fails."],
  ["insufficient_evidence", "Insufficient", "No selection was set aside for insufficient information."],
  ["rejected", "Rejected", "No selection was rejected."],
] as const;

export default function PicksPage() {
  const date = useSelectedDate();
  const [tab, setTab] = useState<string>("ranked");
  const [text, setText] = useState("");
  const [game, setGame] = useState("");
  const [offset, setOffset] = useState(0);
  const search = useDebounced(text.trim(), 300);
  const games = useGames(date);
  const ranked = tab === "ranked";
  // Top picks: the API's ranked view (at most five per game). Every other tab is paged, 25 at a time.
  const q = useSelections(
    ranked
      ? { date, ranked: true, q: search || undefined, game_id: game || undefined, limit: 200 }
      : { date, classification: tab, q: search || undefined, game_id: game || undefined, limit: LIMIT, offset },
  );
  const counts = q.data?.counts;
  const count = (id: string) => (!counts ? null : id === "qualified" ? (counts.high_confidence ?? 0) + (counts.standard ?? 0) : (counts[id] ?? 0));
  const reset = () => setOffset(0);
  const meta = TABS.find((t) => t[0] === tab) ?? TABS[0];

  return (
    <div className="space-y-9">
      <PageHeader
        title="Top Picks"
        sub="Qualified selections the model puts at 65% or higher, most likely first, at most five per game. Other tabs page through every evaluated selection."
        right={
          q.data?.edition ? (
            <p className="max-w-[44ch] text-sm text-muted">
              <span className="slot mr-2 text-ink">Paper research only</span>
              {titleCase(q.data.edition.kind)} edition v{q.data.edition.version}, published {fmtDateTimeET(q.data.edition.published_at) ?? "—"}.
            </p>
          ) : undefined
        }
      />
      <Tabs label="Selection view" scroll value={tab} onChange={(v) => { setTab(v); reset(); }} items={TABS.map(([id, label]) => ({ id, label, count: count(id) }))} />
      <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
        <label>
          <span className="sr-only">Search selections</span>
          <Input type="search" placeholder="Search player, team or market" value={text} onChange={(e) => { setText(e.target.value); reset(); }} data-testid="picks-search" />
        </label>
        <label>
          <span className="sr-only">Game</span>
          <Select value={game} onChange={(e) => { setGame(e.target.value); reset(); }}>
            <option value="">All games</option>
            {(games.data?.games ?? []).map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </Select>
        </label>
      </div>
      <Panel title={meta[1]} right={q.data ? <span className="num">{q.data.items.length} shown · {q.data.total} matching</span> : undefined}>
        <QueryView query={q} rows={6}>
          {(d) =>
            !d.edition ? (
              <EmptyState title="No research edition has been published for this date.">
                Selections appear here after the first edition of the day is published.
              </EmptyState>
            ) : d.items.length === 0 ? (
              <EmptyState title={search || game ? "No selection matches these filters." : meta[2]} />
            ) : ranked ? (
              <>
                <SelectionsByGame items={d.items} perGame={5} />
                <ProbScaleKey className="mt-5" />
              </>
            ) : (
              <>
                <SelectionHead />
                <ul data-testid="picks-list">
                  {d.items.map((s) => (
                    <SelectionRow key={s.id} s={s} />
                  ))}
                </ul>
                <Pagination offset={offset} limit={LIMIT} total={d.total} onChange={setOffset} />
              </>
            )
          }
        </QueryView>
      </Panel>
    </div>
  );
}
