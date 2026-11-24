"use client";

import { Activity, AlertTriangle, ArrowRight, BarChart3, Boxes, CalendarDays, Clock, Crosshair, Filter, HeartPulse, Layers, Target, TrendingUp, Users, Zap } from "lucide-react";
import { StatusBadge } from "@/components/classification-badge";
import { GameMatchupCard } from "@/components/game-card";
import { PropRow } from "@/components/props";
import { SelectionList } from "@/components/selection-card";
import { SummaryTiles, Tile } from "@/components/summary";
import { StatusDot } from "@/components/ui/badge";
import { textLink } from "@/components/ui/button";
import { Val } from "@/components/ui/na";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState, Skeleton } from "@/components/ui/states";
import { DLink, useSelectedDate } from "@/lib/date";
import { fmtDate, fmtDateTimeET, fmtInt, titleCase } from "@/lib/format";
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
  const q = usePlayerProps({ date, quoted: true, limit: 5 });
  const rows = q.data?.items ?? [];
  if (quoted > 0 && q.isPending) return <LoadingState rows={3} />;
  if (rows.length === 0) {
    return (
      <EmptyState title={message || "Player prop quotes are not available for this slate."} icon={Target}>
        <DLink href="/player-props#manual" className={textLink}>
          Enter a market manually <ArrowRight className="h-3 w-3" aria-hidden />
        </DLink>
      </EmptyState>
    );
  }
  return (
    <div>
      {message && <p className="mb-1 text-xs text-muted">{message}</p>}
      <div className="divide-y divide-line/40" data-testid="overview-props">
        {rows.map((p) => (
          <PropRow key={`${p.player_id}:${p.market}`} p={p} />
        ))}
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const date = useSelectedDate();
  const q = useCommandCenter(date);
  const combos = useCombos("double", date);

  if (q.isPending) {
    return (
      <div>
        <PageHeader title="Command Center" />
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <LoadingState rows={6} label="Loading overview" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div>
        <PageHeader title="Command Center" />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const d = q.data;
  const ls = d.lineups_summary;
  const ps = d.props_summary;
  const notReady = d.model_readiness.filter((m) => !m.ready).length;
  return (
    <div className="space-y-5" data-testid="command-center">
      <PageHeader
        title="Command Center"
        sub={
          <>
            Slate {fmtDate(d.date, { weekday: true, year: true }) ?? d.date}
            {d.is_today ? " · today" : " · historical date, original editions shown"}
          </>
        }
        right={
          <>
            <DLink href="/research/daily" className={textLink}>
              Editions ({d.editions.length})
            </DLink>
            <DLink href="/parlays" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-bg shadow-accent hover:brightness-110 md:min-h-0 md:h-9">
              <Zap className="h-4 w-4" aria-hidden />
              Parlay research
            </DLink>
          </>
        }
      />

      {d.warnings.length > 0 && (
        <div role="status" className="rounded-lg bg-warn/10 px-4 py-2 ring-1 ring-inset ring-warn/40" data-testid="warnings">
          <ul className="space-y-1">
            {d.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-soft">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                {i === 0 && <span className="shrink-0 font-display text-[15px] font-semibold uppercase tracking-wide text-warn">Warnings</span>}
                <span className="min-w-0 break-words">{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="stat-strip">
        <Tile icon={CalendarDays} label="Games">
          {fmtInt(d.slate.n_games)}
        </Tile>
        <Tile icon={TrendingUp} label="Markets analyzed" sub={`${fmtInt(d.counts.rejected)} rejected`}>
          {fmtInt(d.counts.markets_analyzed)}
        </Tile>
        <Tile icon={Filter} label="Qualified selections" sub={`${fmtInt(d.counts.high_confidence)} high confidence`}>
          {fmtInt(d.counts.qualified_selections)}
        </Tile>
        <Tile icon={Layers} label="Combinations">
          {fmtInt(d.counts.combinations)}
        </Tile>
        <Tile icon={Users} label="Lineups" sub={ls ? `${ls.unknown} awaiting confirmation` : undefined}>
          {ls ? (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="whitespace-nowrap">
                {ls.confirmed} <span className="text-sm font-medium text-muted">confirmed</span>
              </span>
              <span className="whitespace-nowrap">
                {ls.projected} <span className="text-sm font-medium text-muted">projected</span>
              </span>
            </span>
          ) : (
            <Val v={null} />
          )}
        </Tile>
        <Tile icon={Target} label="Prop markets" sub={ps ? `${ps.manual_entries} manual · ${ps.players_projected} players projected` : undefined}>
          {ps ? (
            <>
              {fmtInt(ps.quoted_markets)} <span className="text-sm font-medium text-muted">quoted</span>
            </>
          ) : (
            <Val v={null} />
          )}
        </Tile>
        <Tile icon={Clock} label="Latest refresh">
          <span className="text-base">
            <Val v={fmtDateTimeET(d.latest_refresh_at)} />
          </span>
        </Tile>
        <Tile icon={Boxes} label="Edition" sub={d.edition ? `Published ${fmtDateTimeET(d.edition.published_at) ?? "—"}` : undefined}>
          {d.edition ? (
            <span className="text-base">
              {titleCase(d.edition.kind)} <span className="text-muted">v{d.edition.version}</span>
            </span>
          ) : (
            <span className="text-sm font-normal text-muted">No edition published</span>
          )}
        </Tile>
      </div>

      <section aria-label="Games on this slate">
        <SectionTitle
          right={
            <DLink href="/games" className={textLink}>
              All games <ArrowRight className="h-3 w-3" aria-hidden />
            </DLink>
          }
        >
          Slate · {d.slate.n_games} game{d.slate.n_games === 1 ? "" : "s"}
        </SectionTitle>
        {d.slate.games.length === 0 ? (
          <EmptyState title="No games are scheduled for this date." icon={CalendarDays} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {d.slate.games.map((g) => (
              <GameMatchupCard key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Player prop research"
          icon={Target}
          right={
            <DLink href="/player-props" className={textLink}>
              All player props <ArrowRight className="h-3 w-3" aria-hidden />
            </DLink>
          }
        >
          <PropSummary date={date} message={ps?.message ?? ""} quoted={ps?.quoted_markets ?? 0} />
        </Panel>

        <Panel
          title="Parlay research"
          icon={Layers}
          right={
            <DLink href="/parlays" className={textLink}>
              Open parlay research <ArrowRight className="h-3 w-3" aria-hidden />
            </DLink>
          }
        >
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="parlay-strip">
            {CATEGORIES.map(([id, label]) => (
              <li key={id}>
                <DLink href={`/parlays?tab=${id}`} className="flex min-h-[44px] flex-col rounded-md bg-raised/50 px-3 py-2 hover:bg-raised">
                  <span className="text-xs text-muted">{label}</span>
                  <span className="num text-lg font-semibold text-ink">{combos.data ? (combos.data.counts[id] ?? 0) : "—"}</span>
                </DLink>
              </li>
            ))}
            <li>
              <DLink href="/builder" className="flex min-h-[44px] flex-col justify-center rounded-md bg-raised/50 px-3 py-2 hover:bg-raised">
                <span className="text-xs text-muted">Build your own</span>
                <span className="text-sm font-semibold text-accent">Research builder</span>
              </DLink>
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted">Counts are combinations that met the research criteria. Empty categories are reported as zero.</p>
        </Panel>
      </div>

      <Panel id="high-confidence" tone="accent" icon={Crosshair} title="High-confidence research" right={<span className="num">{d.high_confidence.length} selection(s)</span>}>
        {d.high_confidence.length === 0 ? (
          <EmptyState title={NO_HIGH_CONFIDENCE}>Qualification thresholds are fixed in advance and are not relaxed to fill this section.</EmptyState>
        ) : (
          <SelectionList items={d.high_confidence} />
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Injury changes"
          icon={HeartPulse}
          right={
            <DLink href="/injuries" className={textLink}>
              Injuries &amp; availability <ArrowRight className="h-3 w-3" aria-hidden />
            </DLink>
          }
        >
          {d.injury_changes.length === 0 ? (
            <EmptyState title="No injury changes recorded since the previous refresh." icon={HeartPulse} />
          ) : (
            <ul className="divide-y divide-line/40">
              {d.injury_changes.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
                  <span className="min-w-0 break-words text-soft">{c.text}</span>
                  <span className="num shrink-0 text-xs text-muted">{fmtDateTimeET(c.at) ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Paper-testing performance · all time"
          icon={BarChart3}
          right={
            <DLink href="/results" className={textLink}>
              Full results <ArrowRight className="h-3 w-3" aria-hidden />
            </DLink>
          }
        >
          {d.paper_performance.settled === 0 ? (
            <EmptyState title="n=0 — no settled paper tickets yet." icon={BarChart3}>
              Hit rate and ROI are not reported until tickets settle.
            </EmptyState>
          ) : (
            <SummaryTiles s={d.paper_performance} compact />
          )}
        </Panel>
      </div>

      <Panel
        title="Operational status"
        icon={Activity}
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
        <div className="grid gap-x-8 gap-y-3 lg:grid-cols-[auto_1fr]" data-testid="ops-status">
          <div>
            <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Agents</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <StatusDot tone="accent">
                <span className="num font-semibold text-ink">{d.agents.ok}</span> OK
              </StatusDot>
              <StatusDot tone={d.agents.failed > 0 ? "bad" : "neutral"}>
                <span className="num font-semibold text-ink">{d.agents.failed}</span> failed
              </StatusDot>
              <StatusDot tone={d.agents.never_run > 0 ? "warn" : "neutral"}>
                <span className="num font-semibold text-ink">{d.agents.never_run}</span> never run
              </StatusDot>
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
              Model readiness · {d.model_readiness.length - notReady} ready · {notReady} not ready
            </div>
            {d.model_readiness.length === 0 ? (
              <p className="text-sm text-muted">No models are registered.</p>
            ) : (
              <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                {d.model_readiness.map((m) => (
                  <li key={`${m.family}-${m.name}-${m.version}`} className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm" title={m.note}>
                    <span className="truncate font-medium text-ink">{m.name}</span>
                    <span className="num text-xs text-muted">{m.version}</span>
                    <span className="text-xs text-muted">{titleCase(m.family)}</span>
                    <StatusDot tone={m.ready ? "accent" : "warn"}>{m.ready ? "Ready" : "Not ready"}</StatusDot>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {d.findings.length > 0 && (
          <div className="mt-3 border-t border-line/50 pt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Recent findings</span>
              <DLink href="/research-lab" className={textLink}>
                Research lab
              </DLink>
            </div>
            <ul className="space-y-1">
              {d.findings.slice(0, 3).map((f) => (
                <li key={f.finding_uid} className="flex items-baseline justify-between gap-3 text-sm">
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
