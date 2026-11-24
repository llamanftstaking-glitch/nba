"use client";

import { useState, type ReactNode } from "react";
import type { Selection } from "@/lib/types";
import { ClassificationBadge } from "@/components/classification-badge";
import { EvidenceMeter, ProbInterval } from "@/components/prob";
import { SaveTicketButton } from "@/components/save-ticket-button";
import { StaleTag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Val } from "@/components/ui/na";
import { BulletList } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { fmtAmerican, fmtDateTimeET, fmtInt, fmtLine, fmtNum, fmtPct, fmtSignedPct } from "@/lib/format";

function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-2xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export function EvidencePanel({ s }: { s: Selection }) {
  const { components, supporting, opposing } = s.evidence;
  return (
    <div className="space-y-3 border-t border-line bg-bg/50 p-3" data-testid="evidence-panel">
      {s.invalidated && (
        <p className="rounded border border-bad/50 bg-bad-dim/40 px-2 py-1 text-xs text-bad">
          Invalidated{s.invalidation_reason ? `: ${s.invalidation_reason}` : "."}
        </p>
      )}
      <div>
        <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Evidence components (quality, not probability)</h4>
        {components.length === 0 ? (
          <p className="text-xs text-muted">No evidence components were recorded for this selection.</p>
        ) : (
          <ul className="divide-y divide-line/70 rounded border border-line">
            {components.map((c) => (
              <li key={c.name} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-2 py-1.5 text-xs">
                <span className="font-medium text-soft">{c.name}</span>
                <span className="num text-info">
                  {c.score}
                  <span className="text-muted">/{c.max}</span>
                </span>
                {c.note && <span className="col-span-2 break-words text-muted">{c.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Supporting</h4>
          {supporting.length ? <BulletList items={supporting} tone="accent" /> : <p className="text-xs text-muted">None recorded.</p>}
        </div>
        <div>
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Opposing</h4>
          {opposing.length ? <BulletList items={opposing} tone="warn" /> : <p className="text-xs text-muted">None recorded.</p>}
        </div>
      </div>
      {s.rejection_reasons.length > 0 && (
        <div>
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-bad">Rejection reasons</h4>
          <BulletList items={s.rejection_reasons} tone="bad" />
        </div>
      )}
    </div>
  );
}

/**
 * The reusable selection row/card. One layout for every width: a header line and a wrapping metric grid,
 * so nothing scrolls horizontally on a phone.
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
  /** Use the 4-column metric grid at every width (for narrow columns such as the builder detail pane). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const r = rank === undefined ? s.rank_in_game : rank;
  const price = fmtAmerican(s.price_american);
  return (
    <article
      className={cn("min-w-0 rounded border bg-panel", s.invalidated ? "border-bad/50" : "border-line")}
      data-testid="selection-card"
      data-selection-id={s.id}
    >
      <div className="p-2.5">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <span
            className="num inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong px-1 text-2xs text-soft"
            title="Rank within game"
            aria-label={r === null ? "rank not available" : `rank ${r}`}
          >
            {r === null ? "—" : `#${r}`}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-sm font-semibold leading-5 text-ink">{s.market_label}</h3>
            {showGame && <p className="text-2xs text-muted">{s.game_label}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {s.invalidated && <StaleTag label="stale" title={s.invalidation_reason ?? "Invalidated"} />}
            <ClassificationBadge value={s.classification} invalidated={s.invalidated} />
          </div>
        </div>

        {s.rejection_reasons.length > 0 && (
          <p className="mt-1.5 break-words text-xs text-bad" data-testid="rejection-inline">
            <span className="font-semibold">Rejected: </span>
            {s.rejection_reasons.join("; ")}
          </p>
        )}

        <dl
          className={cn(
            "mt-2 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4",
            !compact && "xl:grid-cols-[1.1fr_0.6fr_0.7fr_1.6fr_0.8fr_0.7fr_0.6fr_1.3fr]",
          )}
        >
          <Cell label="Book · price">
            {s.book || price ? (
              <span className="inline-flex flex-wrap items-baseline gap-x-1">
                <span className="text-xs text-soft">{s.book ?? "—"}</span>
                <Val v={price} />
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
          <Cell label="Probability [interval]" className="col-span-3 sm:col-span-1">
            <ProbInterval prob={s.prob} low={s.prob_low} high={s.prob_high} />
          </Cell>
          <Cell label="Break-even">
            <Val v={fmtPct(s.breakeven)} />
          </Cell>
          <Cell label="Edge">
            <Val v={fmtSignedPct(s.edge)} />
          </Cell>
          <Cell label="Sample">
            {s.sample_size === null ? <Val v={null} /> : <span className="num">n={fmtInt(s.sample_size)}</span>}
          </Cell>
          <div className="col-span-3 sm:col-span-1">
            <EvidenceMeter score={s.evidence_score} />
          </div>
        </dl>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-line/70 pt-2">
          <p className="min-w-0 text-2xs text-muted">
            <span>Model </span>
            {s.model ? (
              <span className="num text-soft">
                {s.model.name} {s.model.version}
              </span>
            ) : (
              <Val v={null} />
            )}
            <span className="mx-1.5 text-line-strong">|</span>
            <span>Verified </span>
            <Val v={fmtDateTimeET(s.verified_at)} className="text-soft" />
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {showSave && <SaveTicketButton body={{ selection_ids: [s.id] }} disabled={s.invalidated} />}
            <Button variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="evidence-toggle">
              {open ? "Hide evidence" : "Evidence"}
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
    <div className="space-y-2">
      {items.map((s) => (
        <SelectionCard key={s.id} s={s} showGame={showGame} showSave={showSave} />
      ))}
    </div>
  );
}
