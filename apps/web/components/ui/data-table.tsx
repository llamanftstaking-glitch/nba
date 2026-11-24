import type { ReactNode } from "react";
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
 * Responsive table: a real <table> from the md breakpoint up, stacked label/value cards below it.
 * This is how every tabular view avoids horizontal scrolling at 375px.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  rowClassName,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  caption: string;
  rowClassName?: (row: T) => string | undefined;
  dense?: boolean;
}) {
  const primary = columns.filter((c) => c.primary);
  const rest = columns.filter((c) => !c.primary);
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line-strong">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted",
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
              <tr key={rowKey(r, i)} className={cn("border-b border-line/70 align-top last:border-0 hover:bg-raised/50", rowClassName?.(r))}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-2 text-soft", dense ? "py-1" : "py-1.5", c.align === "right" && "text-right", c.className)}
                  >
                    {c.cell(r, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {rows.map((r, i) => (
          <li key={rowKey(r, i)} className={cn("rounded border border-line bg-bg/40 p-2", rowClassName?.(r))}>
            {primary.length > 0 && (
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
                {primary.map((c) => (
                  <span key={c.key} className="min-w-0 break-words">
                    {c.cell(r, i)}
                  </span>
                ))}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {rest.filter((c) => !c.hideOnMobile?.(r)).map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-2xs uppercase tracking-wide text-muted">{c.header}</dt>
                  <dd className="break-words text-sm text-soft">{c.cell(r, i)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
