"use client";

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
import { teamColor } from "@/lib/team-colors";
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
          <div className="team-name flex flex-wrap items-baseline gap-x-2 text-[1.75rem] text-ink">
            <span>{game.away.abbr}</span>
            {showScore && <span className="num">{game.away_points}</span>}
            <span className="font-normal text-faint">@</span>
            <span>{game.home.abbr}</span>
            {showScore && <span className="num">{game.home_points}</span>}
          </div>
          <div className="mt-1 break-words text-sm text-muted">
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
  if (!env) return <p className="text-sm text-muted">Game environment projection not available.</p>;
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
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-4 border-b border-line py-2" data-testid="pick-row">
      <ProbabilityDisplay prob={s.prob} low={s.prob_low} high={s.prob_high} stack size="lg" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="break-words text-base font-semibold text-ink">{s.market_label}</span>
          <ClassificationBadge value={s.classification} invalidated={s.invalidated} />
        </div>
        <div className="num text-sm text-muted">
          {s.rank_in_game === null ? "" : `Rank ${s.rank_in_game} in this game. `}
          {s.book ?? "No book"} <Val v={fmtAmerican(s.price_american)} />, evidence {s.evidence_score === null ? <NA /> : <span className="text-ink">{s.evidence_score}/100</span>}
        </div>
      </div>
    </li>
  );
}

/**
 * One game as a ruled row: the matchup set like a scoreboard, then what we know about it (lineups,
 * completeness, the projected environment), then the ranked picks with the model estimate first.
 */
export function GameMatchupCard({ game, detailed = false }: { game: Game; detailed?: boolean }) {
  const pct = completenessPct(game.research_completeness.score);
  const missing = game.research_completeness.items.filter((i) => !i.ok);
  const picks = game.top_picks.slice(0, detailed ? 5 : 3);
  const more = game.top_picks.length - picks.length;
  const injuries = game.injuries.away.length + game.injuries.home.length;
  const showScore = game.home_points != null && game.away_points != null;
  const env = game.environment;
  return (
    <article className="grid min-w-0 gap-x-10 gap-y-4 border-b border-line py-5 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1.25fr)]" data-testid="game-card" data-game-id={game.id}>
      <div className="min-w-0">
        <div className="mb-2 flex items-baseline gap-3">
          <span className="slot text-ink">
            <Val v={fmtTimeET(game.tipoff_utc)} />
          </span>
          <StatusBadge value={game.status} />
        </div>
        {(["away", "home"] as const).map((side) => (
          <div key={side} className="flex items-center gap-2.5 py-1">
            <span className="h-7 w-1 shrink-0" style={{ background: teamColor(game[side].abbr) }} aria-hidden />
            <TeamLogo team={game[side]} size={28} />
            <span className="team-name w-12 shrink-0 text-[1.375rem] text-ink">{game[side].abbr}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{game[side].name}</span>
            {showScore && <span className="score text-[1.75rem] text-ink">{side === "away" ? game.away_points : game.home_points}</span>}
          </div>
        ))}
        <p className="mt-2 truncate text-sm text-faint">{game.venue ?? "Venue not available"}</p>
        <DLink href={`/games/${encodeURIComponent(game.id)}`} className="link mt-1 inline-flex min-h-[44px] items-center text-sm md:min-h-0" data-testid="game-link">
          Open game research
        </DLink>
      </div>

      <div className="min-w-0 space-y-3">
        <div data-testid="card-lineups">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {(["away", "home"] as const).map((side) => (
              <span key={side} className="flex items-center gap-1.5 text-sm text-muted">
                {game[side].abbr} lineup
                <LineupStatusLabel status={game.lineup?.[side]?.status} short />
              </span>
            ))}
          </div>
          <div className="num mt-0.5 text-sm text-faint">
            {injuries} injuries listed{game.props ? `, ${game.props.quoted_markets} quoted props, ${game.props.players_projected} players projected` : ""}
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Research completeness</span>
            <span className="num font-bold text-ink">{pct}%</span>
          </div>
          <Meter value={pct} tone={pct >= 80 ? "neutral" : "warn"} label="Research completeness" className="mt-1" />
          {missing.length > 0 && <p className="mt-1 text-sm text-warn">Missing: {missing.map((m) => m.name).join(", ")}</p>}
        </div>
        {env ? (
          <p className="num text-sm text-muted">
            <span className="model font-semibold">
              Projected {game.away.abbr} {fmtNum(env.proj_away_points, 0)}, {game.home.abbr} {fmtNum(env.proj_home_points, 0)}
            </span>
            . Total <Val v={fmtNum(env.proj_total)} className="model" />, pace <Val v={fmtNum(env.proj_pace)} className="model" />, margin ({game.home.abbr}) <Val v={fmtSigned(env.proj_margin, 1)} className="model" />
            <span title="10th–90th percentile of the simulated total">, total p10–p90 {fmtNum(env.total_p10, 0)}–{fmtNum(env.total_p90, 0)}</span>. Model estimate.
          </p>
        ) : (
          <p className="text-sm text-muted">Game environment projection not available.</p>
        )}
        {detailed && env && env.notes.length > 0 && (
          <ul className="space-y-0.5 text-sm text-faint">
            {env.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        {detailed && (
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {game.research_completeness.items.map((it) => (
              <li key={it.name} className="flex min-w-0 gap-2">
                <span className={cn("shrink-0 font-bold", it.ok ? "text-ink" : "text-warn")}>{it.ok ? "OK" : "Missing"}</span>
                <span className="min-w-0 break-words text-muted">
                  {it.name}
                  {it.note ? `: ${it.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-w-0 lg:col-span-2 xl:col-span-1">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule-2 pb-1.5">
          <h3 className="text-sm font-bold text-ink">
            Ranked picks <span className="model font-semibold">model estimate first</span>
          </h3>
          <span className="num text-sm text-faint">
            {game.n_evaluated} evaluated, {game.n_rejected} rejected
          </span>
        </div>
        {picks.length > 0 ? (
          <>
            <ul>
              {picks.map((s) => (
                <PickRow key={s.id} s={s} />
              ))}
            </ul>
            {more > 0 && (
              <DLink href={`/games/${encodeURIComponent(game.id)}`} className="link mt-1 inline-flex min-h-[44px] items-center text-sm md:min-h-0">
                {more} more ranked in this game
              </DLink>
            )}
          </>
        ) : (
          <p className="mt-2 max-w-[60ch] text-sm text-soft" data-testid="no-picks-reason">
            <span className="font-bold text-ink">No qualified picks for this game. </span>
            {game.no_picks_reason ?? "The API did not provide a reason."}
          </p>
        )}
      </div>
    </article>
  );
}
