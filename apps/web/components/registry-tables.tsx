"use client";

import { useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/classification-badge";
import { Badge } from "@/components/ui/badge";
import { Collapsible } from "@/components/ui/collapsible";
import { NA } from "@/components/ui/na";
import { fmtDateTimeET, fmtInt, titleCase } from "@/lib/format";
import type { BacktestItem, ModelItem } from "@/lib/types";

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

function scalar(v: unknown): ReactNode {
  if (v === null || v === undefined) return <NA />;
  if (typeof v === "number") return <span className="num">{Number.isInteger(v) ? v.toLocaleString("en-US") : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3)}</span>;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return <span className="break-words">{String(v)}</span>;
}

// Headline metrics, in priority order: [key, label, kind]
const HEADLINES: [string[], string, "ratio" | "pct" | "num"][] = [
  [["mae_ratio_vs_best_baseline"], "MAE vs baseline", "ratio"],
  [["margin_mae"], "Margin MAE", "num"],
  [["total_mae"], "Total MAE", "num"],
  [["coverage_80", "band_coverage_80", "total_coverage_80"], "80% coverage", "pct"],
  [["ece"], "ECE", "num"],
  [["brier", "home_win_brier"], "Brier", "num"],
  [["home_win_accuracy", "hit_rate"], "Accuracy", "pct"],
  [["roi"], "Simulated ROI", "pct"],
];

function headlines(metrics: Rec | null | undefined, max = 5): [string, ReactNode][] {
  const out: [string, ReactNode][] = [];
  if (!metrics) return out;
  for (const [keys, label, kind] of HEADLINES) {
    const k = keys.find((x) => typeof metrics[x] === "number");
    if (!k) continue;
    const v = metrics[k] as number;
    out.push([label, <span key={k} className="num">{kind === "pct" ? `${(v * 100).toFixed(1)}%` : kind === "ratio" ? `${v.toFixed(3)}×` : v.toFixed(3)}</span>]);
    if (out.length >= max) break;
  }
  return out;
}

function Rows({ rows }: { rows: [string, unknown][] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <>
      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/30 py-1 text-xs">
            <dt className="min-w-0 break-words text-muted">{titleCase(k.replace(/\|/g, " × "))}</dt>
            <dd className="shrink-0 text-right text-ink">{scalar(v)}</dd>
          </div>
        ))}
      </dl>
      {rows.length > 12 && (
        <button type="button" className="mt-1 inline-flex min-h-[44px] items-center text-xs font-medium text-accent hover:underline md:min-h-0" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}

function ObjTable({ rows }: { rows: Rec[] }) {
  const [all, setAll] = useState(false);
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 8);
  const shown = all ? rows : rows.slice(0, 10);
  return (
    <>
      <div className="overflow-hidden">
        <table className="w-full table-fixed border-collapse text-xs" data-testid="metrics-table">
          <thead>
            <tr className="border-b border-line">
              {cols.map((c) => (
                <th key={c} scope="col" className="px-1.5 pb-1 text-left text-2xs font-semibold uppercase tracking-wide text-muted">{titleCase(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-b border-line/30 last:border-0">
                {cols.map((c) => (
                  <td key={c} className="break-words px-1.5 py-1 align-top text-soft">{isScalar(r[c]) ? scalar(r[c]) : <span className="text-muted">nested</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && (
        <button type="button" className="mt-1 inline-flex min-h-[44px] items-center text-xs font-medium text-accent hover:underline md:min-h-0" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer rows" : `Show all ${rows.length} rows`}
        </button>
      )}
    </>
  );
}

/** Nested evaluation metrics as small tables: scalars as key/value rows, arrays of records as a table (never a JSON dump). */
export function MetricsDetails({ metrics, depth = 0 }: { metrics: Rec; depth?: number }) {
  const entries = Object.entries(metrics);
  const scalars = entries.filter(([, v]) => isScalar(v) && !(typeof v === "string" && v.length > 60));
  const notes = entries.filter(([, v]) => typeof v === "string" && v.length > 60);
  const nested = entries.filter(([, v]) => !isScalar(v));
  if (entries.length === 0) return <p className="text-xs text-muted">No metrics were recorded.</p>;
  return (
    <div className="space-y-3" data-testid="metrics-details">
      {scalars.length > 0 && <Rows rows={scalars} />}
      {notes.map(([k, v]) => (
        <p key={k} className="break-words text-xs text-muted">
          <span className="font-semibold text-soft">{titleCase(k)}: </span>
          {String(v)}
        </p>
      ))}
      {nested.map(([k, v]) => (
        <div key={k}>
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">{titleCase(k)}</div>
          {Array.isArray(v) ? (
            v.length === 0 ? (
              <p className="text-xs text-muted">Empty.</p>
            ) : v.every(isObj) ? (
              <ObjTable rows={v as Rec[]} />
            ) : (
              <ul className="space-y-0.5 text-xs text-soft">
                {v.slice(0, 12).map((x, i) => (
                  <li key={i} className="break-words">· {isScalar(x) ? String(x) : "nested value"}</li>
                ))}
                {v.length > 12 && <li className="text-muted">… {v.length - 12} more</li>}
              </ul>
            )
          ) : isObj(v) ? (
            Array.isArray(v.rows) && (v.rows as unknown[]).every(isObj) ? (
              <>
                <ObjTable rows={v.rows as Rec[]} />
                {Object.keys(v).length > 1 && depth < 2 && <MetricsDetails metrics={Object.fromEntries(Object.entries(v).filter(([kk]) => kk !== "rows"))} depth={depth + 1} />}
              </>
            ) : Object.values(v).every(isScalar) ? (
              <Rows rows={Object.entries(v)} />
            ) : depth < 2 ? (
              <MetricsDetails metrics={v} depth={depth + 1} />
            ) : (
              <p className="text-xs text-muted">Nested data with {Object.keys(v).length} keys.</p>
            )
          ) : null}
        </div>
      ))}
    </div>
  );
}

function passBadge(passed: boolean | null | undefined) {
  if (passed === null || passed === undefined) return <span className="text-xs text-muted">Not evaluated</span>;
  return <Badge tone={passed ? "accent" : "bad"}>{passed ? "Passed" : "Did not pass"}</Badge>;
}

function Headline({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-[4.5rem]">
          <dt className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</dt>
          <dd className="text-sm font-semibold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One compact card per model: headline numbers visible, everything else behind "Details". */
export function ModelsTable({ rows }: { rows: ModelItem[] }) {
  return (
    <ul className="space-y-2" data-testid="models-list">
      {rows.map((m) => {
        const e = m.latest_evaluation;
        const limits = Array.isArray(m.limitations) ? m.limitations.join("; ") : m.limitations;
        return (
          <li key={m.id} className="rounded-md bg-raised/40 p-3" data-testid="registry-item">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-sm font-semibold text-ink">{m.name}</span>
                  <span className="num text-xs text-muted">{m.version}</span>
                  <span className="text-xs text-muted">{titleCase(m.family)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
                  <StatusBadge value={m.status} />
                  {passBadge(e?.passed)}
                </div>
              </div>
              <Headline items={[["Sample", e ? <span className="num">n={fmtInt(e.n_obs)}</span> : <NA />], ...headlines(e?.metrics)]} />
            </div>
            <Collapsible title="Details" className="mt-2 bg-bg/40" testId="registry-details">
              <dl className="mb-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                {(
                  [
                    ["Training period", m.training_period],
                    ["Calibration period", m.calibration_period],
                    ["Evaluation period", m.evaluation_period],
                    ["Promoted", m.promoted_at ? `${m.promoted_by ?? "—"} · ${fmtDateTimeET(m.promoted_at)}` : "Not promoted"],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-3 border-b border-line/30 py-1">
                    <dt className="text-muted">{l}</dt>
                    <dd className="num text-right text-ink">{v ?? <NA />}</dd>
                  </div>
                ))}
              </dl>
              {limits && <p className="mb-3 break-words text-xs text-soft"><span className="font-semibold">Limitations: </span>{limits}</p>}
              {e ? <MetricsDetails metrics={e.metrics} /> : <p className="text-xs text-muted">This model has not been evaluated.</p>}
            </Collapsible>
          </li>
        );
      })}
    </ul>
  );
}

/** One compact card per backtest / experiment. */
export function BacktestsTable({ rows, caption = "Backtests" }: { rows: BacktestItem[]; caption?: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <>
      <ul className="space-y-2" aria-label={caption} data-testid="backtests-list">
        {shown.map((b) => (
          <li key={b.id} className="rounded-md bg-raised/40 p-3" data-testid="registry-item">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-sm font-semibold text-ink">{b.model_name}</span>
                  <span className="text-xs text-muted">
                    {titleCase(b.family)} · {titleCase(b.kind)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
                  {passBadge(b.passed)}
                  <span className="num text-xs text-muted">{fmtDateTimeET(b.created_at) ?? "—"}</span>
                </div>
              </div>
              <Headline items={[["Sample", b.n_obs === null ? <NA /> : <span className="num">n={fmtInt(b.n_obs)}</span>], ...headlines(b.metrics)]} />
            </div>
            <Collapsible title="Details" className="mt-2 bg-bg/40" testId="registry-details">
              <p className="mb-2 break-words text-xs text-soft">
                <span className="font-semibold">Period: </span>
                {b.period ?? "—"}
                {b.notes ? ` · ${b.notes}` : ""}
              </p>
              <MetricsDetails metrics={b.metrics} />
            </Collapsible>
          </li>
        ))}
      </ul>
      {rows.length > 12 && (
        <button type="button" className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline md:min-h-0" aria-expanded={all} onClick={() => setAll((v) => !v)} data-testid="registry-more">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </>
  );
}
