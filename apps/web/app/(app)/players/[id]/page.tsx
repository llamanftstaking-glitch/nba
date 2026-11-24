"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { TrendChart } from "@/components/charts";
import { InjuryTable } from "@/components/injury-list";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";
import { fmtDate, fmtDateTimeET, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import type { PlayerDetail } from "@/lib/types";

type Split = PlayerDetail["splits"][number];
type Log = PlayerDetail["game_log"][number];
type Proj = PlayerDetail["projections"][number];
type Acc = PlayerDetail["forecast_accuracy"][number];

const n1 = (v: number | null) => <Val v={fmtNum(v)} />;
const n0 = (v: number | null) => <Val v={fmtInt(v)} />;

const SPLIT_COLUMNS: Column<Split>[] = [
  { key: "label", header: "Split", primary: true, cell: (r) => <span className="font-medium text-ink">{r.label}</span> },
  { key: "g", header: "Sample", align: "right", cell: (r) => <span className="num">n={r.games}</span> },
  { key: "min", header: "MIN", align: "right", cell: (r) => n1(r.min) },
  { key: "pts", header: "PTS", align: "right", cell: (r) => n1(r.pts) },
  { key: "reb", header: "REB", align: "right", cell: (r) => n1(r.reb) },
  { key: "ast", header: "AST", align: "right", cell: (r) => n1(r.ast) },
  { key: "fg3m", header: "3PM", align: "right", cell: (r) => n1(r.fg3m) },
  { key: "stl", header: "STL", align: "right", cell: (r) => n1(r.stl) },
  { key: "blk", header: "BLK", align: "right", cell: (r) => n1(r.blk) },
  { key: "tov", header: "TOV", align: "right", cell: (r) => n1(r.tov) },
];

const LOG_COLUMNS: Column<Log>[] = [
  { key: "date", header: "Date", primary: true, cell: (r) => <span className="num text-ink">{fmtDate(r.date, { year: true }) ?? r.date}</span> },
  { key: "opp", header: "Opponent", primary: true, cell: (r) => <span className="num">{r.is_home ? "vs" : "@"} {r.opp_abbr}</span> },
  { key: "min", header: "MIN", align: "right", cell: (r) => n1(r.min) },
  { key: "pts", header: "PTS", align: "right", cell: (r) => n0(r.pts) },
  { key: "reb", header: "REB", align: "right", cell: (r) => n0(r.reb) },
  { key: "ast", header: "AST", align: "right", cell: (r) => n0(r.ast) },
  { key: "fg3m", header: "3PM", align: "right", cell: (r) => n0(r.fg3m) },
  { key: "stl", header: "STL", align: "right", cell: (r) => n0(r.stl) },
  { key: "blk", header: "BLK", align: "right", cell: (r) => n0(r.blk) },
  { key: "tov", header: "TOV", align: "right", cell: (r) => n0(r.tov) },
];

const PROJ_COLUMNS: Column<Proj>[] = [
  { key: "stat", header: "Stat", primary: true, cell: (r) => <span className="font-medium uppercase text-ink">{r.stat}</span> },
  { key: "game", header: "Game", primary: true, cell: (r) => r.game_label },
  { key: "mean", header: "Mean", align: "right", cell: (r) => n1(r.mean) },
  { key: "range", header: "p10–p90", align: "right", cell: (r) => (r.p10 !== null && r.p90 !== null ? <span className="num">{r.p10.toFixed(1)}–{r.p90.toFixed(1)}</span> : <Val v={null} />) },
  { key: "p50", header: "Median", align: "right", cell: (r) => n1(r.p50) },
  { key: "model", header: "Model version", cell: (r) => <span className="num">{r.model_version}</span> },
  { key: "at", header: "Created", cell: (r) => <Val v={fmtDateTimeET(r.created_at)} /> },
];

const ACC_COLUMNS: Column<Acc>[] = [
  { key: "stat", header: "Stat", primary: true, cell: (r) => <span className="font-medium uppercase text-ink">{r.stat}</span> },
  { key: "n", header: "Sample", align: "right", cell: (r) => <span className="num">n={r.n}</span> },
  { key: "mae", header: "MAE", align: "right", cell: (r) => <Val v={fmtNum(r.mae, 2)} /> },
  { key: "cov", header: "80% interval coverage", align: "right", cell: (r) => <Val v={fmtPct(r.coverage_80)} /> },
];

function View({ d }: { d: PlayerDetail }) {
  const chrono = [...d.game_log].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="space-y-3">
      <PageHeader
        title={d.player.name}
        sub={
          <span className="num">
            {d.player.team_abbr ?? "No team"} · {d.player.position ?? "position not available"} · sample n={d.sample.games} games
          </span>
        }
      />
      {d.injury && (
        <Panel title="Current injury status" tone="warn">
          <InjuryTable rows={[d.injury]} caption="Current injury status" />
        </Panel>
      )}
      <Panel title="Recent trend">
        {chrono.length < 2 ? (
          <EmptyState title="Not enough games to chart." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <TrendChart label="Points" data={chrono.map((g) => ({ x: g.date, y: g.pts }))} />
            <TrendChart label="Minutes" data={chrono.map((g) => ({ x: g.date, y: g.min }))} />
          </div>
        )}
      </Panel>
      <Panel title="Splits · with sample sizes">
        {d.splits.length === 0 ? <EmptyState title="No splits available." /> : <DataTable columns={SPLIT_COLUMNS} rows={d.splits} rowKey={(r) => r.label} caption="Splits" dense />}
      </Panel>
      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Projections">
          {d.projections.length === 0 ? <EmptyState title="No projections for upcoming games." /> : <DataTable columns={PROJ_COLUMNS} rows={d.projections} rowKey={(_, i) => i} caption="Projections" dense />}
        </Panel>
        <Panel title="Forecast accuracy">
          {d.forecast_accuracy.length === 0 ? <EmptyState title="No settled forecasts for this player yet." /> : <DataTable columns={ACC_COLUMNS} rows={d.forecast_accuracy} rowKey={(r) => r.stat} caption="Forecast accuracy" dense />}
        </Panel>
      </div>
      <Panel title="Game log" right={<span className="num">{d.game_log.length} games</span>}>
        {d.game_log.length === 0 ? <EmptyState title="No games in the database for this player." /> : <DataTable columns={LOG_COLUMNS} rows={d.game_log} rowKey={(r, i) => `${r.date}-${i}`} caption="Game log" dense />}
      </Panel>
    </div>
  );
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["player", id], queryFn: () => api.player(id) });
  return (
    <div>
      <div className="mb-2 text-xs">
        <DLink href="/players" className="text-accent hover:underline">
          ← All players
        </DLink>
      </div>
      <QueryView query={q} rows={8}>
        {(d) => <View d={d} />}
      </QueryView>
    </div>
  );
}
