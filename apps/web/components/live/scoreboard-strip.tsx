"use client";

import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { fmtDate } from "@/lib/format";
import { useScoreboard, type GameRow } from "@/lib/live";
import { FreshnessMark, LiveDot, Score, StatusChip, TeamMark } from "./common";

const KEY = "gizer.scoreboard.collapsed";

function Card({ g }: { g: GameRow }) {
  return (
    <DLink href={`/games/${encodeURIComponent(g.game_id)}?tab=live`} className={cn("flex shrink-0 snap-start flex-col gap-1 rounded-md bg-card px-2.5 py-2 ring-1 ring-inset ring-line/60 hover:ring-accent/50", g.followed || g.favorite_team ? "w-[190px]" : "w-[168px]")} data-testid="strip-card" data-game-id={g.game_id} data-status={g.status}>
      {([g.away, g.home] as const).map((t) => (
        <span key={t.abbr} className="flex items-center gap-2">
          <TeamMark team={t} size={20} />
          <span className="flex-1 text-sm font-semibold text-ink">{t.abbr}</span>
          <Score v={t.score} className="text-xl leading-5" />
        </span>
      ))}
      <span className="mt-0.5 flex items-center justify-between gap-1">
        <StatusChip g={g} />
        <span className="flex items-center gap-1">
          <FreshnessMark f={g} short className="text-[11px]" />
          {(g.followed || g.favorite_team) && <Star className="h-3 w-3 shrink-0 fill-accent text-accent" aria-label="Following" />}
        </span>
      </span>
    </DLink>
  );
}

/** Global scoreboard strip: one card per game, Yesterday / Today / Tomorrow, collapsible (remembered per browser). */
export function ScoreboardStrip() {
  const pathname = usePathname();
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
  // Full-height pages (JARVIS) subtract the strip's height.
  useEffect(() => {
    document.documentElement.style.setProperty("--strip-h", collapsed ? "3.25rem" : "9.5rem");
    return () => {
      document.documentElement.style.removeProperty("--strip-h");
    };
  }, [collapsed]);
  const d = q.data;
  const liveCount = d?.live_count ?? 0;
  const dayBtn = "inline-flex min-h-[44px] items-center rounded px-1.5 text-xs font-medium sm:px-2 md:min-h-0 md:h-6";
  const which = !d ? "today" : d.date === d.today ? "today" : d.date < d.today ? "yesterday" : "tomorrow";
  const prominent = pathname === "/";
  return (
    <section className={cn("border-b border-line/60 bg-bg2/80 px-3 md:px-5", prominent ? "py-2.5" : "py-1.5")} aria-label="Scoreboard" data-testid="scoreboard-strip" data-collapsed={collapsed ? "1" : "0"}>
      <div className="mx-auto flex w-full max-w-[1640px] items-center gap-2">
        <DLink href="/live" className="flex shrink-0 items-center gap-1.5 font-display text-[15px] font-semibold uppercase tracking-wide text-ink">
          {liveCount > 0 && <LiveDot />}
          Scores
          {d && <span className="num hidden font-sans text-xs font-normal normal-case text-muted sm:inline">{liveCount > 0 ? `${liveCount} in progress` : `${d.games.length} game${d.games.length === 1 ? "" : "s"}`}</span>}
        </DLink>
        <span className="flex-1" />
        {!collapsed && d && (
          <div className="flex items-center gap-0.5" role="group" aria-label="Scoreboard day">
            <button type="button" className={cn(dayBtn, which === "yesterday" ? "bg-raised text-ink" : "text-muted hover:text-ink")} onClick={() => setDay(which === "tomorrow" ? undefined : d.prev)} data-testid="strip-yesterday">
              Yesterday
            </button>
            <button type="button" className={cn(dayBtn, which === "today" ? "bg-raised text-ink" : "text-muted hover:text-ink")} onClick={() => setDay(undefined)} data-testid="strip-today">
              Today
            </button>
            <button type="button" className={cn(dayBtn, which === "tomorrow" ? "bg-raised text-ink" : "text-muted hover:text-ink")} onClick={() => setDay(which === "yesterday" ? undefined : d.next)} data-testid="strip-tomorrow">
              Tomorrow
            </button>
          </div>
        )}
        <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-label={collapsed ? "Show scoreboard" : "Hide scoreboard"} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink md:h-7 md:w-7" data-testid="strip-toggle">
          {collapsed ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {!collapsed && (
        <div className="mx-auto mt-1.5 w-full max-w-[1640px]">
          {q.isPending ? (
            <div className="h-[84px] animate-pulse rounded-md bg-raised/50" role="status" aria-label="Loading scores" />
          ) : q.isError ? (
            <p className="py-2 text-xs text-muted">Scores could not be loaded. They will be retried automatically.</p>
          ) : d && d.games.length === 0 ? (
            <p className="py-2 text-xs text-muted" data-testid="strip-empty">No games on {fmtDate(d.date, { weekday: true }) ?? d.date}.</p>
          ) : (
            <div className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1" data-testid="strip-scroll">
              {d?.games.map((g) => (
                <Card key={g.game_id} g={g} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
