"use client";

import { useState, type ReactNode } from "react";
import type { Combo, ComboLeg } from "@/lib/types";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceMeter, ProbInterval } from "@/components/prob";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SaveTicketButton } from "@/components/save-ticket-button";
import { linkButton } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { BulletList, Metric } from "@/components/ui/panel";
import { DLink } from "@/lib/date";
import { cn } from "@/lib/cn";
import { fmtAmerican, fmtDateTimeET, fmtInt, fmtLine, fmtNum, fmtPct, titleCase } from "@/lib/format";

export const NO_QUOTE_TEXT = "No verified combined sportsbook quote — research only";
export const REFERENCE_PRICE_LABEL = "Arithmetic product of leg prices — not a sportsbook quote";

const LEG_COLUMNS: Column<ComboLeg>[] = [
  { key: "label", header: "Leg", primary: true, cell: (l) => <span className="font-medium text-ink">{l.label}</span> },
  { key: "game", header: "Game", cell: (l) => l.game_label },
  { key: "line", header: "Line", align: "right", cell: (l) => <Val v={fmtLine(l.line)} /> },
  { key: "price", header: "Price", align: "right", cell: (l) => <Val v={fmtAmerican(l.price_american)} /> },
  { key: "prob", header: "Leg probability", align: "right", cell: (l) => <ProbInterval prob={l.prob} low={l.prob_low} high={l.prob_high} /> },
  {
    key: "ev",
    header: "Evidence",
    align: "right",
    cell: (l) => (l.evidence_score === null ? <Val v={null} /> : <span className="num text-info">{l.evidence_score}/100</span>),
  },
  { key: "n", header: "Sample", align: "right", cell: (l) => (l.sample_size === null ? <Val v={null} /> : <span className="num">n={fmtInt(l.sample_size)}</span>) },
  { key: "class", header: "Class", cell: (l) => <ClassificationBadge value={l.classification} /> },
];

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </div>
  );
}

export function PricingBlock({ combo }: { combo: Pick<Combo, "observed_quote" | "reference_price"> }) {
  return (
    <div className="space-y-2 rounded-md bg-raised/50 p-3" data-testid="pricing-block">
      {combo.observed_quote ? (
        <div>
          <div className="text-2xs uppercase tracking-wide text-muted">Observed combined quote</div>
          <div className="num text-sm text-ink">
            {fmtAmerican(combo.observed_quote.american)} <span className="text-muted">({combo.observed_quote.decimal.toFixed(2)} decimal)</span>
          </div>
          <div className="text-2xs text-muted">
            {combo.observed_quote.book} · observed {fmtDateTimeET(combo.observed_quote.at) ?? "—"}
          </div>
        </div>
      ) : (
        <p className="text-sm font-medium text-warn">{NO_QUOTE_TEXT}</p>
      )}
      {combo.reference_price ? (
        <div className="border-t border-line/50 pt-2">
          <div className="text-2xs uppercase tracking-wide text-muted">{REFERENCE_PRICE_LABEL}</div>
          <div className="num text-sm text-soft">
            {fmtAmerican(combo.reference_price.american)} <span className="text-muted">({combo.reference_price.decimal.toFixed(2)} decimal)</span>
          </div>
          {combo.reference_price.note && <p className="text-2xs text-muted">{combo.reference_price.note}</p>}
        </div>
      ) : (
        <p className="border-t border-line/50 pt-2 text-2xs text-muted">Leg-price reference: not available (one or more legs have no price).</p>
      )}
    </div>
  );
}

export function ComboDetail({ combo }: { combo: Combo }) {
  const c = combo.correlation;
  return (
    <div className="space-y-4 border-t border-line/50 p-4" data-testid="combo-detail">
      {combo.invalidated && (
        <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad ring-1 ring-inset ring-bad/40">
          INVALIDATED{combo.invalidation_reason ? ` — ${combo.invalidation_reason}` : ""}
        </p>
      )}
      <DataTable columns={LEG_COLUMNS} rows={combo.legs} rowKey={(l) => l.selection_id} caption={`Legs of ${combo.name}`} dense />

      <div className="grid gap-4 lg:grid-cols-3">
        <Sub title="Joint probability">
          <dl className="grid grid-cols-2 gap-4 rounded-md bg-raised/50 p-3">
            <Metric label="Correlation-adjusted">
              <ProbInterval prob={combo.joint_prob} low={combo.joint_low} high={combo.joint_high} stack />
            </Metric>
            <Metric label="Independent product">
              <Val v={fmtPct(combo.independent_prob)} />
              <div className="text-2xs text-muted">ignores dependence between legs</div>
            </Metric>
          </dl>
          <div className="mt-2">
            <EvidenceMeter score={combo.evidence_score} />
          </div>
        </Sub>

        <Sub title="Correlation">
          <div className="space-y-1.5 rounded-md bg-raised/50 p-3 text-xs">
            <p className="text-soft">
              <span className="text-muted">Method </span>
              {c.method}
            </p>
            <p className="num text-muted">
              seed <Val v={c.seed} /> · draws <Val v={fmtInt(c.draws)} /> · MC error <Val v={c.mc_se === null ? null : fmtNum(c.mc_se, 4)} />
            </p>
            <p className="break-words text-soft">{c.assessment}</p>
            {c.pairwise.length > 0 ? (
              <ul className="divide-y divide-line/40 border-t border-line/50">
                {c.pairwise.map((p, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 py-1">
                    <span className="min-w-0 break-words text-muted">
                      {p.a} × {p.b}
                    </span>
                    <span className="num shrink-0 text-ink">ρ {p.rho > 0 ? "+" : ""}{p.rho.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No pairwise correlation estimates were recorded.</p>
            )}
          </div>
        </Sub>

        <Sub title="Pricing">
          <PricingBlock combo={combo} />
        </Sub>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Sub title="Shared risks">
          {c.shared_risks.length ? <BulletList items={c.shared_risks} tone="warn" /> : <p className="text-xs text-muted">None identified.</p>}
        </Sub>
        <Sub title="Weakest assumption">
          {combo.weakest_assumption ? <p className="break-words text-xs text-soft">{combo.weakest_assumption}</p> : <p className="text-xs text-muted">Not available.</p>}
        </Sub>
        <Sub title="Invalidation conditions">
          {combo.invalidation_conditions.length ? (
            <BulletList items={combo.invalidation_conditions} tone="bad" />
          ) : (
            <p className="text-xs text-muted">None recorded.</p>
          )}
        </Sub>
      </div>

      <Sub title="Evidence by leg">
        <div className="grid gap-2 md:grid-cols-2">
          {combo.legs.map((l) => (
            <div key={l.selection_id} className="rounded-md bg-raised/50 p-3">
              <div className="mb-1.5 text-sm font-medium text-ink">{l.label}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-2xs uppercase text-muted">Supporting</div>
                  {l.supporting.length ? <BulletList items={l.supporting} tone="accent" /> : <p className="text-xs text-muted">None recorded.</p>}
                </div>
                <div>
                  <div className="text-2xs uppercase text-muted">Opposing</div>
                  {l.opposing.length ? <BulletList items={l.opposing} tone="warn" /> : <p className="text-xs text-muted">None recorded.</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Sub>

      {combo.rejection_reasons.length > 0 && (
        <Sub title="Rejection reasons">
          <BulletList items={combo.rejection_reasons} tone="bad" />
        </Sub>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-2">
        <p className="text-2xs text-muted">
          {titleCase(combo.designation)} · created {fmtDateTimeET(combo.created_at) ?? "—"} · uid <span className="num">{combo.uid}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <DLink
            href={`/builder?legs=${combo.legs.map((l) => l.selection_id).join(",")}`}
            className={linkButton}
          >
            Open in builder
          </DLink>
          <SaveTicketButton body={{ combo_uid: combo.uid }} disabled={combo.invalidated} />
        </div>
      </div>
    </div>
  );
}

/** Compact expandable combination card. */
export function ComboCard({ combo, defaultOpen = false }: { combo: Combo; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const summary = combo.legs.map((l) => l.label).join("  +  ");
  return (
    <article
      className={cn("min-w-0 rounded-lg bg-card ring-1 ring-inset", combo.invalidated ? "ring-bad/40" : "ring-line/60")}
      data-testid="combo-card"
      data-combo-uid={combo.uid}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="block w-full rounded-lg p-4 text-left transition-colors hover:bg-raised/30"
        data-testid="combo-toggle"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">{combo.name}</h3>
          <span className="text-xs text-muted">
            {combo.n_legs} legs · {combo.structure === "SGP" ? "Same game" : combo.structure === "CROSS" ? "Cross game" : "Mixed"}
          </span>
          <ClassificationBadge value={combo.classification} invalidated={combo.invalidated} />
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted" aria-hidden>
            {open ? "Collapse" : "Expand"}
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </div>
        <p className="mt-1 break-words text-sm text-soft">{summary}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <div className="text-2xs font-medium uppercase tracking-wide text-muted">Joint probability [interval]</div>
            <ProbInterval prob={combo.joint_prob} low={combo.joint_low} high={combo.joint_high} size="lg" />
          </div>
          <div className="text-xs">
            {combo.invalidated ? (
              <span className="font-semibold text-bad" data-testid="combo-invalidated">
                INVALIDATED
              </span>
            ) : (
              <span className="text-muted">
                Validated <span className="num text-soft">{fmtDateTimeET(combo.validated_at) ?? "—"}</span>
              </span>
            )}
          </div>
        </div>
      </button>
      {open && <ComboDetail combo={combo} />}
    </article>
  );
}
