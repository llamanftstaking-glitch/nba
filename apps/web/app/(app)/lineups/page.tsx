"use client";

import { ArrowRight, History, Users } from "lucide-react";
import { useState } from "react";
import { MatchupHeader } from "@/components/game-card";
import { LineupCard } from "@/components/lineup-card";
import { LineupHistoryList } from "@/components/lineup-history";
import { LineupTable } from "@/components/lineup-table";
import { Button, textLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { DLink, useSelectedDate } from "@/lib/date";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useGames, useLineups } from "@/lib/queries";
import type { LineupGame } from "@/lib/types";

function GameLineups({ g }: { g: LineupGame }) {
  const [history, setHistory] = useState(false);
  return (
    <section className="space-y-3" data-testid="lineup-game" data-game-id={g.game.id}>
      <div className="rounded-lg bg-bg2 p-4 ring-1 ring-inset ring-line-strong">
        <MatchupHeader game={g.game} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" aria-expanded={history} onClick={() => setHistory((v) => !v)} data-testid="lineup-history-toggle">
            <History className="h-3.5 w-3.5" aria-hidden />
            {history ? "Hide lineup history" : "Lineup history"}
          </Button>
          <DLink href={`/games/${encodeURIComponent(g.game.id)}`} className={textLink}>
            Game research <ArrowRight className="h-3 w-3" aria-hidden />
          </DLink>
        </div>
        {history && (
          <div className="mt-2 border-t border-line pt-2">
            <LineupHistoryList gameId={g.game.id} />
          </div>
        )}
      </div>
      <LineupTable away={g.away} home={g.home} />
    </section>
  );
}

export default function LineupsPage() {
  const date = useSelectedDate();
  const q = useLineups(date);
  const games = useGames(date);
  const [view, setView] = useState<"cards" | "detailed">("cards");
  const cardFor = (id: string) => games.data?.games.find((x) => x.id === id);
  return (
    <div>
      <PageHeader
        title="Starting Lineups"
        sub={
          <>
            {q.data ? `Slate ${fmtDate(q.data.date, { weekday: true, year: true }) ?? q.data.date}. ` : ""}
            A lineup is “Confirmed” only when the source box score lists the starters. “Projected” is GIZER’s own projection from the most recent confirmed five and the latest injury report — it is not an official lineup.
          </>
        }
      />
      <QueryView query={q} rows={8} isEmpty={(d) => d.games.length === 0} empty={<EmptyState title="No games are scheduled for this date." icon={Users} />}>
        {(d) => (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-md bg-bg2 p-0.5 ring-1 ring-inset ring-line-strong" role="group" aria-label="Lineup view">
                {(["cards", "detailed"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    data-testid={`lineup-view-${v}`}
                    onClick={() => setView(v)}
                    className={cn("min-h-[36px] rounded px-3 text-sm font-medium", view === v ? "bg-raised text-ink" : "text-muted hover:text-ink")}
                  >
                    {v === "cards" ? "Lineup board" : "Detailed (minutes)"}
                  </button>
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
                <li><span className="font-semibold text-accent">Confirmed</span> = starters listed in the box score</li>
                <li><span className="font-semibold text-warn">Projected</span> = GIZER projection, not official</li>
                <li><span className="rounded bg-warn-dim px-1 font-semibold text-warn">Q / D / DTD</span> uncertain</li>
                <li><span className="rounded bg-bad-dim px-1 font-semibold text-bad">OUT</span> unavailable</li>
              </ul>
            </div>
            {view === "cards" ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {d.games.map((g) => (
                  <LineupCard key={g.game.id} g={g} card={cardFor(g.game.id)} />
                ))}
              </div>
            ) : (
              <div className="space-y-8">
                {d.games.map((g) => (
                  <GameLineups key={g.game.id} g={g} />
                ))}
              </div>
            )}
          </>
        )}
      </QueryView>
    </div>
  );
}
