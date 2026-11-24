"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, CandlestickChart, FlaskConical, History, ListOrdered, Split, Target, Timer } from "lucide-react";
import { KalshiCompactList, KalshiSyncStatus } from "@/components/kalshi";
import { MinutesProfile } from "@/components/minutes";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerHistory } from "@/components/player-history";
import { PropDrawer, PropRow, propKey } from "@/components/props";
import { AvailabilityStatus, LineupStatusLabel } from "@/components/status";
import { StatusDot } from "@/components/ui/badge";
import { textLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Select } from "@/components/ui/field";
import { Val } from "@/components/ui/na";
import { Pagination } from "@/components/ui/pagination";
import { Label, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { fmtDate, fmtDateTimeET, fmtNum, fmtPct, fmtTimeET, HISTORY_STATS, statLabel, titleCase } from "@/lib/format";
import { useTeams } from "@/lib/queries";
import type { AveragesWindow, GameLogRow, PlayerDetail, PropRow as Prop, SplitRow } from "@/lib/types";

const STRIP = ["season", "L5", "L10", "L20"] as const;
const STRIP_STATS = ["pts", "reb", "ast", "fg3m", "min"] as const;

function sampleText(w: AveragesWindow): string {
  if (w.requested !== null && w.games < w.requested) return `n=${w.games} of ${w.requested} requested`;
  return `n=${w.games}`;
}

function SmallSample() {
  return (
    <StatusDot tone="warn" className="text-warn" title="Small sample: treat these averages with caution">
      Small sample
    </StatusDot>
  );
}

function AveragesStrip({ windows }: { windows: AveragesWindow[] }) {
  const pick = STRIP.map((k) => windows.find((w) => w.key === k)).filter((w): w is AveragesWindow => Boolean(w));
  if (pick.length === 0) return <EmptyState title="No averages are available for this player." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="averages-strip">
      {pick.map((w) => (
        <div key={w.key} className="rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60" data-window={w.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">{w.label}</h3>
            <span className="num text-xs text-muted" data-testid="window-sample">{sampleText(w)}</span>
          </div>
          {!w.available ? (
            <p className="mt-2 text-sm text-muted">Not available{w.note ? `: ${w.note}` : ""}</p>
          ) : (
            <>
              <dl className="mt-2 grid grid-cols-5 gap-1">
                {STRIP_STATS.map((s) => (
                  <div key={s}>
                    <dt className="text-2xs font-medium uppercase text-muted">{statLabel(s)}</dt>
                    <dd className="num text-base font-semibold text-ink">
                      <Val v={fmtNum(w.stats[s]?.mean)} />
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                {w.small_sample && <SmallSample />}
                {w.missed !== null && w.missed > 0 && <span className="num">{w.missed} team games missed</span>}
                {w.note && <span>{w.note}</span>}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function Distribution({ windows }: { windows: AveragesWindow[] }) {
  const [stat, setStat] = useState("pts");
  const rows = windows.filter((w) => w.available);
  const cols: Column<AveragesWindow>[] = [
    { key: "w", header: "Window", primary: true, cell: (w) => <span className="font-semibold text-ink">{w.label}</span> },
    { key: "n", header: "Sample", align: "right", cell: (w) => <span className="num">{sampleText(w)}</span> },
    ...(["mean", "median", "min", "max", "sd", "p25", "p75"] as const).map(
      (k): Column<AveragesWindow> => ({ key: k, header: k === "sd" ? "SD" : titleCase(k), align: "right", cell: (w) => <Val v={fmtNum(w.stats[stat]?.[k])} /> }),
    ),
    { key: "flag", header: "Flag", cell: (w) => (w.small_sample ? <SmallSample /> : <span className="text-xs text-muted">—</span>) },
  ];
  return (
    <div data-testid="distribution">
      <div className="mb-3">
        <Tabs label="Distribution stat" size="sm" scroll value={stat} onChange={setStat} items={["min", ...HISTORY_STATS].map((s) => ({ id: s, label: statLabel(s) }))} />
      </div>
      {rows.length === 0 ? <EmptyState title="No distribution data is available." /> : <DataTable columns={cols} rows={rows} rowKey={(w) => w.key} caption={`${statLabel(stat)} distribution by window`} dense mobileLimit={4} />}
      {windows.some((w) => !w.available) && (
        <p className="mt-2 text-xs text-muted">
          Not available: {windows.filter((w) => !w.available).map((w) => `${w.label}${w.note ? ` (${w.note})` : ""}`).join(", ")}
        </p>
      )}
    </div>
  );
}

const n1 = (v: number | null) => <Val v={fmtNum(v)} />;
const SPLIT_COLUMNS: Column<SplitRow>[] = [
  { key: "label", header: "Split", primary: true, cell: (r) => <span className="font-semibold text-ink">{r.label}</span> },
  { key: "group", header: "Group", cell: (r) => titleCase(r.group) },
  { key: "g", header: "Sample", align: "right", cell: (r) => <span className="num">n={r.games}</span> },
  { key: "min", header: "MIN", align: "right", cell: (r) => n1(r.min) },
  { key: "pts", header: "PTS", align: "right", cell: (r) => n1(r.pts) },
  { key: "reb", header: "REB", align: "right", cell: (r) => n1(r.reb) },
  { key: "ast", header: "AST", align: "right", cell: (r) => n1(r.ast) },
  { key: "fg3m", header: "3PM", align: "right", cell: (r) => n1(r.fg3m) },
  { key: "pra", header: "PRA", align: "right", cell: (r) => n1(r.pra) },
  { key: "flag", header: "Flag", cell: (r) => (r.small_sample ? <SmallSample /> : <span className="text-xs text-muted">—</span>) },
];

type SortKey = "date" | "min" | "pts" | "reb" | "ast" | "fg3m" | "stl" | "blk" | "tov" | "pra";
const LOG_LIMIT = 15;

function GameLog({ id }: { id: string }) {
  const [venue, setVenue] = useState("");
  const [role, setRole] = useState("");
  const [opponent, setOpponent] = useState("");
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const teams = useTeams();
  const q = useQuery({
    queryKey: ["player-game-logs", id, venue, role, opponent, offset],
    queryFn: () => api.playerGameLogs(id, { venue: venue || undefined, role: role || undefined, opponent: opponent || undefined, limit: LOG_LIMIT, offset }),
    placeholderData: (prev) => prev,
  });
  const reset = () => setOffset(0);
  const sorted = useMemo(() => {
    const items = [...(q.data?.items ?? [])];
    items.sort((a, b) => (sort.key === "date" ? a.date.localeCompare(b.date) : a[sort.key] - b[sort.key]) * sort.dir);
    return items;
  }, [q.data, sort]);
  const th = (key: SortKey, label: string, align = "text-right") => (
    <th scope="col" className={cn("px-2 pb-2 text-2xs font-semibold uppercase tracking-wide text-muted", align)} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className={cn("uppercase hover:text-ink", sort.key === key && "text-ink")} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))} data-sort={key}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const stats: [SortKey, string][] = [["min", "MIN"], ["pts", "PTS"], ["reb", "REB"], ["ast", "AST"], ["fg3m", "3PM"], ["stl", "STL"], ["blk", "BLK"], ["tov", "TOV"], ["pra", "PRA"]];
  return (
    <div data-testid="game-log">
      <div className="mb-3 grid grid-cols-3 gap-3 sm:max-w-xl">
        <Field label="Venue">
          <Select value={venue} onChange={(e) => { setVenue(e.target.value); reset(); }}>
            <option value="">All</option>
            <option value="home">Home</option>
            <option value="away">Away</option>
          </Select>
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => { setRole(e.target.value); reset(); }}>
            <option value="">All</option>
            <option value="starter">Starter</option>
            <option value="bench">Bench</option>
          </Select>
        </Field>
        <Field label="Opponent">
          <Select value={opponent} onChange={(e) => { setOpponent(e.target.value); reset(); }}>
            <option value="">All</option>
            {(teams.data?.items ?? []).map((t) => (
              <option key={t.id} value={t.abbr}>{t.abbr}</option>
            ))}
          </Select>
        </Field>
      </div>
      <QueryView query={q} rows={6} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No games match these filters." />}>
        {(d) => (
          <>
            <div className="hidden xl:block">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Game log</caption>
                <thead>
                  <tr className="border-b border-line">
                    {th("date", "Date", "text-left")}
                    <th scope="col" className="px-2 pb-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted">Opp · result</th>
                    <th scope="col" className="px-2 pb-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted">Role</th>
                    {stats.map(([k, l]) => th(k, l))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.game_id} className="border-b border-line/40 last:border-0 hover:bg-raised/40">
                      <td className="num px-2 py-1.5 text-soft">{fmtDate(r.date, { year: true }) ?? r.date}</td>
                      <td className="num px-2 py-1.5 text-soft">
                        {r.is_home ? "vs" : "@"} {r.opp_abbr} · {r.result ?? "—"} {r.team_points ?? "—"}–{r.opp_points ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted">{r.starter === null ? "—" : r.starter ? "Starter" : "Bench"}</td>
                      {stats.map(([k]) => (
                        <td key={k} className={cn("num px-2 py-1.5 text-right", k === sort.key ? "font-semibold text-ink" : "text-soft")}>{r[k]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="grid gap-2 md:grid-cols-2 xl:hidden">
              {sorted.map((r: GameLogRow) => (
                <li key={r.game_id} className="rounded-md bg-raised/40 p-3">
                  <div className="num flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-ink">
                      {fmtDate(r.date) ?? r.date} · {r.is_home ? "vs" : "@"} {r.opp_abbr}
                    </span>
                    <span className="text-xs text-muted">
                      {r.result ?? "—"} {r.team_points ?? "—"}–{r.opp_points ?? "—"} · {r.starter === null ? "role —" : r.starter ? "Starter" : "Bench"}
                    </span>
                  </div>
                  <dl className="mt-1.5 grid grid-cols-5 gap-x-2 gap-y-1">
                    {stats.map(([k, l]) => (
                      <div key={k}>
                        <dt className="text-2xs font-medium uppercase text-muted">{l}</dt>
                        <dd className="num text-sm text-ink">{r[k]}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <Pagination offset={offset} limit={LOG_LIMIT} total={d.total} onChange={setOffset} />
            <p className="mt-2 text-xs text-muted">Source: {d.source}. Sorting applies to the games on this page.</p>
            <div className="mt-4 border-t border-line/50 pt-3" data-testid="missed-games">
              <Label>Missed games · {d.missed.length}</Label>
              {d.missed.length === 0 ? (
                <p className="text-sm text-muted">No missed team games in this span.</p>
              ) : (
                <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {d.missed.map((m, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="num text-soft">
                        {fmtDate(m.date, { year: true }) ?? m.date} · {m.opp_abbr}
                      </span>
                      <span className="text-xs text-muted">{m.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </QueryView>
    </div>
  );
}

function View({ d, id }: { d: PlayerDetail; id: string }) {
  const p = d.player;
  const [open, setOpen] = useState<Prop | null>(null);
  const averages = useQuery({ queryKey: ["player-averages", id], queryFn: () => api.playerAverages(id) });
  const splits = useQuery({ queryKey: ["player-splits", id], queryFn: () => api.playerSplits(id) });
  const minutes = useQuery({ queryKey: ["player-minutes", id], queryFn: () => api.playerMinutes(id) });
  const kalshi = useQuery({ queryKey: ["kalshi-markets", { player_id: id }], queryFn: () => api.kalshiMarkets({ player_id: id, sort: "player", limit: 100 }) });
  const markets = useMemo(() => d.markets ?? [], [d.markets]);
  const lines = useMemo(() => Object.fromEntries(markets.map((m) => [m.stat, m.line])), [markets]);
  const availability = d.injury ? d.injury.status : "available";

  return (
    <div className="space-y-5" data-testid="player-page">
      <section className="flex flex-wrap items-center gap-4 rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60 md:p-5" aria-label="Player">
        <PlayerAvatar name={p.name} src={p.headshot_url} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[30px] font-bold uppercase italic leading-8 tracking-wide text-ink">{p.name}</h1>
          <p className="num mt-0.5 text-sm text-soft">
            {p.team_abbr ?? "No team"} · {p.position ?? "Position —"} · {p.jersey ? `#${p.jersey}` : "Jersey —"} · sample n={d.sample.games} games
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <AvailabilityStatus value={availability} detail={d.injury?.detail} />
            {d.lineup ? (
              <span className="flex items-center gap-2 text-xs text-muted">
                {d.lineup.role ? titleCase(d.lineup.role) : "Role —"} <LineupStatusLabel status={d.lineup.status} />
              </span>
            ) : (
              <span className="text-xs text-muted">Lineup role not available</span>
            )}
          </div>
        </div>
        <div className="rounded-md bg-raised/50 px-4 py-2.5 text-sm" data-testid="next-game">
          <div className="text-2xs font-semibold uppercase tracking-wide text-muted">Next game</div>
          {d.next_game ? (
            <DLink href={`/games/${encodeURIComponent(d.next_game.game_id)}`} className="block hover:underline">
              <span className="font-semibold text-ink">
                {d.next_game.is_home ? "vs" : "@"} {d.next_game.opp_abbr}
              </span>
              <span className="num block text-xs text-muted">
                {fmtDate(d.next_game.date, { weekday: true })} · {fmtTimeET(d.next_game.tipoff_utc) ?? "time —"}
              </span>
            </DLink>
          ) : (
            <span className="text-muted">No upcoming game in the schedule</span>
          )}
        </div>
      </section>

      <section aria-label="Averages">
        <QueryView query={averages} rows={2}>
          {(a) => (
            <>
              <AveragesStrip windows={a.windows} />
              <p className="mt-2 text-xs text-muted">{a.definition}</p>
            </>
          )}
        </QueryView>
      </section>

      <Panel title="Minutes & role" icon={Timer} id="minutes">
        <QueryView query={minutes} rows={3}>
          {(mn) =>
            mn.profile ? (
              <>
                <MinutesProfile r={mn.profile} />
                <p className="mt-2 text-xs text-muted">
                  {mn.model ? `Minutes model ${mn.model.name} ${mn.model.version} · ${mn.model.status === "production" ? "production" : `${mn.model.status} — did not pass validation`}. ` : "No minutes model is registered. "}
                  {mn.uncertainty} {mn.restrictions_note}
                </p>
              </>
            ) : (
              <EmptyState title="No minutes profile is available for this player." icon={Timer}>
                {mn.restrictions_note}
              </EmptyState>
            )
          }
        </QueryView>
      </Panel>

      <Panel title="Available Kalshi contracts" icon={CandlestickChart} id="kalshi" right={kalshi.data ? <span className="num">{kalshi.data.total} contract(s)</span> : undefined}>
        <QueryView query={kalshi} rows={3} isEmpty={(k) => k.items.length === 0} empty={<EmptyState title="No Kalshi contracts are listed for this player on the current slate." icon={CandlestickChart} />}>
          {(k) => (
            <>
              <KalshiSyncStatus sync={k.sync} className="mb-3 text-xs" />
              <KalshiCompactList rows={k.items} ladder />
              <p className="mt-2 text-xs text-muted">Each row is a separate threshold contract with its own rules. Prices are Kalshi market prices in cents, not model probabilities.</p>
            </>
          )}
        </QueryView>
      </Panel>

      <Panel title="Today's markets" icon={Target}>
        {markets.length === 0 ? (
          <EmptyState title="No prop markets for this player on the current slate." icon={Target} />
        ) : (
          <div className="divide-y divide-line/40">
            {markets.map((m) => (
              <PropRow key={propKey(m)} p={m} onOpen={setOpen} showPlayer={false} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Historical performance" icon={History} id="history">
        <PlayerHistory playerId={id} lines={lines} />
      </Panel>

      <Panel title="Distribution by window" icon={BarChart3}>
        <QueryView query={averages} rows={3}>
          {(a) => <Distribution windows={a.windows} />}
        </QueryView>
      </Panel>

      <Panel title="Splits" icon={Split}>
        <QueryView query={splits} rows={3} isEmpty={(s) => s.splits.length === 0} empty={<EmptyState title="No splits are available." />}>
          {(s) => (
            <>
              <DataTable columns={SPLIT_COLUMNS} rows={s.splits} rowKey={(r) => `${r.group}-${r.label}`} caption="Splits" dense mobileLimit={5} />
              {s.notes.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {s.notes.map((n, i) => (
                    <li key={i}>· {n}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </QueryView>
      </Panel>

      <Panel title="Game log explorer" icon={ListOrdered}>
        <GameLog id={id} />
      </Panel>

      <Panel title="Quantitative research" icon={FlaskConical}>
        <div className="grid gap-5 xl:grid-cols-2">
          <div>
            <Label>Model projections</Label>
            {d.projections.length === 0 ? (
              <EmptyState title="No projections for upcoming games." />
            ) : (
              <ul className="divide-y divide-line/40">
                {d.projections.map((r, i) => (
                  <li key={i} className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-x-3 py-2 text-sm">
                    <span className="font-semibold uppercase text-ink">{statLabel(r.stat)}</span>
                    <span className="min-w-0 text-xs text-muted">
                      {r.game_label} · <span className="num">{r.model_version}</span> · {fmtDateTimeET(r.created_at) ?? "—"}
                    </span>
                    <span className="num text-right">
                      <span className="font-semibold text-ink"><Val v={fmtNum(r.mean)} /></span>{" "}
                      {r.p10 !== null && r.p90 !== null ? <span className="text-xs text-muted">[{r.p10.toFixed(1)}–{r.p90.toFixed(1)}]</span> : <span className="text-xs text-muted">[—]</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label>Forecast accuracy</Label>
            {d.forecast_accuracy.length === 0 ? (
              <EmptyState title="No settled forecasts for this player yet." />
            ) : (
              <ul className="divide-y divide-line/40">
                {d.forecast_accuracy.map((r) => (
                  <li key={r.stat} className="num grid grid-cols-[3rem_1fr_1fr_1fr] items-baseline gap-x-3 py-2 text-sm">
                    <span className="font-semibold uppercase text-ink">{statLabel(r.stat)}</span>
                    <span className="text-soft">n={r.n}</span>
                    <span className="text-soft">MAE <Val v={fmtNum(r.mae, 2)} /></span>
                    <span className="text-soft">80% coverage <Val v={fmtPct(r.coverage_80)} /></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>

      <PropDrawer key={open ? propKey(open) : "none"} p={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["player", id], queryFn: () => api.player(id) });
  return (
    <div>
      <div className="mb-3">
        <DLink href="/players" className={textLink}>
          <ArrowLeft className="h-3 w-3" aria-hidden /> Player explorer
        </DLink>
      </div>
      <QueryView query={q} rows={8}>
        {(d) => <View d={d} id={id} />}
      </QueryView>
    </div>
  );
}
