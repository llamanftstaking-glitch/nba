"use client";

import { ArrowRight, History, Users } from "lucide-react";
import { useState } from "react";
import { MatchupHeader } from "@/components/game-card";
import { LineupHistoryList } from "@/components/lineup-history";
import { LineupTable } from "@/components/lineup-table";
import { Button, textLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { DLink, useSelectedDate } from "@/lib/date";
import { fmtDate } from "@/lib/format";
import { useLineups } from "@/lib/queries";
import type { LineupGame } from "@/lib/types";

function GameLineups({ g }: { g: LineupGame }) {
  const [history, setHistory] = useState(false);
  return (
    <section className="space-y-3" data-testid="lineup-game" data-game-id={g.game.id}>
      <div className="rounded-lg bg-bg2 p-4 ring-1 ring-inset ring-line/60">
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
          <div className="mt-2 border-t border-line/50 pt-2">
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
          <div className="space-y-8">
            {d.games.map((g) => (
              <GameLineups key={g.game.id} g={g} />
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}
