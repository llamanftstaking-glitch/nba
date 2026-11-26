"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useState } from "react";
import { TeamLogo } from "@/components/team-logo";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtAge, fmtClockET, fmtTimeET } from "@/lib/format";
import { isLive, live, useTeamLogos, type Freshness, type GameRow, type LiveTeam } from "@/lib/live";

/** A pulsing dot. Rendered only when a game's status is `live` or `overtime`. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)} aria-hidden data-testid="live-dot">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
    </span>
  );
}

/** Status text for a game: LIVE + period and clock, Halftime, End Q1, Final, tipoff time, Delayed, Postponed… */
export function statusText(g: Pick<GameRow, "status" | "status_label" | "period_label" | "clock" | "tipoff_utc">): string {
  switch (g.status) {
    case "live":
    case "overtime":
      return [g.period_label, g.clock].filter(Boolean).join(" · ") || g.status_label;
    case "halftime":
      return "Halftime";
    case "end_period":
      return g.period_label ? `End ${g.period_label}` : g.status_label;
    case "final":
      return g.period_label && /OT/.test(g.period_label) ? `Final / ${g.period_label}` : "Final";
    case "scheduled":
      return fmtTimeET(g.tipoff_utc) ?? "Time —";
    default:
      return g.status_label || g.status;
  }
}

export function StatusChip({ g, className }: { g: Pick<GameRow, "status" | "status_label" | "period_label" | "clock" | "tipoff_utc">; className?: string }) {
  const live = isLive(g.status);
  const tone = live ? "text-accent" : g.status === "final" || g.status === "scheduled" ? "text-muted" : "text-warn";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold", tone, className)} data-testid="status-chip" data-status={g.status}>
      {live && (
        <>
          <LiveDot />
          <span className="uppercase tracking-wide">Live</span>
        </>
      )}
      <span className={cn("num", live && "font-medium text-soft")}>{statusText(g)}</span>
    </span>
  );
}

/** "updated 9s ago", or "Delayed — last update HH:MM:SS ET" when the feed is stale. Scheduled games show nothing. */
export function FreshnessMark({ f, long = false, className }: { f: Freshness & { status?: string }; long?: boolean; className?: string }) {
  if (f.stale) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs font-semibold text-warn", className)} data-testid="freshness" data-stale="1">
        Delayed{long ? ` — last update ${fmtClockET(f.observed_at) ?? "not available"}` : ""}
      </span>
    );
  }
  if (f.feed === "not_started" || f.status === "scheduled") return null;
  const age = fmtAge(f.age_s);
  return (
    <span className={cn("num text-xs text-muted", className)} data-testid="freshness" data-stale="0">
      {age ? `updated ${age}` : "update time —"}
    </span>
  );
}

export function useFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: "game" | "player" | "team"; ref_id: string | number; on: boolean }) => live.follow(v.kind, v.ref_id, v.on),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["live"] }),
  });
}

/** Follow / unfollow a game, player or team. A 403 (viewer role) is shown inline. */
export function FollowButton({ kind, refId, followed, label, compact = false }: { kind: "game" | "player" | "team"; refId: string | number; followed: boolean; label?: string; compact?: boolean }) {
  const m = useFollow();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const on = optimistic ?? followed;
  const err = m.error instanceof ApiError ? m.error.message : m.error ? "Could not update." : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={on}
        disabled={m.isPending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOptimistic(!on);
          m.mutate({ kind, ref_id: refId, on: !on }, { onError: () => setOptimistic(null), onSuccess: (r) => setOptimistic(r.following) });
        }}
        className={cn("inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2.5 text-sm font-medium ring-1 ring-inset md:min-h-0 md:h-8 md:text-xs", on ? "bg-accent/10 text-ink ring-accent/50" : "bg-raised text-soft ring-line hover:text-ink", compact && "min-h-[44px] w-11 justify-center px-0 md:w-8")}
        aria-label={`${on ? "Unfollow" : "Follow"} ${label ?? kind}`}
        data-testid="follow-btn"
        data-on={on ? "1" : "0"}
      >
        <Star className={cn("h-3.5 w-3.5", on ? "fill-accent text-accent" : "text-faint")} aria-hidden />
        {!compact && (on ? "Following" : "Follow")}
      </button>
      {err && (
        <span role="alert" className="text-xs text-bad" data-testid="follow-error">
          {err}
        </span>
      )}
    </span>
  );
}

export function Score({ v, className }: { v: number | null; className?: string }) {
  return v === null || v === undefined ? (
    <span className={cn("font-display font-semibold text-muted", className)} title="not available" aria-label="score not available">
      —
    </span>
  ) : (
    <span className={cn("num font-display font-bold text-ink", className)}>{v}</span>
  );
}

export function TeamMark({ team, size = 24 }: { team: Pick<LiveTeam, "abbr" | "name">; size?: number }) {
  const logos = useTeamLogos();
  return <TeamLogo team={{ abbr: team.abbr, name: team.name, logo_url: logos[team.abbr] ?? null }} size={size} />;
}

/** Quarter-by-quarter line score (Q1..Q4, OT columns as needed, total). */
export function LineScore({ g, className }: { g: Pick<GameRow, "home" | "away">; className?: string }) {
  const n = Math.max(4, g.home.linescores.length, g.away.linescores.length);
  const head = Array.from({ length: n }, (_, i) => (i < 4 ? `Q${i + 1}` : i === 4 ? "OT" : `${i - 3}OT`));
  const cell = (v: number | null | undefined) => (v === null || v === undefined ? <span className="text-faint">—</span> : v);
  return (
    <table className={cn("num border-collapse text-xs", className)} data-testid="line-score">
      <caption className="sr-only">Line score by period</caption>
      <thead>
        <tr className="text-2xs uppercase text-muted">
          <th scope="col" className="pr-3 text-left font-semibold">Team</th>
          {head.map((h) => (
            <th key={h} scope="col" className="w-8 text-right font-semibold">{h}</th>
          ))}
          <th scope="col" className="w-10 text-right font-semibold">T</th>
        </tr>
      </thead>
      <tbody>
        {([g.away, g.home] as const).map((t) => (
          <tr key={t.abbr} className="text-soft">
            <th scope="row" className="pr-3 text-left font-semibold text-ink">{t.abbr}</th>
            {head.map((h, i) => (
              <td key={h} className="text-right">{cell(t.linescores[i])}</td>
            ))}
            <td className="text-right font-semibold text-ink">{cell(t.score)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
