"use client";

import { GameMatchupCard } from "@/components/game-card";
import { PageHeader } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { useSelectedDate } from "@/lib/date";
import { fmtDate } from "@/lib/format";
import { useGames } from "@/lib/queries";

export default function GamesPage() {
  const date = useSelectedDate();
  const q = useGames(date);
  return (
    <div>
      <PageHeader
        title="Today's Games"
        sub={q.data ? `Slate ${fmtDate(q.data.date, { weekday: true, year: true }) ?? q.data.date} · ${q.data.games.length} game(s)` : "Slate"}
      />
      <QueryView query={q} rows={6} isEmpty={(d) => d.games.length === 0} empty={<EmptyState title="No games are scheduled for this date." />}>
        {(d) => (
          <div className="grid gap-4 xl:grid-cols-2">
            {d.games.map((g) => (
              <GameMatchupCard key={g.id} game={g} detailed />
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}
