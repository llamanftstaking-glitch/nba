"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Overlay surface. `side="bottom"` is a bottom sheet at every width; `side="auto"` is a bottom sheet on
 * phones and a right-hand drawer from the md breakpoint (used for the prop research drawer).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  side = "bottom",
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  side?: "bottom" | "auto";
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"} data-testid={testId}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-lg bg-bg2 pb-[env(safe-area-inset-bottom)] ring-1 ring-line",
          side === "auto" && "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[560px] md:rounded-none md:rounded-l-lg",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5">
          <h2 className="min-w-0 font-display text-lg font-semibold uppercase tracking-wide text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink md:h-8 md:w-8" data-testid="sheet-close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
