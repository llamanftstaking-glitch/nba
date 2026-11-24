import type { ReactNode } from "react";
import type { Summary } from "@/lib/types";
import { Val } from "@/components/ui/na";
import { fmtInt, fmtPct, fmtSigned, fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/cn";

export function Tile({ label, children, sub, className }: { label: string; children: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded border border-line bg-panel px-3 py-2", className)} data-testid="tile">
      <div className="text-2xs uppercase tracking-wide text-muted">{label}</div>
      <div className="num mt-0.5 text-[17px] font-semibold leading-6 text-ink">{children}</div>
      {sub && <div className="num text-2xs text-muted">{sub}</div>}
    </div>
  );
}

export function ciText(ci: [number, number] | null, signed = false): ReactNode {
  if (!ci) return <span title="not available" aria-label="interval not available">CI —</span>;
  const f = signed ? fmtSignedPct : fmtPct;
  return (
    <span>
      95% CI [{f(ci[0])} – {f(ci[1])}]
    </span>
  );
}

export function SummaryTiles({ s, compact = false }: { s: Summary; compact?: boolean }) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 md:grid-cols-4 xl:grid-cols-7")}>
      <Tile label="Settled" sub={`${fmtInt(s.tickets)} tickets · ${fmtInt(s.unresolved)} unresolved`}>
        {fmtInt(s.settled)}
      </Tile>
      <Tile label="W / L / Push / Void">
        <span className="whitespace-nowrap">
          {s.wins}/{s.losses}/{s.pushes}/{s.voids}
        </span>
      </Tile>
      <Tile label="Hit rate" sub={ciText(s.hit_rate_ci)}>
        <Val v={fmtPct(s.hit_rate)} />
      </Tile>
      <Tile label="Avg predicted prob." sub="mean model probability">
        <Val v={fmtPct(s.avg_model_prob)} />
      </Tile>
      {!compact && (
        <>
          <Tile label="Simulated ROI" sub={ciText(s.roi_ci, true)}>
            <Val v={fmtSignedPct(s.roi)} />
          </Tile>
          <Tile label="Max drawdown (units)" sub={`P&L ${fmtSigned(s.pnl_units) ?? "—"} on ${s.staked_units.toFixed(2)} staked`}>
            <Val v={s.max_drawdown_units === null ? null : s.max_drawdown_units.toFixed(2)} />
          </Tile>
          <Tile label="Sample size" sub={`${fmtInt(s.priced_tickets)} priced tickets`}>
            n={fmtInt(s.settled)}
          </Tile>
        </>
      )}
    </div>
  );
}
