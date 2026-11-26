"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, ExternalLink, FlaskConical, Library, Terminal } from "lucide-react";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Collapsible } from "@/components/ui/collapsible";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NA } from "@/components/ui/na";
import { Label, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState, QueryView } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import { asList, cortex, kindLabel, sourceWasOpened, type BenchmarkRun, type CortexOverview, type CortexSource, type Finding } from "@/lib/cortex";
import { fmtDate, fmtDateTimeET, fmtInt, fmtNum, titleCase } from "@/lib/format";
import { PlainList } from "./common";
import { NotBuilt, VerificationSplit } from "./overview";

/* ------------------------------------------------------------------ research journal */
const STATUS_TONE: Record<string, "warn" | "accent" | "bad" | "neutral"> = { open: "warn", supported: "accent", rejected: "bad", inconclusive: "neutral" };
const STATUSES = ["", "open", "supported", "rejected", "inconclusive"];

function FindingCard({ f }: { f: Finding }) {
  const limits = asList(f.limitations);
  return (
    <li className="rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60" data-testid="finding" data-status={f.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 break-words text-[15px] font-semibold text-ink">{f.hypothesis}</p>
        <Badge tone={STATUS_TONE[f.status] ?? "neutral"}>{f.status === "open" ? "Open hypothesis" : titleCase(f.status)}</Badge>
      </div>
      <p className="num mt-1 text-xs text-muted">
        Sample size: {f.sample_size === null || f.sample_size === undefined ? "not recorded" : f.sample_size}
        {f.source ? ` · from ${f.source}` : ""}
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div data-testid="finding-supporting">
          <Label>Supporting ({f.supporting.length})</Label>
          {f.supporting.length ? <PlainList items={f.supporting} /> : <p className="text-sm text-muted">None recorded.</p>}
        </div>
        <div data-testid="finding-contradicting">
          <Label>Contradicting ({f.contradicting.length})</Label>
          {f.contradicting.length ? <PlainList items={f.contradicting} tone="warn" /> : <p className="text-sm text-muted">None recorded.</p>}
        </div>
      </div>
      <dl className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">Proposed experiment</dt>
          <dd className="break-words text-sm text-soft">{f.proposed_experiment ?? "Not recorded."}</dd>
        </div>
        <div>
          <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">Result</dt>
          <dd className="break-words text-sm text-soft">{f.result ?? "No result yet."}</dd>
        </div>
      </dl>
      {limits.length > 0 && (
        <div className="mt-3">
          <Label>Limitations</Label>
          <PlainList items={limits} />
        </div>
      )}
    </li>
  );
}

export function ResearchJournal({ status, onStatus }: { status: string; onStatus: (s: string) => void }) {
  const q = useQuery({ queryKey: ["cortex", "research", status], queryFn: () => cortex.research(status) });
  return (
    <div className="space-y-4" data-testid="research-journal">
      <Tabs label="Finding status" size="sm" scroll value={status} onChange={onStatus} items={STATUSES.map((s) => ({ id: s, label: s === "" ? "All" : titleCase(s) }))} />
      <QueryView query={q} rows={4}>
        {(d) => (
          <>
            <p className="rounded-md bg-raised/40 px-3 py-2.5 text-sm text-soft" data-testid="research-note">{d.note}</p>
            {d.items.length === 0 ? (
              <EmptyState title={status ? `No findings with the status “${status}”.` : "No research findings have been recorded yet."} icon={FlaskConical}>
                Findings are written by the research agents and experiments. Until one is recorded this journal stays empty.
              </EmptyState>
            ) : (
              <ul className="space-y-3" data-testid="findings">
                {d.items.map((f) => (
                  <FindingCard key={f.uid} f={f} />
                ))}
              </ul>
            )}
          </>
        )}
      </QueryView>
    </div>
  );
}

/* ------------------------------------------------------------------ sources */
function AccessResult({ s }: { s: CortexSource }) {
  const opened = sourceWasOpened(s.access_result);
  return (
    <span className="block min-w-0" data-testid="access-result" data-opened={opened ? "1" : "0"}>
      <StatusDot tone={opened ? "accent" : "warn"} className={opened ? undefined : "font-semibold text-warn"}>
        {opened ? "Opened and read" : s.access_result ? titleCase(s.access_result.split("(")[0]?.trim() ?? s.access_result) : "Not recorded"}
      </StatusDot>
      {s.access_result && s.access_result.includes("(") && <span className="mt-0.5 block whitespace-normal break-words text-xs text-muted">{s.access_result.slice(s.access_result.indexOf("("))}</span>}
    </span>
  );
}

export function Sources() {
  const q = useQuery({ queryKey: ["cortex", "sources"], queryFn: cortex.sources });
  const columns: Column<CortexSource>[] = [
    {
      key: "title",
      header: "Source",
      primary: true,
      cell: (s) =>
        s.url ? (
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 break-words font-medium text-ink hover:text-accent hover:underline" data-testid="source-link">
            <span className="min-w-0 break-words">{s.title}</span>
            <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-muted" aria-hidden />
          </a>
        ) : (
          <span className="font-medium text-ink">{s.title}</span>
        ),
    },
    { key: "publisher", header: "Publisher", cell: (s) => s.publisher ?? <NA /> },
    { key: "league", header: "League", cell: (s) => s.league ?? <NA /> },
    { key: "kind", header: "Kind", cell: (s) => s.kind ?? <NA /> },
    { key: "reliability", header: "Reliability", cell: (s) => s.reliability ?? <NA /> },
    { key: "permission", header: "Permission note", cell: (s) => <span className="text-xs">{s.permission ?? <NA />}</span> },
    { key: "accessed", header: "Accessed", cell: (s) => <span className="num whitespace-nowrap">{fmtDate(s.accessed, { year: true }) ?? <NA />}</span> },
    { key: "access", header: "Access result", cell: (s) => <AccessResult s={s} /> },
    { key: "citing", header: "Records citing", align: "right", cell: (s) => <span className="num" data-testid="records-citing">{fmtInt(s.records_citing)}</span> },
  ];
  return (
    <div className="space-y-3" data-testid="sources">
      <QueryView query={q} rows={8} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No sources have been indexed yet." icon={Library} />}>
        {(d) => {
          const opened = d.items.filter((s) => sourceWasOpened(s.access_result)).length;
          return (
            <>
              <p className="text-sm text-muted" data-testid="sources-count" data-total={d.items.length}>
                <span className="num font-semibold text-ink">{d.items.length}</span> sources indexed · <span className="num font-semibold text-ink">{opened}</span> opened and read · <span className="num font-semibold text-ink">{d.items.length - opened}</span> not opened. A source is cited by link; its text is not reproduced.
              </p>
              <Panel bodyClassName="p-3">
                <DataTable columns={columns} rows={d.items} rowKey={(s) => s.key} caption="Knowledge sources" mobileLimit={8} />
              </Panel>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}

/* ------------------------------------------------------------------ coverage */
export function Coverage({ o }: { o: CortexOverview }) {
  const max = Math.max(1, ...o.departments.map((d) => d.records));
  const kinds = Object.entries(o.by_kind ?? {});
  const kindMax = Math.max(1, ...kinds.map(([, n]) => n));
  const empty = o.departments.filter((d) => d.records === 0).length;
  return (
    <div className="space-y-5" data-testid="coverage">
      <Panel title="Records by department" icon={BookOpen} right={<span className="num" data-testid="coverage-empty">{empty} of {o.departments.length} departments have no records</span>}>
        <ul className="space-y-2" data-testid="coverage-departments">
          {o.departments.map((d) => (
            <li key={d.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[1.75rem_minmax(0,16rem)_minmax(0,1fr)_3rem]" data-testid="coverage-row" data-department={d.id} data-records={d.records}>
              <span className="num text-muted">{d.id}</span>
              <span className="min-w-0 break-words text-soft">{d.name}</span>
              <span className="col-span-3 order-last h-1.5 overflow-hidden rounded-full bg-line/70 sm:order-none sm:col-span-1" role="img" aria-label={`${d.name}: ${d.records} records`}>
                <span className="block h-full rounded-full bg-info" style={{ width: `${(d.records / max) * 100}%` }} />
              </span>
              <span className={`num text-right font-semibold ${d.records === 0 ? "text-muted" : "text-ink"}`}>{fmtInt(d.records)}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel title="Records by kind" icon={BookOpen}>
          {kinds.length === 0 ? (
            <p className="text-sm text-soft">No records yet.</p>
          ) : (
            <ul className="space-y-2" data-testid="coverage-kinds">
              {kinds.map(([k, n]) => (
                <li key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
                  <span className="text-soft">{kindLabel(k)}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-line/70" role="img" aria-label={`${kindLabel(k)}: ${n} records`}>
                    <span className="block h-full rounded-full bg-teal" style={{ width: `${(n / kindMax) * 100}%` }} />
                  </span>
                  <span className="num text-right font-semibold text-ink">{fmtInt(n)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Verification" icon={BookOpen}>
          <VerificationSplit o={o} />
        </Panel>
      </div>
      <Panel title="What our data can observe" icon={Library}>
        <p className="text-sm text-soft">
          Each record lists what the platform’s own data can show for that topic and what it cannot see. Those lists are part of the record page; the server does not publish a library-wide summary of them, so none is shown here.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">Player profiles</dt>
            <dd className="num text-lg font-semibold text-ink">{fmtInt(o.player_profiles_available)}</dd>
          </div>
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">Team profiles</dt>
            <dd className="num text-lg font-semibold text-ink">{fmtInt(o.team_profiles_available)}</dd>
          </div>
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">Coaching profiles</dt>
            <dd className="num text-lg font-semibold text-ink">{fmtInt(o.coaching_profiles_available)}</dd>
          </div>
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">Sources opened</dt>
            <dd className="num text-lg font-semibold text-ink">
              {fmtInt(o.sources_opened_by_author)} of {fmtInt(o.sources_indexed)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">{o.coaching_note}</p>
      </Panel>
      <NotBuilt items={o.not_built ?? []} />
    </div>
  );
}

/* ------------------------------------------------------------------ evaluations */
function CountTable({ title, data, testId }: { title: string; data: Record<string, number>; testId: string }) {
  const rows = Object.entries(data ?? {});
  return (
    <div data-testid={testId}>
      <Label>{title}</Label>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">None.</p>
      ) : (
        <dl className="divide-y divide-line/30">
          {rows.map(([k, n]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 py-1 text-sm">
              <dt className="min-w-0 break-words text-soft">{titleCase(k)}</dt>
              <dd className="num font-semibold text-ink">{fmtInt(n)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const missText = (m: unknown): string => (typeof m === "string" ? m : JSON.stringify(m));

function RunCard({ r }: { r: BenchmarkRun }) {
  const misses = r.misses ?? [];
  return (
    <li className="rounded-md bg-raised/30 px-3 py-2.5" data-testid="benchmark-run">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 xl:grid-cols-7">
        {(
          [
            ["Kind", titleCase(r.kind)],
            ["Split", r.split ? titleCase(r.split) : null],
            ["Model", r.model],
            ["Questions", r.n === null ? null : fmtInt(r.n)],
            ["Score", r.score === null ? null : `${fmtNum(r.score * 100, 1)}%`],
            ["Cost", r.cost_usd === null ? null : `$${r.cost_usd.toFixed(4)}`],
            ["Run at", fmtDateTimeET(r.created_at)],
          ] as [string, string | null][]
        ).map(([label, v]) => (
          <div key={label} className="min-w-0">
            <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
            <dd className="num break-words text-sm font-medium text-ink" data-run-field={label}>{v ?? <NA />}</dd>
          </div>
        ))}
      </dl>
      {misses.length > 0 && (
        <Collapsible title={`${misses.length} missed`} className="mt-2" testId="run-misses">
          <ul className="space-y-1 px-3 pb-3">
            {misses.slice(0, 50).map((m, i) => (
              <li key={i} className="break-words font-mono text-xs text-soft">{missText(m)}</li>
            ))}
            {misses.length > 50 && <li className="text-xs text-muted">Showing the first 50 of {misses.length}.</li>}
          </ul>
        </Collapsible>
      )}
    </li>
  );
}

export function Evaluations() {
  const q = useQuery({ queryKey: ["cortex", "benchmark"], queryFn: cortex.benchmark, retry: false });
  if (q.isPending) return <LoadingState rows={6} />;
  if (q.isError && q.error instanceof ApiError && q.error.status === 403) {
    return (
      <div role="alert" className="rounded-lg bg-card p-5 ring-1 ring-inset ring-warn/40" data-testid="evaluations-forbidden">
        <p className="font-display text-lg font-semibold uppercase tracking-wide text-warn">Owner access required</p>
        <p className="mt-1 text-sm text-soft">{q.error.message}</p>
      </div>
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const pct = d.target > 0 ? Math.min(100, (d.questions / d.target) * 100) : 0;
  return (
    <div className="space-y-5" data-testid="evaluations">
      <div className="rounded-lg bg-card p-4 ring-1 ring-inset ring-warn/40" data-testid="benchmark-note">
        <p className="font-display text-[17px] font-semibold uppercase tracking-wide text-warn">
          Reviewed by a person: <span className="num" data-testid="reviewed">{fmtInt(d.reviewed_by_a_person)} of {fmtInt(d.questions)}</span>
        </p>
        <p className="mt-1 break-words text-sm text-soft" data-testid="benchmark-note-text">{d.note}</p>
      </div>
      <Panel title="Benchmark size" icon={BookOpen}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="num text-2xl font-semibold text-ink" data-testid="benchmark-questions">{fmtInt(d.questions)}</span>
          <span className="num text-sm text-muted">target {fmtInt(d.target)} questions</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line/70" role="img" aria-label={`${d.questions} of ${d.target} questions written`}>
          <div className="h-full rounded-full bg-info" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          <CountTable title="By category" data={d.by_category} testId="benchmark-by-category" />
          <CountTable title="By type" data={d.by_type} testId="benchmark-by-type" />
          <CountTable title="By split" data={d.by_split} testId="benchmark-by-split" />
        </div>
      </Panel>
      <Panel title="Runs" icon={FlaskConical} right={<span className="num">{d.runs.length}</span>}>
        {d.runs.length === 0 ? (
          <p className="text-sm text-soft" data-testid="no-runs">No benchmark run has been recorded. There is no score to show.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted">Scores are provisional while the answer keys are unreviewed.</p>
            <ul className="space-y-2" data-testid="benchmark-runs">
              {d.runs.slice(0, 20).map((r) => (
                <RunCard key={r.id} r={r} />
              ))}
            </ul>
            {d.runs.length > 20 && <p className="mt-2 text-xs text-muted">Showing the 20 most recent of {d.runs.length} runs.</p>}
          </>
        )}
      </Panel>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel title="Recent library searches" icon={Library} right={<span className="num">{d.recent_retrievals.length}</span>}>
          {d.recent_retrievals.length === 0 ? (
            <p className="text-sm text-soft">No search has been logged.</p>
          ) : (
            <ul className="divide-y divide-line/30" data-testid="retrievals">
              {d.recent_retrievals.slice(0, 15).map((r, i) => (
                <li key={i} className="py-2 text-sm" data-testid="retrieval">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-ink">“{r.query}”</span>
                    <span className="num text-xs text-muted">{fmtDateTimeET(r.at) ?? ""}</span>
                  </div>
                  <p className="num mt-0.5 break-words text-xs text-muted">
                    {r.returned.length === 0 ? "returned nothing" : `returned ${r.returned.length}: ${r.returned.slice(0, 4).join(", ")}${r.returned.length > 4 ? "…" : ""}`} · {r.method.replace(/_/g, " ")}
                    {r.ms !== null ? ` · ${r.ms} ms` : ""}
                    {r.caller ? ` · ${r.caller}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Sample questions" icon={BookOpen} right={<span className="num">{d.sample_questions.length}</span>}>
          {d.sample_questions.length === 0 ? (
            <p className="text-sm text-soft">No sample questions were returned.</p>
          ) : (
            <ul className="space-y-3" data-testid="sample-questions">
              {d.sample_questions.slice(0, 8).map((s) => (
                <li key={s.id} className="text-sm">
                  <p className="num text-2xs font-semibold uppercase tracking-wide text-muted">
                    {s.id} · {titleCase(s.category)} · {titleCase(s.type)}
                  </p>
                  <p className="break-words text-ink">{s.question}</p>
                  {s.choices && s.choices.length > 0 && <p className="mt-0.5 break-words text-xs text-muted">{s.choices.join(" · ")}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <Panel title="How to run" icon={Terminal}>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-bg px-3 py-2 font-mono text-[13px] leading-5 text-soft ring-1 ring-inset ring-line/60" data-testid="how-to-run">{d.how_to_run}</pre>
        <p className="mt-2 text-xs text-muted">These are commands for the server. Nothing on this page starts a run.</p>
      </Panel>
    </div>
  );
}
