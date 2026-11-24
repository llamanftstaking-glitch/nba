"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, Layers, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-raised", className)} aria-hidden />;
}

export function LoadingState({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2" data-state="loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-10", i % 3 === 2 ? "w-2/3" : "w-full")} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** Explicit empty state: one honest sentence, never filler content. */
export function EmptyState({ title, children, icon: Icon = Layers }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center rounded-md bg-raised/40 px-4 py-6 text-center" data-state="empty">
      <Icon className="mb-2 h-5 w-5 text-faint" aria-hidden />
      <p className="max-w-prose text-sm font-medium text-soft">{title}</p>
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
    <div role="alert" className="flex items-start gap-3 rounded-md bg-bad/10 px-4 py-3 ring-1 ring-inset ring-bad/40" data-state="error">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-bad">Could not load this data</p>
        <p className="mt-0.5 break-words text-xs text-soft">{message}</p>
        {onRetry && (
          <Button className="mt-2" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
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
