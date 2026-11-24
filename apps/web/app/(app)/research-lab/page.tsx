"use client";

import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/classification-badge";
import { BacktestsTable } from "@/components/registry-tables";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { BulletList, PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { fmtDateTimeET, fmtInt } from "@/lib/format";
import type { Finding } from "@/lib/types";

type Pair = { a: string; b: string; rho: number; n: number };
const PAIR_COLUMNS: Column<Pair>[] = [
  { key: "a", header: "A", primary: true, cell: (r) => <span className="text-ink">{r.a}</span> },
  { key: "b", header: "B", primary: true, cell: (r) => <span className="text-ink">× {r.b}</span> },
  { key: "rho", header: "ρ", align: "right", cell: (r) => <span className="num">{r.rho > 0 ? "+" : ""}{r.rho.toFixed(3)}</span> },
  { key: "n", header: "Sample", align: "right", cell: (r) => <span className="num">n={fmtInt(r.n)}</span> },
];

function FindingCard({ f }: { f: Finding }) {
  return (
    <article className="rounded-md bg-raised/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 break-words text-sm font-medium text-ink">{f.hypothesis}</h3>
        <StatusBadge value={f.status} />
      </div>
      <p className="num mt-0.5 text-2xs text-muted">
        {f.finding_uid} · {fmtDateTimeET(f.created_at) ?? "—"} · sample {f.sample_size === null ? <Val v={null} /> : `n=${fmtInt(f.sample_size)}`}
      </p>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Supporting</h4>
          {f.supporting.length ? <BulletList items={f.supporting} tone="accent" /> : <p className="text-xs text-muted">None recorded.</p>}
        </div>
        <div>
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Contradicting</h4>
          {f.contradicting.length ? <BulletList items={f.contradicting} tone="warn" /> : <p className="text-xs text-muted">None recorded.</p>}
        </div>
      </div>
      <dl className="mt-2 grid gap-2 text-xs md:grid-cols-3">
        {(
          [
            ["Proposed experiment", f.proposed_experiment],
            ["Result", f.result],
            ["Limitations", f.limitations],
          ] as const
        ).map(([label, v]) => (
          <div key={label}>
            <dt className="text-2xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="break-words text-soft">{v ?? <Val v={null} />}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export default function ResearchLabPage() {
  const q = useQuery({ queryKey: ["research-lab"], queryFn: api.researchLab });
  return (
    <div>
      <PageHeader title="Research Lab" sub="Hypotheses, experiments and correlation estimates. Findings are provisional until an experiment supports them." />
      <QueryView query={q} rows={6}>
        {(d) => (
          <div className="space-y-4">
            <Panel title="Findings" right={<span className="num">{d.findings.length}</span>} bodyClassName="space-y-2 p-3">
              {d.findings.length === 0 ? <EmptyState title="No research findings have been recorded." /> : d.findings.map((f) => <FindingCard key={f.finding_uid} f={f} />)}
            </Panel>
            <Panel title="Experiments" right={<span className="num">{d.experiments.length}</span>}>
              {d.experiments.length === 0 ? <EmptyState title="No experiments have been run." /> : <BacktestsTable rows={d.experiments} caption="Experiments" />}
            </Panel>
            <Panel title="Correlation pairs">
              {!d.correlation ? (
                <EmptyState title="Correlation estimates are not available." />
              ) : (
                <>
                  {d.correlation.pairs.length === 0 ? (
                    <EmptyState title="No correlation pairs have been estimated." />
                  ) : (
                    <DataTable columns={PAIR_COLUMNS} rows={d.correlation.pairs} rowKey={(_, i) => i} caption="Correlation pairs" dense />
                  )}
                  {d.correlation.notes.length > 0 && (
                    <div className="mt-2">
                      <BulletList items={d.correlation.notes} />
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>
        )}
      </QueryView>
    </div>
  );
}
