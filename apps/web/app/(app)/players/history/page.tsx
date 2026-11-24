"use client";

import { ArrowRight } from "lucide-react";
import { PlayerSearch } from "@/components/player-search";
import { linkButton } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { DLink } from "@/lib/date";

export default function PlayerHistoryIndexPage() {
  return (
    <div>
      <PageHeader title="Historical Performance" sub="Find a player to open their game-by-game history against any threshold. History is descriptive: counts of past games, not a probability." />
      <Panel title="Find a player" className="max-w-2xl">
        <PlayerSearch
          action={(p) => (
            <DLink href={`/players/${p.id}#history`} className={linkButton} data-testid="history-open">
              Open history <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </DLink>
          )}
        />
      </Panel>
    </div>
  );
}
