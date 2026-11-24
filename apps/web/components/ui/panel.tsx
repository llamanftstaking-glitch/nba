import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The double-slash brand mark. */
export function SlashMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 20" className={cn("h-4 w-5 shrink-0 text-accent", className)} aria-hidden>
      <path d="M8 0h7L7 20H0z" fill="currentColor" />
      <path d="M19 0h7l-8 20h-7z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function Panel({
  title,
  icon: Icon,
  right,
  children,
  className,
  bodyClassName,
  tone,
  id,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "accent" | "warn" | "bad";
  id?: string;
}) {
  const ring = tone === "accent" ? "ring-accent/35" : tone === "warn" ? "ring-warn/35" : tone === "bad" ? "ring-bad/35" : "ring-line/60";
  const iconTone = tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-accent";
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-20 rounded-lg bg-card ring-1 ring-inset", ring, className)}>
      {(title || right) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 pt-3.5">
          <h2 className="flex min-w-0 items-center gap-2 font-display text-[17px] font-semibold uppercase leading-5 tracking-wide text-ink">
            {Icon && <Icon className={cn("h-[18px] w-[18px] shrink-0", iconTone)} aria-hidden />}
            <span className="min-w-0">{title}</span>
          </h2>
          {right && <div className="flex flex-wrap items-center gap-2 text-xs text-muted">{right}</div>}
        </header>
      )}
      <div className={cn("p-4", Boolean(title || right) && "pt-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 font-display text-[30px] font-bold uppercase italic leading-8 tracking-wide text-ink md:text-[34px] md:leading-9">
          <SlashMark className="h-5 w-7 md:h-6 md:w-8" />
          <span className="min-w-0 break-words">{title}</span>
        </h1>
        {sub && <p className="mt-1 max-w-3xl text-sm text-muted">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** Small section heading inside a page (no card). */
export function SectionTitle({ children, right, icon: Icon }: { children: ReactNode; right?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold uppercase tracking-wide text-ink">
        {Icon ? <Icon className="h-[18px] w-[18px] text-accent" aria-hidden /> : <SlashMark className="h-3 w-4" />}
        {children}
      </h2>
      {right && <div className="flex flex-wrap items-center gap-2 text-xs text-muted">{right}</div>}
    </div>
  );
}

/** Small label / value pair used in metric grids. */
export function Metric({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm font-medium text-ink">{children}</div>
    </div>
  );
}

export function BulletList({ items, tone }: { items: string[]; tone?: "accent" | "warn" | "bad" | "muted" }) {
  const dot = tone === "accent" ? "bg-teal" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-faint";
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm text-soft">
          <span className={cn("mt-[8px] h-1 w-1 shrink-0 rounded-full", dot)} aria-hidden />
          <span className="min-w-0 break-words">{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Small uppercase label above a block of content. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-1 text-2xs font-semibold uppercase tracking-wide text-muted", className)}>{children}</div>;
}
