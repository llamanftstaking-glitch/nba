import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Retired brand mark. Kept as an export so older call sites compile; it renders nothing. */
export function SlashMark(props: { className?: string }) {
  void props;
  return null;
}

/**
 * A page section: a heading on a 2px ink rule, then the content directly on the page.
 * It is not a box. `icon` is accepted for older call sites and not drawn (an icon beside
 * every heading carried no information). `tone` adds a status word, not a coloured frame.
 */
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
  icon?: LucideIcon;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "accent" | "warn" | "bad";
  id?: string;
}) {
  const hid = useId();
  return (
    <section id={id} aria-labelledby={title ? hid : undefined} data-tone={tone} className={cn("min-w-0 scroll-mt-36", className)}>
      {(title || right) && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-2">
          <h2 id={hid} className={cn("h-section min-w-0", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>
            {title}
          </h2>
          {right && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">{right}</div>}
        </header>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 md:mb-6">
      <div className="min-w-0">
        <h1 className="h-page break-words">{title}</h1>
        {sub && <p className="mt-2 max-w-[68ch] text-base text-muted">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{right}</div>}
    </div>
  );
}

/** Section heading inside a page, on the same ink rule as a Panel. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-2.5">
      <h2 className="h-section min-w-0">{children}</h2>
      {right && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">{right}</div>}
    </div>
  );
}

/** A typographic stat: the value, with a plain sentence-case label under it. */
export function Metric({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-2xs text-muted">{label}</div>
      <div className="num text-base font-semibold text-ink">{children}</div>
    </div>
  );
}

export function BulletList({ items, tone }: { items: string[]; tone?: "accent" | "warn" | "bad" | "muted" }) {
  const dot = tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-faint";
  return (
    <ul className="space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-soft">
          <span className={cn("mt-[10px] h-1 w-1 shrink-0 rounded-full", dot)} aria-hidden />
          <span className="min-w-0 break-words">{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** A readable sentence-case label above a block of content. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-1 text-xs font-semibold text-muted", className)}>{children}</div>;
}
