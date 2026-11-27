"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { StackedBoard } from "@/components/live/board";
import { FollowButton, FreshnessMark, StatusChip } from "@/components/live/common";
import { textLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { DLink, useSelectedDate } from "@/lib/date";
import { fmtDate } from "@/lib/format";
import { isInProgress, live, useScoreboard, type GameRow, type Leaders } from "@/lib/live";

function LeadersLine({ id }: { id: string }) {
  // Leaders come from the game centre object; fetched only for games that have started.
  const q = useQuery({ queryKey: ["live", "game", id, "center"], queryFn: () => live.game(id), staleTime: 15_000 });
  const c = q.data;
  const l = c?.leaders;
  if (!c || !l) return null;
  const one = (abbr: string, x: Leaders | null) => {
    if (!x || !x.pts) return null;
    return (
      <span className="min-w-0 truncate">
        <span className="font-bold text-ink">{abbr}</span> {x.pts.name} <span className="num font-bold text-ink">{x.pts.value ?? "—"}</span> points
      </span>
    );
  };
  const a = one(c.away.abbr, l.away);
  const h = one(c.home.abbr, l.home);
  if (!a && !h) return null;
  return (
    <div className="flex flex-col gap-0.5 text-sm text-soft" data-testid="live-leaders">
      {a}
      {h}
    </div>
  );
}

/** One game as a scoreboard row: status and place, the stacked line score, then what the source says about it. */
function GameCard({ g }: { g: GameRow }) {
  const started = g.status !== "scheduled" && g.home.score !== null;
  return (
    <article className="grid gap-x-8 gap-y-2 border-b border-line py-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,34rem)_minmax(0,1fr)]" data-testid="live-card" data-game-id={g.game_id} data-status={g.status}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 md:block md:space-y-1">
        <StatusChip g={g} />
        <div className="md:min-h-[20px]">
          <FreshnessMark f={g} />
        </div>
        <p className="hidden truncate text-sm text-faint md:block">{g.venue ?? "Venue not available"}</p>
      </div>
      <StackedBoard g={g} size="row" />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 md:col-span-2 xl:col-span-1 xl:border-l xl:border-line xl:pl-8">
        <div className="min-w-0 space-y-1">
          {started && <LeadersLine id={g.game_id} />}
          <DLink href={`/games/${encodeURIComponent(g.game_id)}?tab=live`} className={textLink} data-testid="live-open">
            Game centre
          </DLink>
        </div>
        <FollowButton kind="game" refId={g.game_id} followed={g.followed} label={g.label} compact />
      </div>
    </article>
  );
}

function Section({ title, games, testId }: { title: string; games: GameRow[]; testId: string }) {
  if (games.length === 0) return null;
  return (
    <section data-testid={testId}>
      <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
        <h2 className="h-section">{title}</h2>
        <span className="num text-sm text-muted">
          {games.length} game{games.length === 1 ? "" : "s"}
        </span>
      </div>
      {games.map((g) => (
        <GameCard key={g.game_id} g={g} />
      ))}
    </section>
  );
}

export default function LivePage() {
  // opens on the date selected in the top bar (?date=), otherwise on the server's current day
  const selected = useSelectedDate();
  const [day, setDay] = useState<string | undefined>(selected);
  useEffect(() => setDay(selected), [selected]);
  const q = useScoreboard(day);
  const d = q.data;
  const btn = "inline-flex h-11 items-center gap-1 whitespace-nowrap rounded border border-line-strong bg-bg2 px-3 text-sm font-semibold text-ink hover:border-ink disabled:border-line disabled:text-faint md:h-10";
  return (
    <div className="space-y-9">
      <PageHeader
        title="Live Games"
        sub={d ? `${fmtDate(d.date, { weekday: true, year: true }) ?? d.date}${d.date === d.today ? ", today" : ""}. ${d.live_count} in progress.` : "Scores observed by the platform"}
        right={
          d ? (
            <div className="flex items-center gap-1.5" role="group" aria-label="Day">
              <button type="button" className={btn} onClick={() => setDay(d.prev)} data-testid="live-prev">
                <ChevronLeft className="h-4 w-4" aria-hidden /> Previous day
              </button>
              <button type="button" className={btn} onClick={() => setDay(undefined)} disabled={d.date === d.today} data-testid="live-today">
                Today
              </button>
              <button type="button" className={btn} onClick={() => setDay(d.next)} data-testid="live-next">
                Next day <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : undefined
        }
      />
      <QueryView query={q} rows={6}>
        {(sb) => {
          if (sb.games.length === 0) {
            return (
              <EmptyState title={`No games on ${fmtDate(sb.date, { weekday: true, year: true }) ?? sb.date}.`}>
                The schedule has no games for this date. Use the day buttons to move to another date.
              </EmptyState>
            );
          }
          const following = sb.games.filter((g) => g.followed || g.favorite_team);
          const rest = sb.games.filter((g) => !(g.followed || g.favorite_team));
          const liveGames = rest.filter((g) => isInProgress(g.status));
          const upcoming = rest.filter((g) => g.status === "scheduled");
          const finals = rest.filter((g) => g.status === "final");
          const other = rest.filter((g) => !isInProgress(g.status) && g.status !== "scheduled" && g.status !== "final");
          const noneStarted = sb.games.every((g) => g.status === "scheduled");
          return (
            <div className="space-y-10">
              {noneStarted && (
                <p className="text-base text-soft" data-testid="live-not-started">
                  Games on this date have not started. Scores, box scores and plays appear after tipoff.
                </p>
              )}
              <Section title="Following" games={following} testId="live-following" />
              <Section title="Live" games={liveGames} testId="live-live" />
              <Section title="Upcoming" games={upcoming} testId="live-upcoming" />
              <Section title="Delayed, postponed or suspended" games={other} testId="live-other" />
              <Section title="Final" games={finals} testId="live-final" />
              <p className="max-w-[76ch] text-sm text-faint" data-testid="poll-note">{sb.poll_note}</p>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
