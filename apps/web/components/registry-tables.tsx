"use client";

import { StatusBadge } from "@/components/classification-badge";
import { MetricsInline } from "@/components/metrics";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { fmtDateTimeET, fmtInt } from "@/lib/format";
import type { BacktestItem, ModelItem } from "@/lib/types";

function passBadge(passed: boolean | null | undefined) {
  if (passed === null || passed === undefined) return <Val v={null} />;
  return <Badge tone={passed ? "accent" : "bad"}>{passed ? "Passed" : "Did not pass"}</Badge>;
}

const MODEL_COLUMNS: Column<ModelItem>[] = [
  {
    key: "name",
    header: "Model",
    primary: true,
    cell: (m) => (
      <span>
        <span className="font-medium text-ink">{m.name}</span> <span className="num text-xs text-muted">{m.version}</span>
      </span>
    ),
  },
  { key: "family", header: "Family", cell: (m) => m.family },
  { key: "status", header: "Status", cell: (m) => <StatusBadge value={m.status} /> },
  {
    key: "periods",
    header: "Train / calibrate / evaluate",
    cell: (m) => (
      <span className="num text-xs">
        <Val v={m.training_period} /> / <Val v={m.calibration_period} /> / <Val v={m.evaluation_period} />
      </span>
    ),
  },
  {
    key: "eval",
    header: "Latest evaluation",
    cell: (m) =>
      m.latest_evaluation ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {passBadge(m.latest_evaluation.passed)}
            <span className="num text-xs text-muted">n={fmtInt(m.latest_evaluation.n_obs)}</span>
          </div>
          <MetricsInline metrics={m.latest_evaluation.metrics} />
        </div>
      ) : (
        <span className="text-xs text-muted">Not evaluated</span>
      ),
  },
  {
    key: "promoted",
    header: "Promoted",
    cell: (m) =>
      m.promoted_at ? (
        <span className="text-xs">
          {m.promoted_by ?? "—"} · <span className="num">{fmtDateTimeET(m.promoted_at)}</span>
        </span>
      ) : (
        <span className="text-xs text-muted">Not promoted</span>
      ),
  },
  {
    key: "limits",
    header: "Limitations",
    cell: (m) => {
      const text = Array.isArray(m.limitations) ? m.limitations.join("; ") : m.limitations;
      return text ? <span className="break-words text-xs">{text}</span> : <Val v={null} />;
    },
  },
];

export function ModelsTable({ rows }: { rows: ModelItem[] }) {
  return <DataTable columns={MODEL_COLUMNS} rows={rows} rowKey={(m) => m.id} caption="Model registry" />;
}

const BT_COLUMNS: Column<BacktestItem>[] = [
  { key: "name", header: "Model", primary: true, cell: (b) => <span className="font-medium text-ink">{b.model_name}</span> },
  { key: "family", header: "Family", cell: (b) => b.family },
  { key: "kind", header: "Kind", cell: (b) => <Badge>{b.kind}</Badge> },
  { key: "period", header: "Period", cell: (b) => <Val v={b.period} /> },
  { key: "n", header: "Observations", align: "right", cell: (b) => (b.n_obs === null ? <Val v={null} /> : <span className="num">n={fmtInt(b.n_obs)}</span>) },
  { key: "passed", header: "Outcome", cell: (b) => passBadge(b.passed) },
  { key: "metrics", header: "Metrics", cell: (b) => <MetricsInline metrics={b.metrics} /> },
  { key: "notes", header: "Notes", cell: (b) => (b.notes ? <span className="break-words text-xs">{b.notes}</span> : <Val v={null} />) },
  { key: "at", header: "Run", cell: (b) => <Val v={fmtDateTimeET(b.created_at)} /> },
];

export function BacktestsTable({ rows, caption = "Backtests" }: { rows: BacktestItem[]; caption?: string }) {
  return <DataTable columns={BT_COLUMNS} rows={rows} rowKey={(b) => b.id} caption={caption} />;
}
