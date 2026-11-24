"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClassificationBadge, isQualified } from "@/components/classification-badge";
import { PricingBlock } from "@/components/combo-card";
import { EvidenceMeter, ProbInterval } from "@/components/prob";
import { SaveTicketButton } from "@/components/save-ticket-button";
import { SelectionCard } from "@/components/selection-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Val } from "@/components/ui/na";
import { BulletList, Metric, PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSelectedDate } from "@/lib/date";
import { fmtAmerican, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { useCombos, useSelections } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import type { BuilderEvaluation, Selection } from "@/lib/types";

const CATEGORIES = [
  ["double", "2-leg"],
  ["triple", "3-leg"],
  ["quad", "4-leg"],
  ["five", "5-leg"],
  ["six", "6-leg experimental"],
  ["sgp", "Same-game"],
  ["cross", "Cross-game"],
] as const;

const MAX_LEGS = 6;

function Evaluation({ ids, legs }: { ids: number[]; legs: Selection[] }) {
  const debounced = useDebounced(ids, 350);
  const settled = debounced.length === ids.length && debounced.every((v, i) => v === ids[i]);
  const q = useQuery({
    queryKey: ["builder-evaluate", debounced],
    queryFn: () => api.builderEvaluate(debounced),
    enabled: debounced.length >= 2,
    staleTime: 0,
    gcTime: 60_000,
  });

  if (ids.length === 0) {
    return <EmptyState title="No legs yet.">Add selections from the list to evaluate a combination.</EmptyState>;
  }
  if (ids.length === 1) {
    const only = legs[0];
    return (
      <div className="space-y-2">
        <p className="rounded border border-dashed border-line-strong px-2 py-2 text-xs text-muted">
          One leg selected. Add a second leg to evaluate a joint probability, or save this selection as a single paper ticket.
        </p>
        <SaveTicketButton body={{ selection_ids: ids }} disabled={only?.invalidated} />
      </div>
    );
  }
  if (!settled || q.isPending) return <LoadingState rows={3} label="Evaluating combination" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const ev: BuilderEvaluation = q.data;

  return (
    <div className="space-y-3" data-testid="builder-evaluation" data-fetching={q.isFetching ? "1" : "0"}>
      {!ev.reliable && (
        <div role="alert" className="rounded border border-bad/60 bg-bad-dim/50 px-2 py-2" data-testid="unreliable-banner">
          <p className="text-xs font-semibold uppercase tracking-wide text-bad">Estimate not reliable</p>
          <p className="mt-0.5 text-xs text-soft">
            The model could not produce a dependable joint probability for this combination. Treat the figures below as indicative research only.
          </p>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2 rounded border border-line bg-bg/50 p-2">
        <Metric label="Joint probability [interval]">
          <span data-testid="builder-joint">
            <ProbInterval prob={ev.joint_prob} low={ev.joint_low} high={ev.joint_high} stack />
          </span>
        </Metric>
        <Metric label="Independent product">
          <Val v={fmtPct(ev.independent_prob)} />
          <div className="text-2xs text-muted">ignores dependence</div>
        </Metric>
      </dl>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{ev.engine}</Badge>
        <Badge>{ev.structure}</Badge>
        <ClassificationBadge value={ev.classification} invalidated={ev.invalidated} />
      </div>
      <EvidenceMeter score={ev.evidence_score} />
      {ev.warnings.length > 0 && (
        <div className="rounded border border-warn/50 bg-warn-dim/40 p-2" data-testid="builder-warnings">
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-warn">Warnings</h4>
          <BulletList items={ev.warnings} tone="warn" />
        </div>
      )}
      <div className="text-xs">
        <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Correlation</h4>
        <p className="break-words text-soft">{ev.correlation.assessment}</p>
        <p className="num mt-0.5 text-2xs text-muted">
          {ev.correlation.method} · draws <Val v={fmtInt(ev.correlation.draws)} /> · MC error <Val v={ev.correlation.mc_se === null ? null : fmtNum(ev.correlation.mc_se, 4)} />
        </p>
      </div>
      {ev.correlation.shared_risks.length > 0 && (
        <div>
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Shared risks</h4>
          <BulletList items={ev.correlation.shared_risks} tone="warn" />
        </div>
      )}
      {ev.weakest_assumption && (
        <div>
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Weakest assumption</h4>
          <p className="break-words text-xs text-soft">{ev.weakest_assumption}</p>
        </div>
      )}
      <PricingBlock combo={ev} />
      {ev.rejection_reasons.length > 0 && (
        <div>
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-bad">Rejection reasons</h4>
          <BulletList items={ev.rejection_reasons} tone="bad" />
        </div>
      )}
      <SaveTicketButton body={{ selection_ids: ids }} />
    </div>
  );
}

function CombinationPanel({
  legs,
  ids,
  missing,
  onRemove,
  onClear,
  onFocus,
}: {
  legs: Selection[];
  ids: number[];
  missing: number;
  onRemove: (id: number) => void;
  onClear: () => void;
  onFocus: (id: number) => void;
}) {
  return (
    <div className="space-y-3">
      {missing > 0 && (
        <p className="rounded border border-warn/50 bg-warn-dim/40 px-2 py-1 text-xs text-warn">
          {missing} requested leg(s) are not in the latest edition for this date and were skipped.
        </p>
      )}
      {legs.length > 0 && (
        <ul className="divide-y divide-line/70 rounded border border-line" data-testid="builder-legs">
          {legs.map((l, i) => (
            <li key={l.id} className="flex items-start gap-2 px-2 py-1.5">
              <span className="num mt-0.5 text-2xs text-muted">{i + 1}</span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onFocus(l.id)}>
                <span className="block break-words text-xs font-medium text-ink">{l.market_label}</span>
                <span className="num block text-2xs text-muted">
                  {l.game_label} · <Val v={fmtAmerican(l.price_american)} /> · <Val v={fmtPct(l.prob)} />
                </span>
              </button>
              <Button variant="ghost" aria-label={`Remove ${l.market_label}`} onClick={() => onRemove(l.id)} data-testid="builder-remove">
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Evaluation ids={ids} legs={legs} />
      {legs.length > 0 && (
        <Button variant="ghost" onClick={onClear}>
          Clear combination
        </Button>
      )}
    </div>
  );
}

export default function BuilderPage() {
  const date = useSelectedDate();
  const sp = useSearchParams();
  const selQ = useSelections(date);
  const [ids, setIds] = useState<number[]>([]);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [scope, setScope] = useState<"qualified" | "all">("qualified");
  const [category, setCategory] = useState<string>("double");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const combosQ = useCombos(category, date);

  // Preload legs from ?legs=1,2,3 ("Open in builder" on a combination card). Applied once.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const raw = sp.get("legs");
    if (!raw) return;
    const parsed = raw
      .split(",")
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, MAX_LEGS);
    if (parsed.length) {
      setIds([...new Set(parsed)]);
      setFocusId(parsed[0] ?? null);
    }
  }, [sp]);

  const all = useMemo(() => selQ.data?.items ?? [], [selQ.data]);
  const byId = useMemo(() => new Map(all.map((s) => [s.id, s])), [all]);
  const legs = useMemo(() => ids.map((id) => byId.get(id)).filter((s): s is Selection => Boolean(s)), [ids, byId]);
  const validIds = useMemo(() => legs.map((l) => l.id), [legs]);
  const missing = selQ.data ? ids.length - legs.length : 0;
  // With nothing chosen yet, show the first available selection so the detail column is never blank.
  const focused = focusId !== null ? byId.get(focusId) : all.find((x) => isQualified(x.classification, x.invalidated)) ?? all[0];

  const visible = useMemo(
    () => all.filter((s) => scope === "all" || isQualified(s.classification, s.invalidated) || ids.includes(s.id)),
    [all, scope, ids],
  );
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; items: Selection[] }>();
    for (const s of visible) {
      const g = m.get(s.game_id) ?? { label: s.game_label, items: [] };
      g.items.push(s);
      m.set(s.game_id, g);
    }
    return [...m.entries()];
  }, [visible]);

  const add = (id: number) => {
    setIds((cur) => (cur.includes(id) || cur.length >= MAX_LEGS ? cur : [...cur, id]));
    setFocusId(id);
  };
  const remove = (id: number) => setIds((cur) => cur.filter((x) => x !== id));
  const full = ids.length >= MAX_LEGS;

  const panel = (
    <CombinationPanel legs={legs} ids={validIds} missing={missing} onRemove={remove} onClear={() => setIds([])} onFocus={setFocusId} />
  );

  return (
    <div data-testid="builder">
      <PageHeader
        title="Research Builder"
        sub="Assemble a combination from evaluated selections. Each change is re-evaluated by the API; nothing is persisted until saved to the paper ledger."
      />
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(280px,340px)]">
        {/* Left: games and selections */}
        <div className="min-w-0 space-y-3">
          <Panel
            title="Available selections"
            right={
              <label className="flex items-center gap-1.5">
                <span className="sr-only">Selection scope</span>
                <select
                  className="h-6 rounded border border-line-strong bg-bg pl-1.5 pr-5 text-2xs text-ink"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as "qualified" | "all")}
                >
                  <option value="qualified">Qualified</option>
                  <option value="all">All evaluated</option>
                </select>
              </label>
            }
            bodyClassName="p-2"
          >
            <QueryView
              query={selQ}
              rows={6}
              isEmpty={() => groups.length === 0}
              empty={
                <EmptyState title={all.length === 0 ? "No selections are available for this date." : "No qualified selections for this date."}>
                  {all.length > 0 ? 'Switch to "All evaluated" to browse every evaluated selection.' : undefined}
                </EmptyState>
              }
            >
              {() => (
                <div className="space-y-3">
                  {groups.map(([gid, g]) => (
                    <div key={gid}>
                      <h3 className="mb-1 border-b border-line pb-1 text-2xs font-semibold uppercase tracking-wide text-soft">{g.label}</h3>
                      <ul className="space-y-1">
                        {g.items.map((s) => {
                          const inCombo = ids.includes(s.id);
                          return (
                            <li
                              key={s.id}
                              className={cn(
                                "flex items-start gap-2 rounded border px-2 py-1.5",
                                focused?.id === s.id ? "border-info/60 bg-raised" : "border-line bg-bg/40",
                              )}
                              data-testid="builder-option"
                            >
                              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setFocusId(s.id)}>
                                <span className="block break-words text-xs font-medium text-ink">{s.market_label}</span>
                                <span className="num mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
                                  <Val v={fmtPct(s.prob)} />
                                  <span>
                                    Evidence <Val v={s.evidence_score === null ? null : `${s.evidence_score}/100`} />
                                  </span>
                                  <ClassificationBadge value={s.classification} invalidated={s.invalidated} />
                                </span>
                              </button>
                              {inCombo ? (
                                <Button onClick={() => remove(s.id)} aria-label={`Remove ${s.market_label} from combination`}>
                                  Remove
                                </Button>
                              ) : (
                                <Button
                                  variant="primary"
                                  disabled={full || s.invalidated}
                                  onClick={() => add(s.id)}
                                  aria-label={`Add ${s.market_label} to combination`}
                                  data-testid="builder-add"
                                >
                                  Add
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  {full && <p className="text-2xs text-warn">Maximum of {MAX_LEGS} legs reached.</p>}
                </div>
              )}
            </QueryView>
          </Panel>

          <Panel title="Load a researched combination" bodyClassName="p-2">
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="mt-2">
              <QueryView query={combosQ} rows={2} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No combinations in this category for the date." />}>
                {(d) => (
                  <ul className="space-y-1">
                    {d.items.map((c) => (
                      <li key={c.uid} className="flex items-start gap-2 rounded border border-line bg-bg/40 px-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-ink">{c.name}</div>
                          <div className="break-words text-2xs text-muted">{c.legs.map((l) => l.label).join(" + ")}</div>
                        </div>
                        <Button
                          onClick={() => {
                            const next = c.legs.map((l) => l.selection_id).slice(0, MAX_LEGS);
                            setIds(next);
                            setFocusId(next[0] ?? null);
                          }}
                          data-testid="builder-load"
                        >
                          Load
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryView>
            </div>
          </Panel>
        </div>

        {/* Center: focused selection */}
        <div className="min-w-0">
          <Panel title="Selection detail" bodyClassName="p-2">
            {focused ? (
              <SelectionCard
                key={focused.id}
                s={focused}
                showSave={false}
                defaultOpen
                compact
                actions={
                  ids.includes(focused.id) ? (
                    <Button onClick={() => remove(focused.id)}>Remove from combination</Button>
                  ) : (
                    <Button variant="primary" disabled={full || focused.invalidated} onClick={() => add(focused.id)}>
                      Add to combination
                    </Button>
                  )
                }
              />
            ) : (
              <EmptyState title="Select a selection from the list to see its detail and evidence." />
            )}
          </Panel>
        </div>

        {/* Right: current combination (desktop) */}
        <div className="hidden min-w-0 lg:block">
          <div className="sticky top-14">
            <Panel title={`Current combination · ${legs.length} leg(s)`} tone="accent">
              {panel}
            </Panel>
          </div>
        </div>
      </div>

      {/* Mobile / tablet: expandable drawer that sits above the bottom navigation */}
      <div
        className="fixed inset-x-0 bottom-14 z-30 border-t border-accent/50 bg-panel md:bottom-7 lg:hidden"
        data-testid="builder-drawer"
        data-open={drawerOpen ? "1" : "0"}
      >
        <button
          type="button"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
          className="flex h-10 w-full items-center justify-between px-3 text-xs"
          data-testid="builder-drawer-toggle"
        >
          <span className="font-semibold uppercase tracking-wide text-ink">
            Current combination · <span className="num">{legs.length}</span> leg(s)
          </span>
          <span className="text-muted">{drawerOpen ? "Close ▾" : "Open ▴"}</span>
        </button>
        {drawerOpen && <div className="max-h-[60vh] overflow-y-auto border-t border-line p-3">{panel}</div>}
      </div>
      <div className="h-12 lg:hidden" aria-hidden />
    </div>
  );
}
