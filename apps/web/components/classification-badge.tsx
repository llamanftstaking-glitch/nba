import { Badge, StatusDot, type Tone } from "@/components/ui/badge";
import { CLASSIFICATION_LABELS, titleCase } from "@/lib/format";

const MAP: Record<string, { label: string; tone: Tone }> = {
  high_confidence: { label: CLASSIFICATION_LABELS.high_confidence!, tone: "accent-solid" },
  standard: { label: CLASSIFICATION_LABELS.standard!, tone: "accent" },
  watchlist: { label: CLASSIFICATION_LABELS.watchlist!, tone: "warn" },
  insufficient_evidence: { label: CLASSIFICATION_LABELS.insufficient_evidence!, tone: "neutral" },
  stale: { label: CLASSIFICATION_LABELS.stale!, tone: "warn" },
  rejected: { label: CLASSIFICATION_LABELS.rejected!, tone: "bad" },
  invalidated: { label: CLASSIFICATION_LABELS.invalidated!, tone: "bad" },
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
