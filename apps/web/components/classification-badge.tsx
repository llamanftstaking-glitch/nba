import { Badge, StatusDot, type Tone } from "@/components/ui/badge";
import { titleCase } from "@/lib/format";

const MAP: Record<string, { label: string; tone: Tone }> = {
  high_confidence: { label: "High confidence", tone: "accent-solid" },
  standard: { label: "Standard", tone: "accent" },
  watchlist: { label: "Watchlist", tone: "warn" },
  insufficient_evidence: { label: "Insufficient evidence", tone: "neutral" },
  rejected: { label: "Rejected", tone: "bad" },
  invalidated: { label: "Invalidated", tone: "bad" },
};

/** Classification is always carried by a text label; colour is secondary. One of the two places a boxed badge is used. */
export function ClassificationBadge({ value, invalidated }: { value: string; invalidated?: boolean }) {
  const key = invalidated ? "invalidated" : value;
  const m = MAP[key] ?? { label: titleCase(key), tone: "neutral" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function isQualified(classification: string, invalidated?: boolean): boolean {
  return !invalidated && (classification === "high_confidence" || classification === "standard");
}

export function statusTone(value: string): Tone {
  const v = value.toLowerCase();
  if (["ok", "ready", "win", "passed", "alive", "succeeded", "success", "done", "completed", "production", "champion", "active", "final"].includes(v)) return "accent";
  if (["failed", "loss", "error", "dead", "rejected", "invalidated", "down", "missing"].includes(v)) return "bad";
  if (["abstained", "degraded", "stale", "push", "void", "unresolved", "retrying", "candidate", "shadow", "paused", "watchlist", "never_run", "not_configured", "live", "postponed"].includes(v)) return "warn";
  return "neutral";
}

/** Generic status: coloured dot + text label (no box). */
export function StatusBadge({ value }: { value: string }) {
  return <StatusDot tone={statusTone(value)}>{value.toLowerCase() === "never_run" ? "Never run" : titleCase(value)}</StatusDot>;
}
