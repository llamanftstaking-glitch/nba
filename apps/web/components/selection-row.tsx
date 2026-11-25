"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { ClassificationBadge } from "@/components/classification-badge";
import { ProbabilityDisplay } from "@/components/prob";
import { SelectionCard } from "@/components/selection-card";
import { NA, Val } from "@/components/ui/na";
import { cn } from "@/lib/cn";
import { fmtAmerican, fmtSignedPct } from "@/lib/format";
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
      <li data-testid="selection-row" data-selection-id={s.id} data-open="1">
        <div className="mb-1 flex justify-end">
          <button type="button" className="inline-flex min-h-[44px] items-center gap-1 text-xs font-medium text-muted hover:text-ink md:min-h-0" onClick={() => setOpen(false)}>
            Collapse <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <SelectionCard s={s} showGame={showGame} showSave={showSave} />
      </li>
    );
  }
  return (
    <li data-testid="selection-row" data-selection-id={s.id} data-open="0">
      <button type="button" aria-expanded={false} onClick={() => setOpen(true)} className={cn("grid min-h-[44px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 text-left hover:bg-raised/50 md:grid-cols-[auto_minmax(0,1fr)_auto_5rem_4.5rem_4.5rem_auto]", s.invalidated && "opacity-70")}>
        <span className="num inline-flex h-6 min-w-6 items-center justify-center rounded bg-raised px-1 text-xs font-semibold text-soft">{s.rank_in_game === null ? "—" : `#${s.rank_in_game}`}</span>
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold text-ink">{s.market_label}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {showGame && <span>{s.game_label}</span>}
            <ClassificationBadge value={s.classification} invalidated={s.invalidated} />
          </span>
        </span>
        <span className="text-right">
          <ProbabilityDisplay prob={s.prob} low={s.prob_low} high={s.prob_high} stack className="items-end" />
        </span>
        <span className="num hidden text-right text-sm text-soft md:block" title="Price">
          <Val v={fmtAmerican(s.price_american)} />
          <span className="block truncate text-xs text-muted">{s.book ?? "no book"}</span>
        </span>
        <span className="num hidden text-right text-sm text-soft md:block" title="Edge (model probability minus break-even)">
          <Val v={fmtSignedPct(s.edge)} />
          <span className="block text-xs text-muted">edge</span>
        </span>
        <span className="num hidden text-right text-sm md:block" title="Evidence quality (not a probability)">
          {s.evidence_score === null ? <NA /> : <span className="text-info">{s.evidence_score}/100</span>}
          <span className="block text-xs text-muted">evidence</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-faint md:block" aria-hidden />
      </button>
    </li>
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
    <div className="grid gap-x-6 gap-y-4 2xl:grid-cols-2" data-testid="selections-by-game">
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
      <h3 className="flex items-baseline justify-between border-b border-line/50 pb-1 font-display text-[15px] font-semibold uppercase tracking-wide text-soft">
        {label}
        <span className="num font-sans text-xs font-normal normal-case text-muted">{items.length} selection(s)</span>
      </h3>
      <ul className="divide-y divide-line/30">
        {shown.map((s) => (
          <SelectionRow key={s.id} s={s} showGame={false} showSave={showSave} />
        ))}
      </ul>
      {items.length > perGame && (
        <button type="button" className="mt-1 inline-flex min-h-[44px] items-center text-xs font-medium text-accent hover:underline md:min-h-0" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
