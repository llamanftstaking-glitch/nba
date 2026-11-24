"use client";

import type { GameCard as Game, GameEnvironment, Selection } from "@/lib/types";
import { ClassificationBadge, StatusBadge } from "@/components/classification-badge";
import { ProbInterval } from "@/components/prob";
import { TeamLogo } from "@/components/team-logo";
import { Meter } from "@/components/ui/meter";
import { NA, Val } from "@/components/ui/na";
import { Metric } from "@/components/ui/panel";
import { DLink } from "@/lib/date";
import { cn } from "@/lib/cn";
import { fmtAmerican, fmtNum, fmtSigned, fmtTimeET } from "@/lib/format";

/** research_completeness.score is treated as 0–100; a fractional 0–1 value is scaled (contract does not state the unit). */
export function completenessPct(score: number): number {
  const v = score > 0 && score <= 1 && !Number.isInteger(score) ? score * 100 : score;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function Matchup({ game, size = 28 }: { game: Game; size?: number }) {
  const showScore = game.home_points !== null && game.away_points !== null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamLogo team={game.away} size={size} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold text-ink">
          <span>{game.away.abbr}</span>
          {showScore && <span className="num">{game.away_points}</span>}
          <span className="text-muted">@</span>
          <span>{game.home.abbr}</span>
          {showScore && <span className="num">{game.home_points}</span>}
        </div>
        <div className="truncate text-2xs text-muted">
          {game.away.name} at {game.home.name}
        </div>
      </div>
      <TeamLogo team={game.home} size={size} />
    </div>
  );
}

export function EnvironmentSummary({ env, home, away }: { env: GameEnvironment | null; home: string; away: string }) {
  if (!env) {
    return <p className="rounded border border-dashed border-line-strong px-2 py-1.5 text-xs text-muted">Game environment projection not available.</p>;
  }
  return (
    <div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 sm:grid-cols-4">
        <Metric label="Proj. pace">
          <Val v={fmtNum(env.proj_pace)} />
        </Metric>
        <Metric label="Proj. total">
          <Val v={fmtNum(env.proj_total)} />
          <div className="num text-2xs text-muted" title="10th–90th percentile of the simulated total">
            p10–p90 {fmtNum(env.total_p10, 0)}–{fmtNum(env.total_p90, 0)}
          </div>
        </Metric>
        <Metric label={`Proj. margin (${home})`}>
          <Val v={fmtSigned(env.proj_margin, 1)} />
        </Metric>
        <Metric label="Proj. score" className="col-span-3 sm:col-span-1">
          <span className="num">
            {away} {fmtNum(env.proj_away_points)} · {home} {fmtNum(env.proj_home_points)}
          </span>
        </Metric>
      </dl>
    </div>
  );
}

function PickRow({ s }: { s: Selection }) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 py-1.5 sm:grid-cols-[auto_1fr_auto]" data-testid="pick-row">
      <span className="num text-2xs text-muted">{s.rank_in_game === null ? "—" : `#${s.rank_in_game}`}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="break-words text-sm font-medium text-ink">{s.market_label}</span>
          <ClassificationBadge value={s.classification} invalidated={s.invalidated} />
        </div>
        <div className="num text-2xs text-muted">
          {s.book ?? "no book"} <Val v={fmtAmerican(s.price_american)} /> · Evidence{" "}
          {s.evidence_score === null ? <NA /> : <span className="text-info">{s.evidence_score}/100</span>}
        </div>
      </div>
      <div className="col-start-2 sm:col-start-3 sm:text-right">
        <ProbInterval prob={s.prob} low={s.prob_low} high={s.prob_high} />
      </div>
    </li>
  );
}

export function GameMatchupCard({ game, detailed = false }: { game: Game; detailed?: boolean }) {
  const pct = completenessPct(game.research_completeness.score);
  const missing = game.research_completeness.items.filter((i) => !i.ok);
  const picks = game.top_picks.slice(0, 5);
  return (
    <article className="min-w-0 rounded border border-line bg-panel" data-testid="game-card" data-game-id={game.id}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <Matchup game={game} />
        <div className="text-right">
          <div className="num text-sm text-ink">
            <Val v={fmtTimeET(game.tipoff_utc)} />
          </div>
          <div className="mt-0.5 flex justify-end gap-1">
            <StatusBadge value={game.status} />
          </div>
        </div>
      </header>

      <div className="space-y-3 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted">Research completeness</span>
              <span className="num text-ink">{pct}%</span>
            </div>
            <Meter value={pct} tone={pct >= 80 ? "neutral" : "warn"} label="Research completeness" className="mt-1" />
            {missing.length > 0 && (
              <p className="mt-1 text-2xs text-warn">
                Missing: {missing.map((m) => m.name).join(", ")}
              </p>
            )}
          </div>
          <div className="text-xs">
            <div className="text-muted">Injuries listed</div>
            <div className="num text-ink">
              {game.away.abbr} {game.injuries.away.length} · {game.home.abbr} {game.injuries.home.length}
            </div>
            <div className="mt-0.5 break-words text-2xs text-muted">{game.lineup_status}</div>
          </div>
        </div>

        <EnvironmentSummary env={game.environment} home={game.home.abbr} away={game.away.abbr} />
        {detailed && game.environment && game.environment.notes.length > 0 && (
          <ul className="space-y-0.5 text-2xs text-muted">
            {game.environment.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}

        {detailed && (
          <ul className="grid gap-x-3 gap-y-0.5 text-2xs sm:grid-cols-2">
            {game.research_completeness.items.map((it) => (
              <li key={it.name} className="flex min-w-0 gap-1.5">
                <span className={cn("shrink-0 font-semibold", it.ok ? "text-soft" : "text-warn")}>{it.ok ? "OK" : "MISSING"}</span>
                <span className="min-w-0 break-words text-muted">
                  {it.name}
                  {it.note ? ` — ${it.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div>
          <div className="flex items-baseline justify-between border-b border-line pb-1">
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-soft">Ranked picks</h3>
            <span className="num text-2xs text-muted">
              {game.n_evaluated} evaluated · {game.n_rejected} rejected
            </span>
          </div>
          {picks.length > 0 ? (
            <ul className="divide-y divide-line/70">
              {picks.map((s) => (
                <PickRow key={s.id} s={s} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded border border-dashed border-line-strong px-2 py-2 text-xs text-soft" data-testid="no-picks-reason">
              <span className="font-medium">No qualified picks for this game. </span>
              {game.no_picks_reason ?? "The API did not provide a reason."}
            </p>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-line px-3 py-1.5 text-2xs text-muted">
        <span className="min-w-0 truncate">{game.venue ?? "Venue not available"}</span>
        <DLink href={`/games/${encodeURIComponent(game.id)}`} className="shrink-0 font-medium text-accent hover:underline" data-testid="game-link">
          Open game research →
        </DLink>
      </footer>
    </article>
  );
}
