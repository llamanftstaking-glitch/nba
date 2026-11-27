"use client";

import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { fmtDate } from "@/lib/format";
import { useScoreboard, type GameRow } from "@/lib/live";
import { FreshnessMark, LiveDot, Score, StatusChip, TeamMark, leader } from "./common";

const KEY = "gizer.scoreboard.collapsed";

/** The scoreboard at bug size: away over home, the score, one status line. No box; a hairline separates games. */
function Card({ g }: { g: GameRow }) {
  const lead = leader(g);
  const starred = g.followed || g.favorite_team;
  return (
    <DLink href={`/games/${encodeURIComponent(g.game_id)}?tab=live`} className="grid w-[160px] shrink-0 snap-start gap-0.5 border-l border-line px-4 py-0.5 first:border-l-0 first:pl-0 hover:bg-raised sm:w-[172px]" data-testid="strip-card" data-game-id={g.game_id} data-status={g.status}>
      {([["away", g.away], ["home", g.home]] as const).map(([side, t]) => (
        <span key={t.abbr} className="grid grid-cols-[20px_1fr_auto] items-center gap-2">
          <TeamMark team={t} size={20} />
          <span className={cn("text-base leading-none", lead === side || lead === null ? "font-bold text-ink" : "font-medium text-faint")} style={{ fontStretch: "72%" }}>{t.abbr}</span>
          <Score v={t.score} className={cn("text-[1.375rem]", lead !== null && lead !== side && "!font-medium text-faint")} />
        </span>
      ))}
      <span className="flex min-h-[18px] items-center justify-between gap-1">
        <StatusChip g={g} className="!gap-1.5 !text-2xs" />
        <span className="flex items-center gap-1">
          <FreshnessMark f={g} short className="!text-2xs" />
          {starred && <Star className="h-3.5 w-3.5 shrink-0 fill-ink text-ink" aria-label="Following" />}
        </span>
      </span>
    </DLink>
  );
}

/** Global scoreboard strip: one card per game, Yesterday / Today / Tomorrow, collapsible (remembered per browser). */
export function ScoreboardStrip() {
  const [day, setDay] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const q = useScoreboard(day);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggle = () =>
    setCollapsed((v) => {
      try {
        window.localStorage.setItem(KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  const d = q.data;
  const liveCount = d?.live_count ?? 0;
  const dayBtn = "inline-flex min-h-[44px] items-center border-b-2 px-2 text-sm md:min-h-0 md:h-7";
  const on = "border-ink font-bold text-ink";
  const off = "border-transparent font-medium text-muted hover:text-ink";
  const which = !d ? "today" : d.date === d.today ? "today" : d.date < d.today ? "yesterday" : "tomorrow";
  return (
    <section className="border-b border-line bg-bg" aria-label="Scoreboard" data-testid="scoreboard-strip" data-collapsed={collapsed ? "1" : "0"}>
      <div className="mx-auto w-full max-w-[calc(1320px+2*var(--gutter))] px-[var(--gutter)]">
        <div className="flex items-center gap-2">
          <DLink href="/live" className="flex min-h-[44px] shrink-0 items-center gap-2 text-sm font-bold text-ink md:min-h-8">
            {liveCount > 0 && <LiveDot />}
            Scores
            {d && <span className="num hidden font-normal text-muted sm:inline">{liveCount > 0 ? `${liveCount} in progress` : `${d.games.length} game${d.games.length === 1 ? "" : "s"}`}</span>}
          </DLink>
          <span className="flex-1" />
          {!collapsed && d && (
            <div className="flex items-center gap-1" role="group" aria-label="Scoreboard day">
              <button type="button" aria-pressed={which === "yesterday"} className={cn(dayBtn, which === "yesterday" ? on : off)} onClick={() => setDay(which === "tomorrow" ? undefined : d.prev)} data-testid="strip-yesterday">
                Yesterday
              </button>
              <button type="button" aria-pressed={which === "today"} className={cn(dayBtn, which === "today" ? on : off)} onClick={() => setDay(undefined)} data-testid="strip-today">
                Today
              </button>
              <button type="button" aria-pressed={which === "tomorrow"} className={cn(dayBtn, which === "tomorrow" ? on : off)} onClick={() => setDay(which === "yesterday" ? undefined : d.next)} data-testid="strip-tomorrow">
                Tomorrow
              </button>
            </div>
          )}
          <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? "Show scoreboard" : "Hide scoreboard"} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink hover:bg-raised md:h-8 md:w-8" data-testid="strip-toggle">
            {collapsed ? <ChevronDown className="h-5 w-5" aria-hidden /> : <ChevronUp className="h-5 w-5" aria-hidden />}
          </button>
        </div>
        {!collapsed && (
          <div className="pb-1.5">
            {q.isPending ? (
              <p className="py-2 text-sm text-muted" role="status">Loading scores…</p>
            ) : q.isError ? (
              <p className="py-2 text-sm text-muted">Scores could not be loaded. They will be retried automatically.</p>
            ) : d && d.games.length === 0 ? (
              <p className="py-2 text-sm text-muted" data-testid="strip-empty">No games on {fmtDate(d.date, { weekday: true }) ?? d.date}.</p>
            ) : (
              <div className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto" data-testid="strip-scroll">
                {d?.games.map((g) => (
                  <Card key={g.game_id} g={g} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
