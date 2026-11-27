import { Clock } from "lucide-react";
import { StatusDot, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { fmtDateTimeET, ORIGIN_LABELS, titleCase } from "@/lib/format";
import type { LineupStatus } from "@/lib/types";

/** Availability: "available" is neutral; any injury status text is shown verbatim with a severity dot. */
export function AvailabilityStatus({ value, detail, className }: { value: string | null | undefined; detail?: string | null; className?: string }) {
  if (!value) {
    return (
      <span className={cn("text-xs text-muted", className)} title="not available" aria-label="availability not available">
        —
      </span>
    );
  }
  const v = value.toLowerCase();
  const tone: Tone = v === "available" || v === "active" ? "neutral" : v.includes("out") || v.includes("inactive") ? "bad" : "warn";
  return (
    <StatusDot tone={tone} className={className} title={detail ?? undefined}>
      {titleCase(value)}
    </StatusDot>
  );
}

const LINEUP: Record<LineupStatus, { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "accent" },
  projected: { label: "Projected — not official", tone: "warn" },
  unknown: { label: "Awaiting confirmation", tone: "neutral" },
};

/** Lineup status. A projected lineup is never labelled as confirmed. */
export function LineupStatusLabel({ status, short = false, className }: { status: LineupStatus | null | undefined; short?: boolean; className?: string }) {
  const m = LINEUP[status ?? "unknown"] ?? LINEUP.unknown;
  return (
    <StatusDot tone={m.tone} className={className} data-lineup-status={status ?? "unknown"}>
      {short ? (status === "projected" ? "Projected" : status === "confirmed" ? "Confirmed" : "Awaiting") : m.label}
    </StatusDot>
  );
}

/** "Updated …" with an amber stale marker when the API says the data is old. */
export function FreshnessIndicator({ at, stale = false, label = "Updated", className }: { at: string | null | undefined; stale?: boolean; label?: string; className?: string }) {
  const t = fmtDateTimeET(at);
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs", stale ? "text-warn" : "text-muted", className)} data-stale={stale ? "1" : "0"}>
      <Clock className="h-3 w-3" aria-hidden />
      {t ? (
        <span className="num">
          {label} {t}
        </span>
      ) : (
        <span aria-label="time not available">{label} —</span>
      )}
      {stale && <span className="font-semibold">· stale</span>}
    </span>
  );
}

/** Where a quote came from. Owner-entered and hypothetical quotes are not independently verified. */
export function OriginTag({ origin, className }: { origin: string | null | undefined; className?: string }) {
  if (!origin) return <span className={cn("text-xs text-muted", className)}>No quote</span>;
  const verified = origin === "provider";
  return (
    <span
      className={cn("whitespace-nowrap text-xs font-medium", verified ? "text-muted" : "text-warn", className)}
      title={verified ? "Quote supplied by a configured provider" : "Not an independently verified quote"}
      data-origin={origin}
    >
      {ORIGIN_LABELS[origin] ?? titleCase(origin)}
    </span>
  );
}
