"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export type TabItem = { id: string; label: string; count?: number | null };

/**
 * Tab list on a hairline: the selected tab is ink with a 3px underline. Arrow keys, Home and End move
 * between tabs and only the selected tab is in the Tab order. `scroll` keeps it on one line and lets the
 * row scroll sideways inside itself (the page never scrolls sideways).
 */
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
  const ref = useRef<HTMLDivElement | null>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.id === value);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = items[(next + items.length) % items.length];
    if (!t) return;
    onChange(t.id);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${CSS.escape(t.id)}"]`)?.focus());
  };
  return (
    <div ref={ref} role="tablist" aria-label={label} onKeyDown={onKey} className={cn("flex gap-x-6 border-b border-line", scroll ? "no-scrollbar overflow-x-auto" : "flex-wrap")}>
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-tab={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] pt-[3px] transition-colors",
              size === "sm" ? "text-sm md:min-h-[40px]" : "text-base",
              active ? "border-ink font-bold text-ink" : "border-transparent font-medium text-muted hover:text-ink",
            )}
          >
            <span>{t.label}</span>
            {t.count !== undefined && <span className={cn("num text-xs font-normal", active ? "text-ink" : "text-faint")}>{t.count === null ? "—" : t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
