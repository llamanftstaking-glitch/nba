"use client";

import { ArrowRight, MapPin } from "lucide-react";
import type { GameCard as Game, GameEnvironment, Selection, TeamRef } from "@/lib/types";
import { ClassificationBadge, StatusBadge } from "@/components/classification-badge";
import { ProbabilityDisplay } from "@/components/prob";
import { LineupStatusLabel } from "@/components/status";
import { TeamLogo } from "@/components/team-logo";
import { Meter } from "@/components/ui/meter";
import { NA, Val } from "@/components/ui/na";
import { Metric } from "@/components/ui/panel";
import { DLink } from "@/lib/date";
import { cn } from "@/lib/cn";
import { fmtAmerican, fmtNum, fmtSigned, fmtTimeET } from "@/lib/format";

/** research_completeness.score is 0–100 (API contract). */
export function completenessPct(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

type MatchupGame = { home: TeamRef; away: TeamRef; home_points?: number | null; away_points?: number | null; tipoff_utc: string | null; status: string };

/** Away @ home with logos, full names, tipoff in ET and game status. */
export function MatchupHeader({ game, size = 36, className }: { game: MatchupGame; size?: number; className?: string }) {
  const showScore = game.home_points != null && game.away_points != null;
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        <TeamLogo team={game.away} size={size} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1.5 font-display text-[22px] font-semibold uppercase leading-6 tracking-wide text-ink">
            <span>{game.away.abbr}</span>
            {showScore && <span className="num">{game.away_points}</span>}
            <span className="text-faint">@</span>
            <span>{game.home.abbr}</span>
            {showScore && <span className="num">{game.home_points}</span>}
          </div>
          <div className="break-words text-xs leading-4 text-muted">
            {game.away.name} at {game.home.name}
          </div>
        </div>
        <TeamLogo team={game.home} size={size} />
      </div>
      <div className="shrink-0 text-right">
        <div className="num whitespace-nowrap text-sm font-semibold text-ink">
          <Val v={fmtTimeET(game.tipoff_utc)} />
        </div>
        <StatusBadge value={game.status} />
      </div>
    </div>
  );
}

export function EnvironmentSummary({ env, home, away }: { env: GameEnvironment | null; home: string; away: string }) {
  if (!env) return <p className="rounded-md bg-raised/40 px-3 py-2 text-sm text-muted">Game environment projection not available.</p>;
  return (
    <dl className="grid grid-cols-3 gap-x-4 gap-y-2">
      <Metric label="Proj. pace">
        <Val v={fmtNum(env.proj_pace)} />
      </Metric>
      <Metric label="Proj. total">
        <Val v={fmtNum(env.proj_total)} />
      </Metric>
      <Metric label={`Proj. margin (${home})`}>
        <Val v={fmtSigned(env.proj_margin, 1)} />
      </Metric>
      <div className="col-span-3 num text-xs text-muted">
        Proj. score{" "}
        <span className="font-medium text-soft">
          {away} {fmtNum(env.proj_away_points, 0)} · {home} {fmtNum(env.proj_home_points, 0)}
        </span>
        <span title="10th–90th percentile of the simulated total"> · total p10–p90 {fmtNum(env.total_p10, 0)}–{fmtNum(env.total_p90, 0)}</span>
      </div>
    </dl>
  );
}

function PickRow({ s }: { s: Selection }) {
  return (
    <li className="flex items-start gap-2.5 py-2" data-testid="pick-row">
      <span className="num mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded bg-raised px-1 text-xs font-semibold text-soft">
        {s.rank_in_game === null ? "—" : `#${s.rank_in_game}`}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="break-words text-sm font-semibold text-ink">{s.market_label}</span>
          <ClassificationBadge value={s.classification} invalidated={s.invalidated} />
        </div>
        <div className="num text-xs text-muted">
          {s.book ?? "No book"} <Val v={fmtAmerican(s.price_american)} /> · Evidence {s.evidence_score === null ? <NA /> : <span className="text-info">{s.evidence_score}/100</span>}
        </div>
      </div>
      <ProbabilityDisplay prob={s.prob} low={s.prob_low} high={s.prob_high} stack className="shrink-0 items-end text-right" />
    </li>
  );
}

export function GameMatchupCard({ game, detailed = false }: { game: Game; detailed?: boolean }) {
  const pct = completenessPct(game.research_completeness.score);
  const missing = game.research_completeness.items.filter((i) => !i.ok);
  const picks = game.top_picks.slice(0, 5);
  const injuries = game.injuries.away.length + game.injuries.home.length;
  return (
    <article className="flex min-w-0 flex-col rounded-lg bg-card ring-1 ring-inset ring-line/60" data-testid="game-card" data-game-id={game.id}>
      <div className="p-4 pb-3">
        <MatchupHeader game={game} />
      </div>

      <div className="flex-1 space-y-4 px-4 pb-4">
        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">Research completeness</span>
            <span className="num font-semibold text-ink">{pct}%</span>
          </div>
          <Meter value={pct} tone={pct >= 80 ? "neutral" : "warn"} label="Research completeness" className="mt-1" />
          {missing.length > 0 && <p className="mt-1 text-xs text-warn">Missing: {missing.map((m) => m.name).join(", ")}</p>}
        </div>

        <div className="rounded-md bg-raised/40 px-3 py-2" data-testid="card-lineups">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {(["away", "home"] as const).map((side) => (
              <span key={side} className="flex items-center gap-1.5 text-xs text-muted">
                {game[side].abbr} lineup
                <LineupStatusLabel status={game.lineup?.[side]?.status} short />
              </span>
            ))}
          </div>
          <div className="num mt-1 text-xs text-muted">
            {injuries} injuries listed{game.props ? ` · ${game.props.quoted_markets} quoted props · ${game.props.players_projected} players projected` : ""}
          </div>
        </div>

        <EnvironmentSummary env={game.environment} home={game.home.abbr} away={game.away.abbr} />
        {detailed && game.environment && game.environment.notes.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted">
            {game.environment.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}

        {detailed && (
          <ul className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {game.research_completeness.items.map((it) => (
              <li key={it.name} className="flex min-w-0 gap-1.5">
                <span className={cn("shrink-0 font-semibold", it.ok ? "text-soft" : "text-warn")}>{it.ok ? "OK" : "Missing"}</span>
                <span className="min-w-0 break-words text-muted">
                  {it.name}
                  {it.note ? ` — ${it.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-[15px] font-semibold uppercase tracking-wide text-soft">Ranked picks</h3>
            <span className="num text-xs text-muted">
              {game.n_evaluated} evaluated · {game.n_rejected} rejected
            </span>
          </div>
          {picks.length > 0 ? (
            <ul className="divide-y divide-line/40">
              {picks.map((s) => (
                <PickRow key={s.id} s={s} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-md bg-raised/40 px-3 py-2.5 text-sm text-soft" data-testid="no-picks-reason">
              <span className="font-semibold">No qualified picks for this game. </span>
              {game.no_picks_reason ?? "The API did not provide a reason."}
            </p>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-line/50 px-4 py-2.5 text-xs text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
          <span className="truncate">{game.venue ?? "Venue not available"}</span>
        </span>
        <DLink href={`/games/${encodeURIComponent(game.id)}`} className="inline-flex min-h-[44px] shrink-0 items-center gap-1 font-semibold text-accent hover:underline md:min-h-0" data-testid="game-link">
          Open game research <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </DLink>
      </footer>
    </article>
  );
}
