"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Selection, SelectionContext } from "@/lib/types";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceMeter, ProbabilityDisplay } from "@/components/prob";
import { SaveTicketButton } from "@/components/save-ticket-button";
import { LineupStatusLabel, OriginTag } from "@/components/status";
import { StaleTag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Val } from "@/components/ui/na";
import { BulletList, Label } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { fmtAmerican, fmtDateTimeET, fmtInt, fmtLine, fmtNum, fmtPct, fmtSignedPct, titleCase } from "@/lib/format";

function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Descriptive history shown apart from the model numbers. These are past averages, not predictions. */
export function HistoricalContext({ c, className, compact = false }: { c: SelectionContext; className?: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-md bg-raised/50 px-3 py-2", className)} data-testid="historical-context">
      <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Historical context (descriptive)</div>
      <dl className={cn("grid grid-cols-3 gap-x-3 gap-y-1.5", !compact && "sm:grid-cols-6")}>
        <Cell label="L5 avg">
          <Val v={fmtNum(c.l5)} />
        </Cell>
        <Cell label="L10 avg">
          <Val v={fmtNum(c.l10)} />
        </Cell>
        <Cell label="L20 avg">
          <Val v={fmtNum(c.l20)} />
        </Cell>
        <Cell label="Season avg">
          <Val v={fmtNum(c.season_avg)} />
        </Cell>
        <Cell label="Proj. min">
          <Val v={fmtNum(c.proj_min, 0)} />
        </Cell>
        <Cell label="Lineup">
          {c.lineup_role || c.lineup_status ? (
            <span className="flex flex-col text-xs">
              <span className="text-sm">{c.lineup_role ? titleCase(c.lineup_role) : "—"}</span>
              {c.lineup_status && <LineupStatusLabel status={c.lineup_status} short />}
            </span>
          ) : (
            <Val v={null} />
          )}
        </Cell>
      </dl>
    </div>
  );
}

export function EvidencePanel({ s }: { s: Selection }) {
  const { components, supporting, opposing } = s.evidence;
  return (
    <div className="space-y-4 border-t border-line/50 p-4" data-testid="evidence-panel">
      {s.invalidated && (
        <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad ring-1 ring-inset ring-bad/40">Invalidated{s.invalidation_reason ? `: ${s.invalidation_reason}` : "."}</p>
      )}
      <div>
        <Label>Evidence components (quality, not probability)</Label>
        {components.length === 0 ? (
          <p className="text-sm text-muted">No evidence components were recorded for this selection.</p>
        ) : (
          <ul className="divide-y divide-line/40 rounded-md bg-raised/40">
            {components.map((c) => (
              <li key={c.name} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                <span className="font-medium text-soft">{c.name}</span>
                <span className="num font-medium text-info">
                  {c.score}
                  <span className="text-muted">/{c.max}</span>
                </span>
                {c.note && <span className="col-span-2 break-words text-xs text-muted">{c.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Supporting</Label>
          {supporting.length ? <BulletList items={supporting} tone="accent" /> : <p className="text-sm text-muted">None recorded.</p>}
        </div>
        <div>
          <Label>Opposing</Label>
          {opposing.length ? <BulletList items={opposing} tone="warn" /> : <p className="text-sm text-muted">None recorded.</p>}
        </div>
      </div>
      {s.rejection_reasons.length > 0 && (
        <div>
          <Label className="text-bad">Rejection reasons</Label>
          <BulletList items={s.rejection_reasons} tone="bad" />
        </div>
      )}
    </div>
  );
}

/**
 * The reusable selection card. Model output (probability, interval, edge) leads; evidence quality is a
 * separately labelled meter; descriptive history sits in its own row underneath.
 */
export function SelectionCard({
  s,
  showGame = true,
  showSave = true,
  rank,
  actions,
  defaultOpen = false,
  compact = false,
}: {
  s: Selection;
  showGame?: boolean;
  showSave?: boolean;
  rank?: number | null;
  actions?: ReactNode;
  defaultOpen?: boolean;
  /** Narrow containers (builder detail pane): keep the metric grid at four columns. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const r = rank === undefined ? s.rank_in_game : rank;
  const price = fmtAmerican(s.price_american);
  return (
    <article className={cn("min-w-0 rounded-lg bg-card ring-1 ring-inset", s.invalidated ? "ring-bad/40" : "ring-line/60")} data-testid="selection-card" data-selection-id={s.id}>
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
          <span
            className="num inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-raised px-1.5 text-xs font-semibold text-soft"
            title="Rank within game"
            aria-label={r === null ? "rank not available" : `rank ${r}`}
          >
            {r === null ? "—" : `#${r}`}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-semibold leading-6 text-ink">{s.market_label}</h3>
            {showGame && <p className="text-xs text-muted">{s.game_label}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {s.invalidated && <StaleTag label="stale" title={s.invalidation_reason ?? "Invalidated"} />}
            <ClassificationBadge value={s.classification} invalidated={s.invalidated} />
          </div>
        </div>

        {s.rejection_reasons.length > 0 && (
          <p className="mt-2 break-words text-sm text-bad" data-testid="rejection-inline">
            <span className="font-semibold">Rejected: </span>
            {s.rejection_reasons.join("; ")}
          </p>
        )}

        <div className={cn("mt-3 grid gap-x-5 gap-y-3", !compact && "xl:grid-cols-[minmax(170px,0.9fr)_minmax(0,3fr)_minmax(150px,0.9fr)] xl:items-end")}>
          <div>
            <div className="text-2xs font-medium uppercase tracking-wide text-muted">Model probability [interval]</div>
            <ProbabilityDisplay prob={s.prob} low={s.prob_low} high={s.prob_high} size="lg" />
          </div>
          <dl className={cn("grid grid-cols-3 gap-x-4 gap-y-2", compact ? "sm:grid-cols-3" : "sm:grid-cols-6")}>
            <Cell label="Price">
              {s.book || price ? (
                <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                  <Val v={price} />
                  <span className="text-xs font-normal text-muted">{s.book ?? ""}</span>
                </span>
              ) : (
                <Val v={null} />
              )}
            </Cell>
            <Cell label="Line">
              <Val v={fmtLine(s.line)} />
            </Cell>
            <Cell label="Projection">
              <Val v={fmtNum(s.projection)} />
            </Cell>
            <Cell label="Break-even">
              <Val v={fmtPct(s.breakeven)} />
            </Cell>
            <Cell label="Edge">
              <Val v={fmtSignedPct(s.edge)} />
            </Cell>
            <Cell label="Sample">{s.sample_size === null ? <Val v={null} /> : <span className="num">n={fmtInt(s.sample_size)}</span>}</Cell>
          </dl>
          <EvidenceMeter score={s.evidence_score} />
        </div>

        {s.context && <HistoricalContext c={s.context} className="mt-3" compact={compact} />}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 text-xs text-muted">
            {s.model ? (
              <span className="num">
                {s.model.name} {s.model.version}
              </span>
            ) : (
              <span>
                Model <Val v={null} />
              </span>
            )}
            <span className="mx-1.5 text-faint">·</span>
            <span>Verified </span>
            <Val v={fmtDateTimeET(s.verified_at)} />
            {s.origin && (
              <>
                <span className="mx-1.5 text-faint">·</span>
                <span>Quote </span>
                <OriginTag origin={s.origin} />
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {showSave && <SaveTicketButton body={{ selection_ids: [s.id] }} disabled={s.invalidated} />}
            <Button variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="evidence-toggle">
              {open ? "Hide evidence" : "Evidence"}
              {open ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            </Button>
          </div>
        </div>
      </div>
      {open && <EvidencePanel s={s} />}
    </article>
  );
}

export function SelectionList({ items, showGame, showSave }: { items: Selection[]; showGame?: boolean; showSave?: boolean }) {
  return (
    <div className="space-y-3">
      {items.map((s) => (
        <SelectionCard key={s.id} s={s} showGame={showGame} showSave={showSave} />
      ))}
    </div>
  );
}
