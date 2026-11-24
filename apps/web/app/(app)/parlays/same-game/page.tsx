"use client";

import { ComboCard } from "@/components/combo-card";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { useSelectedDate } from "@/lib/date";
import { useCombos, useGames } from "@/lib/queries";
import type { Combo } from "@/lib/types";

export default function SameGamePage() {
  const date = useSelectedDate();
  const q = useCombos("sgp", date);
  const games = useGames(date);

  return (
    <div>
      <PageHeader
        title="Same-Game Research"
        sub="Combinations whose legs share one game. Legs in the same game are dependent; joint probabilities here are correlation-adjusted."
      />
      <QueryView
        query={q}
        rows={4}
        isEmpty={(d) => d.items.length === 0}
        empty={<EmptyState title="No same-game combination met the research criteria for this slate." />}
      >
        {(d) => {
          const byGame = new Map<string, { label: string; items: Combo[] }>();
          for (const c of d.items) {
            const first = c.legs[0];
            const key = first?.game_id ?? "unknown";
            const entry = byGame.get(key) ?? { label: first?.game_label ?? "Unknown game", items: [] };
            entry.items.push(c);
            byGame.set(key, entry);
          }
          const without = (games.data?.games ?? []).filter((g) => !byGame.has(g.id));
          return (
            <div className="space-y-4">
              {[...byGame.entries()].map(([id, g]) => (
                <Panel key={id} title={g.label} right={<span className="num">{g.items.length} combination(s)</span>} bodyClassName="space-y-2 p-2">
                  {g.items.map((c) => (
                    <ComboCard key={c.uid} combo={c} />
                  ))}
                </Panel>
              ))}
              {without.length > 0 && (
                <p className="text-xs text-muted">No same-game combination for: {without.map((g) => g.label).join(", ")}.</p>
              )}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
