"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/classification-badge";
import { ComboCard } from "@/components/combo-card";
import { EnvironmentSummary, Matchup, completenessPct } from "@/components/game-card";
import { InjuryTable } from "@/components/injury-list";
import { SelectionList } from "@/components/selection-card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Meter } from "@/components/ui/meter";
import { NA, Val } from "@/components/ui/na";
import { BulletList, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";
import { fmtAmerican, fmtDate, fmtDateTimeET, fmtLine, fmtTimeET, titleCase } from "@/lib/format";
import type { GameDetail, LooseValue, PlayerProj, Quote, TeamForm } from "@/lib/types";

function loose(v: LooseValue | undefined, digits = 1) {
  if (v === null || v === undefined || v === "") return <NA />;
  if (typeof v === "number") return <span className="num">{Number.isInteger(v) ? v : v.toFixed(digits)}</span>;
  if (typeof v === "boolean") return <span>{v ? "yes" : "no"}</span>;
  return <span className="break-words">{v}</span>;
}

function TeamComparison({ home, away, homeAbbr, awayAbbr }: { home: TeamForm; away: TeamForm; homeAbbr: string; awayAbbr: string }) {
  const keys = [...new Set([...Object.keys(away ?? {}), ...Object.keys(home ?? {})])];
  if (keys.length === 0) return <EmptyState title="Team form is not available for this game." />;
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="sr-only">Team form comparison</caption>
      <thead>
        <tr className="border-b border-line-strong text-2xs uppercase tracking-wide text-muted">
          <th scope="col" className="py-1.5 pr-2 text-left font-semibold">Metric</th>
          <th scope="col" className="px-2 py-1.5 text-right font-semibold">{awayAbbr}</th>
          <th scope="col" className="py-1.5 pl-2 text-right font-semibold">{homeAbbr}</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-b border-line/70 last:border-0">
            <th scope="row" className="py-1 pr-2 text-left text-xs font-normal text-muted">{titleCase(k)}</th>
            <td className="px-2 py-1 text-right text-ink">{loose(away?.[k])}</td>
            <td className="py-1 pl-2 text-right text-ink">{loose(home?.[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function first(row: PlayerProj, keys: string[]): LooseValue | undefined {
  for (const k of keys) if (k in row) return row[k];
  return undefined;
}

function PlayerProjections({ rows }: { rows: PlayerProj[] }) {
  if (rows.length === 0) return <EmptyState title="No player projections are available for this game." />;
  const hasLongShape = rows.some((r) => "mean" in r);
  const columns: Column<PlayerProj>[] = hasLongShape
    ? [
        { key: "player", header: "Player", primary: true, cell: (r) => <span className="font-medium text-ink">{loose(first(r, ["player_name", "name", "player"]))}</span> },
        { key: "team", header: "Team", cell: (r) => loose(first(r, ["team_abbr", "team"])) },
        { key: "stat", header: "Stat", cell: (r) => { const v = first(r, ["stat", "market"]); return typeof v === "string" ? v.toUpperCase() : loose(v); } },
        { key: "mean", header: "Mean", align: "right", cell: (r) => <span className="font-semibold text-ink">{loose(r.mean)}</span> },
        {
          key: "range",
          header: "p10–p90",
          align: "right",
          cell: (r) =>
            typeof r.p10 === "number" && typeof r.p90 === "number" ? (
              <span className="num text-muted">
                {r.p10.toFixed(1)}–{r.p90.toFixed(1)}
              </span>
            ) : (
              <NA />
            ),
        },
        { key: "p50", header: "Median", align: "right", cell: (r) => loose(r.p50) },
      ]
    : Object.keys(rows[0] ?? {}).map((k, i) => ({ key: k, header: titleCase(k), primary: i === 0, cell: (r: PlayerProj) => loose(r[k]) }));
  return <DataTable columns={columns} rows={rows} rowKey={(_, i) => i} caption="Player projections" dense />;
}

const QUOTE_COLUMNS: Column<Quote>[] = [
  { key: "market", header: "Market", primary: true, cell: (r) => <span className="text-ink">{titleCase(r.market)} · {r.side}</span> },
  { key: "line", header: "Line", align: "right", cell: (r) => <Val v={fmtLine(r.line)} /> },
  { key: "price", header: "Price", align: "right", cell: (r) => <Val v={fmtAmerican(r.price_american)} /> },
  { key: "book", header: "Book", cell: (r) => r.book },
  { key: "at", header: "Observed", cell: (r) => <Val v={fmtDateTimeET(r.at)} /> },
];

function GameView({ d }: { d: GameDetail }) {
  const g = d.game;
  const [showAll, setShowAll] = useState(false);
  const pct = completenessPct(g.research_completeness.score);
  const rejected = d.selections.filter((s) => s.rejection_reasons.length > 0 || s.classification === "rejected").length;

  return (
    <div className="space-y-3" data-testid="game-page">
      <h1 className="text-[17px] font-semibold leading-6 tracking-tight text-ink">
        {g.away.name} at {g.home.name} <span className="font-normal text-muted">· game research</span>
      </h1>
      <div className="rounded border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Matchup game={g} size={40} />
          <div className="text-right">
            <div className="num text-sm text-ink">
              {fmtDate(g.date, { weekday: true })} · <Val v={fmtTimeET(g.tipoff_utc)} />
            </div>
            <div className="mt-1 flex flex-wrap justify-end gap-1.5">
              <StatusBadge value={g.status} />
              <span className="text-2xs text-muted">{g.venue ?? "Venue not available"}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-[1fr_2fr]">
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted">Research completeness</span>
              <span className="num text-ink">{pct}%</span>
            </div>
            <Meter value={pct} tone={pct >= 80 ? "neutral" : "warn"} label="Research completeness" className="mt-1" />
            <ul className="mt-2 space-y-0.5 text-2xs">
              {g.research_completeness.items.map((it) => (
                <li key={it.name} className="flex gap-1.5">
                  <span className={it.ok ? "font-semibold text-soft" : "font-semibold text-warn"}>{it.ok ? "OK" : "MISSING"}</span>
                  <span className="min-w-0 break-words text-muted">
                    {it.name}
                    {it.note ? ` — ${it.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Environment</h2>
            <EnvironmentSummary env={g.environment} home={g.home.abbr} away={g.away.abbr} />
            {g.environment && g.environment.notes.length > 0 && (
              <div className="mt-2">
                <BulletList items={g.environment.notes} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Team comparison · recent form">
          <TeamComparison home={d.team_form.home} away={d.team_form.away} homeAbbr={g.home.abbr} awayAbbr={g.away.abbr} />
        </Panel>
        <Panel title="Lineup status and injuries">
          <p className="mb-2 break-words rounded border border-line bg-bg/50 px-2 py-1.5 text-xs text-soft">{g.lineup_status}</p>
          {(["away", "home"] as const).map((side) => (
            <div key={side} className="mb-2 last:mb-0">
              <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
                {g[side].abbr} · {g.injuries[side].length} listed
              </h3>
              {g.injuries[side].length === 0 ? (
                <p className="text-xs text-muted">No injuries listed for {g[side].abbr}.</p>
              ) : (
                <ul className="divide-y divide-line/70 rounded border border-line">
                  {g.injuries[side].map((r, i) => (
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-2 px-2 py-1 text-xs">
                      <span className="text-ink">{r.player_name}</span>
                      <span className="text-warn">{r.status}</span>
                      <span className="w-full break-words text-2xs text-muted">
                        {[r.detail, r.comment].filter(Boolean).join(" — ") || "No detail"} · {r.source}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Panel>
      </div>

      <Panel title="Top picks" right={<span className="num">{g.n_evaluated} evaluated · {g.n_rejected} rejected</span>}>
        {g.top_picks.length === 0 ? (
          <EmptyState title="No qualified picks for this game.">{g.no_picks_reason ?? "The API did not provide a reason."}</EmptyState>
        ) : (
          <SelectionList items={g.top_picks} showGame={false} />
        )}
      </Panel>

      <Panel title="Player projections · mean with p10–p90">
        <PlayerProjections rows={d.player_projections} />
      </Panel>

      <Panel
        title="All evaluated selections"
        right={
          <>
            <span className="num">
              {d.selections.length} evaluated · {rejected} rejected
            </span>
            <Button aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} data-testid="toggle-all-selections">
              {showAll ? "Hide" : "Show all, including rejected"}
            </Button>
          </>
        }
      >
        {d.selections.length === 0 ? (
          <EmptyState title="No selections were evaluated for this game." />
        ) : showAll ? (
          <SelectionList items={d.selections} showGame={false} />
        ) : (
          <p className="text-xs text-muted">Collapsed. Rejected selections are kept with their rejection reasons and can be reviewed here.</p>
        )}
      </Panel>

      <Panel title="Same-game combination research" right={<span className="num">{d.sgp.length}</span>} bodyClassName="space-y-2 p-3">
        {d.sgp.length === 0 ? <EmptyState title="No same-game combination met the research criteria for this game." /> : d.sgp.map((c) => <ComboCard key={c.uid} combo={c} />)}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Head to head">
          {d.h2h.length === 0 ? (
            <EmptyState title="No prior meetings in the available data." />
          ) : (
            <ul className="divide-y divide-line/70">
              {d.h2h.map((m, i) => (
                <li key={i} className="num flex items-baseline justify-between gap-2 py-1 text-xs">
                  <span className="text-muted">{fmtDate(m.date, { year: true }) ?? m.date}</span>
                  <span className="text-ink">
                    {m.away_abbr} <Val v={m.away_points} /> @ {m.home_abbr} <Val v={m.home_points} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Current quotes">
          {g.quotes.length === 0 ? (
            <EmptyState title="No verified quotes are available for this game." />
          ) : (
            <DataTable columns={QUOTE_COLUMNS} rows={g.quotes} rowKey={(_, i) => i} caption="Current quotes" dense />
          )}
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Agent reports">
          {d.agent_reports.length === 0 ? (
            <EmptyState title="No agent has reported on this game." />
          ) : (
            <ul className="divide-y divide-line/70">
              {d.agent_reports.map((r, i) => (
                <li key={i} className="py-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-ink">{r.agent}</span>
                    <span className="num text-muted">{fmtDateTimeET(r.at) ?? "—"}</span>
                  </div>
                  <p className="mt-0.5 break-words text-xs text-soft">{r.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Unresolved questions" tone={d.unresolved.length ? "warn" : undefined}>
          {d.unresolved.length === 0 ? <EmptyState title="No unresolved questions were recorded." /> : <BulletList items={d.unresolved} tone="warn" />}
        </Panel>
      </div>

      {(g.injuries.home.length > 0 || g.injuries.away.length > 0) && (
        <Panel title="Injury report detail">
          <InjuryTable rows={[...g.injuries.away, ...g.injuries.home]} caption="Injuries for this game" />
        </Panel>
      )}
    </div>
  );
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["game", id], queryFn: () => api.game(id) });
  return (
    <div>
      <div className="mb-2 text-xs">
        <DLink href="/games" className="text-accent hover:underline">
          ← All games
        </DLink>
      </div>
      <QueryView query={q} rows={8}>
        {(d) => <GameView d={d} />}
      </QueryView>
    </div>
  );
}
