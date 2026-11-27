"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClassificationBadge } from "@/components/classification-badge";
import { PricingBlock } from "@/components/combo-card";
import { EvidenceMeter, ProbInterval } from "@/components/prob";
import { SaveTicketButton } from "@/components/save-ticket-button";
import { SelectionCard } from "@/components/selection-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Val } from "@/components/ui/na";
import { BulletList, Metric, PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useSelectedDate } from "@/lib/date";
import { fmtAmerican, fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { useCombos, useSelections } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import type { BuilderEvaluation, ComboLeg, Selection } from "@/lib/types";
import { Collapsible } from "@/components/ui/collapsible";

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

function Evaluation({ ids, legs, onLabels }: { ids: number[]; legs: Leg[]; onLabels: (m: Map<number, ComboLeg>) => void }) {
  const debounced = useDebounced(ids, 350);
  const settled = debounced.length === ids.length && debounced.every((v, i) => v === ids[i]);
  const q = useQuery({
    queryKey: ["builder-evaluate", debounced],
    queryFn: () => api.builderEvaluate(debounced),
    enabled: debounced.length >= 2,
    staleTime: 0,
    gcTime: 60_000,
  });

  const evLegs = q.data?.legs;
  useEffect(() => {
    if (evLegs) onLabels(new Map(evLegs.map((l) => [l.selection_id, l])));
  }, [evLegs, onLabels]);

  if (ids.length === 0) {
    return <EmptyState title="No legs yet.">Add selections from the list to evaluate a combination.</EmptyState>;
  }
  if (ids.length === 1) {
    const only = legs[0];
    return (
      <div className="space-y-2">
        <p className="rounded-md bg-raised/40 px-2 py-2 text-xs text-muted">
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
    <div className="space-y-4" data-testid="builder-evaluation" data-fetching={q.isFetching ? "1" : "0"}>
      {!ev.reliable && (
        <div role="alert" className="border-l-4 border-bad pl-3 px-2 py-2" data-testid="unreliable-banner">
          <p className="text-xs font-semibold text-bad">Estimate not reliable</p>
          <p className="mt-0.5 text-xs text-soft">
            The model could not produce a dependable joint probability for this combination. Treat the figures below as indicative research only.
          </p>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-2 border-l-2 border-line py-1 pl-3">
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
        <div className="border-l-4 border-warn pl-3 p-2" data-testid="builder-warnings">
          <h4 className="mb-1 text-2xs font-semibold text-warn">Warnings</h4>
          <BulletList items={ev.warnings} tone="warn" />
        </div>
      )}
      <div className="text-xs">
        <h4 className="mb-1 text-2xs font-semibold text-muted">Correlation</h4>
        <p className="break-words text-soft">{ev.correlation.assessment}</p>
        <p className="num mt-0.5 text-2xs text-muted">
          {ev.correlation.method} · draws <Val v={fmtInt(ev.correlation.draws)} /> · MC error <Val v={ev.correlation.mc_se === null ? null : fmtNum(ev.correlation.mc_se, 4)} />
        </p>
      </div>
      {ev.correlation.shared_risks.length > 0 && (
        <div>
          <h4 className="mb-1 text-2xs font-semibold text-muted">Shared risks</h4>
          <BulletList items={ev.correlation.shared_risks} tone="warn" />
        </div>
      )}
      {ev.weakest_assumption && (
        <div>
          <h4 className="mb-1 text-2xs font-semibold text-muted">Weakest assumption</h4>
          <p className="break-words text-xs text-soft">{ev.weakest_assumption}</p>
        </div>
      )}
      <PricingBlock combo={ev} />
      {ev.rejection_reasons.length > 0 && (
        <div>
          <h4 className="mb-1 text-2xs font-semibold text-bad">Rejection reasons</h4>
          <BulletList items={ev.rejection_reasons} tone="bad" />
        </div>
      )}
      <SaveTicketButton body={{ selection_ids: ids }} />
    </div>
  );
}

type Leg = { id: number; label: string; game_label: string; price: number | null; prob: number | null; invalidated: boolean };
const legOf = (s: Selection): Leg => ({ id: s.id, label: s.market_label, game_label: s.game_label, price: s.price_american, prob: s.prob, invalidated: s.invalidated });

function CombinationPanel({ legs, onRemove, onClear, onLabels }: { legs: Leg[]; onRemove: (id: number) => void; onClear: () => void; onLabels: (m: Map<number, ComboLeg>) => void }) {
  const ids = useMemo(() => legs.map((l) => l.id), [legs]);
  return (
    <div className="space-y-9">
      {legs.length > 0 && (
        <ul className="divide-y divide-line rounded-md bg-raised/40" data-testid="builder-legs">
          {legs.map((l, i) => (
            <li key={l.id} className="flex items-start gap-2 px-3 py-2">
              <span className="num mt-0.5 text-xs text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium text-ink">{l.label}</span>
                <span className="num block text-xs text-muted">
                  {l.game_label || "—"} · <Val v={fmtAmerican(l.price)} /> · <Val v={fmtPct(l.prob)} />
                </span>
              </span>
              <Button variant="ghost" aria-label={`Remove ${l.label}`} onClick={() => onRemove(l.id)} data-testid="builder-remove">
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Evaluation ids={ids} legs={legs} onLabels={onLabels} />
      {legs.length > 0 && (
        <Button variant="ghost" onClick={onClear}>
          Clear combination
        </Button>
      )}
    </div>
  );
}

function GameGroup({ label, items, open, children }: { label: string; items: number; open: boolean; children: React.ReactNode }) {
  return (
    <Collapsible title={<span className="font-display text-base font-semibold">{label}</span>} right={`${items} selection(s)`} defaultOpen={open} testId="builder-game-group">
      {children}
    </Collapsible>
  );
}

export default function BuilderPage() {
  const date = useSelectedDate();
  const sp = useSearchParams();
  const [legs, setLegs] = useState<Leg[]>([]);
  const [focus, setFocus] = useState<Selection | null>(null);
  const [watch, setWatch] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<string>("double");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadAll, setLoadAll] = useState(false);
  const search = useDebounced(text.trim(), 300);
  // Qualified selections only by default; the watchlist is a separate, opt-in request. Both are bounded.
  const qualQ = useSelections({ date, classification: "qualified", q: search || undefined, limit: 200 });
  const watchQ = useSelections({ date, classification: "watchlist", q: search || undefined, limit: 100 }, watch);
  const combosQ = useCombos(category, date);

  // Preload legs from ?legs=1,2,3 ("Open in builder"). Labels arrive with the first evaluation.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const parsed = (sp.get("legs") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, MAX_LEGS);
    if (parsed.length) setLegs([...new Set(parsed)].map((id) => ({ id, label: `Selection #${id}`, game_label: "", price: null, prob: null, invalidated: false })));
  }, [sp]);

  const onLabels = useCallback((m: Map<number, ComboLeg>) => {
    setLegs((cur) => {
      let changed = false;
      const next = cur.map((l) => {
        const e = m.get(l.id);
        if (!e || (l.label === e.label && l.game_label === e.game_label)) return l;
        changed = true;
        return { ...l, label: e.label, game_label: e.game_label, price: e.price_american, prob: e.prob };
      });
      return changed ? next : cur;
    });
  }, []);

  const items = useMemo(() => [...(qualQ.data?.items ?? []), ...(watch ? (watchQ.data?.items ?? []) : [])], [qualQ.data, watchQ.data, watch]);
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; items: Selection[] }>();
    for (const s of items) {
      const g = m.get(s.game_id) ?? { label: s.game_label, items: [] };
      g.items.push(s);
      m.set(s.game_id, g);
    }
    return [...m.entries()];
  }, [items]);
  const ids = legs.map((l) => l.id);
  const focused = focus ?? items[0] ?? null;
  const full = legs.length >= MAX_LEGS;
  const add = (s: Selection) => {
    setLegs((cur) => (cur.some((l) => l.id === s.id) || cur.length >= MAX_LEGS ? cur : [...cur, legOf(s)]));
    setFocus(s);
  };
  const remove = (id: number) => setLegs((cur) => cur.filter((l) => l.id !== id));
  const total = (qualQ.data?.total ?? 0) + (watch ? (watchQ.data?.total ?? 0) : 0);

  const panel = <CombinationPanel legs={legs} onRemove={remove} onClear={() => setLegs([])} onLabels={onLabels} />;
  const combos = combosQ.data?.items ?? [];

  return (
    <div data-testid="builder">
      <PageHeader title="Research Builder" sub="Assemble a combination from qualified research selections. Each change is re-evaluated by the API; nothing is persisted until saved to the paper ledger." />
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(280px,340px)]">
        {/* Left: selections */}
        <div className="min-w-0 space-y-4">
          <Panel title="Available selections" right={qualQ.data ? <span className="num">{items.length} of {total}</span> : undefined} bodyClassName="space-y-3">
            <Field label="Search">
              <Input type="search" placeholder="Player, team or market" value={text} onChange={(e) => setText(e.target.value)} data-testid="builder-search" />
            </Field>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-soft md:min-h-0">
              <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} className="h-4 w-4 accent-ink" data-testid="builder-watchlist" />
              Include watchlist
            </label>
            <QueryView
              query={qualQ}
              rows={6}
              isEmpty={() => groups.length === 0}
              empty={
                <EmptyState title={search ? "No selection matches this search." : "No qualified selections for this date."}>
                  {search ? undefined : "Tick “Include watchlist” to browse watchlist selections, or pick another date."}
                </EmptyState>
              }
            >
              {() => (
                <div className="space-y-2">
                  {groups.map(([gid, g], gi) => (
                    <GameGroup key={gid} label={g.label} items={g.items.length} open={gi === 0 || groups.length <= 3 || Boolean(search)}>
                      <ul className="space-y-1.5">
                        {g.items.map((s) => {
                          const inCombo = ids.includes(s.id);
                          return (
                            <li key={s.id} className={cn("flex items-start gap-2 rounded-md px-2 py-1.5", focused?.id === s.id ? "bg-raised ring-1 ring-inset ring-info/50" : "bg-bg/40")} data-testid="builder-option">
                              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setFocus(s)}>
                                <span className="block break-words text-sm font-medium text-ink">{s.market_label}</span>
                                <span className="num mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
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
                                <Button variant="primary" disabled={full || s.invalidated} onClick={() => add(s)} aria-label={`Add ${s.market_label} to combination`} data-testid="builder-add">
                                  Add
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </GameGroup>
                  ))}
                  {total > items.length && <p className="text-xs text-muted">Showing {items.length} of {total}. Use search to narrow the list.</p>}
                  {full && <p className="text-xs text-warn">Maximum of {MAX_LEGS} legs reached.</p>}
                </div>
              )}
            </QueryView>
          </Panel>

          <Collapsible title="Load a researched combination" className="blk" testId="builder-load-panel">
            <Field label="Category">
              <Select value={category} onChange={(e) => { setCategory(e.target.value); setLoadAll(false); }}>
                {CATEGORIES.map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </Select>
            </Field>
            <div className="mt-2">
              <QueryView query={combosQ} rows={2} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No combinations in this category for the date." />}>
                {() => (
                  <>
                    <ul className="space-y-1.5">
                      {(loadAll ? combos : combos.slice(0, 6)).map((c) => (
                        <li key={c.uid} className="flex items-start gap-2 rounded-md bg-raised/40 px-2 py-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-ink">{c.name}</div>
                            <div className="break-words text-xs text-muted">{c.legs.map((l) => l.label).join(" + ")}</div>
                          </div>
                          <Button
                            onClick={() => setLegs(c.legs.slice(0, MAX_LEGS).map((l) => ({ id: l.selection_id, label: l.label, game_label: l.game_label, price: l.price_american, prob: l.prob, invalidated: false })))}
                            data-testid="builder-load"
                          >
                            Load
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {combos.length > 6 && (
                      <Button variant="ghost" className="mt-1" aria-expanded={loadAll} onClick={() => setLoadAll((v) => !v)}>
                        {loadAll ? "Show fewer" : `Show all ${combos.length}`}
                      </Button>
                    )}
                  </>
                )}
              </QueryView>
            </div>
          </Collapsible>
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
                    <Button variant="primary" disabled={full || focused.invalidated} onClick={() => add(focused)}>
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
          <div className="sticky top-16">
            <Panel title={`Current combination · ${legs.length} leg(s)`} tone="accent">
              {panel}
            </Panel>
          </div>
        </div>
      </div>

      {/* Below lg: expandable drawer that sits above the bottom navigation */}
      <div className="fixed inset-x-0 bottom-14 z-30 border-t border-accent/50 bg-bg2 lg:hidden" data-testid="builder-drawer" data-open={drawerOpen ? "1" : "0"}>
        <button type="button" aria-expanded={drawerOpen} onClick={() => setDrawerOpen((v) => !v)} className="flex h-11 w-full items-center justify-between px-3 text-sm" data-testid="builder-drawer-toggle">
          <span className="font-semibold text-ink">
            Current combination · <span className="num">{legs.length}</span> leg(s)
          </span>
          <span className="text-muted">{drawerOpen ? "Close" : "Open"}</span>
        </button>
        {drawerOpen && <div className="max-h-[60vh] overflow-y-auto border-t border-line p-3">{panel}</div>}
      </div>
      <div className="h-12 lg:hidden" aria-hidden />
    </div>
  );
}
