import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "accent-solid" | "warn" | "bad" | "info";

// A label is text. Only the top research tier keeps a box, because it is the one label
// that has to be found at a glance.
const TONES: Record<Tone, string> = {
  neutral: "text-muted",
  accent: "text-ink",
  "accent-solid": "rounded-sm bg-ink px-1.5 py-px text-bg2",
  warn: "text-warn",
  bad: "text-bad",
  info: "text-info",
};

/** Classification and a few true states, as a short weighted word. */
export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center whitespace-nowrap text-2xs font-bold", TONES[tone], className)}>
      {children}
    </span>
  );
}

const DOT: Record<Tone, string> = {
  neutral: "border border-faint bg-transparent",
  accent: "bg-ink",
  "accent-solid": "bg-ink",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
};

/** Status as a small mark plus a text label (the label always carries the meaning). */
export function StatusDot({ tone = "neutral", children, className, ...rest }: { tone?: Tone; children: ReactNode } & Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  return (
    <span {...rest} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-soft", className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function StaleTag({ label = "stale", title }: { label?: string; title?: string }) {
  return (
    <StatusDot tone="warn" title={title} className="text-warn">
      {label}
    </StatusDot>
  );
}
