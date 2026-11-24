import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "accent-solid" | "warn" | "bad" | "info";

const TONES: Record<Tone, string> = {
  neutral: "border-line-strong bg-raised text-soft",
  accent: "border-accent/50 bg-accent-dim/40 text-accent",
  "accent-solid": "border-accent bg-accent text-bg",
  warn: "border-warn/50 bg-warn-dim/60 text-warn",
  bad: "border-bad/50 bg-bad-dim/60 text-bad",
  info: "border-info/40 bg-info-dim/50 text-info",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded border px-1.5 py-px text-2xs font-semibold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StaleTag({ label = "stale", title }: { label?: string; title?: string }) {
  return (
    <Badge tone="warn" title={title}>
      {label}
    </Badge>
  );
}
