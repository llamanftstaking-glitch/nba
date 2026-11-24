"use client";

import { ClassificationBadge, StatusBadge } from "@/components/classification-badge";
import { GameMatchupCard } from "@/components/game-card";
import { SelectionList } from "@/components/selection-card";
import { SummaryTiles, Tile } from "@/components/summary";
import { Badge } from "@/components/ui/badge";
import { Val } from "@/components/ui/na";
import { BulletList, PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState, Skeleton } from "@/components/ui/states";
import { DLink, useSelectedDate } from "@/lib/date";
import { fmtDate, fmtDateTimeET, fmtInt, titleCase } from "@/lib/format";
import { useCommandCenter } from "@/lib/queries";

const NO_HIGH_CONFIDENCE =
  "No selection met the high-confidence criteria for this slate. That is a valid research outcome.";

export default function CommandCenterPage() {
  const date = useSelectedDate();
  const q = useCommandCenter(date);

  if (q.isPending) {
    return (
      <div>
        <PageHeader title="Command Center" />
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <LoadingState rows={6} label="Loading command center" />
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
  return (
    <div className="space-y-3" data-testid="command-center">
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
            <DLink href="/research/daily" className="text-xs text-accent hover:underline">
              Editions ({d.editions.length})
            </DLink>
            <DLink href="/parlays" className="inline-flex h-7 items-center rounded border border-accent bg-accent px-2 text-xs font-medium text-bg">
              Parlay research
            </DLink>
          </>
        }
      />

      {d.warnings.length > 0 && (
        <Panel title="Warnings" tone="warn" bodyClassName="p-3">
          <BulletList items={d.warnings} tone="warn" />
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="stat-strip">
        <Tile label="Games">{fmtInt(d.slate.n_games)}</Tile>
        <Tile label="Markets analyzed" sub={`${fmtInt(d.counts.rejected)} rejected`}>
          {fmtInt(d.counts.markets_analyzed)}
        </Tile>
        <Tile label="Qualified selections" sub={`${fmtInt(d.counts.high_confidence)} high confidence`}>
          {fmtInt(d.counts.qualified_selections)}
        </Tile>
        <Tile label="Combinations">{fmtInt(d.counts.combinations)}</Tile>
        <Tile label="Latest refresh">
          <span className="text-sm">
            <Val v={fmtDateTimeET(d.latest_refresh_at)} />
          </span>
        </Tile>
        <Tile label="Edition" sub={d.edition ? `published ${fmtDateTimeET(d.edition.published_at) ?? "—"}` : undefined}>
          {d.edition ? (
            <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
              <Badge tone="info">{titleCase(d.edition.kind)}</Badge>
              <span>v{d.edition.version}</span>
            </span>
          ) : (
            <span className="text-sm font-normal text-muted">No edition published</span>
          )}
        </Tile>
      </div>

      <Panel
        id="high-confidence"
        tone="accent"
        title="High-confidence research"
        right={<span className="num">{d.high_confidence.length} selection(s)</span>}
      >
        {d.high_confidence.length === 0 ? (
          <EmptyState title={NO_HIGH_CONFIDENCE}>
            Qualification thresholds are fixed in advance and are not relaxed to fill this section.
          </EmptyState>
        ) : (
          <SelectionList items={d.high_confidence} />
        )}
      </Panel>

      <section aria-label="Games on this slate">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-2xs font-semibold uppercase tracking-wider text-soft">Slate · {d.slate.n_games} game(s)</h2>
          <DLink href="/games" className="text-xs text-accent hover:underline">
            All games →
          </DLink>
        </div>
        {d.slate.games.length === 0 ? (
          <EmptyState title="No games are scheduled for this date." />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {d.slate.games.map((g) => (
              <GameMatchupCard key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Injury changes" right={<DLink href="/injuries" className="text-accent hover:underline">Injury report →</DLink>}>
          {d.injury_changes.length === 0 ? (
            <EmptyState title="No injury changes recorded since the previous refresh." />
          ) : (
            <ul className="divide-y divide-line/70">
              {d.injury_changes.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-xs">
                  <span className="min-w-0 break-words text-soft">{c.text}</span>
                  <span className="num shrink-0 text-muted">{fmtDateTimeET(c.at) ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Model readiness" right={<DLink href="/performance" className="text-accent hover:underline">Registry →</DLink>}>
          {d.model_readiness.length === 0 ? (
            <EmptyState title="No models are registered." />
          ) : (
            <ul className="divide-y divide-line/70">
              {d.model_readiness.map((m) => (
                <li key={`${m.family}-${m.name}-${m.version}`} className="py-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-ink">{m.name}</span>
                    <span className="num text-xs text-muted">{m.version}</span>
                    <Badge>{m.family}</Badge>
                    <StatusBadge value={m.status} />
                    <Badge tone={m.ready ? "accent" : "warn"}>{m.ready ? "Ready" : "Not ready"}</Badge>
                  </div>
                  {m.note && <p className="mt-0.5 break-words text-2xs text-muted">{m.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Paper-testing performance · all time"
        right={<DLink href="/results" className="text-accent hover:underline">Full results →</DLink>}
      >
        {d.paper_performance.settled === 0 ? (
          <EmptyState title="n=0 — no settled paper tickets yet.">Hit rate and ROI are not reported until tickets settle.</EmptyState>
        ) : (
          <SummaryTiles s={d.paper_performance} compact />
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Agent status" right={<DLink href="/agents" className="text-accent hover:underline">Agent operations →</DLink>}>
          <dl className="grid grid-cols-3 gap-2">
            <Tile label="OK">{d.agents.ok}</Tile>
            <Tile label="Failed" className={d.agents.failed > 0 ? "border-bad/50" : undefined}>
              {d.agents.failed}
            </Tile>
            <Tile label="Never run" className={d.agents.never_run > 0 ? "border-warn/50" : undefined}>
              {d.agents.never_run}
            </Tile>
          </dl>
        </Panel>

        <Panel title="Recent findings" right={<DLink href="/research-lab" className="text-accent hover:underline">Research lab →</DLink>}>
          {d.findings.length === 0 ? (
            <EmptyState title="No research findings have been recorded." />
          ) : (
            <ul className="divide-y divide-line/70">
              {d.findings.map((f) => (
                <li key={f.finding_uid} className="flex flex-wrap items-start justify-between gap-2 py-1.5">
                  <span className="min-w-0 flex-1 break-words text-xs text-soft">{f.hypothesis}</span>
                  <ClassificationBadgeOrStatus value={f.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ClassificationBadgeOrStatus({ value }: { value: string }) {
  const known = ["high_confidence", "standard", "watchlist", "insufficient_evidence", "rejected", "invalidated"];
  return known.includes(value) ? <ClassificationBadge value={value} /> : <StatusBadge value={value} />;
}
