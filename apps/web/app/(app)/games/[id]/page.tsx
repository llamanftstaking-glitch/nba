"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CandlestickChart, FileText, Gauge, HeartPulse, History, Layers, LineChart, ListChecks, Target, Timer, Users } from "lucide-react";
import { InjuryChangeList } from "@/components/injury-changes";
import { KalshiCompactList, KalshiSyncStatus } from "@/components/kalshi";
import { MinutesCompact } from "@/components/minutes";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ComboCard } from "@/components/combo-card";
import { EnvironmentSummary, MatchupHeader, completenessPct } from "@/components/game-card";
import { LineupHistoryList } from "@/components/lineup-history";
import { LineupTable } from "@/components/lineup-table";
import { HistFrequency, MarketTable, PropDrawer, propKey } from "@/components/props";
import { SelectionList } from "@/components/selection-card";
import { SelectionRow } from "@/components/selection-row";
import { Collapsible } from "@/components/ui/collapsible";
import { TeamFormComparison } from "@/components/team-form";
import { Button, textLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Meter } from "@/components/ui/meter";
import { Val } from "@/components/ui/na";
import { BulletList, Label, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";
import { classLabel, fmtDate, fmtDateTimeET, fmtNum, statLabel } from "@/lib/format";
import type { GameDetail, PlayerProj, PropRow } from "@/lib/types";

const PROJ_STATS = ["pts", "reb", "ast", "fg3m"] as const;

/** D — one compact row per player: recent averages (descriptive) beside the model projection with its 80% range. */
function PlayerAverages({ rows, props }: { rows: PlayerProj[]; props: PropRow[] }) {
  const [all, setAll] = useState(false);
  const players = useMemo(() => {
    const m = new Map<number, { id: number; name: string; team: string | null; min: number; n: number; inj: string | null; stats: Partial<Record<string, PlayerProj>> }>();
    for (const r of rows) {
      const e = m.get(r.player_id) ?? { id: r.player_id, name: r.player_name, team: r.team_abbr, min: r.proj_min, n: r.n_games, inj: r.injury_status, stats: {} };
      e.stats[r.stat] = r;
      m.set(r.player_id, e);
    }
    return [...m.values()];
  }, [rows]);
  const l10 = useMemo(() => new Map(props.map((p) => [`${p.player_id}:${p.stat}`, p.l10])), [props]);
  if (players.length === 0) return <EmptyState title="No player projections are available for this game." />;
  const shown = all ? players : players.slice(0, 10);
  return (
    <div data-testid="player-averages">
      <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))] gap-x-3 border-b border-line pb-2 text-2xs font-semibold uppercase tracking-wide text-muted sm:grid">
        <span>Player · proj min · sample</span>
        {PROJ_STATS.map((k) => (
          <span key={k} className="text-right">
            {statLabel(k)} · L10 avg / proj [p10–p90]
          </span>
        ))}
      </div>
      <ul>
        {shown.map((p) => (
          <li key={p.id} className="grid grid-cols-4 gap-x-3 gap-y-1 border-b border-line/40 py-2 last:border-0 sm:grid-cols-[minmax(0,2.2fr)_repeat(4,minmax(0,1fr))]">
            <div className="col-span-4 min-w-0 sm:col-span-1">
              <DLink href={`/players/${p.id}`} className="font-semibold text-ink hover:underline">
                {p.name}
              </DLink>{" "}
              <span className="num text-xs text-muted">
                {p.team ?? "—"} · {fmtNum(p.min, 0)} min · n={p.n}
              </span>
              {p.inj ? <span className="ml-1.5 text-xs text-warn">{p.inj}</span> : null}
            </div>
            {PROJ_STATS.map((k) => {
              const s = p.stats[k];
              const avg = l10.get(`${p.id}:${k}`);
              return (
                <div key={k} className="text-left sm:text-right">
                  <span className="mr-1 text-2xs uppercase text-muted sm:hidden">{statLabel(k)}</span>
                  <span className="num text-xs text-muted" title="L10 average (descriptive)">
                    <Val v={fmtNum(avg)} /> /{" "}
                  </span>
                  <span className="num font-semibold text-ink">{s ? fmtNum(s.mean) : "—"}</span>
                  {s && <span className="num block text-xs text-muted sm:inline sm:pl-1">[{s.p10.toFixed(0)}–{s.p90.toFixed(0)}]</span>}
                </div>
              );
            })}
          </li>
        ))}
      </ul>
      {players.length > 10 && (
        <Button variant="ghost" className="mt-2" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer players" : `Show all ${players.length} players`}
        </Button>
      )}
      <p className="mt-2 text-xs text-muted">L10 averages are descriptive history. Projections are model output, conditional on the player appearing; the bracket is the model’s 80% range.</p>
    </div>
  );
}

function GameProps({ gameId, onRows }: { gameId: string; onRows: (r: PropRow[]) => void }) {
  const q = useQuery({
    queryKey: ["game-player-props", gameId],
    queryFn: async () => {
      const r = await api.gamePlayerProps(gameId);
      onRows(r.items);
      return r;
    },
  });
  const [text, setText] = useState("");
  const [market, setMarket] = useState("");
  const [open, setOpen] = useState<PropRow | null>(null);
  const [showAllProps, setShowAllProps] = useState(false);
  return (
    <>
      <QueryView query={q} rows={5}>
        {(d) => {
          const needle = text.trim().toLowerCase();
          const rows = d.items.filter((p) => (!market || p.market === market) && (!needle || p.player_name.toLowerCase().includes(needle)));
          return (
            <div className="space-y-3">
              <p className="text-xs text-muted">{d.quote_status.message}</p>
              <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                <Field label="Search">
                  <Input type="search" placeholder="Player name" value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
                <Field label="Market">
                  <Select value={market} onChange={(e) => setMarket(e.target.value)}>
                    <option value="">All markets</option>
                    {d.markets.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              {rows.length === 0 ? (
                <EmptyState title={d.items.length === 0 ? "No player prop markets are available for this game." : "No markets match these filters."} icon={Target} />
              ) : (
                <>
                  <MarketTable rows={showAllProps ? rows : rows.slice(0, 8)} onOpen={setOpen} caption="Player prop markets for this game" />
                  {rows.length > 8 && (
                    <Button variant="ghost" aria-expanded={showAllProps} onClick={() => setShowAllProps((v) => !v)}>
                      {showAllProps ? "Show fewer markets" : `Show all ${rows.length} markets`}
                    </Button>
                  )}
                </>
              )}
            </div>
          );
        }}
      </QueryView>
      <PropDrawer key={open ? propKey(open) : "none"} p={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** 7 — descriptive recent averages per quoted/projected market. */
function HistoricalPerformance({ rows: allRows }: { rows: PropRow[] }) {
  const [all, setAll] = useState(false);
  const rows = all ? allRows : allRows.slice(0, 12);
  if (allRows.length === 0) return <EmptyState title="No player history rows are available for this game." icon={History} />;
  return (
    <div data-testid="game-history">
      <ul className="divide-y divide-line/30">
        <li className="hidden grid-cols-[minmax(0,2fr)_1fr_repeat(4,0.7fr)_1.4fr] gap-x-3 pb-2 text-2xs font-semibold uppercase tracking-wide text-muted md:grid" aria-hidden>
          <span>Player</span>
          <span>Stat · line</span>
          <span className="text-right">L5</span>
          <span className="text-right">L10</span>
          <span className="text-right">L20</span>
          <span className="text-right">Season</span>
          <span>History vs line</span>
        </li>
        {rows.map((p, idx) => (
          <li key={propKey(p)} className={`${!all && idx >= 5 ? "hidden md:grid" : "grid"} grid-cols-4 gap-x-3 gap-y-1 py-2 md:grid-cols-[minmax(0,2fr)_1fr_repeat(4,0.7fr)_1.4fr] md:items-center`}>
            <span className="col-span-4 min-w-0 md:col-span-1">
              <DLink href={`/players/${p.player_id}#history`} className="text-sm font-semibold text-ink hover:underline">
                {p.player_name}
              </DLink>
              <span className="num ml-1.5 text-xs text-muted">
                {p.team_abbr} · n={p.n_games}
              </span>
            </span>
            <span className="col-span-4 text-sm text-soft md:col-span-1">
              {statLabel(p.stat)} <span className="num text-muted"><Val v={p.line} /></span>
            </span>
            {(
              [
                ["L5", p.l5],
                ["L10", p.l10],
                ["L20", p.l20],
                ["Season", p.season_avg],
              ] as const
            ).map(([l, v]) => (
              <span key={l} className="num text-sm text-ink md:text-right">
                <span className="mr-1 text-2xs uppercase text-muted md:hidden">{l}</span>
                <Val v={fmtNum(v)} />
              </span>
            ))}
            <span className="col-span-4 md:col-span-1">
              <HistFrequency p={p} />
            </span>
          </li>
        ))}
      </ul>
      {allRows.length > 5 && (
        <Button variant="ghost" className={allRows.length <= 12 ? "mt-2 md:hidden" : "mt-2"} aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer rows" : `Show all ${allRows.length} rows`}
        </Button>
      )}
      <p className="mt-2 text-xs text-muted">Averages over games played and counts against today’s line. Descriptive history, not a probability.</p>
    </div>
  );
}

function Technical({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-md bg-raised/40">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium text-soft md:min-h-9">
        {title}
        <span className="text-xs text-muted group-open:hidden">Show</span>
        <span className="hidden text-xs text-muted group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-line/40 p-3">{children}</div>
    </details>
  );
}

function GameView({ d }: { d: GameDetail }) {
  const g = d.game;
  const [showAll, setShowAll] = useState(false);
  const [history, setHistory] = useState(false);
  const [propRows, setPropRows] = useState<PropRow[]>([]);
  const lineups = useQuery({ queryKey: ["game-lineups", g.id], queryFn: () => api.gameLineups(g.id) });
  const minutes = useQuery({ queryKey: ["minutes", { date: g.date, limit: 200 }], queryFn: () => api.minutes({ date: g.date, sort: "proj_min", order: "desc", limit: 200 }) });
  const kalshi = useQuery({ queryKey: ["kalshi-markets", { game_id: g.id }], queryFn: () => api.kalshiMarkets({ game_id: g.id, sort: "volume", limit: 200 }) });
  const changes = useQuery({ queryKey: ["injury-changes", g.date, false], queryFn: () => api.injuryChanges({ date: g.date, limit: 100 }) });
  const pct = completenessPct(g.research_completeness.score);
  const isQ = (c: string) => c === "high_confidence" || c === "standard";
  const qualifiedSel = d.selections.filter((x) => isQ(x.classification) && !x.invalidated);
  const watchSel = d.selections.filter((x) => x.classification === "watchlist");
  const otherSel = d.selections.filter((x) => !(isQ(x.classification) && !x.invalidated) && x.classification !== "watchlist");
  const sc = d.selection_counts ?? {};
  const notQualifiedTotal = d.selection_counts ? Object.entries(sc).filter(([k]) => !isQ(k) && k !== "watchlist").reduce((a, [, v]) => a + v, 0) : otherSel.length;
  const limitations = g.research_completeness.items.filter((i) => !i.ok);
  const teamSet = new Set([g.home.abbr, g.away.abbr]);
  const injuries = [...g.injuries.away, ...g.injuries.home];

  return (
    <div className="space-y-5" data-testid="game-page">
      {/* 1 — matchup header */}
      <section id="matchup" className="rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60 md:p-5" aria-label="Matchup">
        <h1 className="sr-only">
          {g.away.name} at {g.home.name} · game research
        </h1>
        <MatchupHeader game={g} size={48} />
        <p className="mt-1 text-xs text-muted">
          {fmtDate(g.date, { weekday: true, year: true })} · {g.venue ?? "Venue not available"}
        </p>
        <div className="mt-3 max-w-md">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">Research completeness</span>
            <span className="num font-semibold text-ink">{pct}%</span>
          </div>
          <Meter value={pct} tone={pct >= 80 ? "neutral" : "warn"} label="Research completeness" className="mt-1" />
          {limitations.length > 0 && <p className="mt-1 text-xs text-warn">Missing: {limitations.map((l) => l.name).join(", ")}</p>}
        </div>
      </section>

      {/* 2 — game environment */}
      <Panel title="Game environment" icon={Gauge} id="environment">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <Label>Projected environment</Label>
            <EnvironmentSummary env={g.environment} home={g.home.abbr} away={g.away.abbr} />
            {g.environment && g.environment.notes.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {g.environment.notes.map((n, i) => (
                  <li key={i}>· {n}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label>Team form</Label>
            <TeamFormComparison home={d.team_form.home} away={d.team_form.away} homeAbbr={g.home.abbr} awayAbbr={g.away.abbr} />
          </div>
        </div>
      </Panel>

      {/* 3 — lineups */}
      <section aria-label="Starting lineups" id="lineups">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold uppercase tracking-wide text-ink">
            <Users className="h-[18px] w-[18px] text-accent" aria-hidden />
            Starting lineups
          </h2>
          <Button variant="ghost" aria-expanded={history} onClick={() => setHistory((v) => !v)}>
            <History className="h-3.5 w-3.5" aria-hidden />
            {history ? "Hide lineup history" : "Lineup history"}
          </Button>
        </div>
        {history && (
          <div className="mb-3 rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60">
            <LineupHistoryList gameId={g.id} />
          </div>
        )}
        <QueryView query={lineups} rows={5}>
          {(l) => <LineupTable away={l.away} home={l.home} />}
        </QueryView>
      </section>

      {/* 4 — player minutes */}
      <Panel title="Player minutes" icon={Timer} id="minutes">
        <QueryView query={minutes} rows={5}>
          {(m) => {
            const rows = m.items.filter((r) => (r.game_id ? r.game_id === g.id : r.team_abbr !== null && teamSet.has(r.team_abbr)));
            return rows.length === 0 ? (
              <EmptyState title="No minutes profiles are available for these teams." icon={Timer} />
            ) : (
              <>
                <MinutesCompact rows={rows} />
                <p className="mt-2 text-xs text-muted">
                  Classifications are descriptive context, not qualification rules. {m.model && m.model.status !== "production" ? `Minutes model ${m.model.name} ${m.model.version}: ${m.model.status} — did not pass validation. ` : ""}
                  {m.uncertainty}
                </p>
              </>
            );
          }}
        </QueryView>
      </Panel>

      {/* 5 — player market availability */}
      <Panel title="Player market availability" icon={Target} id="props">
        <GameProps gameId={g.id} onRows={setPropRows} />
      </Panel>

      {/* 6 — Kalshi market observations */}
      <Panel title="Kalshi market observations" icon={CandlestickChart} id="kalshi" right={kalshi.data ? <span className="num">{kalshi.data.total} contract(s)</span> : undefined}>
        <QueryView query={kalshi} rows={4} isEmpty={(k) => k.items.length === 0} empty={<EmptyState title="No Kalshi contracts have been observed for this game." icon={CandlestickChart} />}>
          {(k) => (
            <>
              <KalshiSyncStatus sync={k.sync} className="mb-3 text-xs" />
              <KalshiCompactList rows={k.items} perGroup={3} mainLineFirst />
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span>
                  {k.total > k.items.length ? `Showing the ${k.items.length} highest-volume of ${k.total} contracts. ` : ""}Market prices in cents as observed at the last sync. A market price is not a model probability.
                </span>
                <DLink href={`/kalshi-intelligence?game_id=${encodeURIComponent(g.id)}`} className={textLink} data-testid="kalshi-all-link">
                  All contracts for this game
                </DLink>
              </p>
            </>
          )}
        </QueryView>
      </Panel>

      {/* 7 — historical player performance */}
      <Panel title="Historical player performance" icon={History} id="history">
        <HistoricalPerformance rows={propRows} />
      </Panel>

      {/* 8 — injury & availability timeline */}
      <Panel title="Injury & availability timeline" icon={HeartPulse} id="availability">
        <QueryView query={changes} rows={2}>
          {(c) => {
            const mine = c.items.filter((x) => x.game_id === g.id);
            return mine.length === 0 ? <p className="text-sm text-muted">No status changes have been recorded for this game.</p> : <InjuryChangeList items={mine} showGame={false} />;
          }}
        </QueryView>
        <div className="mt-3 border-t border-line/50 pt-3">
          <Label>Currently listed · {injuries.length}</Label>
          {injuries.length === 0 ? (
            <p className="text-sm text-muted">No injuries are listed for either team.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {injuries.map((r, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <span className="text-ink">
                    {r.player_name} <span className="text-xs text-muted">{r.team_abbr ?? ""}</span>
                  </span>
                  <span className="text-xs text-warn">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">{g.lineup_status}</p>
        </div>
      </Panel>

      {/* 9 — projections */}
      <Panel title="Projections" icon={LineChart} id="projections">
        <Technical title={`Model projections with 80% ranges · ${new Set(d.player_projections.map((r) => r.player_id)).size} players`}>
          <PlayerAverages rows={d.player_projections} props={propRows} />
        </Technical>
      </Panel>

      {/* 10 — research selections */}
      <Panel title="Research selections" icon={ListChecks} id="selections" right={<span className="num">{g.n_evaluated} evaluated · {g.n_rejected} rejected</span>}>
        {qualifiedSel.length === 0 ? (
          <EmptyState title="No qualified picks for this game.">{g.no_picks_reason ?? "The API did not provide a reason."}</EmptyState>
        ) : (
          <>
            <SelectionList items={qualifiedSel.slice(0, 5)} showGame={false} />
            {qualifiedSel.length > 5 && (
              <Collapsible title={`${qualifiedSel.length - 5} more qualified`} className="mt-3" testId="game-more-qualified">
                <ul className="divide-y divide-line/30">
                  {qualifiedSel.slice(5).map((x) => (
                    <SelectionRow key={x.id} s={x} showGame={false} />
                  ))}
                </ul>
              </Collapsible>
            )}
          </>
        )}
        {watchSel.length > 0 && (
          <Collapsible title={`Watchlist · ${watchSel.length}`} className="mt-3" testId="game-watchlist">
            <ul className="divide-y divide-line/30">
              {watchSel.map((x) => (
                <SelectionRow key={x.id} s={x} showGame={false} />
              ))}
            </ul>
          </Collapsible>
        )}
        <div className="mt-4 border-t border-line/50 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="num text-sm text-muted" data-testid="game-more-evaluated">
              +{notQualifiedTotal.toLocaleString("en-US")} more evaluated (not qualified)
              {otherSel.length < notQualifiedTotal ? ` · ${otherSel.length} of them returned by the API` : ""}
            </span>
            <Button aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} data-testid="toggle-all-selections" disabled={otherSel.length === 0}>
              {showAll ? "Hide" : "Show not-qualified selections"}
            </Button>
          </div>
          {showAll && (
            <ul className="mt-3 divide-y divide-line/30" data-testid="game-other-selections">
              {otherSel.map((x) => (
                <li key={x.id} className="grid gap-x-4 py-1.5 text-sm md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)] md:items-baseline">
                  <span className="break-words font-medium text-ink">{x.market_label}</span>
                  <span className="text-xs text-muted">{classLabel(x.classification)}</span>
                  <span className="break-words text-xs text-bad" data-testid="rejection-inline">
                    {x.rejection_reasons.length ? x.rejection_reasons.join("; ") : "No reason recorded"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      {/* 11 — same-game research */}
      <Panel title="Same-game research" icon={Layers} id="sgp" right={<span className="num">{d.sgp.length}</span>} bodyClassName="space-y-3">
        {d.sgp.length === 0 ? <EmptyState title="No same-game combination met the research criteria for this game." /> : d.sgp.map((c) => <ComboCard key={c.uid} combo={c} />)}
      </Panel>

      {/* 12 — sources and limitations */}
      <Panel title="Sources and limitations" icon={FileText} id="sources">
        <div className="grid gap-5 lg:grid-cols-3">
          <div>
            <Label>Agent reports</Label>
            {d.agent_reports.length === 0 ? (
              <p className="text-sm text-muted">No agent has reported on this game.</p>
            ) : (
              <ul className="space-y-2">
                {d.agent_reports.map((r, i) => (
                  <li key={i}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{r.agent}</span>
                      <span className="num text-xs text-muted">{fmtDateTimeET(r.at) ?? "—"}</span>
                    </div>
                    <p className="break-words text-sm text-soft">{r.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label>Limitations</Label>
            {limitations.length === 0 ? <p className="text-sm text-muted">No data limitations were flagged.</p> : <BulletList items={limitations.map((l) => `${l.name}${l.note ? ` — ${l.note}` : ""}`)} tone="warn" />}
            <ul className="mt-2 space-y-0.5 text-xs">
              {g.research_completeness.items.filter((it) => it.ok).map((it) => (
                <li key={it.name} className="text-muted">
                  <span className="font-semibold text-soft">OK</span> {it.name}
                  {it.note ? ` — ${it.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Label>Unresolved questions</Label>
            {d.unresolved.length === 0 ? <p className="text-sm text-muted">No unresolved questions were recorded.</p> : <BulletList items={d.unresolved} tone="warn" />}
          </div>
        </div>
        <div className="mt-4 border-t border-line/50 pt-3">
          <Label>Head to head</Label>
          {d.h2h.length === 0 ? (
            <p className="text-sm text-muted">No prior meetings in the available data.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {d.h2h.map((m, i) => (
                <li key={i} className="num flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted">{fmtDate(m.date, { year: true }) ?? m.date}</span>
                  <span className="text-ink">
                    {m.away_abbr} <Val v={m.away_points} /> @ {m.home_abbr} <Val v={m.home_points} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["game", id], queryFn: () => api.game(id) });
  return (
    <div>
      <div className="mb-3">
        <DLink href="/games" className={textLink}>
          <ArrowLeft className="h-3 w-3" aria-hidden /> All games
        </DLink>
      </div>
      <QueryView query={q} rows={8}>
        {(d) => <GameView d={d} />}
      </QueryView>
    </div>
  );
}
