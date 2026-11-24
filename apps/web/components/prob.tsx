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
      <span className={cn("font-semibold text-ink", size === "lg" && "text-xl leading-6")}>{p}</span>
      {iv ? (
        <span className="text-xs font-normal text-muted" title="Interval for the model probability">
          {iv}
        </span>
      ) : (
        <span className="text-xs font-normal text-muted" title="interval not available" aria-label="interval not available">
          [—]
        </span>
      )}
    </span>
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
          <span className="num font-medium text-info">
            {score}
            <span className="text-muted">/100</span>
          </span>
        )}
      </div>
      <Meter value={score} tone="info" label="Evidence quality score" className="mt-1" />
    </div>
  );
}
