import { NA } from "@/components/ui/na";
import { Meter } from "@/components/ui/meter";
import { fmtInterval, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Probability with its interval, e.g. `58.2%  [53.1–63.0]`. */
export function ProbInterval({
  prob,
  low,
  high,
  className,
  stack,
}: {
  prob: number | null;
  low: number | null;
  high: number | null;
  className?: string;
  stack?: boolean;
}) {
  const p = fmtPct(prob);
  const iv = fmtInterval(low, high);
  if (p === null) return <NA className={className} />;
  return (
    <span className={cn("num", stack ? "inline-flex flex-col" : "inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className="font-semibold text-ink">{p}</span>
      {iv ? (
        <span className="text-xs text-muted" title="Interval for the model probability">
          {iv}
        </span>
      ) : (
        <span className="text-xs text-muted" title="interval not available" aria-label="interval not available">
          [—]
        </span>
      )}
    </span>
  );
}

/**
 * Evidence quality meter (0–100). Deliberately styled differently from probability
 * (labelled, sky-blue bar) because evidence quality is not a probability.
 */
export function EvidenceMeter({ score, className }: { score: number | null; className?: string }) {
  return (
    <div className={cn("min-w-[92px]", className)} data-testid="evidence-meter">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">Evidence</span>
        {score === null ? (
          <NA />
        ) : (
          <span className="num text-info">
            {score}
            <span className="text-muted">/100</span>
          </span>
        )}
      </div>
      <Meter value={score} tone="info" label="Evidence quality score" className="mt-0.5" />
    </div>
  );
}
