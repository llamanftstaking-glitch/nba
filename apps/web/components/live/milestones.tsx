"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { fmtClockET, statLabel, titleCase } from "@/lib/format";
import { live, type Milestone } from "@/lib/live";

export const milestoneStat = (s: string) => (s === "double_double" ? "Double-double" : s === "min" ? "MIN" : statLabel(s));

/** A tracking threshold: current, threshold, remaining, game status and freshness. Never a likelihood. */
export function MilestoneRow({ m, showPlayer = false, canDelete = true }: { m: Milestone; showPlayer?: boolean; canDelete?: boolean }) {
  const qc = useQueryClient();
  const del = useMutation({ mutationFn: () => live.deleteMilestone(m.id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["live"] }) });
  const pct = m.current === null || m.threshold <= 0 ? 0 : Math.min(100, (m.current / m.threshold) * 100);
  return (
    <li className="py-2" data-testid="milestone" data-reached={m.reached ? "1" : "0"}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium text-ink">
              {showPlayer && m.player_name ? `${m.player_name} · ` : ""}
              {milestoneStat(m.stat)} {m.stat === "double_double" ? "" : m.threshold}
            </span>
            <span className="num text-xs text-muted">
              current <span className="text-ink">{m.current ?? "—"}</span> · threshold <span className="text-ink">{m.threshold}</span> · remaining <span className="text-ink">{m.remaining ?? "—"}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line" role="img" aria-label={`Current ${m.current ?? "not available"} of threshold ${m.threshold}`}>
            <div className="h-full rounded bg-info" style={{ width: `${pct}%` }} />
          </div>
          <div className="num mt-0.5 text-xs text-muted">
            {m.reached ? `Threshold reached${m.reached_value !== null ? ` at ${m.reached_value}` : ""}${m.reached_at ? ` · ${fmtClockET(m.reached_at)}` : ""}` : "Tracking"} · game {m.game_status ? titleCase(m.game_status) : "status —"}
            {m.observed_at ? ` · observed ${fmtClockET(m.observed_at)}` : ""}
            {m.notify ? " · notify on" : ""}
            {m.note ? ` · ${m.note}` : ""}
          </div>
        </div>
        {canDelete && (
          <button type="button" onClick={() => del.mutate()} disabled={del.isPending} aria-label={`Delete tracking threshold ${milestoneStat(m.stat)} ${m.threshold}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-faint hover:bg-raised hover:text-ink md:h-8 md:w-8" data-testid="milestone-delete">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      {del.isError && <p role="alert" className="text-xs text-bad">{del.error instanceof ApiError ? del.error.message : "Could not delete."}</p>}
    </li>
  );
}
