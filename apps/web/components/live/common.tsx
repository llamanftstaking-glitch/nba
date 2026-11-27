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
    <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full bg-model motion-safe:animate-[live-pulse_1.6s_ease-in-out_infinite]", className)} aria-hidden data-testid="live-dot" />
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
  // The status slot: the one place a scoreboard label is set in capitals. Orange means a game in progress.
  const tone = live ? "text-model-text" : g.status === "final" ? "text-ink" : g.status === "scheduled" ? "text-muted" : "text-warn";
  return (
    <span className={cn("slot", tone, className)} data-testid="status-chip" data-status={g.status}>
      {live && (
        <>
          <LiveDot />
          <span>Live</span>
        </>
      )}
      <span className={cn("num", live && "text-ink")}>{statusText(g)}</span>
    </span>
  );
}

/** "updated 9s ago", or "Delayed — last update HH:MM:SS ET" when the feed is stale. Scheduled games show nothing. */
export function FreshnessMark({ f, long = false, short = false, className }: { f: Freshness & { status?: string }; long?: boolean; short?: boolean; className?: string }) {
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
    <span className={cn("num whitespace-nowrap text-xs text-muted", className)} data-testid="freshness" data-stale="0" title={age ? `Last observed ${age}` : undefined}>
      {age ? (short ? age : `updated ${age}`) : short ? "" : "update time —"}
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
export function FollowButton({ kind, refId, followed, label, compact = false, collapse = false }: { kind: "game" | "player" | "team"; refId: string | number; followed: boolean; label?: string; compact?: boolean; /** icon only below the md breakpoint */ collapse?: boolean }) {
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
        className={cn("inline-flex min-h-[44px] items-center gap-1.5 rounded border px-3 text-sm font-semibold md:min-h-0 md:h-9", on ? "border-ink bg-ink text-bg2" : "border-line-strong bg-bg2 text-ink hover:border-ink", compact && "w-11 justify-center px-0 md:w-9", collapse && "max-md:w-11 max-md:justify-center max-md:px-0")}
        aria-label={`${on ? "Unfollow" : "Follow"} ${label ?? kind}`}
        data-testid="follow-btn"
        data-on={on ? "1" : "0"}
      >
        <Star className={cn("h-4 w-4", on ? "fill-current" : "")} aria-hidden />
        {!compact && <span className={collapse ? "max-md:sr-only" : undefined}>{on ? "Following" : "Follow"}</span>}
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
    <span className={cn("score text-faint", className)} title="not available" aria-label="score not available">
      —
    </span>
  ) : (
    <span className={cn("score", className)}>{v}</span>
  );
}

export function TeamMark({ team, size = 24 }: { team: Pick<LiveTeam, "abbr" | "name">; size?: number }) {
  const logos = useTeamLogos();
  return <TeamLogo team={{ abbr: team.abbr, name: team.name, logo_url: logos[team.abbr] ?? null }} size={size} />;
}

/** A side is ahead when both scores are published and it has more points. Used for weight only, never colour alone. */
export function leader(g: Pick<GameRow, "home" | "away">): "home" | "away" | null {
  const h = g.home.score, a = g.away.score;
  if (h === null || a === null || h === undefined || a === undefined || h === a) return null;
  return h > a ? "home" : "away";
}

/** Quarter-by-quarter line score (Q1..Q4, OT columns as needed, total). */
export function LineScore({ g, className }: { g: Pick<GameRow, "home" | "away">; className?: string }) {
  const n = Math.max(4, g.home.linescores.length, g.away.linescores.length);
  const head = Array.from({ length: n }, (_, i) => (i < 4 ? `Q${i + 1}` : i === 4 ? "OT" : `${i - 3}OT`));
  const cell = (v: number | null | undefined) => (v === null || v === undefined ? <span className="text-faint">—</span> : v);
  const lead = leader(g);
  return (
    <table className={cn("num border-collapse text-sm", className)} data-testid="line-score">
      <caption className="sr-only">Line score by period</caption>
      <thead>
        <tr className="!border-t-0 !bg-transparent">
          <th scope="col" className="!pl-0 pr-4 text-left">Team</th>
          {head.map((h) => (
            <th key={h} scope="col" className="w-10 text-right">{h}</th>
          ))}
          <th scope="col" className="w-12 text-right">T</th>
        </tr>
      </thead>
      <tbody>
        {([["away", g.away], ["home", g.home]] as const).map(([side, t]) => (
          <tr key={t.abbr} className="border-b border-line text-muted">
            <th scope="row" className={cn("py-1.5 !pl-0 pr-4 text-left text-base", lead === side ? "font-extrabold text-ink" : "font-semibold text-muted")} style={{ fontStretch: "70%" }}>{t.abbr}</th>
            {head.map((h, i) => (
              <td key={h} className={cn("py-1.5 text-right", lead === side && "text-ink")}>{cell(t.linescores[i])}</td>
            ))}
            <td className={cn("py-1.5 text-right", lead === side ? "font-extrabold text-ink" : "font-semibold")}>{cell(t.score)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
