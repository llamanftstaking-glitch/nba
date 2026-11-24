import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Summary } from "@/lib/types";
import { Val } from "@/components/ui/na";
import { fmtInt, fmtPct, fmtSigned, fmtSignedPct } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Stat tile: optional icon, label, one prominent value, optional sub-line. */
export function Tile({ label, children, sub, className, icon: Icon, tone }: { label: string; children: ReactNode; sub?: ReactNode; className?: string; icon?: LucideIcon; tone?: "warn" | "bad" }) {
  return (
    <div className={cn("flex min-w-0 gap-4 rounded-lg bg-card px-4 py-3 ring-1 ring-inset", tone === "warn" ? "ring-warn/40" : tone === "bad" ? "ring-bad/40" : "ring-line/60", className)} data-testid="tile">
      {Icon && <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-accent")} aria-hidden />}
      <div className="min-w-0">
        <div className="text-2xs font-semibold uppercase tracking-wide text-muted">{label}</div>
        <div className="num mt-0.5 text-[22px] font-semibold leading-7 text-ink">{children}</div>
        {sub && <div className="num text-xs text-muted">{sub}</div>}
      </div>
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
  if (compact) {
    // Inline figures for use inside a panel: no nested cards.
    const item = (label: string, value: ReactNode, sub: ReactNode) => (
      <div className="min-w-0">
        <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
        <dd className="num whitespace-nowrap text-xl font-semibold leading-7 text-ink">{value}</dd>
        <dd className="num text-xs text-muted">{sub}</dd>
      </div>
    );
    return (
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4" data-testid="summary-compact">
        {item("Settled", fmtInt(s.settled), `${fmtInt(s.tickets)} tickets`)}
        {item("W / L / P / V", `${s.wins}/${s.losses}/${s.pushes}/${s.voids}`, `${fmtInt(s.unresolved)} unresolved`)}
        {item("Hit rate", <Val v={fmtPct(s.hit_rate)} />, ciText(s.hit_rate_ci))}
        {item("Avg predicted", <Val v={fmtPct(s.avg_model_prob)} />, "mean model probability")}
      </dl>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
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
      <Tile label="Simulated ROI" sub={ciText(s.roi_ci, true)}>
        <Val v={fmtSignedPct(s.roi)} />
      </Tile>
      <Tile label="Max drawdown (units)" sub={`P&L ${fmtSigned(s.pnl_units) ?? "—"} on ${s.staked_units.toFixed(2)} staked`}>
        <Val v={s.max_drawdown_units === null ? null : s.max_drawdown_units.toFixed(2)} />
      </Tile>
      <Tile label="Sample size" sub={`${fmtInt(s.priced_tickets)} priced tickets`}>
        n={fmtInt(s.settled)}
      </Tile>
    </div>
  );
}
