"use client";

import { SubjectMark } from "./subject-mark";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { ClassificationBadge } from "@/components/classification-badge";
import { ProbabilityDisplay, ProbScale } from "@/components/prob";
import { SelectionCard } from "@/components/selection-card";
import { NA, Val } from "@/components/ui/na";
import { cn } from "@/lib/cn";
import { fmtAmerican, fmtPct, fmtSignedPct } from "@/lib/format";
import type { Selection } from "@/lib/types";

/**
 * One-line selection for long lists: rank, label, classification, model probability with interval, price,
 * edge and evidence. Expands in place to the full SelectionCard. Lists of these stay short on screen even
 * when a slate has thousands of evaluated selections.
 */
export function SelectionRow({ s, showGame = true, showSave = true }: { s: Selection; showGame?: boolean; showSave?: boolean }) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <li data-testid="selection-row" data-selection-id={s.id} data-open="1" className="border-b border-line pb-4">
        <div className="flex justify-end">
          <button type="button" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-ink hover:underline" onClick={() => setOpen(false)}>
            Collapse <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <SelectionCard s={s} showGame={showGame} showSave={showSave} />
      </li>
    );
  }
  return (
    <li data-testid="selection-row" data-selection-id={s.id} data-open="0" className="border-b border-line">
      <button type="button" aria-expanded={false} onClick={() => setOpen(true)} className={cn("grid min-h-[44px] w-full items-center gap-x-4 gap-y-1.5 py-3 text-left hover:bg-raised/60 md:gap-x-6", ROW_COLS)}>
        <span className="col-span-3 flex min-w-0 items-baseline gap-3 md:col-span-1">
          <span className="num w-5 shrink-0 text-sm text-faint">{s.rank_in_game === null ? "—" : s.rank_in_game}</span>
          <span className="shrink-0 self-center"><SubjectMark s={s} size={36} /></span>
          <span className="min-w-0">
            <span className="h-sub block break-words text-ink">{s.market_label}</span>
            <span className="flex flex-wrap items-center gap-x-2.5 text-sm text-muted">
              {showGame && <span>{s.game_label}</span>}
              <ClassificationBadge value={s.classification} invalidated={s.invalidated} />
            </span>
          </span>
        </span>
        <span>
          <span className="block text-2xs text-faint md:hidden">Model estimate</span>
          <ProbabilityDisplay prob={s.prob} low={s.prob_low} high={s.prob_high} stack size="lg" />
        </span>
        <span className="hidden lg:block">
          <ProbScale prob={s.prob} low={s.prob_low} high={s.prob_high} breakeven={s.breakeven} />
        </span>
        <span className="num text-base text-ink md:text-right" title="Price">
          <span className="block text-2xs text-faint md:hidden">Price</span>
          <Val v={fmtAmerican(s.price_american)} />
          <span className="block truncate text-2xs text-faint">{s.book ?? "no book"}</span>
        </span>
        <span className="num text-base text-ink md:text-right" title="Break-even probability at the price">
          <span className="block text-2xs text-faint md:hidden">Break-even</span>
          <Val v={fmtPct(s.breakeven)} />
        </span>
        <span className="num hidden text-right text-base text-soft md:block" title="Edge (model probability minus break-even)">
          <Val v={fmtSignedPct(s.edge)} />
        </span>
        <span className="num hidden text-right text-base md:block" title="Evidence quality (not a probability)">
          {s.evidence_score === null ? <NA /> : <span className="text-ink">{s.evidence_score}<span className="text-faint">/100</span></span>}
        </span>
        <ChevronDown className="hidden h-4 w-4 text-faint md:block" aria-hidden />
      </button>
    </li>
  );
}

// Phone: contract on its own line, then estimate, price and break-even. Desktop: one ruled line.
const ROW_COLS = "grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[minmax(0,1.5fr)_7rem_7rem_5rem_4.5rem_4.5rem_1rem] lg:grid-cols-[minmax(0,1.4fr)_7rem_minmax(6rem,1fr)_7rem_5rem_4.5rem_4.5rem_1rem]";

/** Column heads for a list of selection rows. The estimate column is the only orange one. */
export function SelectionHead() {
  return (
    <div className={cn("hidden items-end gap-x-6 border-b border-rule-2 pb-2 md:grid", ROW_COLS)} aria-hidden data-testid="selection-head">
      <span className="slot text-muted">Contract</span>
      <span className="slot model whitespace-normal">Model estimate</span>
      <span className="num hidden justify-between text-2xs text-faint lg:flex">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </span>
      <span className="slot justify-end text-muted">Price</span>
      <span className="slot justify-end whitespace-normal text-right text-muted">Break-even</span>
      <span className="slot justify-end text-muted">Edge</span>
      <span className="slot justify-end text-muted">Evidence</span>
      <span />
    </div>
  );
}

/** Selection rows grouped by game, with at most `perGame` shown per game until expanded. */
export function SelectionsByGame({ items, perGame = 5, showSave = true }: { items: Selection[]; perGame?: number; showSave?: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; items: Selection[] }>();
    for (const s of items) {
      const g = m.get(s.game_id) ?? { label: s.game_label, items: [] };
      g.items.push(s);
      m.set(s.game_id, g);
    }
    return [...m.entries()];
  }, [items]);
  return (
    <div className="space-y-8" data-testid="selections-by-game">
      <SelectionHead />
      {groups.map(([id, g]) => (
        <GameGroup key={id} label={g.label} items={g.items} perGame={perGame} showSave={showSave} />
      ))}
    </div>
  );
}

function GameGroup({ label, items, perGame, showSave }: { label: string; items: Selection[]; perGame: number; showSave: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, perGame);
  return (
    <section className="min-w-0" data-testid="selection-game-group">
      <h3 className="flex items-baseline justify-between border-b-2 border-ink pb-1.5">
        <span className="team-name text-xl text-ink">{label}</span>
        <span className="num text-sm text-muted">
          {items.length} selection{items.length === 1 ? "" : "s"}
        </span>
      </h3>
      <ul>
        {shown.map((s) => (
          <SelectionRow key={s.id} s={s} showGame={false} showSave={showSave} />
        ))}
      </ul>
      {items.length > perGame && (
        <button type="button" className="link mt-1 inline-flex min-h-[44px] items-center text-sm" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
