"use client";

import { Button } from "./button";

export function Pagination({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  if (total <= 0) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted" aria-label="Pagination">
      <span className="num">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button disabled={offset <= 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <Button disabled={to >= total} onClick={() => onChange(offset + limit)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
