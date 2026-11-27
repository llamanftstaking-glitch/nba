"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Swords } from "lucide-react";
import { EnvironmentSummary, MatchupHeader } from "@/components/game-card";
import { TeamFormComparison } from "@/components/team-form";
import { textLink } from "@/components/ui/button";
import { Val } from "@/components/ui/na";
import { Label, PageHeader } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { DLink, useSelectedDate } from "@/lib/date";
import { fmtDate } from "@/lib/format";
import { useGames } from "@/lib/queries";
import type { GameCard } from "@/lib/types";

function MatchupCard({ game }: { game: GameCard }) {
  const q = useQuery({ queryKey: ["game", game.id], queryFn: () => api.game(game.id) });
  return (
    <article className="blk p-4" data-testid="matchup-card">
      <MatchupHeader game={game} />
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.2fr_1.4fr_1fr]">
        <div>
          <Label>Team form</Label>
          <QueryView query={q} rows={3}>
            {(d) => <TeamFormComparison home={d.team_form.home} away={d.team_form.away} homeAbbr={game.home.abbr} awayAbbr={game.away.abbr} />}
          </QueryView>
        </div>
        <div>
          <Label>Environment</Label>
          <EnvironmentSummary env={game.environment} home={game.home.abbr} away={game.away.abbr} />
        </div>
        <div>
          <Label>Head to head</Label>
          <QueryView query={q} rows={2} isEmpty={(d) => d.h2h.length === 0} empty={<p className="text-sm text-muted">No prior meetings in the available data.</p>}>
            {(d) => (
              <ul className="space-y-1">
                {d.h2h.map((m, i) => (
                  <li key={i} className="num flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-muted">{fmtDate(m.date, { year: true }) ?? m.date}</span>
                    <span className="text-ink">
                      {m.away_abbr} <Val v={m.away_points} /> @ {m.home_abbr} <Val v={m.home_points} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </div>
      </div>
      <div className="mt-3 text-right">
        <DLink href={`/games/${encodeURIComponent(game.id)}`} className={textLink}>
          Open game research <ArrowRight className="h-3 w-3" aria-hidden />
        </DLink>
      </div>
    </article>
  );
}

export default function MatchupsPage() {
  const date = useSelectedDate();
  const q = useGames(date);
  return (
    <div>
      <PageHeader title="Matchup Intelligence" sub="Team form, projected environment and head-to-head history for each game on the slate." />
      <QueryView query={q} rows={6} isEmpty={(d) => d.games.length === 0} empty={<EmptyState title="No games are scheduled for this date." icon={Swords} />}>
        {(d) => (
          <div className="space-y-9">
            {d.games.map((g) => (
              <MatchupCard key={g.id} game={g} />
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}
