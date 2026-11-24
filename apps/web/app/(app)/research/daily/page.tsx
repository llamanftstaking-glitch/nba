"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ComboCard } from "@/components/combo-card";
import { SelectionList } from "@/components/selection-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { BulletList, PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSelectedDate } from "@/lib/date";
import { classLabel, fmtDateTimeET, fmtPct, titleCase } from "@/lib/format";
import type { EditionDetail, EditionListItem } from "@/lib/types";

function editionLabel(e: { kind: string; version: number; published_at: string }): string {
  return `${titleCase(e.kind)} v${e.version} · ${fmtDateTimeET(e.published_at) ?? "—"}`;
}

function Counts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return <span className="text-xs text-muted">No counts recorded</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {entries.map(([k, v]) => (
        <span key={k}>
          <span className="text-muted">{titleCase(k)} </span>
          <span className="num text-ink">{v}</span>
        </span>
      ))}
    </span>
  );
}

type DiffRow = { kind: "added" | "removed" | "changed"; label: string; detail: string };

function computeDiff(from: EditionDetail, to: EditionDetail): { selections: DiffRow[]; combos: DiffRow[] } {
  const selections: DiffRow[] = [];
  const a = new Map(from.selections.map((s) => [s.key, s]));
  const b = new Map(to.selections.map((s) => [s.key, s]));
  for (const [k, s] of b) {
    const prev = a.get(k);
    if (!prev) {
      selections.push({ kind: "added", label: s.market_label, detail: `${classLabel(s.classification)} · ${fmtPct(s.prob) ?? "probability not available"}` });
      continue;
    }
    const parts: string[] = [];
    if (prev.classification !== s.classification) parts.push(`classification ${classLabel(prev.classification)} → ${classLabel(s.classification)}`);
    if (prev.prob !== s.prob) parts.push(`probability ${fmtPct(prev.prob) ?? "—"} → ${fmtPct(s.prob) ?? "—"}`);
    if (prev.line !== s.line) parts.push(`line ${prev.line ?? "—"} → ${s.line ?? "—"}`);
    if (prev.price_american !== s.price_american) parts.push(`price ${prev.price_american ?? "—"} → ${s.price_american ?? "—"}`);
    if (prev.invalidated !== s.invalidated) parts.push(s.invalidated ? "invalidated" : "no longer invalidated");
    if (parts.length) selections.push({ kind: "changed", label: s.market_label, detail: parts.join("; ") });
  }
  for (const [k, s] of a) if (!b.has(k)) selections.push({ kind: "removed", label: s.market_label, detail: `was ${classLabel(s.classification)}` });

  const combos: DiffRow[] = [];
  const sig = (legs: { label: string }[]) => legs.map((l) => l.label).sort().join(" | ");
  const ca = new Map(from.combos.map((c) => [sig(c.legs), c]));
  const cb = new Map(to.combos.map((c) => [sig(c.legs), c]));
  for (const [k, c] of cb) {
    const prev = ca.get(k);
    if (!prev) combos.push({ kind: "added", label: c.name, detail: c.legs.map((l) => l.label).join(" + ") });
    else {
      const parts: string[] = [];
      if (prev.classification !== c.classification) parts.push(`classification ${classLabel(prev.classification)} → ${classLabel(c.classification)}`);
      if (prev.joint_prob !== c.joint_prob) parts.push(`joint probability ${fmtPct(prev.joint_prob) ?? "—"} → ${fmtPct(c.joint_prob) ?? "—"}`);
      if (prev.invalidated !== c.invalidated) parts.push(c.invalidated ? "invalidated" : "no longer invalidated");
      if (parts.length) combos.push({ kind: "changed", label: c.name, detail: parts.join("; ") });
    }
  }
  for (const [k, c] of ca) if (!cb.has(k)) combos.push({ kind: "removed", label: c.name, detail: c.legs.map((l) => l.label).join(" + ") });
  return { selections, combos };
}

function DiffList({ rows, empty }: { rows: DiffRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line/40">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[auto_1fr] gap-x-2 py-1.5 text-xs">
          <Badge tone={r.kind === "added" ? "info" : r.kind === "removed" ? "bad" : "warn"}>{r.kind}</Badge>
          <div className="min-w-0">
            <div className="break-words font-medium text-ink">{r.label}</div>
            <div className="break-words text-muted">{r.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Diff({ fromId, toId }: { fromId: number; toId: number }) {
  const a = useQuery({ queryKey: ["edition", fromId], queryFn: () => api.edition(fromId) });
  const b = useQuery({ queryKey: ["edition", toId], queryFn: () => api.edition(toId) });
  const diff = useMemo(() => (a.data && b.data ? computeDiff(a.data, b.data) : null), [a.data, b.data]);
  if (fromId === toId) return <EmptyState title="Choose two different editions to compare." />;
  if (a.isPending || b.isPending) return <LoadingState rows={3} />;
  if (a.isError) return <ErrorState error={a.error} onRetry={() => void a.refetch()} />;
  if (b.isError) return <ErrorState error={b.error} onRetry={() => void b.refetch()} />;
  if (!diff) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="edition-diff">
      <div>
        <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Selections · {diff.selections.length} difference(s)</h3>
        <DiffList rows={diff.selections} empty="No selection differences between these editions." />
      </div>
      <div>
        <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Combinations · {diff.combos.length} difference(s)</h3>
        <DiffList rows={diff.combos} empty="No combination differences between these editions." />
      </div>
    </div>
  );
}

function FullEdition({ id }: { id: number }) {
  const q = useQuery({ queryKey: ["edition", id], queryFn: () => api.edition(id) });
  return (
    <QueryView query={q} rows={6}>
      {(e) => (
        <div className="space-y-4" data-testid="edition-full">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone="info">{titleCase(e.kind)}</Badge>
            <span className="num">v{e.version}</span>
            <span>published {fmtDateTimeET(e.published_at) ?? "—"}</span>
            <span className="num break-all" title="Content hash of the published edition">
              sha256 {e.content_sha256.slice(0, 16)}…
            </span>
          </div>
          <Counts counts={e.summary.counts} />
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Narrative</h3>
              {e.summary.narrative.length ? (
                <div className="space-y-1.5">
                  {e.summary.narrative.map((p, i) => (
                    <p key={i} className="break-words text-sm text-soft">
                      {p}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">No narrative recorded.</p>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Limitations</h3>
                {e.summary.limitations.length ? <BulletList items={e.summary.limitations} tone="warn" /> : <p className="text-xs text-muted">None recorded.</p>}
              </div>
              <div>
                <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Unresolved</h3>
                {e.summary.unresolved.length ? <BulletList items={e.summary.unresolved} tone="warn" /> : <p className="text-xs text-muted">None recorded.</p>}
              </div>
            </div>
          </div>
          <div>
            <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Rejected · {e.summary.rejected.length}</h3>
            {e.summary.rejected.length === 0 ? (
              <p className="text-xs text-muted">Nothing was rejected in this edition.</p>
            ) : (
              <ul className="divide-y divide-line/40 rounded-md bg-raised/40">
                {e.summary.rejected.map((r, i) => (
                  <li key={i} className="px-2 py-1.5 text-xs">
                    <div className="font-medium text-ink">{r.label}</div>
                    <div className="break-words text-bad">{r.reasons.join("; ") || "No reason recorded"}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Selections · {e.selections.length}</h3>
            {e.selections.length === 0 ? <EmptyState title="This edition contains no selections." /> : <SelectionList items={e.selections} />}
          </div>
          <div>
            <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Combinations · {e.combos.length}</h3>
            {e.combos.length === 0 ? (
              <EmptyState title="This edition contains no combinations." />
            ) : (
              <div className="space-y-2">
                {e.combos.map((c) => (
                  <ComboCard key={c.uid} combo={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </QueryView>
  );
}

function Editions({ items }: { items: EditionListItem[] }) {
  // API order is not specified; sort oldest → newest for a stable "from → to" comparison.
  const sorted = useMemo(() => [...items].sort((x, y) => x.published_at.localeCompare(y.published_at)), [items]);
  const latest = sorted[sorted.length - 1]!;
  const previous = sorted[sorted.length - 2] ?? latest;
  const [fromId, setFromId] = useState(previous.id);
  const [toId, setToId] = useState(latest.id);
  const [viewId, setViewId] = useState(latest.id);
  useEffect(() => {
    setFromId(previous.id);
    setToId(latest.id);
    setViewId(latest.id);
  }, [previous.id, latest.id]);

  return (
    <div className="space-y-4">
      <Panel title="Editions for this date" right={<span className="num">{sorted.length}</span>}>
        <ul className="space-y-2">
          {[...sorted].reverse().map((e) => (
            <li key={e.id} className={cn("rounded border bg-bg/40 p-2", e.id === viewId ? "border-info/60" : "border-line")} data-testid="edition-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{titleCase(e.kind)}</Badge>
                  <span className="num text-sm text-ink">v{e.version}</span>
                  <span className="num text-xs text-muted">{fmtDateTimeET(e.published_at) ?? "—"}</span>
                  {e.id === latest.id && <Badge>Latest</Badge>}
                </div>
                <Button onClick={() => setViewId(e.id)} disabled={e.id === viewId}>
                  {e.id === viewId ? "Viewing" : "View full edition"}
                </Button>
              </div>
              <div className="mt-1.5">
                <Counts counts={e.counts} />
              </div>
              {e.changes.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5 border-t border-line/50 pt-1.5 text-xs">
                  {e.changes.map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 text-2xs font-semibold uppercase text-warn">{titleCase(c.type)}</span>
                      <span className="min-w-0 break-words text-soft">{c.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 border-t border-line/50 pt-1.5 text-2xs text-muted">No changes recorded against the previous edition.</p>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Diff between editions">
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:max-w-2xl">
          <Field label="From">
            <Select value={fromId} onChange={(e) => setFromId(Number(e.target.value))}>
              {sorted.map((e) => (
                <option key={e.id} value={e.id}>
                  {editionLabel(e)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select value={toId} onChange={(e) => setToId(Number(e.target.value))}>
              {sorted.map((e) => (
                <option key={e.id} value={e.id}>
                  {editionLabel(e)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {sorted.length < 2 ? <EmptyState title="Only one edition exists for this date; there is nothing to compare yet." /> : <Diff fromId={fromId} toId={toId} />}
      </Panel>

      <Panel title="Full edition">
        <FullEdition id={viewId} />
      </Panel>
    </div>
  );
}

export default function DailyResearchPage() {
  const date = useSelectedDate();
  const q = useQuery({ queryKey: ["editions", date ?? "today"], queryFn: () => api.editions(date) });
  return (
    <div>
      <PageHeader title="Daily Research Editions" sub="Every published edition for the selected date, what changed between them, and the full content as originally published." />
      <QueryView query={q} rows={6} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No research edition has been published for this date." />}>
        {(d) => <Editions items={d.items} />}
      </QueryView>
    </div>
  );
}
