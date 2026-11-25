"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { useSelectedDate } from "@/lib/date";

export type QuickPlayer = { id: number; name: string; headshot_url: string | null; team_abbr: string | null; group: string; proj_min: number | null };

/**
 * Players to offer before the user has searched: the slate's highest projected-minute players
 * (GET /minutes), or the first rows of GET /players when the slate is empty.
 */
export function useQuickPlayers(limit = 30): { players: QuickPlayer[]; source: "slate" | "players" | null; isPending: boolean } {
  const date = useSelectedDate();
  const minutes = useQuery({ queryKey: ["minutes", { date, sort: "proj_min", limit }], queryFn: () => api.minutes({ date, sort: "proj_min", order: "desc", limit }) });
  const slateEmpty = minutes.isSuccess && minutes.data.items.length === 0;
  const fallback = useQuery({ queryKey: ["players", "top", limit], queryFn: () => api.players({ limit }), enabled: slateEmpty || minutes.isError });
  return useMemo(() => {
    if (minutes.data && minutes.data.items.length > 0) {
      return {
        source: "slate" as const,
        isPending: false,
        players: minutes.data.items.map((r) => ({ id: r.player_id, name: r.player_name, headshot_url: r.headshot_url, team_abbr: r.team_abbr, group: r.team_abbr && r.opp_abbr ? [r.team_abbr, r.opp_abbr].sort().join(" · ") : "Other", proj_min: r.proj_min })),
      };
    }
    if (fallback.data) {
      return { source: "players" as const, isPending: false, players: fallback.data.items.map((p) => ({ id: p.id, name: p.name, headshot_url: null, team_abbr: p.team_abbr, group: p.team_abbr ?? "Other", proj_min: null })) };
    }
    return { source: null, isPending: minutes.isPending || fallback.isLoading, players: [] };
  }, [minutes.data, minutes.isPending, fallback.data, fallback.isLoading]);
}
