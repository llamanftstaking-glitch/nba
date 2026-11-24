"use client";

import { useQuery } from "@tanstack/react-query";
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
    "inline-flex h-8 w-8 items-center justify-center rounded border border-line-strong text-soft hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:text-muted";
  return (
    <div className="flex min-w-0 items-center gap-1" data-testid="date-selector">
      <button type="button" className={btn} aria-label="Previous day" disabled={!current} onClick={() => current && setDate(shiftDate(current, -1))}>
        ‹
      </button>
      <label className="min-w-0">
        <span className="sr-only">Slate date</span>
        <select
          className="num h-8 min-w-0 max-w-[170px] rounded border border-line-strong bg-bg pl-2 pr-6 text-xs text-ink"
          value={current ?? ""}
          disabled={!current}
          onChange={(e) => setDate(e.target.value || undefined)}
        >
          {!current && <option value="">Loading dates…</option>}
          {options.map((d) => (
            <option key={d} value={d}>
              {fmtDate(d, { weekday: true })?.split(",")[0] ?? ""} {d}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className={btn} aria-label="Next day" disabled={!current} onClick={() => current && setDate(shiftDate(current, 1))}>
        ›
      </button>
      {selected && (
        <button
          type="button"
          className="hidden h-8 rounded border border-line-strong px-2 text-xs text-soft hover:bg-raised hover:text-ink sm:inline-flex sm:items-center"
          onClick={() => setDate(undefined)}
        >
          Today
        </button>
      )}
      {isHistorical && (
        <span className="hidden rounded border border-warn/50 bg-warn-dim/60 px-1.5 py-px text-2xs font-semibold uppercase text-warn lg:inline" title="Showing the editions originally published for this date">
          Historical · original editions
        </span>
      )}
    </div>
  );
}
