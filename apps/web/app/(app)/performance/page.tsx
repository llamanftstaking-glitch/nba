"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LineChart, Ruler } from "lucide-react";
import { ciText } from "@/components/summary";
import { textLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";
import { fmtInt, fmtNum, fmtPct, fmtSigned, fmtSignedPct, statLabel } from "@/lib/format";
import type { StrategiesResponse, StrategyGroup } from "@/lib/types";

const NO_RECORDS = "n=0 — no settled records";
const has = (g: StrategyGroup) => g.settled > 0;
const dash = <span className="text-muted">—</span>;

const COLUMNS: Column<StrategyGroup>[] = [
  { key: "label", header: "Strategy", primary: true, className: "whitespace-nowrap", cell: (g) => <span className="font-semibold text-ink">{g.label}</span> },
  { key: "n", header: "Tickets", align: "right", cell: (g) => <span className="num">n={fmtInt(g.tickets)}</span> },
  { key: "settled", header: "Settled", align: "right", className: "xl:whitespace-nowrap", cell: (g) => (has(g) ? <span className="num">{fmtInt(g.settled)}</span> : <span className="text-muted" data-testid="strategy-empty">{NO_RECORDS}</span>) },
  { key: "wl", header: "W / L / P / V", align: "right", className: "whitespace-nowrap", hideOnMobile: (g) => !has(g), cell: (g) => (has(g) ? <span className="num">{g.wins}/{g.losses}/{g.pushes}/{g.voids}</span> : dash) },
  {
    key: "hit",
    header: "Hit rate [95% CI]",
    align: "right",
    hideOnMobile: (g) => !has(g),
    cell: (g) => (has(g) ? <span className="num"><Val v={fmtPct(g.hit_rate)} /> <span className="block text-xs text-muted xl:whitespace-nowrap">{ciText(g.hit_rate_ci)}</span></span> : dash),
  },
  { key: "pred", header: "Avg predicted", align: "right", hideOnMobile: (g) => !has(g), cell: (g) => (has(g) ? <Val v={fmtPct(g.avg_model_prob)} /> : dash) },
  {
    key: "roi",
    header: "Simulated ROI (priced)",
    align: "right",
    hideOnMobile: (g) => !has(g),
    cell: (g) =>
      !has(g) ? dash : g.priced_tickets === 0 ? <span className="text-xs text-muted">no priced tickets</span> : <span className="num"><Val v={fmtSignedPct(g.roi)} /> <span className="block text-xs text-muted xl:whitespace-nowrap">{ciText(g.roi_ci, true)} · {g.priced_tickets} priced</span></span>,
  },
  { key: "pnl", header: "P&L (units)", align: "right", hideOnMobile: (g) => !has(g), cell: (g) => (has(g) ? <Val v={fmtSigned(g.pnl_units)} /> : dash) },
];

const KINDS: [StrategyGroup["kind"], string][] = [
  ["market", "By market type"],
  ["engine", "By engine · combination size"],
  ["structure", "By structure"],
];

function View({ d }: { d: StrategiesResponse }) {
  return (
    <div className="space-y-5">
      {KINDS.map(([kind, title]) => {
        const rows = d.groups.filter((g) => g.kind === kind);
        return (
          <Panel key={kind} title={title} icon={LineChart}>
            {rows.length === 0 ? <EmptyState title="The API returned no groups of this kind." /> : <DataTable columns={COLUMNS} rows={rows} rowKey={(g) => g.key} caption={title} dense />}
          </Panel>
        );
      })}
      <Panel title="Forecast accuracy" icon={Ruler}>
        {d.forecast.length === 0 ? (
          <EmptyState title="n=0 — no settled forecasts yet." />
        ) : (
          <DataTable
            columns={[
              { key: "stat", header: "Stat", primary: true, cell: (r) => <span className="font-semibold uppercase text-ink">{statLabel(r.stat)}</span> },
              { key: "n", header: "Sample", align: "right", cell: (r) => <span className="num">n={fmtInt(r.n)}</span> },
              { key: "mae", header: "Mean absolute error", align: "right", cell: (r) => <Val v={fmtNum(r.mae, 2)} /> },
              { key: "cov", header: "80% interval coverage", align: "right", cell: (r) => <Val v={fmtPct(r.coverage_80)} /> },
            ]}
            rows={d.forecast}
            rowKey={(r) => r.stat}
            caption="Forecast accuracy"
            dense
          />
        )}
      </Panel>
      <p className="rounded-lg bg-card px-4 py-3 text-sm text-soft ring-1 ring-inset ring-line/60" data-testid="strategies-disclaimer">
        {d.disclaimer}
      </p>
    </div>
  );
}

export default function PerformancePage() {
  const q = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  return (
    <div>
      <PageHeader
        title="Strategy Performance"
        sub="Settled paper-ticket outcomes grouped by market type, engine and structure. Groups with no settled records say so."
        right={
          <>
            <DLink href="/results" className={textLink}>
              Results <ArrowRight className="h-3 w-3" aria-hidden />
            </DLink>
            <DLink href="/models" className={textLink}>
              Model registry <ArrowRight className="h-3 w-3" aria-hidden />
            </DLink>
          </>
        }
      />
      <QueryView query={q} rows={8}>
        {(d) => <View d={d} />}
      </QueryView>
    </div>
  );
}
