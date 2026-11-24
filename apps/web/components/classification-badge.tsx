import { Badge, type Tone } from "@/components/ui/badge";
import { titleCase } from "@/lib/format";

const MAP: Record<string, { label: string; tone: Tone }> = {
  high_confidence: { label: "High confidence", tone: "accent-solid" },
  standard: { label: "Standard", tone: "accent" },
  watchlist: { label: "Watchlist", tone: "warn" },
  insufficient_evidence: { label: "Insufficient evidence", tone: "neutral" },
  rejected: { label: "Rejected", tone: "bad" },
  invalidated: { label: "Invalidated", tone: "bad" },
};

/** Classification is always carried by a text label; colour is secondary. */
export function ClassificationBadge({ value, invalidated }: { value: string; invalidated?: boolean }) {
  const key = invalidated ? "invalidated" : value;
  const m = MAP[key] ?? { label: titleCase(key), tone: "neutral" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function isQualified(classification: string, invalidated?: boolean): boolean {
  return !invalidated && (classification === "high_confidence" || classification === "standard");
}

export function StatusBadge({ value }: { value: string }) {
  const v = value.toLowerCase();
  const tone: Tone =
    ["ok", "ready", "win", "passed", "alive", "succeeded", "success", "done", "completed", "production", "champion", "active"].includes(v)
      ? "accent"
      : ["failed", "loss", "error", "dead", "rejected", "invalidated", "down"].includes(v)
        ? "bad"
        : ["abstained", "degraded", "stale", "push", "void", "unresolved", "retrying", "candidate", "shadow", "paused", "watchlist"].includes(v)
          ? "warn"
          : "neutral";
  return <Badge tone={tone}>{v === "never_run" ? "never run" : titleCase(value)}</Badge>;
}
