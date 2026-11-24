"use client";

import { ArrowRight } from "lucide-react";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge } from "@/components/ui/badge";
import { DLink } from "@/lib/date";
import { fmtDateTimeET } from "@/lib/format";
import type { InjuryChange } from "@/lib/types";

/** Availability status changes: previous → current, what they affect, and where they came from. */
export function InjuryChangeList({ items, showGame = true }: { items: InjuryChange[]; showGame?: boolean }) {
  return (
    <ul className="divide-y divide-line/30" data-testid="injury-changes">
      {items.map((c, i) => {
        const name = <span className="font-semibold text-ink">{c.player_name}</span>;
        return (
          <li key={`${c.player_name}-${c.at}-${i}`} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-3 lg:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.3fr)]" data-testid="injury-change" data-material={c.material ? "1" : "0"}>
            <PlayerAvatar name={c.player_name} src={c.headshot_url} size={36} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 text-sm">
                {c.player_id !== null ? (
                  <DLink href={`/players/${c.player_id}`} className="hover:underline">
                    {name}
                  </DLink>
                ) : (
                  name
                )}
                <span className="text-xs text-muted">{c.team_abbr ?? "—"}</span>
                {c.material && <Badge tone="warn">Material</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-muted">{c.previous_status ?? "Not listed"}</span>
                <ArrowRight className="h-3.5 w-3.5 text-faint" aria-label="changed to" />
                <span className="font-semibold text-ink">{c.current_status ?? "Not listed"}</span>
              </div>
              {c.detail && <div className="break-words text-xs text-muted">{c.detail}</div>}
            </div>
            <div className="col-start-2 min-w-0 text-xs text-muted lg:col-start-auto">
              {showGame && (
                <div className="text-sm text-soft">
                  {c.game_id && c.game_label ? (
                    <DLink href={`/games/${encodeURIComponent(c.game_id)}`} className="hover:underline">
                      {c.game_label}
                    </DLink>
                  ) : (
                    (c.game_label ?? "No game on this slate")
                  )}
                </div>
              )}
              <div className="num" data-testid="reassess">
                {c.records_to_reassess} research record{c.records_to_reassess === 1 ? "" : "s"} to reassess ({c.qualified_records_affected} qualified)
              </div>
              {c.lineup_changes.length > 0 && (
                <ul className="mt-0.5 text-soft">
                  {c.lineup_changes.map((l, k) => (
                    <li key={k} className="break-words">
                      Lineup: {l}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="col-start-2 min-w-0 text-xs text-muted lg:col-start-auto">
              <div>Source: {c.source ?? "—"}</div>
              <div className="num">
                Published {fmtDateTimeET(c.source_published_at) ?? "—"} · recorded {fmtDateTimeET(c.at) ?? "—"}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
