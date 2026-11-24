import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
  tone,
  id,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "accent" | "warn" | "bad";
  id?: string;
}) {
  const toneBorder =
    tone === "accent" ? "border-accent/50" : tone === "warn" ? "border-warn/50" : tone === "bad" ? "border-bad/50" : "border-line";
  return (
    <section id={id} className={cn("min-w-0 rounded border bg-panel", toneBorder, className)}>
      {(title || right) && (
        <header className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-3 py-1.5">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-soft">{title}</h2>
          {right && <div className="flex flex-wrap items-center gap-2 text-2xs text-muted">{right}</div>}
        </header>
      )}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h1 className="text-[17px] font-semibold leading-6 tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** Small label / value pair used in dense metric grids. */
export function Metric({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-2xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}

export function BulletList({ items, tone }: { items: string[]; tone?: "accent" | "warn" | "bad" | "muted" }) {
  const dot =
    tone === "accent" ? "bg-accent" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-muted";
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-xs text-soft">
          <span className={cn("mt-[7px] h-1 w-1 shrink-0 rounded-full", dot)} aria-hidden />
          <span className="min-w-0 break-words">{t}</span>
        </li>
      ))}
    </ul>
  );
}
