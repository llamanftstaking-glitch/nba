"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { SectionTitle } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { CONCEPT_KINDS, cortex, kindLabel, VERIFICATION_LABELS, type CortexOverview } from "@/lib/cortex";
import { useDebounced } from "@/lib/use-debounced";
import { ConceptRow, FormulaBlock } from "./common";

const METHOD_TEXT: Record<string, string> = {
  all_words: "Keyword search: records containing every word.",
  any_word: "Keyword search: no record contains every word, so records containing any of the words are listed.",
  none: "Keyword search found no usable word in the query.",
};

/** The formula lives on the full record, so a statistics row reads its own record (cached per slug). */
function RowFormula({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ["cortex", "concept", slug], queryFn: () => cortex.concept(slug), staleTime: 5 * 60_000 });
  if (q.isPending) return <span className="mt-2 block text-xs text-muted">Loading formula…</span>;
  if (q.isError) return <span className="mt-2 block text-xs text-muted">Formula could not be loaded; open the record.</span>;
  if (!q.data.formula) return <span className="mt-2 block text-xs text-muted" data-testid="no-formula">No formula is recorded for this entry.</span>;
  return <FormulaBlock formula={q.data.formula} className="mt-2" />;
}

/** A bounded, paged list of records for one fixed kind (Playbook columns, Statistics lists). */
export function KindList({ kind, title, pageSize, formula = false, testId }: { kind: string; title: string; pageSize: number; formula?: boolean; testId: string }) {
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ["cortex", "concepts", { kind, pageSize, offset }], queryFn: () => cortex.concepts({ kind, limit: pageSize, offset }), placeholderData: keepPreviousData });
  return (
    <section data-testid={testId} data-kind={kind}>
      <SectionTitle right={q.data ? <span className="num" data-testid="kind-total">{q.data.total} records</span> : undefined}>{title}</SectionTitle>
      <div className="rounded-lg bg-card p-1.5 ring-1 ring-inset ring-line/60">
        <QueryView query={q} rows={5}>
          {(d) =>
            d.items.length === 0 ? (
              <EmptyState title={`No ${title.toLowerCase()} records in the library yet.`}>Records appear here as they are written. Nothing is filled in to make this list look complete.</EmptyState>
            ) : (
              <>
                <ul className="divide-y divide-line/30">
                  {d.items.map((c) => (
                    <ConceptRow key={c.slug} c={c} extra={formula ? <RowFormula slug={c.slug} /> : undefined} />
                  ))}
                </ul>
                <div className="px-3 pb-2">
                  <Pagination offset={offset} limit={pageSize} total={d.total} onChange={setOffset} />
                </div>
              </>
            )
          }
        </QueryView>
      </div>
    </section>
  );
}

const PAGE = 30;

/** Encyclopedia: keyword search plus department / kind / verification filters, 30 records per page. */
export function Encyclopedia({ overview, department, onDepartment }: { overview: CortexOverview | undefined; department: string; onDepartment: (d: string) => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("");
  const [verification, setVerification] = useState("");
  const [offset, setOffset] = useState(0);
  const search = useDebounced(text.trim(), 300);
  useEffect(() => setOffset(0), [search, kind, verification, department]);
  const filters = { q: search, department, kind, verification, limit: PAGE, offset };
  const q = useQuery({ queryKey: ["cortex", "concepts", filters], queryFn: () => cortex.concepts(filters), placeholderData: keepPreviousData });
  const filtered = Boolean(search || department || kind || verification);
  return (
    <div className="space-y-4" data-testid="encyclopedia">
      <div className="grid gap-3 rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Search the library">
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
            <Input type="search" name="cortex_q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Keywords, for example: shot clock" className="pl-9" />
          </span>
        </Field>
        <Field label="Department">
          <Select name="cortex_department" value={department} onChange={(e) => onDepartment(e.target.value)}>
            <option value="">All departments</option>
            {(overview?.departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.id}. {d.name} ({d.records})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kind">
          <Select name="cortex_kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {CONCEPT_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Verification">
          <Select name="cortex_verification" value={verification} onChange={(e) => setVerification(e.target.value)}>
            <option value="">Any</option>
            {Object.entries(VERIFICATION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <QueryView query={q} rows={8}>
        {(d) => (
          <div>
            <p className="mb-2 text-sm text-muted" data-testid="concept-count" data-total={d.total} data-mode={d.mode} data-method={d.method ?? ""}>
              <span className="num font-semibold text-ink">{d.total}</span> {d.total === 1 ? "record" : "records"}
              {d.mode === "search" ? ` for “${d.query ?? search}”. ${METHOD_TEXT[d.method ?? ""] ?? ""}` : filtered ? " match the filters." : " in the library."}
            </p>
            {d.items.length === 0 ? (
              <EmptyState title={d.mode === "search" ? "No record matches this search." : "No record matches these filters."} icon={Search}>
                The library holds only what has been written. Search is by keyword, not by meaning, so try the plain term a rulebook or box score would use.
              </EmptyState>
            ) : (
              <div className="rounded-lg bg-card p-1.5 ring-1 ring-inset ring-line/60">
                <ul className="divide-y divide-line/30" data-testid="concept-list">
                  {d.items.map((c) => (
                    <ConceptRow key={c.slug} c={c} />
                  ))}
                </ul>
                <div className="px-3 pb-2">
                  <Pagination offset={offset} limit={PAGE} total={d.total} onChange={setOffset} />
                </div>
              </div>
            )}
          </div>
        )}
      </QueryView>
    </div>
  );
}

export function Playbook() {
  return (
    <div className="space-y-3" data-testid="playbook">
      <p className="max-w-3xl text-sm text-muted">Offensive and defensive records from the library. These are written descriptions; no play-type, tracking or film data is held, so nothing here says how often a team runs an action.</p>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <KindList kind="offense" title="Offense" pageSize={12} testId="playbook-offense" />
        <KindList kind="defense" title="Defense" pageSize={12} testId="playbook-defense" />
      </div>
    </div>
  );
}

export function Statistics() {
  return (
    <div className="space-y-3" data-testid="statistics">
      <p className="max-w-3xl text-sm text-muted">Statistic definitions and research methods, each with its recorded formula. A formula is shown exactly as written in the record.</p>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <KindList kind="statistic" title="Statistics" pageSize={10} formula testId="statistics-statistic" />
        <KindList kind="method" title="Methods" pageSize={10} formula testId="statistics-method" />
      </div>
    </div>
  );
}
