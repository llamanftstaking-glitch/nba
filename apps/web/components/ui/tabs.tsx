"use client";

import { cn } from "@/lib/cn";

export type TabItem = { id: string; label: string; count?: number | null };

/** Tab list. Wraps by default; `scroll` makes it a horizontally swipeable chip row (the page itself never scrolls sideways). */
export function Tabs({
  items,
  value,
  onChange,
  label,
  scroll = false,
  size = "md",
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  scroll?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex gap-1.5", scroll ? "no-scrollbar -mx-1 overflow-x-auto px-1" : "flex-wrap")}>
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
              "inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium transition-colors",
              size === "sm" ? "min-h-[44px] px-3 text-sm md:min-h-0 md:h-7 md:px-2.5 md:text-xs" : "min-h-[44px] px-3 text-sm md:min-h-0 md:h-9",
              active ? "bg-accent/10 text-ink ring-1 ring-inset ring-accent/50" : "bg-raised/60 text-muted hover:bg-raised hover:text-ink",
            )}
          >
            <span>{t.label}</span>
            {t.count !== undefined && <span className={cn("num text-xs", active ? "text-accent" : "text-faint")}>{t.count === null ? "—" : t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
