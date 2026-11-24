"use client";

import { useQuery } from "@tanstack/react-query";
import { HeartPulse } from "lucide-react";
import { useMemo } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { AvailabilityStatus, FreshnessIndicator } from "@/components/status";
import { StaleTag } from "@/components/ui/badge";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";
import { fmtDateTimeET } from "@/lib/format";
import type { InjuryRow } from "@/lib/types";

function Row({ r }: { r: InjuryRow }) {
  const name = <span className="font-semibold text-ink">{r.player_name}</span>;
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-2.5 md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)] md:items-center" data-testid="injury-row" data-stale={r.stale ? "1" : "0"}>
      <PlayerAvatar name={r.player_name} src={r.headshot_url} size={36} />
      <div className="min-w-0">
        <div className="truncate text-sm">
          {r.player_id !== null ? (
            <DLink href={`/players/${r.player_id}`} className="hover:underline">
              {name}
            </DLink>
          ) : (
            name
          )}
        </div>
        <div className="break-words text-xs text-muted">{[r.detail, r.comment].filter(Boolean).join(" — ") || "No detail provided"}</div>
      </div>
      <div className="col-start-2 md:col-start-auto">
        <AvailabilityStatus value={r.status} />
        <div className="text-xs text-muted">{r.previous_status ? `Previously: ${r.previous_status}` : "No previous status recorded"}</div>
      </div>
      <div className="col-start-2 text-xs text-muted md:col-start-auto">
        <div className="flex flex-wrap items-center gap-x-2">
          <span>Source: {r.source}</span>
          {r.stale && <StaleTag title="Older than the allowed maximum age" />}
        </div>
        <div className="num">
          Published {fmtDateTimeET(r.source_published_at) ?? "—"} · ingested {fmtDateTimeET(r.ingested_at) ?? "—"}
        </div>
      </div>
    </li>
  );
}

export default function InjuriesPage() {
  const q = useQuery({ queryKey: ["injuries"], queryFn: api.injuries });
  const groups = useMemo(() => {
    const byGame = new Map<string, Map<string, InjuryRow[]>>();
    for (const r of q.data?.items ?? []) {
      const g = r.game_label ?? "No game on this slate";
      const t = r.team_abbr ?? "Team not available";
      if (!byGame.has(g)) byGame.set(g, new Map());
      const teams = byGame.get(g)!;
      teams.set(t, [...(teams.get(t) ?? []), r]);
    }
    return [...byGame.entries()];
  }, [q.data]);
  const staleCount = (q.data?.items ?? []).filter((i) => i.stale).length;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Injuries & Availability"
        sub={
          q.data ? (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Source {q.data.source}</span>
              <FreshnessIndicator at={q.data.as_of} label="As of" stale={staleCount > 0} />
              {staleCount > 0 && <span className="num text-warn">{staleCount} stale entr{staleCount === 1 ? "y" : "ies"}</span>}
            </span>
          ) : (
            "Latest availability feed"
          )
        }
      />
      <QueryView query={q} rows={6}>
        {(d) => (
          <>
            <Panel title="Changes" icon={HeartPulse}>
              {d.changes.length === 0 ? (
                <EmptyState title="No injury changes recorded." icon={HeartPulse} />
              ) : (
                <ul className="divide-y divide-line/40">
                  {d.changes.map((c, i) => (
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
                      <span className="min-w-0 break-words text-soft">{c.text}</span>
                      <span className="num text-xs text-muted">{fmtDateTimeET(c.at) ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {groups.length === 0 ? (
              <EmptyState title="No injuries are listed." icon={HeartPulse} />
            ) : (
              groups.map(([game, teams]) => (
                <Panel key={game} title={game} right={<span className="num">{[...teams.values()].reduce((a, b) => a + b.length, 0)} listed</span>}>
                  <div className="space-y-4" data-testid="injury-game">
                    {[...teams.entries()].map(([team, rows]) => (
                      <div key={team}>
                        <div className="border-b border-line/50 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
                          {team} · {rows.length}
                        </div>
                        <ul className="divide-y divide-line/30">
                          {rows.map((r, i) => (
                            <Row key={`${r.player_name}-${i}`} r={r} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Panel>
              ))
            )}
          </>
        )}
      </QueryView>
    </div>
  );
}
