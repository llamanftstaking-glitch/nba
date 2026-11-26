"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { ClassificationBadge } from "@/components/classification-badge";
import { LiveNav } from "@/components/live/live-nav";
import { StatusDot } from "@/components/ui/badge";
import { Val } from "@/components/ui/na";
import { PageHeader } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { DLink } from "@/lib/date";
import { fmtClockET, fmtDateTimeET, fmtLine, fmtSigned, titleCase } from "@/lib/format";
import { live, type TrackerItem } from "@/lib/live";

const OBS: Record<string, string> = { not_started: "Game not started", in_progress: "Game in progress", final_awaiting_settlement: "Game final — awaiting settlement", settled: "Settled" };

function TicketCard({ t }: { t: TrackerItem }) {
  return (
    <article className="rounded-lg bg-card ring-1 ring-inset ring-line/60" data-testid="tracker-ticket">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3">
        <span className="num font-display text-lg font-semibold uppercase tracking-wide text-ink">Paper ticket #{t.ticket_id}</span>
        <span className="text-xs text-muted">
          {titleCase(t.engine)} · {t.structure} · saved {fmtDateTimeET(t.created_at) ?? "—"}
        </span>
        <ClassificationBadge value={t.classification} />
        <span className="ml-auto">
          {t.settlement ? <StatusDot tone="neutral" data-testid="tracker-settlement">Settled: {titleCase(t.settlement.result)}</StatusDot> : <StatusDot tone="neutral">Pending settlement</StatusDot>}
        </span>
      </header>
      <ul className="divide-y divide-line/30 px-4 pb-3 pt-1">
        {t.legs.map((l, i) => (
          <li key={i} className="grid gap-x-4 gap-y-1 py-2.5 md:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1.2fr)] md:items-center" data-testid="tracker-leg">
            <div className="min-w-0">
              <div className="break-words text-sm font-medium text-ink">{l.label}</div>
              <div className="text-xs text-muted">
                {l.game_id && l.game_label ? (
                  <DLink href={`/games/${encodeURIComponent(l.game_id)}?tab=live`} className="hover:underline">
                    {l.game_label}
                  </DLink>
                ) : (
                  (l.game_label ?? "Game —")
                )}{" "}
                · {l.status_label ?? "Status —"}
                {l.period_label ? ` · ${l.period_label}` : ""}
                {l.clock ? ` ${l.clock}` : ""}
              </div>
            </div>
            <dl className="num grid grid-cols-3 gap-x-5 text-sm">
              <div>
                <dt className="text-2xs font-medium uppercase text-muted">Line</dt>
                <dd className="font-semibold text-ink"><Val v={fmtLine(l.line)} /></dd>
              </div>
              <div>
                <dt className="text-2xs font-medium uppercase text-muted">Current</dt>
                <dd className="font-semibold text-ink"><Val v={l.current} /></dd>
              </div>
              <div>
                <dt className="text-2xs font-medium uppercase text-muted">Difference</dt>
                <dd className="text-soft"><Val v={fmtSigned(l.difference_to_line, 1)} /></dd>
              </div>
            </dl>
            <div className="text-xs text-muted">
              <span className="text-soft">{OBS[l.observation] ?? titleCase(l.observation)}</span>
              {l.current_basis ? ` · ${l.current_basis}` : ""}
              <span className="num block">
                {l.stale ? <span className="font-semibold text-warn">Delayed — last update {fmtClockET(l.observed_at) ?? "not available"}</span> : l.observed_at ? `observed ${fmtClockET(l.observed_at)}` : "not observed yet"}
              </span>
            </div>
          </li>
        ))}
      </ul>
      {t.settlement?.reason && <p className="border-t border-line/50 px-4 py-2 text-xs text-muted">{t.settlement.reason}</p>}
    </article>
  );
}

export default function ResearchTrackerPage() {
  const q = useQuery({ queryKey: ["live", "tracker"], queryFn: () => live.tracker(), refetchInterval: 30_000 });
  return (
    <div className="space-y-5">
      <PageHeader title="Research Tracker" sub="Open paper tickets beside what has been observed so far: each leg’s line and current value. An outcome exists only once a ticket is settled." />
      <LiveNav />
      <QueryView query={q} rows={5}>
        {(d) => (
          <>
            {d.items.length === 0 ? (
              <EmptyState title="No paper tickets for this date." icon={ClipboardList}>
                Tickets saved to the paper ledger for today’s games are listed here with their observed values once games begin.
              </EmptyState>
            ) : (
              <div className="grid gap-4 2xl:grid-cols-2">
                {d.items.map((t) => (
                  <TicketCard key={t.ticket_id} t={t} />
                ))}
              </div>
            )}
            {d.notes.length > 0 && (
              <ul className="space-y-0.5 text-xs text-muted" data-testid="tracker-notes">
                {d.notes.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </QueryView>
    </div>
  );
}
