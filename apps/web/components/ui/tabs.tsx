"use client";

import { cn } from "@/lib/cn";

export type TabItem = { id: string; label: string; count?: number | null };

/** Wrapping tab list (no horizontal scrolling on narrow screens). */
export function Tabs({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-line pb-2">
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            data-tab={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded border px-2 text-xs font-medium transition-colors",
              active
                ? "border-accent/60 bg-accent-dim/40 text-ink"
                : "border-line bg-panel text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span className={cn("num rounded-sm px-1 text-2xs", active ? "bg-accent/20 text-accent" : "bg-raised text-soft")}>
                {t.count === null ? "—" : t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
