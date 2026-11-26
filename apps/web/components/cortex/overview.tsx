"use client";

import { BookOpen, FileSearch, FlaskConical, Library, ShieldAlert, UserSquare2, Users } from "lucide-react";
import { Tile } from "@/components/summary";
import { NA } from "@/components/ui/na";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { fmtDateTimeET, fmtInt, titleCase } from "@/lib/format";
import { kindLabel, type CortexOverview } from "@/lib/cortex";
import { PlainList } from "./common";

/** Checked against a source vs authored and not checked, as one two-part bar with the exact numbers. */
export function VerificationSplit({ o }: { o: CortexOverview }) {
  const total = o.records_checked_against_a_source + o.records_authored_not_checked;
  const pct = total > 0 ? (o.records_checked_against_a_source / total) * 100 : 0;
  return (
    <div data-testid="verification-split">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line/70" role="img" aria-label={`${o.records_checked_against_a_source} records checked against a source, ${o.records_authored_not_checked} authored and not checked`}>
        {total > 0 && <div className="h-full bg-accent" style={{ width: `${pct}%` }} />}
        {total > 0 && <div className="h-full bg-warn" style={{ width: `${100 - pct}%` }} />}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-sm bg-accent" aria-hidden /> Checked against a source
          </dt>
          <dd className="num text-lg font-semibold text-ink" data-testid="count-checked">{fmtInt(o.records_checked_against_a_source)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-sm bg-warn" aria-hidden /> Authored, not checked
          </dt>
          <dd className="num text-lg font-semibold text-ink" data-testid="count-not-checked">{fmtInt(o.records_authored_not_checked)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function NotBuilt({ items }: { items: string[] }) {
  return (
    <Panel title="Not built" icon={ShieldAlert} tone="warn">
      <p className="mb-2 text-sm text-muted">Capabilities this library does not have. They are listed so that nothing on these pages is read as more than it is.</p>
      {items.length === 0 ? <p className="text-sm text-soft">The server lists nothing here.</p> : <PlainList items={items} testId="not-built" tone="warn" />}
    </Panel>
  );
}

export function Overview({ o, onDepartment }: { o: CortexOverview; onDepartment: (id: number) => void }) {
  const findings = Object.entries(o.research_findings ?? {});
  const totalFindings = findings.reduce((a, [, n]) => a + n, 0);
  return (
    <div className="space-y-5" data-testid="cortex-overview">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="cortex-tiles">
        <Tile label="Knowledge records" icon={BookOpen} sub={`season ${o.season}`}>
          <span data-testid="count-records">{fmtInt(o.knowledge_records)}</span>
        </Tile>
        <Tile label="Sources indexed" icon={Library} sub={<span data-testid="count-sources-opened">{fmtInt(o.sources_opened_by_author)} opened by the author</span>}>
          <span data-testid="count-sources">{fmtInt(o.sources_indexed)}</span>
        </Tile>
        <Tile label="Player profiles" icon={UserSquare2} sub="computed from stored box scores">
          <span data-testid="count-players">{fmtInt(o.player_profiles_available)}</span>
        </Tile>
        <Tile label="Team profiles" icon={Users} sub="this season to date">
          <span data-testid="count-teams">{fmtInt(o.team_profiles_available)}</span>
        </Tile>
        <Tile label="Coaching profiles" icon={Users} tone={o.coaching_profiles_available === 0 ? "warn" : undefined} sub={<span className="whitespace-normal font-sans" data-testid="coaching-note">{o.coaching_note}</span>}>
          <span data-testid="count-coaching">{fmtInt(o.coaching_profiles_available)}</span>
        </Tile>
        <Tile label="Research findings" icon={FlaskConical} sub={totalFindings === 0 ? "none recorded" : findings.map(([k, n]) => `${n} ${k}`).join(" · ")}>
          <span data-testid="count-findings">{fmtInt(totalFindings)}</span>
        </Tile>
        <Tile label="Unresolved hypotheses" icon={FlaskConical} sub="open findings are hypotheses, not knowledge">
          <span data-testid="count-unresolved">{fmtInt(o.unresolved_hypotheses)}</span>
        </Tile>
        <Tile label="Last knowledge update" icon={FileSearch} sub={`${fmtInt(o.retrievals_logged)} library searches logged`}>
          <span className="text-[15px] leading-7" data-testid="last-update">{fmtDateTimeET(o.last_knowledge_update) ?? <NA />}</span>
        </Tile>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="Verification of the records" icon={FileSearch}>
          <VerificationSplit o={o} />
          <p className="mt-3 text-xs text-muted">“Checked against a source” means the author compared the record with the cited source. “Authored, not checked” means it was written without that comparison and should be read with that in mind.</p>
        </Panel>
        <Panel title="Records by kind" icon={BookOpen}>
          {Object.keys(o.by_kind ?? {}).length === 0 ? (
            <p className="text-sm text-soft">No records yet.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3" data-testid="by-kind">
              {Object.entries(o.by_kind).map(([k, n]) => (
                <div key={k} className="flex items-baseline justify-between gap-2 border-b border-line/30 pb-1">
                  <dt className="text-sm text-soft">{kindLabel(k)}</dt>
                  <dd className="num text-sm font-semibold text-ink">{fmtInt(n)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      </div>

      <section>
        <SectionTitle right={<span className="num">{o.departments.length} departments</span>}>Departments</SectionTitle>
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-testid="departments">
          {o.departments.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onDepartment(d.id)}
                className="flex min-h-[64px] w-full items-center gap-3 rounded-lg bg-card px-3.5 py-2.5 text-left ring-1 ring-inset ring-line/60 hover:ring-accent/50"
                data-testid="department-card"
                data-department={d.id}
                data-records={d.records}
              >
                <span className="num w-7 shrink-0 font-display text-xl font-semibold text-muted">{String(d.id).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 break-words text-sm font-medium text-ink">{d.name}</span>
                <span className="shrink-0 text-right">
                  <span className={`num block text-lg font-semibold leading-5 ${d.records === 0 ? "text-muted" : "text-ink"}`}>{fmtInt(d.records)}</span>
                  <span className="block text-2xs uppercase tracking-wide text-muted">{d.records === 1 ? "record" : "records"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <NotBuilt items={o.not_built ?? []} />
      {findings.length > 0 && (
        <p className="text-xs text-muted">
          Research findings by status: {findings.map(([k, n]) => `${titleCase(k)} ${n}`).join(" · ")}.
        </p>
      )}
    </div>
  );
}
