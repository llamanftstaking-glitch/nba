"use client";

import { useQuery } from "@tanstack/react-query";
import { LineupStatusLabel } from "@/components/status";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { fmtDateTimeET } from "@/lib/format";

export function LineupHistoryList({ gameId }: { gameId: string }) {
  const q = useQuery({ queryKey: ["lineup-history", gameId], queryFn: () => api.lineupHistory(gameId) });
  return (
    <QueryView query={q} rows={2} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No lineup changes have been recorded for this game." />}>
      {(d) => (
        <ul className="divide-y divide-line/40" data-testid="lineup-history">
          {d.items.map((h, i) => (
            <li key={i} className="grid gap-x-3 gap-y-0.5 py-2 text-sm sm:grid-cols-[9.5rem_3rem_1fr_auto] sm:items-baseline">
              <span className="num text-xs text-muted">{fmtDateTimeET(h.at) ?? "—"}</span>
              <span className="font-semibold text-ink">{h.team_abbr}</span>
              <span className="min-w-0 break-words text-soft">
                {h.change} <span className="text-xs text-muted">· {h.source}</span>
              </span>
              <LineupStatusLabel status={h.status} short />
            </li>
          ))}
        </ul>
      )}
    </QueryView>
  );
}
