"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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

  const btn =
    "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-raised text-soft ring-1 ring-inset ring-line hover:text-ink disabled:cursor-not-allowed disabled:text-faint md:h-9 md:w-9";
  return (
    <div className="flex min-w-0 items-center gap-1.5" data-testid="date-selector">
      <button type="button" className={btn} aria-label="Previous day" disabled={!current} onClick={() => current && setDate(shiftDate(current, -1))}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <label className="relative min-w-0">
        <span className="sr-only">Slate date</span>
        <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <select
          className="num h-11 min-w-0 max-w-[150px] sm:max-w-[206px] rounded-md bg-raised pl-8 pr-7 text-sm font-medium text-ink ring-1 ring-inset ring-line md:h-9"
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
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      {selected && (
        <button type="button" className="hidden h-9 rounded-md px-2.5 text-xs font-medium text-muted hover:bg-raised hover:text-ink sm:inline-flex sm:items-center" onClick={() => setDate(undefined)}>
          Today
        </button>
      )}
      {isHistorical && (
        <span className="hidden items-center gap-1.5 text-xs font-medium text-warn lg:inline-flex" title="Showing the editions originally published for this date">
          <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
          Historical · original editions
        </span>
      )}
    </div>
  );
}
