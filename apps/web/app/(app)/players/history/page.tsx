"use client";

import { ArrowRight, History } from "lucide-react";
import { useMemo } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerSearch } from "@/components/player-search";
import { useQuickPlayers } from "@/components/slate-players";
import { linkButton } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { DLink } from "@/lib/date";

export default function PlayerHistoryIndexPage() {
  const quick = useQuickPlayers(30);
  const groups = useMemo(() => {
    const m = new Map<string, typeof quick.players>();
    for (const p of quick.players) m.set(p.group, [...(m.get(p.group) ?? []), p]);
    return [...m.entries()];
  }, [quick]);
  return (
    <div className="space-y-5">
      <PageHeader title="Historical Performance" sub="Open a player’s game-by-game history against any threshold. History is descriptive: counts of past games, not a probability." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title={quick.source === "players" ? "Players" : "Players on this slate"} icon={History} right={quick.source === "slate" ? "highest projected minutes first" : undefined}>
          {quick.isPending ? (
            <LoadingState rows={4} />
          ) : groups.length === 0 ? (
            <EmptyState title="No players are available to list." icon={History}>
              There is no slate for this date and the player table is empty. Use the search once game data has been ingested.
            </EmptyState>
          ) : (
            <>
              {quick.source === "players" && <p className="mb-3 text-sm text-muted">No games on this slate, so this is the start of the player list. Use the search for anyone else.</p>}
              <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 2xl:grid-cols-3" data-testid="history-quick">
                {groups.map(([label, players]) => (
                  <div key={label} className="min-w-0">
                    <div className="border-b border-line/50 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted">{label}</div>
                    <ul>
                      {players.map((p) => (
                        <li key={p.id}>
                          <DLink href={`/players/${p.id}#history`} className="flex min-h-[44px] items-center gap-2.5 rounded-md px-1 py-1 hover:bg-raised/50" data-testid="history-quick-link">
                            <PlayerAvatar name={p.name} src={p.headshot_url} size={28} />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{p.name}</span>
                            <span className="num shrink-0 text-xs text-muted">
                              {p.team_abbr ?? "—"}
                              {p.proj_min !== null ? ` · ${p.proj_min.toFixed(0)} min` : ""}
                            </span>
                          </DLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
        <Panel title="Find any player">
          <PlayerSearch
            action={(p) => (
              <DLink href={`/players/${p.id}#history`} className={linkButton} data-testid="history-open">
                Open history <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </DLink>
            )}
          />
        </Panel>
      </div>
    </div>
  );
}
