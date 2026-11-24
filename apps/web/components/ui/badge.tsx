import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "accent-solid" | "warn" | "bad" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-raised text-muted",
  accent: "bg-accent/10 text-accent ring-1 ring-inset ring-accent/40",
  "accent-solid": "bg-accent text-bg",
  warn: "bg-warn/10 text-warn ring-1 ring-inset ring-warn/40",
  bad: "bg-bad/10 text-bad ring-1 ring-inset ring-bad/40",
  info: "bg-info/10 text-info ring-1 ring-inset ring-info/30",
};

/** Boxed label. Reserved for classification and a few true states; ordinary metadata is plain text. */
export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide", TONES[tone], className)}
    >
      {children}
    </span>
  );
}

const DOT: Record<Tone, string> = {
  neutral: "bg-faint",
  accent: "bg-accent",
  "accent-solid": "bg-accent",
  warn: "bg-warn",
  bad: "bg-bad",
  info: "bg-info",
};

/** Status as a small coloured dot plus a text label (the label always carries the meaning). */
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
