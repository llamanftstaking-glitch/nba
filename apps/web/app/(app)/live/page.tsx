"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { FollowButton, FreshnessMark, LineScore, Score, StatusChip, TeamMark } from "@/components/live/common";
import { LiveNav } from "@/components/live/live-nav";
import { textLink } from "@/components/ui/button";
import { PageHeader, SectionTitle } from "@/components/ui/panel";
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
        <span className="font-semibold text-soft">{abbr}</span> {x.pts.name} <span className="num text-ink">{x.pts.value ?? "—"}</span> pts
      </span>
    );
  };
  const a = one(c.away.abbr, l.away);
  const h = one(c.home.abbr, l.home);
  if (!a && !h) return null;
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted" data-testid="live-leaders">
      {a}
      {h}
    </div>
  );
}

function GameCard({ g }: { g: GameRow }) {
  const started = g.status !== "scheduled" && g.home.score !== null;
  return (
    <article className="flex flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60" data-testid="live-card" data-game-id={g.game_id} data-status={g.status}>
      <div className="flex items-center justify-between gap-2">
        <StatusChip g={g} className="text-sm" />
        <span className="flex items-center gap-2">
          <FreshnessMark f={g} />
          <FollowButton kind="game" refId={g.game_id} followed={g.followed} label={g.label} compact />
        </span>
      </div>
      <div className="space-y-1.5">
        {([g.away, g.home] as const).map((t) => (
          <div key={t.abbr} className="flex items-center gap-3">
            <TeamMark team={t} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-ink">{t.name}</span>
            </span>
            <Score v={t.score} className="text-[34px] leading-8" />
          </div>
        ))}
      </div>
      {started && <LineScore g={g} className="w-full" />}
      {started && <LeadersLine id={g.game_id} />}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line/50 pt-2 text-xs text-muted">
        <span className="min-w-0 truncate">{g.venue ?? "Venue not available"}</span>
        <DLink href={`/games/${encodeURIComponent(g.game_id)}?tab=live`} className={textLink} data-testid="live-open">
          Game centre <ArrowRight className="h-3 w-3" aria-hidden />
        </DLink>
      </div>
    </article>
  );
}

function Section({ title, games, testId }: { title: string; games: GameRow[]; testId: string }) {
  if (games.length === 0) return null;
  return (
    <section data-testid={testId}>
      <SectionTitle right={<span className="num">{games.length}</span>}>{title}</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {games.map((g) => (
          <GameCard key={g.game_id} g={g} />
        ))}
      </div>
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
  const btn = "inline-flex h-11 items-center gap-1 rounded-md bg-raised px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line hover:bg-line/70 md:h-9";
  return (
    <div className="space-y-5">
      <PageHeader
        title="Live Games"
        sub={d ? `${fmtDate(d.date, { weekday: true, year: true }) ?? d.date}${d.date === d.today ? " · today" : ""} · ${d.live_count} in progress` : "Scores observed by the platform"}
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
      <LiveNav />
      <QueryView query={q} rows={6}>
        {(sb) => {
          if (sb.games.length === 0) {
            return (
              <EmptyState title={`No games on ${fmtDate(sb.date, { weekday: true, year: true }) ?? sb.date}.`} icon={Radio}>
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
            <div className="space-y-6">
              {noneStarted && (
                <p className="rounded-md bg-raised/50 px-3 py-2 text-sm text-soft" data-testid="live-not-started">
                  Games on this date have not started. Scores, box scores and plays appear after tipoff.
                </p>
              )}
              <Section title="Following" games={following} testId="live-following" />
              <Section title="Live" games={liveGames} testId="live-live" />
              <Section title="Upcoming" games={upcoming} testId="live-upcoming" />
              <Section title="Delayed, postponed or suspended" games={other} testId="live-other" />
              <Section title="Final" games={finals} testId="live-final" />
              <p className="text-xs text-muted" data-testid="poll-note">{sb.poll_note}</p>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
