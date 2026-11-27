import { cn } from "@/lib/cn";

/** Thin horizontal meter (0..max) on a rule. Colour carries no meaning on its own; always pair with a label. */
export function Meter({
  value,
  max = 100,
  tone = "neutral",
  label,
  className,
}: {
  value: number | null;
  max?: number;
  tone?: "neutral" | "accent" | "warn" | "bad" | "info";
  label: string;
  className?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const fill = tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : tone === "info" ? "bg-info" : "bg-ink";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      aria-valuetext={value === null ? "not available" : `${value} of ${max}`}
      className={cn("h-1 w-full overflow-hidden bg-line", className)}
    >
      <div className={cn("h-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Horizontal share bar with a label and value, used for exposure and distribution lists. */
export function ShareBar({ label, value, right, tone = "info" }: { label: string; value: number; right: string; tone?: "info" | "warn" }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 break-words text-soft">{label}</span>
        <span className="num shrink-0 font-semibold text-ink">{right}</span>
      </div>
      <div className="mt-1 h-1 w-full bg-line" role="img" aria-label={`${label}: ${right}`}>
        <div className={cn("h-full", tone === "warn" ? "bg-warn" : "bg-info")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
