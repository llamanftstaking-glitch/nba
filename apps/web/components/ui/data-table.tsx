"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "right";
  /** Shown as the heading of the stacked card on mobile instead of a label/value pair. */
  primary?: boolean;
  className?: string;
  /** Drop this label/value pair from the stacked mobile card for rows where it carries no information. */
  hideOnMobile?: (row: T) => boolean;
};

/**
 * Responsive table: a real <table> from the xl breakpoint up (the sidebar leaves too little room below it), stacked label/value cards below it.
 * This is how every tabular view avoids horizontal scrolling at 375px.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  rowClassName,
  dense,
  mobileLimit,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  caption: string;
  rowClassName?: (row: T) => string | undefined;
  dense?: boolean;
  /** In the stacked (below xl) layout, show this many rows first with a "Show all" control. */
  mobileLimit?: number;
}) {
  const [allMobile, setAllMobile] = useState(false);
  const primary = columns.filter((c) => c.primary);
  const rest = columns.filter((c) => !c.primary);
  return (
    <>
      <div className="hidden xl:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-2 pb-2 text-2xs font-semibold uppercase tracking-wide text-muted",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} className={cn("border-b border-line/40 align-top last:border-0 hover:bg-raised/40", rowClassName?.(r))}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-2 text-soft", dense ? "py-1.5" : "py-2", c.align === "right" && "text-right", c.className)}
                  >
                    {c.cell(r, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 xl:hidden" aria-label={caption}>
        {(mobileLimit && !allMobile ? rows.slice(0, mobileLimit) : rows).map((r, i) => (
          <li key={rowKey(r, i)} className={cn("rounded-md bg-raised/40 p-3", rowClassName?.(r))}>
            {primary.length > 0 && (
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
                {primary.map((c) => (
                  <span key={c.key} className="min-w-0 break-words">
                    {c.cell(r, i)}
                  </span>
                ))}
              </div>
            )}
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2 md:grid-cols-4">
              {rest.filter((c) => !c.hideOnMobile?.(r)).map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-2xs uppercase tracking-wide text-muted">{c.header}</dt>
                  <dd className="break-words text-sm text-ink">{c.cell(r, i)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
        {mobileLimit && rows.length > mobileLimit ? (
          <li>
            <button type="button" className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent hover:underline" aria-expanded={allMobile} onClick={() => setAllMobile((v) => !v)}>
              {allMobile ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          </li>
        ) : null}
      </ul>
    </>
  );
}
