"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { KalshiPriceChart, TIMELINE_COLORS, type PricePoint, type TimelineMark } from "@/components/charts";
import { ClassificationBadge } from "@/components/classification-badge";
import { PlayerAvatar } from "@/components/player-avatar";
import { ProbabilityDisplay } from "@/components/prob";
import { StatusDot } from "@/components/ui/badge";
import { Collapsible } from "@/components/ui/collapsible";
import { linkButton, textLink } from "@/components/ui/button";
import { NA, Val } from "@/components/ui/na";
import { BulletList, Label } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { Sheet } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { fmtCents, fmtCentsMove, fmtDateTimeET, fmtInt, fmtNum, fmtPct, fmtTimeET, statLabel, titleCase } from "@/lib/format";
import type { KalshiMarketDetail, KalshiMarketRow, KalshiSync } from "@/lib/types";

export const POLL_NOTE = "Polled periodically — not a continuous feed.";

/** Last sync time, the API's own note, and an amber stale tag when the poll is overdue. */
export function KalshiSyncStatus({ sync, className }: { sync: KalshiSync; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)} data-testid="kalshi-sync" data-stale={sync.stale ? "1" : "0"}>
      <StatusDot tone={sync.stale ? "warn" : "neutral"} className={sync.stale ? "text-warn" : undefined}>
        {sync.stale ? "Stale" : "Synced"}
      </StatusDot>
      <span className="num text-muted">
        Last sync {fmtDateTimeET(sync.last_sync_at) ?? "—"}
        {sync.age_minutes !== null ? ` · ${Math.round(sync.age_minutes)} min ago` : ""} · polled about every {sync.poll_minutes} min
      </span>
      <span className="text-muted">{sync.note}</span>
    </p>
  );
}

/**
 * A price move. Direction is shown with an arrow and a sign; colour is the neutral data hue (up) or
 * slate (down) because a market move is neither good nor bad.
 */
export function PriceMove({ v, className }: { v: number | null | undefined; className?: string }) {
  const t = fmtCentsMove(v);
  if (t === null || v === null || v === undefined) return <NA className={className} />;
  const up = v > 0;
  const flat = Math.round(v * 1000) === 0;
  return (
    <span className={cn("num inline-flex items-center gap-0.5 whitespace-nowrap", flat ? "text-muted" : up ? "text-info" : "text-muted", className)} data-move={flat ? "flat" : up ? "up" : "down"}>
      {!flat && (up ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
      {t}
    </span>
  );
}

export function TrackedOnlyTag({ m }: { m: Pick<KalshiMarketRow, "interpretation" | "interpretation_note"> }) {
  if (m.interpretation === "normalized") return null;
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded bg-raised px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted"
      title={m.interpretation_note ?? (m.interpretation === "unmatched" ? "Not matched to a GIZER market" : "Contract type not evaluated by GIZER")}
      data-testid="tracked-only"
    >
      Tracked only
    </span>
  );
}

function Threshold({ m }: { m: KalshiMarketRow }) {
  if (m.comparator === null && m.threshold === null) return <NA />;
  return (
    <span className="num whitespace-nowrap text-sm text-ink">
      {m.comparator ?? "—"}
      {m.threshold !== null && <span className="ml-1 text-xs text-muted">(strike {m.threshold})</span>}
    </span>
  );
}

function BidAsk({ m }: { m: Pick<KalshiMarketRow, "yes_bid" | "yes_ask"> }) {
  return (
    <span className="num whitespace-nowrap">
      <Val v={fmtCents(m.yes_bid)} /> <span className="text-faint">/</span> <Val v={fmtCents(m.yes_ask)} />
    </span>
  );
}

const sub = (m: KalshiMarketRow) => [m.team_abbr, m.game_label, m.stat_label ?? (m.stat ? statLabel(m.stat) : null) ?? titleCase(m.kind)].filter(Boolean).join(" · ");

/** Mobile / tablet: expandable contract card. */
export function KalshiCard({ m, onOpen }: { m: KalshiMarketRow; onOpen: (m: KalshiMarketRow) => void }) {
  const [open, setOpen] = useState(false);
  const tracked = m.interpretation !== "normalized";
  return (
    <article className={cn("rounded-lg bg-card ring-1 ring-inset ring-line/60", tracked && "opacity-80")} data-testid="kalshi-card" data-ticker={m.ticker}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-[44px] w-full items-center gap-3 p-3 text-left" data-testid="kalshi-card-toggle">
        <span className="min-w-0 flex-1">
          <span className={cn("block break-words text-base font-semibold", tracked ? "text-soft" : "text-ink")}>{m.title}</span>
          <span className="block break-words text-xs text-muted">{sub(m)}</span>
          <TrackedOnlyTag m={m} />
        </span>
        <span className="shrink-0 text-right">
          <span className="num block text-base font-semibold text-ink">
            <Val v={fmtCents(m.price)} />
          </span>
          <PriceMove v={m.change_since_first} className="text-xs" />
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-faint" aria-hidden /> : <ChevronDown className="h-4 w-4 shrink-0 text-faint" aria-hidden />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-line/50 p-3">
          {tracked && m.interpretation_note && <p className="text-xs text-muted">{m.interpretation_note}</p>}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
            {(
              [
                ["Threshold", <Threshold key="t" m={m} />],
                ["First observed", <Val key="f" v={fmtCents(m.first_observed)} />],
                ["15m / 60m move", <span key="w" className="flex gap-2"><PriceMove v={m.windows?.["15m"]} /><PriceMove v={m.windows?.["60m"]} /></span>],
                ["Bid / ask", <BidAsk key="b" m={m} />],
                ["Spread", <Val key="s" v={fmtCents(m.spread)} />],
                ["Volume", <Val key="v" v={fmtInt(m.volume)} />],
                ["Open interest", <Val key="o" v={fmtInt(m.open_interest)} />],
                ["Status", <span key="st">{titleCase(m.status)}</span>],
              ] as [string, ReactNode][]
            ).map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-2xs font-medium uppercase text-muted">{label}</dt>
                <dd className="text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="num text-xs text-muted">Updated {fmtTimeET(m.last_observed_at) ?? "—"}</span>
            <button type="button" className={linkButton} onClick={() => onOpen(m)} data-testid="kalshi-open">
              Market detail <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

const TH = "px-2 pb-2 text-2xs font-semibold uppercase tracking-wide text-muted";

/** Kalshi contract table (xl and up) with expandable cards below that width. */
export function KalshiTable({ rows, onOpen }: { rows: KalshiMarketRow[]; onOpen: (m: KalshiMarketRow) => void }) {
  return (
    <>
      <div className="hidden xl:block" data-testid="kalshi-table">
        <table className="w-full table-auto border-collapse">
          <caption className="sr-only">Kalshi contracts</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={TH}>Contract</th>
              <th scope="col" className={TH}>Threshold</th>
              <th scope="col" className={cn(TH, "text-right")}>First</th>
              <th scope="col" className={cn(TH, "text-right")}>Price</th>
              <th scope="col" className={cn(TH, "text-right")} title="Change since the first observation today">Move</th>
              <th scope="col" className={cn(TH, "text-right")}>15m / 60m</th>
              <th scope="col" className={cn(TH, "text-right")}>Bid / ask</th>
              <th scope="col" className={cn(TH, "text-right")}>Spread</th>
              <th scope="col" className={cn(TH, "text-right")}>Volume</th>
              <th scope="col" className={cn(TH, "hidden text-right 2xl:table-cell")}>Open int.</th>
              <th scope="col" className={cn(TH, "text-right")}>Updated</th>
              <th scope="col" className={cn(TH, "hidden 2xl:table-cell")}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const tracked = m.interpretation !== "normalized";
              return (
                <tr
                  key={m.ticker}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open market detail for ${m.title}`}
                  onClick={() => onOpen(m)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(m);
                    }
                  }}
                  className={cn("cursor-pointer border-b border-line/40 align-middle last:border-0 hover:bg-raised/40", tracked && "opacity-75")}
                  data-testid="kalshi-row"
                  data-ticker={m.ticker}
                  data-interpretation={m.interpretation}
                >
                  <td className="px-2 py-2">
                    <span className={cn("block text-sm font-semibold leading-5", tracked ? "text-soft" : "text-ink")}>{m.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {sub(m)}
                      <TrackedOnlyTag m={m} />
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <Threshold m={m} />
                  </td>
                  <td className="num px-2 py-2 text-right text-sm text-soft">
                    <Val v={fmtCents(m.first_observed)} />
                  </td>
                  <td className="num px-2 py-2 text-right text-sm font-semibold text-ink">
                    <Val v={fmtCents(m.price)} />
                  </td>
                  <td className="px-2 py-2 text-right text-sm">
                    <PriceMove v={m.change_since_first} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-xs">
                    <PriceMove v={m.windows?.["15m"]} /> <span className="text-faint">/</span> <PriceMove v={m.windows?.["60m"]} />
                  </td>
                  <td className="px-2 py-2 text-right text-sm text-soft">
                    <BidAsk m={m} />
                  </td>
                  <td className="num px-2 py-2 text-right text-sm text-soft">
                    <Val v={fmtCents(m.spread)} />
                  </td>
                  <td className="num px-2 py-2 text-right text-sm text-soft">
                    <Val v={fmtInt(m.volume)} />
                  </td>
                  <td className="num hidden px-2 py-2 text-right text-sm text-soft 2xl:table-cell">
                    <Val v={fmtInt(m.open_interest)} />
                  </td>
                  <td className="num whitespace-nowrap px-2 py-2 text-right text-xs text-muted" title={fmtDateTimeET(m.last_observed_at) ?? undefined}>
                    <Val v={fmtTimeET(m.last_observed_at)} />
                  </td>
                  <td className="hidden px-2 py-2 text-xs text-muted 2xl:table-cell">{titleCase(m.status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 xl:hidden">
        {rows.map((m) => (
          <KalshiCard key={m.ticker} m={m} onOpen={onOpen} />
        ))}
      </div>
    </>
  );
}

function CompactGroup({ label, list, ladder, perGroup }: { label: string; list: KalshiMarketRow[]; ladder: boolean; perGroup: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, perGroup);
  return (
    <div className="min-w-0" data-testid="kalshi-group">
      <div className="flex items-baseline justify-between border-b border-line/50 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
        <span>
          {label} · {list.length}
        </span>
        <span>Market price · move · volume</span>
      </div>
      <ul className="divide-y divide-line/30">
        {shown.map((m, idx) => (
          <li key={m.ticker} className={cn(!all && idx >= 3 && "hidden md:block")}>
            <DLink href={`/kalshi-intelligence/${encodeURIComponent(m.ticker)}`} className={cn("flex min-h-[44px] items-center gap-3 py-1.5 hover:bg-raised/40", m.interpretation !== "normalized" && "opacity-75")} data-testid="kalshi-compact-row">
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium text-ink">{ladder ? (m.comparator ?? m.title) : m.title}</span>
                {ladder && <span className="block break-words text-xs text-muted">{m.title}</span>}
                <TrackedOnlyTag m={m} />
              </span>
              <span className="num w-14 shrink-0 text-right text-sm font-semibold text-ink">
                <Val v={fmtCents(m.price)} />
              </span>
              <span className="w-16 shrink-0 text-right text-xs">
                <PriceMove v={m.change_since_first} />
              </span>
              <span className="num w-16 shrink-0 text-right text-xs text-muted">
                <Val v={fmtInt(m.volume)} />
              </span>
            </DLink>
          </li>
        ))}
      </ul>
      {list.length > 3 && (
        <button type="button" className={cn("mt-1 inline-flex min-h-[44px] items-center text-xs font-medium text-accent hover:underline md:min-h-0", list.length <= perGroup && "md:hidden")} aria-expanded={all} onClick={() => setAll((v) => !v)} data-testid="kalshi-group-more">
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}

/**
 * Compact rows grouped by stat/kind: contract title, market price, move since first observation, volume.
 * Each group shows its first `perGroup` rows (a real slate has hundreds of contracts per game).
 */
export function KalshiCompactList({ rows, ladder = false, perGroup = 5, mainLineFirst = false, maxGroups }: { rows: KalshiMarketRow[]; ladder?: boolean; perGroup?: number; mainLineFirst?: boolean; maxGroups?: number }) {
  const groups = useMemo(() => {
    const m = new Map<string, KalshiMarketRow[]>();
    for (const r of rows) {
      const key = r.stat_label ?? (r.stat ? statLabel(r.stat) : titleCase(r.kind));
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    // ladders read by threshold; game lists keep the API order (volume) so the busiest contracts lead
    if (ladder) for (const list of m.values()) list.sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
    if (mainLineFirst) {
      // Per player (or per contract family), the contract priced closest to even leads; the other thresholds follow.
      for (const [key, list] of m) {
        const best = new Map<string, KalshiMarketRow>();
        for (const r of list) {
          const who = r.player_name ?? r.team_abbr ?? r.title;
          const cur = best.get(who);
          if (r.price !== null && (!cur || cur.price === null || Math.abs(r.price - 0.5) < Math.abs(cur.price - 0.5))) best.set(who, r);
          else if (!cur) best.set(who, r);
        }
        const mains = new Set([...best.values()].map((r) => r.ticker));
        m.set(key, [...list.filter((r) => mains.has(r.ticker)), ...list.filter((r) => !mains.has(r.ticker))]);
      }
    }
    return [...m.entries()];
  }, [rows, ladder, mainLineFirst]);
  const head = maxGroups ? groups.slice(0, maxGroups) : groups;
  const rest = maxGroups ? groups.slice(maxGroups) : [];
  return (
    <div data-testid="kalshi-compact">
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
        {head.map(([label, list]) => (
          <CompactGroup key={label} label={label} list={list} ladder={ladder} perGroup={perGroup} />
        ))}
      </div>
      {rest.length > 0 && (
        <Collapsible title={`${rest.length} more contract ${rest.length === 1 ? "group" : "groups"}`} right={rest.map(([l]) => l).slice(0, 3).join(" · ")} className="mt-3" testId="kalshi-more-groups">
          <div className="grid gap-x-6 gap-y-4 px-3 pb-3 lg:grid-cols-2">
            {rest.map(([label, list]) => (
              <CompactGroup key={label} label={label} list={list} ladder={ladder} perGroup={perGroup} />
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="num text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

const EVENT_LABEL = { availability: "Availability", lineup: "Lineup", market_status: "Market status" } as const;

/** Full market detail: market data first, independent model research second, each labelled. */
export function KalshiDetailView({ d }: { d: KalshiMarketDetail }) {
  const m = d.market;
  const [metric, setMetric] = useState<"price" | "spread" | "volume">("price");
  const tracked = m.interpretation !== "normalized";
  const points: PricePoint[] = useMemo(
    () =>
      d.series
        .map((p) => ({ t: new Date(p.at).getTime(), price: p.price, band: p.yes_bid !== null && p.yes_ask !== null ? ([p.yes_bid, p.yes_ask] as [number, number]) : null, spread: p.spread, volume: p.volume }))
        .filter((p) => Number.isFinite(p.t))
        .sort((a, b) => a.t - b.t),
    [d.series],
  );
  const marks: TimelineMark[] = useMemo(() => d.timeline.map((e) => ({ t: new Date(e.at).getTime(), type: e.type, own: e.own_player, text: e.text })).filter((e) => Number.isFinite(e.t)), [d.timeline]);
  const timeline = useMemo(() => [...d.timeline].sort((a, b) => a.at.localeCompare(b.at)), [d.timeline]);
  const r = d.research;

  return (
    <div className="space-y-6" data-testid="kalshi-detail" data-ticker={m.ticker}>
      {/* ---------- Market data ---------- */}
      <section className="space-y-4" aria-label="Market data" data-testid="kd-market">
        <div>
          <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.12em] text-info">Market data · Kalshi</div>
          <h2 className="break-words text-lg font-semibold leading-6 text-ink">{m.title}</h2>
          <p className="text-sm text-muted">{[m.game_label, m.team_abbr, m.stat_label].filter(Boolean).join(" · ") || "Game not available"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusDot tone="neutral">{titleCase(m.status)}</StatusDot>
            <TrackedOnlyTag m={m} />
            <span className="num break-all text-xs text-faint">{m.ticker}</span>
          </div>
          {tracked && (
            <p className="mt-2 rounded-md bg-raised/60 px-3 py-2 text-sm text-soft" data-testid="kd-tracked-note">
              Tracked only — GIZER does not evaluate this contract. {m.interpretation_note ?? ""}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-raised/50 p-3 sm:grid-cols-4">
          <Stat label="Threshold">{m.comparator ?? "—"}</Stat>
          <Stat label="Exact strike"><Val v={m.threshold} /></Stat>
          <Stat label="Market price"><Val v={fmtCents(m.price)} /></Stat>
          <Stat label="Move since first"><PriceMove v={m.change_since_first} /></Stat>
          <Stat label="Bid / ask"><BidAsk m={m} /></Stat>
          <Stat label="Last trade"><Val v={fmtCents(m.last_price)} /></Stat>
          <Stat label="Volume"><Val v={fmtInt(m.volume)} /></Stat>
          <Stat label="Open interest"><Val v={fmtInt(m.open_interest)} /></Stat>
          <Stat label="First observed"><Val v={fmtCents(m.first_observed)} /></Stat>
          <Stat label="Low / high"><Val v={fmtCents(m.low)} /> <span className="text-faint">/</span> <Val v={fmtCents(m.high)} /></Stat>
          <Stat label="Observations">{m.observations}</Stat>
          <Stat label="Closes"><Val v={fmtDateTimeET(m.close_time)} /></Stat>
        </dl>
        <KalshiSyncStatus sync={d.sync} className="text-xs" />

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Label className="mb-0">Price history</Label>
            <Tabs label="History metric" size="sm" value={metric} onChange={(v) => setMetric(v as typeof metric)} items={[{ id: "price", label: "Price" }, { id: "spread", label: "Spread" }, { id: "volume", label: "Volume" }]} />
          </div>
          {points.length < 2 ? (
            <EmptyState title="Only one observation so far">{points.length === 1 ? `Market price ${fmtCents(points[0]?.price ?? null) ?? "—"} at ${fmtDateTimeET(d.series[0]?.at) ?? "—"}. A line is drawn once a second observation exists.` : "No observations have been stored for this contract yet."}</EmptyState>
          ) : (
            <KalshiPriceChart points={points} marks={marks} metric={metric} />
          )}
        </div>

        <div data-testid="kd-timeline">
          <Label>Events during this market · {timeline.length}</Label>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted">No availability, lineup or market-status events were recorded for this game.</p>
          ) : (
            <ul className="divide-y divide-line/30">
              {timeline.map((e, i) => (
                <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3 py-2 text-sm">
                  <span className="mt-1 h-3 border-l-2" style={{ borderColor: TIMELINE_COLORS[e.type] }} aria-hidden />
                  <span className="min-w-0">
                    <span className={cn("break-words", e.own_player ? "font-semibold text-ink" : "text-soft")}>{e.text}</span>
                    <span className="num block text-xs text-muted">
                      {EVENT_LABEL[e.type] ?? titleCase(e.type)} · {fmtDateTimeET(e.at) ?? "—"}
                      {e.source ? ` · ${e.source}` : ""}
                      {e.source_published_at ? ` · published ${fmtDateTimeET(e.source_published_at)}` : ""}
                      {e.own_player ? " · this contract's player" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {points.length >= 2 && marks.some((e) => e.t < (points[0]?.t ?? 0) || e.t > (points[points.length - 1]?.t ?? 0)) && (
            <p className="mt-1 text-xs text-muted" data-testid="kd-outside">
              {marks.filter((e) => e.t < (points[0]?.t ?? 0) || e.t > (points[points.length - 1]?.t ?? 0)).length} event(s) fall outside the observed price window, so they are listed here but have no marker on the chart.
            </p>
          )}
          <p className="mt-1 text-xs text-muted">Events are shown for context in time order. An event next to a price change does not establish that one caused the other.</p>
        </div>

        <div className="rounded-md bg-raised/50 p-3" data-testid="kd-rules">
          <Label>Contract rules</Label>
          <p className="whitespace-pre-line break-words text-sm text-soft">{d.rules.primary ?? "Primary rules not available."}</p>
          {d.rules.secondary && <p className="mt-2 whitespace-pre-line break-words text-xs text-muted">{d.rules.secondary}</p>}
          <p className="mt-2 break-words text-xs text-muted">{d.rules.settlement_note}</p>
        </div>

        <div data-testid="kd-history">
          <Label>Historical results vs this threshold (descriptive)</Label>
          {!d.history ? (
            <p className="text-sm text-muted">Not available for this contract.</p>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["L5", "L10", "L20", "season"] as const).map((k) => {
                  const h = d.history?.[k];
                  return (
                    <li key={k} className="rounded-md bg-raised/50 px-3 py-2">
                      <div className="text-2xs font-semibold uppercase text-muted">{k === "season" ? "Season" : k}</div>
                      {h ? (
                        <>
                          <div className="num text-sm font-semibold text-ink">
                            {h.over} of {h.n} over
                          </div>
                          <div className="num text-xs text-muted">
                            under {h.under} · equal {h.equal} · avg <Val v={fmtNum(h.average)} />
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-muted">—</div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1 text-xs text-muted">Counts of past games against this exact threshold — descriptive history, not a probability.</p>
            </>
          )}
        </div>
      </section>

      {/* ---------- Independent model research ---------- */}
      <section className="space-y-3 border-t border-line/60 pt-5" aria-label="Independent model research" data-testid="kd-research">
        <div className="text-2xs font-semibold uppercase tracking-[0.12em] text-accent">Independent model research · GIZER</div>
        {tracked ? (
          <p className="rounded-md bg-raised/40 px-3 py-2.5 text-sm text-muted" data-testid="kd-no-model">
            No model research is shown for a tracked-only contract.
          </p>
        ) : !r ? (
          <p className="rounded-md bg-raised/40 px-3 py-2.5 text-sm text-muted" data-testid="kd-no-research">
            {m.kind === "player" ? "No model research is available for this contract." : "Model research is shown for player contracts only."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {r.player && (
                <DLink href={`/players/${r.player.id}`} className="flex items-center gap-2 hover:underline">
                  <PlayerAvatar name={r.player.name} src={r.player.headshot_url} size={32} />
                  <span className="text-sm font-semibold text-ink">{r.player.name}</span>
                  {r.player.position && <span className="text-xs text-muted">{r.player.position}</span>}
                </DLink>
              )}
              <StatusDot tone={r.model_ready ? "accent" : "warn"}>{r.model_ready ? "Model ready" : "Model not ready"}</StatusDot>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-raised/50 p-3 sm:grid-cols-3">
              <Stat label="Projection [p10–p90]">
                {r.projection && r.projection.mean !== null ? (
                  <>
                    {fmtNum(r.projection.mean)} <span className="text-xs font-normal text-muted">[{fmtNum(r.projection.p10) ?? "—"}–{fmtNum(r.projection.p90) ?? "—"}]</span>
                  </>
                ) : (
                  <NA />
                )}
              </Stat>
              <Stat label="Projected minutes"><Val v={fmtNum(r.projection?.proj_min, 0)} /></Stat>
              <Stat label="Projection created"><Val v={fmtDateTimeET(r.projection?.created_at)} /></Stat>
            </dl>
            {r.selections.length === 0 ? (
              <p className="text-sm text-muted">No research selection was evaluated for this contract.</p>
            ) : (
              <ul className="space-y-2">
                {r.selections.map((s) => (
                  <li key={s.id} className="rounded-md bg-raised/50 p-3" data-testid="kd-selection">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold capitalize text-ink">{s.side}</span>
                        <ClassificationBadge value={s.classification} />
                      </div>
                      <div className="text-right">
                        <div className="text-2xs font-medium uppercase text-muted">Model probability [interval]</div>
                        <ProbabilityDisplay prob={s.prob} low={s.prob_low} high={s.prob_high} />
                      </div>
                    </div>
                    <p className="num mt-1 text-xs text-muted">
                      Break-even at the market price <Val v={fmtPct(s.breakeven)} />
                    </p>
                    {s.rejection_reasons.length > 0 && (
                      <div className="mt-2">
                        <BulletList items={s.rejection_reasons} tone="bad" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">{r.note}</p>
          </>
        )}
        <p className="text-xs text-muted">The market price above is Kalshi’s; the model probability here is GIZER’s. They are independent figures and neither is derived from the other.</p>
      </section>

      {d.notes.length > 0 && (
        <ul className="space-y-0.5 border-t border-line/60 pt-3 text-xs text-muted" data-testid="kd-notes">
          {d.notes.map((n, i) => (
            <li key={i}>· {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function KalshiDetailLoader({ ticker }: { ticker: string }) {
  const q = useQuery({ queryKey: ["kalshi-market", ticker], queryFn: () => api.kalshiMarket(ticker) });
  return (
    <QueryView query={q} rows={8}>
      {(d) => <KalshiDetailView d={d} />}
    </QueryView>
  );
}

/** Market detail drawer (right drawer from md, bottom sheet below). */
export function KalshiDrawer({ ticker, onClose }: { ticker: string | null; onClose: () => void }) {
  return (
    <Sheet open={ticker !== null} onClose={onClose} side="auto" testId="kalshi-drawer" title="Market detail">
      {ticker && (
        <>
          <KalshiDetailLoader ticker={ticker} />
          <div className="mt-4">
            <DLink href={`/kalshi-intelligence/${encodeURIComponent(ticker)}`} className={textLink}>
              Open as a page <ArrowRight className="h-3 w-3" aria-hidden />
            </DLink>
          </div>
        </>
      )}
    </Sheet>
  );
}
