"use client";

import { StatusBadge } from "@/components/classification-badge";
import { Badge, StaleTag } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { fmtDateTimeET, fmtInt } from "@/lib/format";
import type { DataHealth } from "@/lib/types";

type Provider = DataHealth["providers"][number];
type Fresh = DataHealth["freshness"][number];

const PROVIDER_COLUMNS: Column<Provider>[] = [
  { key: "p", header: "Provider", primary: true, cell: (r) => <span className="font-medium text-ink">{r.provider}</span> },
  { key: "cfg", header: "Configured", cell: (r) => <Badge tone={r.configured ? "accent" : "warn"}>{r.configured ? "Configured" : "Not configured"}</Badge> },
  { key: "status", header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
  { key: "ok", header: "Last success", cell: (r) => <Val v={fmtDateTimeET(r.last_success_at)} /> },
  { key: "err", header: "Last error", cell: (r) => <Val v={fmtDateTimeET(r.last_error_at)} /> },
  { key: "calls", header: "Calls this month", align: "right", cell: (r) => <Val v={fmtInt(r.calls_this_month)} /> },
  {
    key: "quota",
    header: "Quota",
    align: "right",
    cell: (r) => (r.quota_used === null && r.quota_limit === null ? <Val v={null} /> : <span className="num">{fmtInt(r.quota_used) ?? "—"} / {fmtInt(r.quota_limit) ?? "—"}</span>),
  },
  { key: "cost", header: "Monthly cost", align: "right", cell: (r) => <Val v={r.monthly_cost_usd === null ? null : `$${r.monthly_cost_usd.toFixed(2)}`} /> },
];

export function ProvidersTable({ rows }: { rows: Provider[] }) {
  return <DataTable columns={PROVIDER_COLUMNS} rows={rows} rowKey={(r) => r.provider} caption="Data providers" dense />;
}

function age(min: number | null): string | null {
  if (min === null) return null;
  if (min < 90) return `${Math.round(min)} min`;
  if (min < 48 * 60) return `${(min / 60).toFixed(1)} h`;
  return `${(min / 1440).toFixed(1)} d`;
}

const FRESH_COLUMNS: Column<Fresh>[] = [
  { key: "name", header: "Dataset", primary: true, cell: (r) => <span className="font-medium text-ink">{r.name}</span> },
  { key: "state", header: "State", primary: true, cell: (r) => (r.ok ? <Badge>Fresh</Badge> : <StaleTag title="Older than the allowed maximum age" />) },
  { key: "at", header: "Last update", cell: (r) => <Val v={fmtDateTimeET(r.at)} /> },
  { key: "age", header: "Age", align: "right", cell: (r) => <Val v={age(r.age_minutes)} className={r.ok ? undefined : "text-warn"} /> },
  { key: "max", header: "Max allowed", align: "right", cell: (r) => <Val v={age(r.max_age_minutes)} /> },
];

export function FreshnessTable({ rows }: { rows: Fresh[] }) {
  return <DataTable columns={FRESH_COLUMNS} rows={rows} rowKey={(r) => r.name} caption="Data freshness" dense rowClassName={(r) => (r.ok ? undefined : "bg-warn-dim/20")} />;
}
