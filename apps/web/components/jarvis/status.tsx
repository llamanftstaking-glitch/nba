import { cn } from "@/lib/cn";
import type { PillState } from "./use-jarvis";

const MAP: Record<PillState, { label: string; dot: string; text: string }> = {
  ready: { label: "Ready", dot: "bg-ink", text: "text-ink" },
  processing: { label: "Processing", dot: "bg-ink animate-pulse", text: "text-ink" },
  provider_unavailable: { label: "Provider unavailable", dot: "bg-warn", text: "text-warn" },
  budget_limited: { label: "Budget limited", dot: "bg-warn", text: "text-warn" },
  paused: { label: "Paused", dot: "bg-warn", text: "text-warn" },
  error: { label: "Error", dot: "bg-bad", text: "text-bad" },
};

/** JARVIS status pill. "Processing" appears only while a request is in flight. */
export function JarvisPill({ state, message, showMessage = false, className }: { state: PillState; message?: string; showMessage?: boolean; className?: string }) {
  const m = MAP[state] ?? MAP.ready;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <span className={cn("slot shrink-0", m.text)} title={message} data-testid="jarvis-pill" data-state={state}>
        <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} aria-hidden />
        {m.label}
      </span>
      {showMessage && message && <span className="min-w-0 truncate text-sm text-muted" title={message}>{message}</span>}
    </span>
  );
}
