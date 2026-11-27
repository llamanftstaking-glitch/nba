import { NA } from "@/components/ui/na";
import { Meter } from "@/components/ui/meter";
import { fmtInterval, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Model probability with its interval, e.g. `58.2%  [53.1–63.0]`. Only registered-model output is rendered with this component. */
export function ProbabilityDisplay({
  prob,
  low,
  high,
  className,
  stack,
  size = "md",
}: {
  prob: number | null;
  low: number | null;
  high: number | null;
  className?: string;
  stack?: boolean;
  size?: "md" | "lg";
}) {
  const p = fmtPct(prob);
  const iv = fmtInterval(low, high);
  if (p === null) return <NA className={className} />;
  return (
    <span className={cn("num", stack ? "inline-flex flex-col" : "inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className={cn("model font-bold", size === "lg" && "score text-[1.75rem]")}>{p}</span>
      {iv ? (
        <span className="text-2xs font-normal text-faint" title="Interval for the model probability">
          {iv}
        </span>
      ) : (
        <span className="text-2xs font-normal text-faint" title="interval not available" aria-label="interval not available">
          [—]
        </span>
      )}
    </span>
  );
}

/**
 * A model estimate on a ruled 0–100 scale: the orange tick is the estimate, the wash is its interval and
 * the ink notch is the price break-even. Orange is used for nothing else, so an estimate can never be
 * mistaken for something observed.
 */
export function ProbScale({ prob, low, high, breakeven, className }: { prob: number | null; low: number | null; high: number | null; breakeven?: number | null; className?: string }) {
  if (prob === null) return <span className={className} />;
  const pos = (v: number) => `${Math.max(0, Math.min(100, v * 100))}%`;
  const label = `Model estimate ${fmtPct(prob)}${low !== null && high !== null ? `, interval ${fmtPct(low)} to ${fmtPct(high)}` : ""}${breakeven !== null && breakeven !== undefined ? `, price break-even ${fmtPct(breakeven)}` : ""}`;
  return (
    <span className={cn("relative block h-7 border-x border-rule-2", className)} role="img" aria-label={label} data-testid="prob-scale">
      <span className="absolute inset-x-0 top-1/2 h-px bg-rule-2" />
      <span className="absolute left-1/2 top-[9px] h-[10px] w-px bg-rule-2" />
      {low !== null && high !== null && <span className="absolute bottom-2 top-2 bg-model/20" style={{ left: pos(low), width: `${Math.max(0, (high - low) * 100)}%` }} />}
      {breakeven !== null && breakeven !== undefined && <span className="absolute bottom-[7px] top-[7px] -ml-px w-0.5 bg-ink" style={{ left: pos(breakeven) }} />}
      <span className="absolute bottom-0.5 top-0.5 -ml-0.5 w-1 bg-model" style={{ left: pos(prob) }} />
    </span>
  );
}

/** The key to the scale, shown once under a list of picks. */
export function ProbScaleKey({ className }: { className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-faint", className)} data-testid="prob-key">
      <span className="inline-flex items-center gap-2"><span className="h-4 w-1 bg-model" aria-hidden /> model estimate</span>
      <span className="inline-flex items-center gap-2"><span className="h-2.5 w-4 bg-model/20" aria-hidden /> its interval</span>
      <span className="inline-flex items-center gap-2"><span className="h-3 w-0.5 bg-ink" aria-hidden /> price break-even</span>
      <span className="text-muted">A model estimate is not an observed hit rate.</span>
    </p>
  );
}

/** @deprecated name kept for existing call sites. */
export const ProbInterval = ProbabilityDisplay;

/**
 * Evidence quality meter (0–100). Deliberately different from probability: a labelled bar in the neutral
 * data hue, because evidence quality is not a probability.
 */
export function EvidenceMeter({ score, className }: { score: number | null; className?: string }) {
  return (
    <div className={cn("min-w-[96px]", className)} data-testid="evidence-meter">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">Evidence</span>
        {score === null ? (
          <NA />
        ) : (
          <span className="num font-semibold text-ink">
            {score}
            <span className="text-muted">/100</span>
          </span>
        )}
      </div>
      <Meter value={score} tone="info" label="Evidence quality score" className="mt-1" />
    </div>
  );
}
