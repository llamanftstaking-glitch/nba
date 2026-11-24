"use client";

import { StatusBadge } from "@/components/classification-badge";
import { Badge, StaleTag } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { fmtDateTimeET, fmtInt } from "@/lib/format";
import { StatusDot } from "@/components/ui/badge";
import { FreshnessIndicator } from "@/components/status";
import type { DataHealth, ProviderInfo } from "@/lib/types";

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

const CREDENTIAL: Record<ProviderInfo["credential"], { label: string; tone: "accent" | "warn" | "neutral" }> = {
  present: { label: "Credential present", tone: "accent" },
  missing: { label: "Credential missing", tone: "warn" },
  not_required: { label: "No credential required", tone: "neutral" },
};

/** Provider configuration center: status only. No secret values and no key entry field. */
export function ProviderCenter({ items }: { items: ProviderInfo[] }) {
  return (
    <ul className="grid gap-4 xl:grid-cols-2" data-testid="provider-center">
      {items.map((p) => {
        const cred = CREDENTIAL[p.credential] ?? CREDENTIAL.missing;
        return (
          <li key={p.provider} className="rounded-md bg-raised/40 p-4" data-testid="provider-card" data-provider={p.provider}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-base font-semibold text-ink">{p.name}</div>
                <div className="text-xs text-muted">
                  <span className="num">{p.provider}</span> · {p.categories.length ? p.categories.join(", ") : "no categories listed"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <StatusBadge value={p.status} />
                <StatusDot tone={cred.tone}>{cred.label}</StatusDot>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-2xs font-medium uppercase text-muted">Last success</dt>
                <dd><FreshnessIndicator at={p.last_success_at} label="" /></dd>
              </div>
              <div>
                <dt className="text-2xs font-medium uppercase text-muted">Calls this month</dt>
                <dd className="num text-ink">{fmtInt(p.calls_this_month)}</dd>
              </div>
              <div>
                <dt className="text-2xs font-medium uppercase text-muted">Quota</dt>
                <dd className="num text-ink">
                  {fmtInt(p.quota_used)} / {p.quota_limit === null ? "no limit" : fmtInt(p.quota_limit)}
                </dd>
              </div>
              <div>
                <dt className="text-2xs font-medium uppercase text-muted">Monthly cost</dt>
                <dd className="num text-ink">${p.monthly_cost_usd.toFixed(2)}</dd>
              </div>
            </dl>
            {(p.last_error || p.last_error_at) && (
              <p className="mt-2 break-words text-xs text-bad">
                Last error {fmtDateTimeET(p.last_error_at) ?? "—"}: {p.last_error ?? "no message recorded"}
              </p>
            )}
            {p.limitations.length > 0 && (
              <div className="mt-2">
                <div className="text-2xs font-medium uppercase text-muted">Limitations</div>
                <ul className="text-xs text-soft">
                  {p.limitations.map((l, i) => (
                    <li key={i}>· {l}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-2">
              <div className="text-2xs font-medium uppercase text-muted">Setup</div>
              <p className="break-words text-xs text-soft">{p.setup || "No setup instructions provided."}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
