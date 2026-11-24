"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-raised", className)} aria-hidden />;
}

export function LoadingState({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2" data-state="loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-9", i % 3 === 2 ? "w-2/3" : "w-full")} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line-strong px-3 py-5 text-center" data-state="empty">
      <p className="text-sm text-soft">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-prose text-xs text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError
      ? `${error.message}${error.status ? ` (HTTP ${error.status})` : ""}`
      : error instanceof Error
        ? error.message
        : "Unexpected error.";
  return (
    <div role="alert" className="rounded border border-bad/50 bg-bad-dim/40 px-3 py-3" data-state="error">
      <p className="text-sm font-medium text-bad">Could not load this data</p>
      <p className="mt-0.5 break-words text-xs text-soft">{message}</p>
      {onRetry && (
        <Button className="mt-2" onClick={onRetry}>
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
