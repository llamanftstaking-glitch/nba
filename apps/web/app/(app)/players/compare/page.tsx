"use client";

import { useQueries } from "@tanstack/react-query";
import { GitCompare, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { OverlayLineChart } from "@/components/charts";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerSearch } from "@/components/player-search";
import { useQuickPlayers } from "@/components/slate-players";
import { Button } from "@/components/ui/button";
import { Val } from "@/components/ui/na";
import { Label, PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";
import { fmtNum, HISTORY_STATS, statLabel } from "@/lib/format";

const MAX = 3;
const WINDOWS = [["L5", "L5"], ["L10", "L10"], ["L20", "L20"], ["season", "Season"]] as const;
const TABLE_STATS = ["min", "pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "pra"] as const;

export default function ComparePage() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasParam = sp.has("ids");
  const paramIds = (sp.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, MAX);
  const quick = useQuickPlayers(12);
  // Nothing chosen yet: start with the slate's two highest projected-minute players so the page is never blank.
  const ids = hasParam ? paramIds : quick.players.slice(0, 2).map((p) => p.id);
  const preselected = !hasParam && ids.length > 0;
  const [win, setWin] = useState("L10");
  const [stat, setStat] = useState("pts");

  const setIds = (next: number[]) => {
    const p = new URLSearchParams(sp.toString());
    if (next.length) p.set("ids", next.join(","));
    else p.delete("ids");
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const details = useQueries({ queries: ids.map((id) => ({ queryKey: ["player", String(id)], queryFn: () => api.player(String(id)) })) });
  const averages = useQueries({ queries: ids.map((id) => ({ queryKey: ["player-averages", String(id)], queryFn: () => api.playerAverages(id) })) });
  // L10 values come from the threshold endpoint (games oldest → newest); the line itself is irrelevant here.
  const recent = useQueries({ queries: ids.map((id) => ({ queryKey: ["player-threshold", String(id), stat, 0, "L10", "", ""], queryFn: () => api.playerThreshold(id, { stat, line: 0, window: "L10" }) })) });

  const loading = [...details, ...averages].some((q) => q.isPending);
  const failed = [...details, ...averages].find((q) => q.isError);
  const players = ids.map((id, i) => ({ id, detail: details[i]?.data, window: averages[i]?.data?.windows.find((w) => w.key === win), recent: recent[i]?.data }));

  return (
    <div className="space-y-9">
      <PageHeader title="Player Comparison" sub="Compare two or three players over the same window. Averages are descriptive history with their sample sizes." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel title="Players" icon={GitCompare}>
          {ids.length > 0 && (
            <ul className="mb-3 space-y-1.5" data-testid="compare-selected">
              {players.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5 border-l-2 border-line py-1 pl-3">
                  <PlayerAvatar name={p.detail?.player.name ?? "?"} src={p.detail?.player.headshot_url} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.detail?.player.name ?? `Player ${p.id}`}</span>
                  <button type="button" aria-label="Remove from comparison" className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink md:h-8 md:w-8" onClick={() => setIds(ids.filter((x) => x !== p.id))}>
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {preselected && (
            <p className="mb-3 text-xs text-muted" data-testid="compare-preselected">
              Started with {quick.source === "slate" ? "the two highest projected-minute players on this slate" : "the first two players in the player list (no games on this slate)"}. Change them below.
            </p>
          )}
          {quick.players.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-2xs font-semibold text-muted">{quick.source === "slate" ? "Slate players" : "Players"}</div>
              <ul className="flex flex-wrap gap-1.5" data-testid="compare-chips">
                {quick.players.filter((p) => !ids.includes(p.id)).slice(0, 10).map((p) => (
                  <li key={p.id}>
                    <button type="button" disabled={ids.length >= MAX} onClick={() => setIds([...ids, p.id])} className="inline-flex min-h-[44px] items-center rounded-md bg-raised/60 px-2.5 text-sm text-soft hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:text-faint md:min-h-0 md:h-7 md:text-xs" data-testid="compare-chip">
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ids.length >= MAX ? (
            <p className="text-sm text-muted">Three players selected. Remove one to add another.</p>
          ) : (
            <PlayerSearch
              exclude={ids}
              placeholder="Add a player"
              action={(p) => (
                <Button onClick={() => setIds([...ids, p.id])} data-testid="compare-add">
                  Add
                </Button>
              )}
            />
          )}
        </Panel>

        <div className="min-w-0 space-y-4">
          {!hasParam && quick.isPending ? (
            <LoadingState rows={5} />
          ) : ids.length < 2 ? (
            <EmptyState title="Select at least two players to compare." icon={GitCompare}>
              Pick from the slate players on the left or search by name.
            </EmptyState>
          ) : loading ? (
            <LoadingState rows={5} />
          ) : failed ? (
            <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
          ) : (
            <>
              <Panel title="Averages" right={<Tabs label="Window" size="sm" value={win} onChange={setWin} items={WINDOWS.map(([id, label]) => ({ id, label }))} />}>
                <div className="overflow-hidden" data-testid="compare-table">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <caption className="sr-only">Average per game over the selected window</caption>
                    <thead>
                      <tr className="border-b border-line">
                        <th scope="col" className="w-16 pb-2 text-left text-2xs font-semibold text-muted">Stat</th>
                        {players.map((p) => (
                          <th key={p.id} scope="col" className="px-1 pb-2 text-right align-bottom normal-case tracking-normal">
                            <DLink href={`/players/${p.id}`} className="block truncate text-sm font-semibold text-ink hover:underline">
                              {p.detail?.player.name}
                            </DLink>
                            <span className="num block text-xs font-normal text-muted">
                              {p.window ? (p.window.requested !== null && p.window.games < p.window.requested ? `n=${p.window.games} of ${p.window.requested}` : `n=${p.window.games}`) : "n —"}
                              {p.window?.small_sample ? " · small sample" : ""}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {TABLE_STATS.map((s) => (
                        <tr key={s} className="border-b border-line last:border-0">
                          <th scope="row" className="py-1.5 text-left text-xs font-medium text-muted">{statLabel(s)}</th>
                          {players.map((p) => (
                            <td key={p.id} className="num px-1 py-1.5 text-right font-medium text-ink">
                              <Val v={p.window?.available ? fmtNum(p.window.stats[s]?.mean) : null} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel title="Last 10 games">
                <Label>Stat</Label>
                <Tabs label="Stat" size="sm" scroll value={stat} onChange={setStat} items={HISTORY_STATS.map((s) => ({ id: s, label: statLabel(s) }))} />
                <div className="mt-3">
                  {recent.some((q) => q.isPending) ? (
                    <LoadingState rows={3} />
                  ) : (
                    <OverlayLineChart statLabel={statLabel(stat)} series={players.map((p) => ({ name: p.detail?.player.name ?? String(p.id), values: (p.recent?.games ?? []).map((g) => g.value) }))} />
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">Each line is that player’s own most recent appearances, oldest to newest; the games are not the same dates. Descriptive history only.</p>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
