"use client";

import { FreshnessTable, ProvidersTable } from "@/components/data-health-panels";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { BulletList, PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { fmtDate, fmtInt } from "@/lib/format";
import { useDataHealth } from "@/lib/queries";
import type { DataHealth } from "@/lib/types";

type Cov = DataHealth["coverage"][number];
const COV_COLUMNS: Column<Cov>[] = [
  { key: "season", header: "Season", primary: true, cell: (r) => <span className="num font-medium text-ink">{String(r.season)}</span> },
  { key: "games", header: "Games", align: "right", cell: (r) => <Val v={fmtInt(r.games)} /> },
  { key: "box", header: "With box score", align: "right", cell: (r) => <Val v={fmtInt(r.games_with_box)} /> },
  { key: "rows", header: "Player rows", align: "right", cell: (r) => <Val v={fmtInt(r.player_rows)} /> },
  { key: "first", header: "First date", cell: (r) => <Val v={fmtDate(r.first_date, { year: true })} /> },
  { key: "last", header: "Last date", cell: (r) => <Val v={fmtDate(r.last_date, { year: true })} /> },
];

export default function DataHealthPage() {
  const q = useDataHealth();
  return (
    <div>
      <PageHeader title="Data Health" sub="Provider status, historical coverage and freshness of every dataset the research depends on." />
      <QueryView query={q} rows={8}>
        {(d) => {
          const stale = d.freshness.filter((f) => !f.ok).length;
          return (
            <div className="space-y-3">
              {d.warnings.length > 0 && (
                <Panel title="Warnings" tone="warn">
                  <BulletList items={d.warnings} tone="warn" />
                </Panel>
              )}
              <Panel title="Freshness" tone={stale ? "warn" : undefined} right={<span className="num">{stale} stale of {d.freshness.length}</span>}>
                {d.freshness.length === 0 ? <EmptyState title="No freshness checks are reported." /> : <FreshnessTable rows={d.freshness} />}
              </Panel>
              <Panel title="Providers">{d.providers.length === 0 ? <EmptyState title="No providers are reported." /> : <ProvidersTable rows={d.providers} />}</Panel>
              <Panel title="Coverage by season">
                {d.coverage.length === 0 ? <EmptyState title="No historical coverage has been loaded." /> : <DataTable columns={COV_COLUMNS} rows={d.coverage} rowKey={(r) => String(r.season)} caption="Coverage by season" dense />}
              </Panel>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
