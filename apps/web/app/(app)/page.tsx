"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

import { ClassificationBadge, StatusBadge } from "@/components/classification-badge";
import { JarvisMark } from "@/components/jarvis/mark";
import { useJarvisPanel } from "@/components/jarvis/panel";
import { StackedBoard } from "@/components/live/board";
import { FreshnessMark, StatusChip } from "@/components/live/common";
import { ProbabilityDisplay, ProbScale } from "@/components/prob";
import { GameMatchupCard } from "@/components/game-card";
import { PropRow } from "@/components/props";
import { SelectionList } from "@/components/selection-card";
import { SummaryTiles, Tile } from "@/components/summary";
import { StatusDot } from "@/components/ui/badge";
import { textLink } from "@/components/ui/button";
import { Val } from "@/components/ui/na";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { DLink, useSelectedDate } from "@/lib/date";
import { fmtAmerican, fmtDate, fmtDateTimeET, fmtInt, titleCase } from "@/lib/format";
import { isInProgress, useScoreboard, type GameRow } from "@/lib/live";
import type { Selection } from "@/lib/types";
import { useCombos, useCommandCenter, usePlayerProps } from "@/lib/queries";

const NO_HIGH_CONFIDENCE = "No selection met the high-confidence criteria for this slate. That is a valid research outcome.";

const CATEGORIES = [
  ["double", "2-Leg"],
  ["triple", "3-Leg"],
  ["quad", "4-Leg"],
  ["five", "5-Leg"],
  ["six", "6-Leg"],
  ["sgp", "Same-Game"],
  ["cross", "Cross-Game"],
] as const;

function PropSummary({ date, message, quoted }: { date?: string; message: string; quoted: number }) {
  const q = usePlayerProps({ date, quoted: true, limit: 6 });
  const rows = q.data?.items ?? [];
  if (quoted > 0 && q.isPending) return <LoadingState rows={3} />;
  if (rows.length === 0) {
    return (
      <EmptyState title={message || "Player prop quotes are not available for this slate."}>
        <DLink href="/player-props#manual" className={textLink}>
          Enter a market manually
        </DLink>
      </EmptyState>
    );
  }
  return (
    <div>
      {message && <p className="mb-1 text-sm text-muted">{message}</p>}
      <div className="divide-y divide-line" data-testid="overview-props">
        {rows.map((p) => (
          <PropRow key={`${p.player_id}:${p.market}`} p={p} />
        ))}
      </div>
    </div>
  );
}

const BRIEFING_DRAFT = "Give me the read on today's slate: availability, lineup status, data completeness and what is still unknown.";

/** The game the page opens on: one in progress if there is one, otherwise the latest final, otherwise the first to tip. */
function featured(games: GameRow[]): GameRow | null {
  return games.find((g) => isInProgress(g.status)) ?? [...games].reverse().find((g) => g.status === "final") ?? games[0] ?? null;
}

/** Compact scoreboard hero: the stacked line score for one game, with its status slot and freshness. */
function Hero({ date }: { date?: string }) {
  const q = useScoreboard(date);
  if (q.isPending) return <LoadingState label="Loading scores" />;
  if (q.isError) return <p className="text-sm text-muted" data-testid="hero-error">Scores could not be loaded. The slate below comes from the research edition.</p>;
  const g = featured(q.data.games);
  if (!g) return <EmptyState title={`No games on ${fmtDate(q.data.date, { weekday: true, year: true }) ?? q.data.date}.`}>The schedule has no games for this date. Use the date control above to move to another day.</EmptyState>;
  const others = q.data.games.length - 1;
  return (
    <div data-testid="home-hero" data-game-id={g.game_id}>
      <StackedBoard
        g={g}
        size="hero"
        head={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusChip g={g} />
            <FreshnessMark f={g} long className="!font-normal" />
            <span className="truncate text-sm font-normal text-faint">{g.venue ?? ""}</span>
          </span>
        }
      />
      <p className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1">
        <DLink href={`/games/${encodeURIComponent(g.game_id)}?tab=live`} className={textLink} data-testid="hero-link">
          Box score and game page
        </DLink>
        {others > 0 && (
          <DLink href="/live" className={textLink}>
            All {q.data.games.length} games with line scores
          </DLink>
        )}
      </p>
      <p className="mt-1 text-sm text-faint">{q.data.poll_note}</p>
    </div>
  );
}

/** Top picks: the model estimate first, then the contract and the observed price. */
function TopPicks({ picks, total, reason }: { picks: Selection[]; total: number; reason: string }) {
  return (
    <section aria-labelledby="home-picks-h" data-testid="home-picks">
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-ink pb-2">
        <h2 id="home-picks-h" className="h-section">
          Top picks
        </h2>
        <DLink href="/picks" className={textLink}>
          All top picks
        </DLink>
      </div>
      {picks.length === 0 ? (
        <EmptyState title="No selection qualified for this slate.">{reason}</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-end gap-x-4 border-b border-rule-2 py-1.5" aria-hidden>
            <span className="slot model whitespace-normal">Model estimate</span>
            <span className="slot text-muted">Contract</span>
            <span className="slot text-muted">Price</span>
          </div>
          <ol>
            {picks.map((s) => (
              <li key={s.id} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line py-2" data-testid="home-pick">
                <ProbabilityDisplay prob={s.prob} low={s.prob_low} high={s.prob_high} stack size="lg" />
                <div className="min-w-0">
                  <div className="h-sub break-words text-ink">{s.market_label}</div>
                  <div className="flex flex-wrap items-center gap-x-2.5 text-sm text-muted">
                    <span>{s.game_label}</span>
                    <ClassificationBadge value={s.classification} invalidated={s.invalidated} />
                  </div>
                  <ProbScale prob={s.prob} low={s.prob_low} high={s.prob_high} breakeven={s.breakeven} className="mt-1 hidden !h-4 max-w-[16rem] 2xl:block" />
                </div>
                <div className="num text-right text-base text-ink">
                  <Val v={fmtAmerican(s.price_american)} />
                  <span className="block text-2xs text-faint">{s.book ?? "no book"}</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm text-faint">
            Showing {picks.length} of {total} ranked on this slate. Paper research only: an estimate is not an observed hit rate.
          </p>
        </>
      )}
    </section>
  );
}

export default function OverviewPage() {
  const date = useSelectedDate();
  const q = useCommandCenter(date);
  const combos = useCombos("double", date);
  const kalshi = useQuery({ queryKey: ["kalshi-markets", { date, limit: 1 }], queryFn: () => api.kalshiMarkets({ date, limit: 1 }) });
  const jarvisPanel = useJarvisPanel();

  if (q.isPending) {
    return (
      <div>
        <h1 className="h-page mb-5">Today</h1>
        <LoadingState label="Loading the slate" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div>
        <h1 className="h-page mb-5">Today</h1>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const d = q.data;
  const ls = d.lineups_summary;
  const ps = d.props_summary;
  const notReady = d.model_readiness.filter((m) => !m.ready).length;
  const ranked = d.slate.games.flatMap((g) => g.top_picks).sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));
  const noPicksReason = d.slate.games.length === 0 ? "No games are scheduled for this date." : "That is a valid research outcome. Each game below gives its own reason.";
  return (
    <div className="space-y-10 md:space-y-14" data-testid="command-center">
      <div>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 md:mb-5">
          <h1 className="h-section">
            <span className="sr-only">Today: </span>
            {fmtDate(d.date, { weekday: true, year: true }) ?? d.date}
          </h1>
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted">
            <span className={d.is_today ? "slot text-ink" : "slot text-warn"}>{d.is_today ? "Today" : "Historical"}</span>
            <span>{d.is_today ? "Scores are polled observations, not a continuous feed." : "A historical date, original editions shown."}</span>
            <DLink href="/research/daily" className={textLink}>
              Editions ({d.editions.length})
            </DLink>
            <DLink href="/parlays" className={textLink}>
              Parlay research
            </DLink>
          </p>
        </div>
        <div className="grid gap-x-12 gap-y-8 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-7">
            <Hero date={date} />
          </div>
          <div className="min-w-0 xl:col-span-5">
            <TopPicks picks={ranked.slice(0, 5)} total={ranked.length} reason={noPicksReason} />
          </div>
        </div>
      </div>

      {d.warnings.length > 0 && (
        <div role="status" className="border-l-4 border-warn pl-4" data-testid="warnings">
          <p className="slot text-warn">
            {d.warnings.length} warning{d.warnings.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1 max-w-[80ch] space-y-1">
            {d.warnings.map((w, i) => (
              <li key={i} className="break-words text-sm text-soft">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-12">
        <section className="min-w-0 xl:col-span-5" aria-labelledby="home-brief-h" data-testid="home-briefing">
          <SectionTitle
            right={
              <DLink href="/jarvis?tab=briefings" className={textLink}>
                Briefings
              </DLink>
            }
          >
            <span id="home-brief-h">Ask JARVIS</span>
          </SectionTitle>
          <p className="max-w-[60ch] text-base text-soft">The assistant reads verified records and explains them with the sources it used. It never produces a probability and never changes a classification.</p>
          <button
            type="button"
            onClick={() => jarvisPanel.open(undefined, BRIEFING_DRAFT)}
            className="mt-4 flex min-h-[52px] w-full items-center gap-3 rounded border border-ink bg-bg2 px-4 text-left text-base font-semibold text-ink hover:bg-ink hover:text-bg2"
            data-testid="home-ask-jarvis"
          >
            <JarvisMark className="h-5 w-5" />
            Ask for the read on this slate
          </button>
          <p className="mt-2 text-sm text-faint">Opens the assistant with the question written. Nothing is sent until you send it.</p>
        </section>
        <div className="min-w-0 xl:col-span-7">
          <Panel
            title="Injury changes"
            right={
              <DLink href="/injuries" className={textLink}>
                Injuries &amp; availability
              </DLink>
            }
          >
            {d.injury_changes.length === 0 ? (
              <EmptyState title="No injury changes recorded since the previous refresh." />
            ) : (
              <ul>
                {d.injury_changes.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line py-2.5">
                    <span className="min-w-0 break-words text-base text-soft">{c.text}</span>
                    <span className="num shrink-0 text-sm text-faint">{fmtDateTimeET(c.at) ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <section aria-label="Games on this slate">
        <SectionTitle
          right={
            <DLink href="/games" className={textLink}>
              All games in detail
            </DLink>
          }
        >
          The slate, {d.slate.n_games} game{d.slate.n_games === 1 ? "" : "s"}
        </SectionTitle>
        {d.slate.games.length === 0 ? (
          <EmptyState title="No games are scheduled for this date.">Research editions are published only for dates with games.</EmptyState>
        ) : (
          <div>
            {d.slate.games.map((g) => (
              <GameMatchupCard key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="The slate in numbers">
        <SectionTitle>The slate in numbers</SectionTitle>
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-3 xl:grid-cols-5" data-testid="stat-strip">
          <Tile label="Games">{fmtInt(d.slate.n_games)}</Tile>
          <Tile label="Markets analyzed" sub={`${fmtInt(d.counts.rejected)} rejected`}>
            {fmtInt(d.counts.markets_analyzed)}
          </Tile>
          <Tile label="Qualified selections" sub={`${fmtInt(d.counts.high_confidence)} high confidence`}>
            {fmtInt(d.counts.qualified_selections)}
          </Tile>
          <Tile label="Combinations">{fmtInt(d.counts.combinations)}</Tile>
          <Tile label="Lineups" sub={ls ? `${ls.unknown} awaiting confirmation` : undefined}>
            {ls ? (
              <span className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="whitespace-nowrap">
                  {ls.confirmed} <span className="text-sm font-normal text-muted" style={{ fontStretch: "100%" }}>confirmed</span>
                </span>
                <span className="whitespace-nowrap">
                  {ls.projected} <span className="text-sm font-normal text-muted" style={{ fontStretch: "100%" }}>projected</span>
                </span>
              </span>
            ) : (
              <Val v={null} />
            )}
          </Tile>
          <Tile label="Prop markets" sub={ps ? `${ps.manual_entries} manual, ${ps.players_projected} players projected` : undefined}>
            {ps ? (
              <>
                {fmtInt(ps.quoted_markets)} <span className="text-sm font-normal text-muted" style={{ fontStretch: "100%" }}>quoted</span>
              </>
            ) : (
              <Val v={null} />
            )}
          </Tile>
          <Tile
            label="Kalshi markets"
            tone={kalshi.data?.sync.stale ? "warn" : undefined}
            sub={kalshi.data ? `Last sync ${fmtDateTimeET(kalshi.data.sync.last_sync_at) ?? "—"}${kalshi.data.sync.stale ? ", stale" : ""}` : kalshi.isError ? "Kalshi data unavailable" : undefined}
          >
            <DLink href="/kalshi-intelligence" className="hover:underline" data-testid="kalshi-tile">
              {kalshi.data ? (
                <>
                  {fmtInt(kalshi.data.counts.total)} <span className="text-sm font-normal text-muted" style={{ fontStretch: "100%" }}>contracts</span>
                </>
              ) : (
                <Val v={null} />
              )}
            </DLink>
          </Tile>
          <Tile label="Latest refresh">
            <span className="text-xl">
              <Val v={fmtDateTimeET(d.latest_refresh_at)} />
            </span>
          </Tile>
          <Tile label="Edition" sub={d.edition ? `Published ${fmtDateTimeET(d.edition.published_at) ?? "—"}` : undefined}>
            {d.edition ? (
              <span className="text-xl">
                {titleCase(d.edition.kind)} <span className="font-normal text-muted">v{d.edition.version}</span>
              </span>
            ) : (
              <span className="text-sm font-normal text-muted" style={{ fontStretch: "100%" }}>No edition published</span>
            )}
          </Tile>
        </div>
      </section>

      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-2">
        <Panel
          title="Player prop research"
          right={
            <DLink href="/player-props" className={textLink}>
              All player props
            </DLink>
          }
        >
          <PropSummary date={date} message={ps?.message ?? ""} quoted={ps?.quoted_markets ?? 0} />
        </Panel>

        <Panel
          title="Parlay research"
          className="xl:!pt-0"
          right={
            <DLink href="/parlays" className={textLink}>
              Open parlay research
            </DLink>
          }
        >
          <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-4" data-testid="parlay-strip">
            {CATEGORIES.map(([id, label]) => (
              <li key={id} className="border-b border-line">
                <DLink href={`/parlays?tab=${id}`} className="flex min-h-[44px] flex-col py-2 hover:bg-raised">
                  <span className="num text-[1.5rem] leading-7 text-ink" style={{ fontStretch: "68%", fontWeight: 750 }}>{combos.data ? (combos.data.counts[id] ?? 0) : "—"}</span>
                  <span className="text-sm text-muted">{label}</span>
                </DLink>
              </li>
            ))}
            <li className="border-b border-line">
              <DLink href="/builder" className="flex min-h-[44px] flex-col justify-center py-2 hover:bg-raised">
                <span className="link text-base text-ink">Research builder</span>
                <span className="text-sm text-muted">Build your own</span>
              </DLink>
            </li>
          </ul>
          <p className="mt-3 text-sm text-faint">Counts are combinations that met the research criteria. Empty categories are reported as zero.</p>
        </Panel>
      </div>

      <Panel id="high-confidence" title="High-confidence research" right={<span className="num">{d.high_confidence.length} selection(s)</span>}>
        {d.high_confidence.length === 0 ? (
          <EmptyState title={NO_HIGH_CONFIDENCE}>Qualification thresholds are fixed in advance and are not relaxed to fill this section.</EmptyState>
        ) : (
          <SelectionList items={d.high_confidence} />
        )}
      </Panel>

      <Panel
        title="Paper-testing performance, all time"
        right={
          <DLink href="/results" className={textLink}>
            Full results
          </DLink>
        }
      >
        {d.paper_performance.settled === 0 ? (
          <EmptyState title="n=0. No settled paper tickets yet.">Hit rate and ROI are not reported until tickets settle.</EmptyState>
        ) : (
          <SummaryTiles s={d.paper_performance} compact />
        )}
      </Panel>

      <Panel
        title="System status"
        right={
          <>
            <DLink href="/agents" className={textLink}>
              Agents
            </DLink>
            <DLink href="/models" className={textLink}>
              Models
            </DLink>
            <DLink href="/data-health" className={textLink}>
              Data health
            </DLink>
          </>
        }
      >
        <div className="grid gap-x-12 gap-y-4 lg:grid-cols-[auto_1fr]" data-testid="ops-status">
          <div>
            <div className="mb-1 text-sm font-semibold text-muted">Agents</div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <StatusDot tone="accent">
                <span className="num font-bold text-ink">{d.agents.ok}</span> OK
              </StatusDot>
              <StatusDot tone={d.agents.failed > 0 ? "bad" : "neutral"}>
                <span className="num font-bold text-ink">{d.agents.failed}</span> failed
              </StatusDot>
              <StatusDot tone={d.agents.never_run > 0 ? "warn" : "neutral"}>
                <span className="num font-bold text-ink">{d.agents.never_run}</span> never run
              </StatusDot>
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-sm font-semibold text-muted">
              Model readiness: {d.model_readiness.length - notReady} ready, {notReady} not ready
            </div>
            {d.model_readiness.length === 0 ? (
              <p className="text-sm text-muted">No models are registered.</p>
            ) : (
              <ul className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                {d.model_readiness.map((m) => (
                  <li key={`${m.family}-${m.name}-${m.version}`} className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm" title={m.note}>
                    <span className="truncate font-semibold text-ink">{m.name}</span>
                    <span className="num text-faint">{m.version}</span>
                    <span className="text-muted">{titleCase(m.family)}</span>
                    <StatusDot tone={m.ready ? "accent" : "warn"}>{m.ready ? "Ready" : "Not ready"}</StatusDot>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {d.findings.length > 0 && (
          <div className="mt-5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Recent findings</span>
              <DLink href="/research-lab" className={textLink}>
                Research lab
              </DLink>
            </div>
            <ul>
              {d.findings.slice(0, 3).map((f) => (
                <li key={f.finding_uid} className="flex items-baseline justify-between gap-4 border-t border-line py-2 text-sm">
                  <span className="min-w-0 flex-1 break-words text-soft">{f.hypothesis}</span>
                  <StatusBadge value={f.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}
