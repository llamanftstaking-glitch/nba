"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useSelectedDate, useSetDate } from "@/lib/date";
import { fmtDate, shiftDate } from "@/lib/format";

/** Global slate date control: previous/next day arrows plus the list of dates the API has research for. */
export function DateSelector() {
  const selected = useSelectedDate();
  const setDate = useSetDate();
  const cc = useQuery({ queryKey: ["command-center", selected ?? "today"], queryFn: () => api.commandCenter(selected) });

  const current = selected ?? cc.data?.date;
  const available = cc.data?.available_dates ?? [];
  const options = current && !available.includes(current) ? [current, ...available] : available;
  const isHistorical = cc.data ? !cc.data.is_today : false;

  const btn = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink hover:bg-raised disabled:cursor-not-allowed disabled:text-faint md:h-9 md:w-9";
  return (
    <div className="flex min-w-0 items-center gap-1" data-testid="date-selector">
      <button type="button" className={btn} aria-label="Previous day" disabled={!current} onClick={() => current && setDate(shiftDate(current, -1))}>
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <label className="min-w-0">
        <span className="sr-only">Slate date</span>
        <select
          className="num h-11 min-w-0 max-w-[190px] rounded border border-line-strong bg-bg2 pl-3 pr-8 text-sm font-semibold text-ink hover:border-ink md:h-9"
          value={current ?? ""}
          disabled={!current}
          onChange={(e) => setDate(e.target.value || undefined)}
        >
          {!current && <option value="">Loading…</option>}
          {options.map((d) => (
            <option key={d} value={d}>
              {fmtDate(d, { weekday: true, year: true }) ?? d}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={btn} aria-label="Next day" disabled={!current} onClick={() => current && setDate(shiftDate(current, 1))}>
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
      {selected && (
        <button type="button" className="link ml-1 hidden min-h-9 items-center text-sm sm:inline-flex" onClick={() => setDate(undefined)}>
          Today
        </button>
      )}
      {isHistorical && (
        <span className="slot ml-2 hidden text-warn xl:inline-flex" title="Showing the editions originally published for this date">
          Historical, original editions
        </span>
      )}
    </div>
  );
}
