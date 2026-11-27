"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "right";
  /** Shown as the heading of the stacked row on a phone instead of a label/value pair. */
  primary?: boolean;
  className?: string;
  /** Drop this label/value pair from the stacked phone row for rows where it carries no information. */
  hideOnMobile?: (row: T) => boolean;
};

/**
 * Box-score table: ink rule and band over the head, hairline rows, right-aligned tabular figures and a
 * sticky first column. From the lg breakpoint it is a real <table> that scrolls sideways inside its own
 * region when it has to; below that each row is a ruled label/value block, which is how tabular views
 * avoid horizontal scrolling at 375px.
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
  /** In the stacked (below lg) layout, show this many rows first with a "Show all" control. */
  mobileLimit?: number;
}) {
  const [allMobile, setAllMobile] = useState(false);
  const primary = columns.filter((c) => c.primary);
  const rest = columns.filter((c) => !c.primary);
  return (
    <>
      <div className="hidden overflow-x-auto lg:block" role="region" aria-label={caption} tabIndex={0}>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c.key} scope="col" className={cn("px-2.5", i === 0 && "sticky-col pl-2", c.align === "right" ? "text-right" : "text-left")}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} className={cn("border-b border-line align-top hover:bg-raised/60", rowClassName?.(r))}>
                {columns.map((c, ci) => (
                  <td key={c.key} className={cn("px-2.5 text-soft", ci === 0 && "sticky-col pl-2 font-medium text-ink", dense ? "py-2" : "py-2.5", c.align === "right" && "num text-right", c.className)}>
                    {c.cell(r, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="border-t-2 border-ink lg:hidden" aria-label={caption}>
        {(mobileLimit && !allMobile ? rows.slice(0, mobileLimit) : rows).map((r, i) => (
          <li key={rowKey(r, i)} className={cn("border-b border-line py-3", rowClassName?.(r))}>
            {primary.length > 0 && (
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink">
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
                  <dt className="text-2xs text-muted">{c.header}</dt>
                  <dd className="num break-words text-sm text-ink">{c.cell(r, i)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
        {mobileLimit && rows.length > mobileLimit ? (
          <li>
            <button type="button" className="link inline-flex min-h-[44px] items-center text-sm" aria-expanded={allMobile} onClick={() => setAllMobile((v) => !v)}>
              {allMobile ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          </li>
        ) : null}
      </ul>
    </>
  );
}
