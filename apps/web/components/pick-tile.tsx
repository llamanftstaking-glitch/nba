"use client";

import { ChevronUp } from "lucide-react";
import { useState } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { SelectionCard } from "@/components/selection-card";
import { SubjectMark } from "@/components/subject-mark";
import { cn } from "@/lib/cn";
import { fmtAmerican, fmtLine, fmtNum, fmtPct, fmtSignedPct, propMarketName } from "@/lib/format";
import type { ComboLeg, Selection } from "@/lib/types";

/** "Over 24.5" / "Under 9.5" / "Home -3.5": the side and line the way a betting board prints them. */
export function sideLine(side: string, line: number | null, market?: string): string {
  const l = market === "spread" && line !== null && line > 0 ? `+${fmtLine(line)}` : fmtLine(line);
  const w = side.charAt(0).toUpperCase() + side.slice(1);
  return l === null ? w : `${w} ${l}`;
}

function propTitle(market: string, label: string | null | undefined): string {
  return market.startsWith("player_") ? propMarketName(market) : label ?? market;
}

/** The side pill with its American price under it. Over is filled, under is outlined, game sides are filled. */
export function SidePill({ side, line, price, market, size = "md" }: { side: string; line: number | null; price: number | null; market?: string; size?: "sm" | "md" }) {
  const under = side === "under";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 flex-col items-center justify-center rounded-md text-center leading-tight",
        size === "md" ? "min-w-[6.5rem] px-3 py-2" : "min-w-[5.5rem] px-2 py-1.5",
        under ? "bg-bg2 text-ink ring-1 ring-inset ring-line-strong" : "bg-ink text-bg2",
      )}
      data-testid="side-pill"
    >
      <span className={cn("num font-bold", size === "md" ? "text-sm" : "text-xs")}>{sideLine(side, line, market)}</span>
      <span className={cn("num font-semibold", size === "md" ? "text-base" : "text-sm")}>{fmtAmerican(price) ?? "—"}</span>
    </span>
  );
}

/**
 * Board-style line for a ranked pick, the way a betting board lists a prop: photo, player, stat, the model numbers,
 * and the side with its price. Expands in place to the full research card. Keeps the `selection-row` test id.
 */
export function PickTile({ s, showGame = true, showSave = true }: { s: Selection; showGame?: boolean; showSave?: boolean }) {
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
  const player = s.subject_type === "player";
  return (
    <li data-testid="selection-row" data-selection-id={s.id} data-open="0" className="border-b border-line">
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setOpen(true)}
        className={cn("grid min-h-[44px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 text-left hover:bg-raised/60 md:grid-cols-[minmax(0,1fr)_17rem_auto]",
          s.invalidated && "opacity-60")}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="shrink-0"><SubjectMark s={s} size={48} /></span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{player ? s.subject_name : s.market_label}</span>
            {player && <span className="block truncate text-sm text-soft">{propTitle(s.market, s.market_label)}</span>}
            {showGame && <span className="block truncate text-sm text-muted">{s.game_label}</span>}
            {s.invalidated && <span className="block text-sm font-semibold text-bad">Invalidated</span>}
          </span>
        </span>
        <span className="order-last col-span-2 grid grid-cols-4 gap-2 md:order-none md:col-span-1">
          <Stat label="Projection" v={fmtNum(s.projection)} />
          <Stat label="Model" v={fmtPct(s.prob, 0)} strong />
          <Stat label="Break-even" v={fmtPct(s.breakeven, 0)} />
          <Stat label="Edge" v={fmtSignedPct(s.edge)} />
        </span>
        <SidePill side={s.side} line={s.line} price={s.price_american} market={s.market} />
      </button>
    </li>
  );
}

function Stat({ label, v, strong }: { label: string; v: string | null; strong?: boolean }) {
  return (
    <span className="min-w-0">
      <span className="block text-xs text-muted">{label}</span>
      <span className={cn("num block text-sm", strong ? "font-semibold text-model-text" : "text-ink")}>{v ?? "—"}</span>
    </span>
  );
}

/** One leg on a parlay slip: photo, player, stat, side and price. */
export function SlipLeg({ l }: { l: ComboLeg }) {
  const player = l.subject_type === "player" || l.market.startsWith("player_");
  return (
    <li className="flex items-center gap-3 py-2" data-testid="slip-leg">
      {player ? <PlayerAvatar name={l.subject_name} src={l.headshot_url} size={36} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{player ? l.subject_name : l.label}</span>
        <span className="block truncate text-sm text-muted">
          {player ? `${propTitle(l.market, l.label)}, ` : ""}
          {l.game_label}
        </span>
      </span>
      <span className="num shrink-0 text-right text-sm">
        <span className="block font-bold text-ink">{sideLine(l.side, l.line, l.market)}</span>
        <span className="block text-muted">{fmtAmerican(l.price_american) ?? "—"}</span>
      </span>
    </li>
  );
}
