"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Remembers what had focus when an overlay opened and gives it back when the overlay closes.
 * Radix returns focus to a `Dialog.Trigger`; our overlays are opened by ordinary buttons, table rows'
 * buttons and keyboard shortcuts, so the element is captured here (during the render in which `open`
 * turns true, before the dialog moves focus) and restored in `onCloseAutoFocus`.
 */
export function useReturnFocus(open: boolean): (e: Event) => void {
  const prev = useRef<HTMLElement | null>(null);
  const was = useRef(false);
  if (open && !was.current && typeof document !== "undefined") prev.current = document.activeElement as HTMLElement | null;
  was.current = open;
  return (e: Event) => {
    e.preventDefault();
    const el = prev.current;
    if (el && el.isConnected) el.focus();
  };
}

/**
 * Overlay surface built on Radix Dialog: focus moves in, stays in, and returns to the control that
 * opened it; Escape and the scrim close it; the page behind is inert.
 * `side="bottom"` is a bottom sheet at every width; `side="auto"` is a bottom sheet on phones and a
 * right-hand drawer from the md breakpoint.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  side = "bottom",
  testId,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  side?: "bottom" | "auto";
  testId?: string;
  wide?: boolean;
}) {
  const returnFocus = useReturnFocus(open);
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus}
          data-testid={testId}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t bg-bg2 pb-[env(safe-area-inset-bottom)] shadow-overlay focus:outline-none",
            side === "auto" && "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:rounded-none md:border-l md:border-line md:shadow-sheet",
            side === "auto" && (wide ? "md:w-[640px]" : "md:w-[560px]"),
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b-2 border-ink py-2 pl-4 pr-2 md:pl-6">
            <Dialog.Title className="h-sub min-w-0">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink hover:bg-raised" data-testid="sheet-close">
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:px-6 md:py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
