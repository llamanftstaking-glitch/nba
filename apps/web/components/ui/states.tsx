"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/** A quiet placeholder line. Not a frame: it is used only where a real value is about to appear. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("h-px bg-line", className)} aria-hidden />;
}

/**
 * Loading: one sentence and a thin moving bar on the section's rule. No grey boxes that guess at
 * the content. After eight seconds it says so, instead of pulsing for ever.
 */
export function LoadingState({ label = "Loading" }: { rows?: number; label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" aria-label={label} className="py-3" data-state="loading">
      <div className="relative h-0.5 overflow-hidden bg-line" aria-hidden>
        <div className="absolute inset-y-0 w-1/4 bg-ink motion-safe:animate-[loading-bar_1.4s_ease-in-out_infinite]" />
      </div>
      <p className="mt-2 text-xs text-muted">
        {label}…{slow ? " The server has not answered yet; this is taking longer than usual." : ""}
      </p>
    </div>
  );
}

/** Explicit empty state: one honest sentence set on the page. No frame, no filler. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="max-w-[68ch] py-3" data-state="empty">
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Could not load this data" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message =
    error instanceof ApiError
      ? `${error.message}${error.status ? ` (HTTP ${error.status})` : ""}`
      : error instanceof Error
        ? error.message
        : "Unexpected error.";
  return (
    <div role="alert" className="max-w-[68ch] border-l-4 border-bad py-2 pl-4" data-state="error">
      <p className="text-base font-bold text-bad">{title}</p>
      <p className="mt-0.5 break-words text-sm text-soft">{message}</p>
      {onRetry && (
        <Button className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Uniform loading / error / empty handling for a TanStack query. */
export function QueryView<T>({
  query,
  children,
  rows,
  isEmpty,
  empty,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  rows?: number;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
}) {
  if (query.isPending) return <LoadingState rows={rows} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (isEmpty && isEmpty(query.data)) return <>{empty ?? <EmptyState title="No data available." />}</>;
  return <>{children(query.data)}</>;
}
