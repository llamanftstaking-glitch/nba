"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PlayerAvatar } from "@/components/player-avatar";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { NA, Val } from "@/components/ui/na";
import { Label, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState, QueryView } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { fmtDateTimeET, fmtNum, fmtSigned } from "@/lib/format";
import { isInProgress, live, type BoxRow, type BoxTeam, type GameCenter, type GameRow, type Leaders, type Play, type RotationTeam, type StreamState } from "@/lib/live";
import { teamColor } from "@/lib/team-colors";
import { StackedBoard } from "./board";
import { FollowButton, FreshnessMark, StatusChip, TeamMark } from "./common";

const periodLabel = (p: number) => (p <= 4 ? `Q${p}` : p === 5 ? "OT" : `${p - 4}OT`);
/** Game seconds at the end of each period: quarters are 720 s, overtime periods 300 s. */
const periodEnd = (p: number) => (p <= 4 ? p * 720 : 2880 + (p - 4) * 300);

/* ------------------------------------------------------------------ score header */
export function ScoreHeader({ g, stream }: { g: GameRow; stream: StreamState }) {
  // The compact matchup header: the same stacked scoreboard as the home page, one size down, and it
  // stays in view while the tabs scroll. The status slot carries Final, the clock, Delayed or Reconnecting.
  return (
    <header className="sticky top-0 z-20 -mx-[var(--gutter)] bg-bg px-[var(--gutter)] pt-2 md:top-[var(--bar-h)]" data-testid="score-header" data-status={g.status} data-version={g.version}>
      <h1 className="sr-only">
        {g.away.name} at {g.home.name} · game centre
      </h1>
      <StackedBoard
        g={g}
        size="header"
        head={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusChip g={g} />
            {stream === "reconnecting" ? (
              <span className="text-2xs font-bold text-warn" data-testid="stream-state" data-state="reconnecting">Reconnecting…</span>
            ) : (
              <FreshnessMark f={g} long className="!whitespace-normal !font-normal" />
            )}
            <span className="hidden truncate text-sm font-normal text-faint xl:inline">{g.venue ?? ""}</span>
            <span className="ml-auto pr-2 md:pr-3">
              <FollowButton kind="game" refId={g.game_id} followed={g.followed} label={g.label} collapse />
            </span>
          </span>
        }
      />
    </header>
  );
}

/* ------------------------------------------------------------------ overview */
type LeaderOne = Leaders[keyof Leaders] | undefined;
function LeaderCell({ x, align }: { x: LeaderOne; align: "left" | "right" }) {
  if (!x) return <span className={cn("block", align === "right" && "text-right")}><NA /></span>;
  return (
    <span className={cn("block min-w-0", align === "right" && "text-right")}>
      <span className="score block text-[2rem] text-ink">{x.value ?? <NA />}</span>
      <span className="block break-words text-sm leading-tight text-soft">
        {x.player_id !== null ? (
          <DLink href={`/players/${x.player_id}`} className="hover:underline">
            {x.name}
          </DLink>
        ) : (
          x.name
        )}
      </span>
    </span>
  );
}

/** Leaders face each other across the category, away on the left and home on the right. */
function LeadersBlock({ away, home, a, h }: { away: string; home: string; a: Leaders | null; h: Leaders | null }) {
  const row = (label: string, k: keyof Leaders) => (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 border-b border-line py-2.5">
      <LeaderCell x={a?.[k]} align="left" />
      <span className="slot text-muted">{label}</span>
      <LeaderCell x={h?.[k]} align="right" />
    </li>
  );
  return (
    <div data-testid="leaders">
      <div className="flex justify-between text-lg text-ink" style={{ fontStretch: "70%", fontWeight: 800 }}>
        <span>{away}</span>
        <span>{home}</span>
      </div>
      <ul>
        {row("Points", "pts")}
        {row("Rebounds", "reb")}
        {row("Assists", "ast")}
      </ul>
    </div>
  );
}

function TeamBars({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["live", "game", id, "team-stats"], queryFn: () => live.teamStats(id) });
  return (
    <QueryView query={q} rows={4}>
      {(d) =>
        !d.available || d.items.length === 0 ? (
          <EmptyState title="Team statistics have not been published for this game yet." />
        ) : (
          <div data-testid="team-bars">
            <div className="mb-1 flex justify-between text-lg text-ink" style={{ fontStretch: "70%", fontWeight: 800 }}>
              <span>{d.away.abbr}</span>
              <span>{d.home.abbr}</span>
            </div>
            <ul className="space-y-3">
              {d.items.map((it) => {
                const a = it.away_value ?? 0;
                const h = it.home_value ?? 0;
                const total = a + h;
                // a bar is drawn only when both sides are published: a missing value must not read as zero
                const both = it.away_value !== null && it.home_value !== null;
                const ap = total > 0 ? (a / total) * 100 : 50;
                return (
                  <li key={it.key} data-testid="team-bar">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className={cn("num w-20 text-base text-ink", both && a > h ? "font-extrabold" : "font-medium")}>{it.away ?? <NA />}</span>
                      <span className="min-w-0 flex-1 truncate text-center text-sm text-muted">{it.label}</span>
                      <span className={cn("num w-20 text-right text-base text-ink", both && h > a ? "font-extrabold" : "font-medium")}>{it.home ?? <NA />}</span>
                    </div>
                    <div className="mt-1 flex h-2 gap-0.5" role="img" aria-label={`${it.label}: ${d.away.abbr} ${it.away ?? "not published"}, ${d.home.abbr} ${it.home ?? "not published"}`}>
                      <div className="flex flex-1 justify-end overflow-hidden bg-line">
                        <div className="h-full" style={{ width: `${both ? ap : 0}%`, background: a > h ? teamColor(d.away.abbr) : "rgb(var(--text-3))" }} />
                      </div>
                      <div className="flex-1 overflow-hidden bg-line">
                        <div className="h-full" style={{ width: `${both ? 100 - ap : 0}%`, background: h > a ? teamColor(d.home.abbr) : "rgb(var(--text-3))" }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {d.not_published.length > 0 && <p className="mt-3 text-sm text-faint" data-testid="not-published">Not published by the source: {d.not_published.join(", ")}.</p>}
          </div>
        )
      }
    </QueryView>
  );
}

function Progression({ id, g }: { id: string; g: GameRow }) {
  const q = useQuery({ queryKey: ["live", "game", id, "momentum"], queryFn: () => live.momentum(id) });
  return (
    <QueryView query={q} rows={4}>
      {(d) => {
        if (d.points.length < 2) return <EmptyState title="Not enough scoring events yet to draw the score progression." />;
        const data = [{ t: 0, diff: 0, home: 0, away: 0, period: 1 }, ...d.points];
        const lastP = Math.max(4, ...d.points.map((p) => p.period));
        const max = Math.max(5, ...data.map((p) => Math.abs(p.diff)));
        const bounds = Array.from({ length: lastP }, (_, i) => periodEnd(i + 1));
        return (
          <div data-testid="progression">
            <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <li className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-ink" aria-hidden /> Margin ({g.home.abbr} minus {g.away.abbr})
              </li>
              <li>Above zero: {g.home.abbr} ahead · below zero: {g.away.abbr} ahead</li>
            </ul>
            <div className="h-56 w-full" role="img" aria-label={`Score margin over game time. ${g.home.abbr} largest lead ${d.largest_lead?.home ?? "not available"}, ${g.away.abbr} largest lead ${d.largest_lead?.away ?? "not available"}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#E6E7E2" vertical={false} />
                  <XAxis type="number" dataKey="t" domain={[0, periodEnd(lastP)]} ticks={bounds.map((b, i) => b - (i < 4 ? 360 : 150))} tickFormatter={(v: number) => periodLabel(bounds.findIndex((b) => v < b) + 1)} stroke="#D5D7D1" tickLine={false} tick={{ fill: "#646B72", fontSize: 13 }} />
                  <YAxis domain={[-max, max]} stroke="#D5D7D1" tickLine={false} tick={{ fill: "#646B72", fontSize: 13 }} width={30} allowDecimals={false} />
                  {bounds.slice(0, -1).map((b) => (
                    <ReferenceLine key={b} x={b} stroke="#D5D7D1" />
                  ))}
                  <ReferenceLine y={0} stroke="#646B72" />
                  <Tooltip
                    cursor={{ stroke: "#D5D7D1" }}
                    contentStyle={{ background: "#FFFFFF", border: "1px solid #D5D7D1", borderRadius: 4, fontSize: 13 }}
                    labelStyle={{ color: "#454C53" }}
                    itemStyle={{ color: "#12161A" }}
                    labelFormatter={(t, payload) => {
                      const p = payload?.[0]?.payload as { period?: number; home?: number; away?: number } | undefined;
                      return p ? `${periodLabel(p.period ?? 1)} · ${g.away.abbr} ${p.away} – ${g.home.abbr} ${p.home}` : String(t);
                    }}
                    formatter={(v) => [typeof v === "number" ? (v === 0 ? "Tied" : `${v > 0 ? g.home.abbr : g.away.abbr} by ${Math.abs(v)}`) : String(v), "Margin"]}
                  />
                  <Line type="stepAfter" dataKey="diff" stroke="#12161A" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <dl className="num mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4" data-testid="progression-facts">
              <div><dd className="score text-[1.75rem] text-ink"><Val v={d.lead_changes} /></dd><dt className="text-2xs text-muted">Lead changes</dt></div>
              <div><dd className="score text-[1.75rem] text-ink"><Val v={d.ties} /></dd><dt className="text-2xs text-muted">Ties</dt></div>
              <div><dd className="score text-[1.75rem] text-ink"><Val v={d.largest_lead?.away} /></dd><dt className="text-2xs text-muted">Largest lead {g.away.abbr}</dt></div>
              <div><dd className="score text-[1.75rem] text-ink"><Val v={d.largest_lead?.home} /></dd><dt className="text-2xs text-muted">Largest lead {g.home.abbr}</dt></div>
            </dl>
            {d.runs.length > 0 && (
              <p className="num mt-1 text-xs text-muted">
                Largest scoring runs: {d.runs.slice(0, 3).map((r) => `${r.team === "home" ? g.home.abbr : g.away.abbr} ${r.points}–0`).join(" · ")}
              </p>
            )}
            <p className="mt-1 text-xs text-muted">{d.note}</p>
          </div>
        );
      }}
    </QueryView>
  );
}

export function PlayLine({ p, g }: { p: Play; g: Pick<GameRow, "home" | "away"> }) {
  const team = p.team_side === "home" ? g.home : p.team_side === "away" ? g.away : null;
  return (
    <li className={cn("grid grid-cols-[3.25rem_1.75rem_minmax(0,1fr)_auto] items-start gap-x-2 py-2 text-sm", p.scoring && "font-medium")} data-testid="play" data-seq={p.sequence} data-kind={p.kind}>
      <span className="num text-xs text-muted">{p.clock ?? "—"}</span>
      <span>{team ? <TeamMark team={team} size={20} /> : <span className="block h-5 w-5" />}</span>
      <span className={cn("min-w-0 break-words", p.scoring ? "text-ink" : "text-soft")}>
        {p.text}
        {p.corrected && <span className="ml-2 text-2xs font-bold text-warn" data-testid="play-corrected">corrected</span>}
      </span>
      <span className="num whitespace-nowrap text-right text-xs text-muted">{p.scoring && p.home_score !== null && p.away_score !== null ? <span className="font-semibold text-ink">{p.away_score}–{p.home_score}</span> : ""}</span>
    </li>
  );
}

export function OverviewTab({ c }: { c: GameCenter }) {
  const SUM: Record<string, string> = { q1: "After the first quarter", half: "At halftime", q3: "After the third quarter", final: "Final" };
  if (c.mode === "pregame" || c.status === "scheduled") {
    return (
      <EmptyState title="This game has not started.">
        Scores, the box score, plays and rotations appear here after tipoff. Pregame research is on the Research tab.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-6" data-testid="live-overview">
      <div className="grid gap-x-16 gap-y-6 xl:grid-cols-2">
        <Panel title="Leaders">
          {c.leaders ? (
            <LeadersBlock away={c.away.abbr} home={c.home.abbr} a={c.leaders.away} h={c.leaders.home} />
          ) : (
            <EmptyState title="Leaders have not been published yet." />
          )}
        </Panel>
        <Panel title="Last plays" right={<span className="num">{c.plays_count} recorded</span>}>
          {c.last_plays.length === 0 ? (
            <EmptyState title="No plays have been recorded yet." />
          ) : (
            <ul className="divide-y divide-line" data-testid="last-plays">
              {c.last_plays.map((p) => (
                <PlayLine key={p.event_id} p={p} g={c} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className="grid gap-x-16 gap-y-6 xl:grid-cols-2">
        <Panel title="Team comparison">
          <TeamBars id={c.game_id} />
        </Panel>
        <Panel title="Score progression (observed)">
          <Progression id={c.game_id} g={c} />
        </Panel>
      </div>
      {c.summaries.length > 0 && (
        <Panel title="Period summaries" right="Generated from recorded statistics">
          <ul className="space-y-3" data-testid="summaries">
            {c.summaries.map((s) => (
              <li key={s.kind}>
                <Label>
                  {SUM[s.kind] ?? s.kind} · {fmtDateTimeET(s.created_at) ?? "—"}
                </Label>
                <p className="whitespace-pre-line break-words text-sm text-soft">{s.text}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <ul className="max-w-[76ch] space-y-1 text-sm text-faint">
        {[c.poll_note, ...c.notes].filter(Boolean).map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ box score */
type Col = { key: string; label: string; get: (r: BoxRow) => number | null; text?: (r: BoxRow) => string; pregame?: boolean; title?: string };
const made = (m: number | null, a: number | null) => (m === null || a === null ? "—" : `${m}-${a}`);
const COLS: Col[] = [
  { key: "minutes", label: "MIN", get: (r) => r.minutes, text: (r) => (r.minutes === null ? "—" : fmtNum(r.minutes, 0) ?? "—") },
  { key: "pts", label: "PTS", get: (r) => r.pts },
  { key: "reb", label: "REB", get: (r) => r.reb },
  { key: "ast", label: "AST", get: (r) => r.ast },
  { key: "fg3m", label: "3PM", get: (r) => r.fg3m },
  { key: "stl", label: "STL", get: (r) => r.stl },
  { key: "blk", label: "BLK", get: (r) => r.blk },
  { key: "tov", label: "TO", get: (r) => r.tov },
  { key: "pf", label: "PF", get: (r) => r.pf },
  { key: "fgm", label: "FG", get: (r) => r.fgm, text: (r) => made(r.fgm, r.fga) },
  { key: "fg3", label: "3PT", get: (r) => r.fg3m, text: (r) => made(r.fg3m, r.fg3a) },
  { key: "ftm", label: "FT", get: (r) => r.ftm, text: (r) => made(r.ftm, r.fta) },
  { key: "plus_minus", label: "+/-", get: (r) => r.plus_minus, text: (r) => fmtSigned(r.plus_minus, 0) ?? "—" },
  { key: "pra", label: "PRA", get: (r) => r.pra },
  { key: "pr", label: "PR", get: (r) => r.pr },
  { key: "pa", label: "PA", get: (r) => r.pa },
  { key: "ra", label: "RA", get: (r) => r.ra },
  { key: "fg_pct", label: "FG%", get: (r) => r.fg_pct, text: (r) => fmtNum(r.fg_pct) ?? "—" },
  { key: "true_shooting_pct", label: "TS%", get: (r) => r.true_shooting_pct, text: (r) => fmtNum(r.true_shooting_pct) ?? "—" },
];
const PRE: Col[] = [
  { key: "pre_min", label: "Proj MIN", get: (r) => r.pregame?.proj_min ?? null, text: (r) => fmtNum(r.pregame?.proj_min ?? null) ?? "—", pregame: true, title: "Pregame projection" },
  { key: "pre_pts", label: "Proj PTS", get: (r) => r.pregame?.pts ?? null, text: (r) => fmtNum(r.pregame?.pts ?? null) ?? "—", pregame: true, title: "Pregame projection" },
  { key: "pre_reb", label: "Proj REB", get: (r) => r.pregame?.reb ?? null, text: (r) => fmtNum(r.pregame?.reb ?? null) ?? "—", pregame: true, title: "Pregame projection" },
  { key: "pre_ast", label: "Proj AST", get: (r) => r.pregame?.ast ?? null, text: (r) => fmtNum(r.pregame?.ast ?? null) ?? "—", pregame: true, title: "Pregame projection" },
];
const cellText = (c: Col, r: BoxRow) => (c.text ? c.text(r) : (c.get(r) ?? "—"));

function PlayerName({ r, link = true }: { r: BoxRow; link?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {r.on_court === true && <span className="h-2 w-2 shrink-0 rounded-full bg-ink" title="On court" aria-label="on court" data-testid="on-court" />}
      {r.player_id !== null && link ? (
        <DLink href={`/players/${r.player_id}`} className="truncate font-semibold text-ink hover:underline">
          {r.name}
        </DLink>
      ) : (
        <span className="truncate font-semibold text-ink">{r.name}</span>
      )}
      <span className="num shrink-0 text-2xs text-faint">{r.position ?? ""}</span>
      {r.foul_trouble === true && <span className="shrink-0 text-2xs font-bold text-warn" data-testid="foul-trouble">Fouls</span>}
      {r.ejected && <span className="shrink-0 text-2xs font-bold text-bad">Ejected</span>}
    </span>
  );
}

/** "On court" describes this moment of a game in progress; once the game is over the marker is dropped. */
function offCourt<T extends { players: { on_court: boolean | null }[] }>(t: T, status: string): T {
  return isInProgress(status) ? t : { ...t, players: t.players.map((p) => ({ ...p, on_court: null })) };
}

function TeamBox({ t, cols, sort, onSort }: { t: BoxTeam; cols: Col[]; sort: { key: string; dir: 1 | -1 } | null; onSort: (key: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const { active, dnp, benchAt } = useMemo(() => {
    const played = t.players.filter((r) => !r.dnp);
    const out = t.players.filter((r) => r.dnp);
    if (!sort) {
      const ordered = [...played.filter((r) => r.starter), ...played.filter((r) => !r.starter)];
      return { active: ordered, dnp: out, benchAt: played.filter((r) => r.starter).length };
    }
    const col = cols.find((c) => c.key === sort.key);
    const val = (r: BoxRow) => (col ? col.get(r) : null);
    return { active: [...played].sort((a, b) => (val(a) === null ? 1 : 0) - (val(b) === null ? 1 : 0) || ((val(a) ?? 0) - (val(b) ?? 0)) * sort.dir), dnp: out, benchAt: -1 };
  }, [t.players, sort, cols]);
  const totals = (c: Col): string => {
    const v = t.totals;
    if (c.key === "fgm") return made(v.fgm ?? null, v.fga ?? null);
    if (c.key === "fg3") return made(v.fg3m ?? null, v.fg3a ?? null);
    if (c.key === "ftm") return made(v.ftm ?? null, v.fta ?? null);
    const x = v[c.key];
    return x === null || x === undefined ? "—" : String(x);
  };
  const main = cols.slice(0, 4);
  return (
    <section data-testid="box-team" data-team={t.abbr}>
      <h3 className="flex items-center gap-3 pb-2">
        <span className="h-7 w-1.5" style={{ background: teamColor(t.abbr) }} aria-hidden />
        <TeamMark team={t} size={28} />
        <span className="team-name text-[1.625rem] text-ink">{t.name}</span>
        <span className="score ml-auto text-[1.75rem] text-ink">{t.totals.pts ?? ""}</span>
      </h3>
      {/* table: ink rule and band over the head, sticky player column, scrolls inside its own region */}
      <div className="hidden overflow-x-auto lg:block" role="region" aria-label={`${t.name} box score`} tabIndex={0}>
        <table className="w-full border-collapse border-t-2 border-ink text-sm" data-testid="box-table">
          <caption className="sr-only">{t.name} box score</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky-col min-w-[12rem] px-2 text-left">Player</th>
              {cols.map((c) => (
                <th key={c.key} scope="col" title={c.title} className={cn("px-2 text-right", c.pregame && "model")} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" className="inline-flex min-h-[28px] items-center gap-0.5 whitespace-nowrap uppercase tracking-[0.05em] hover:text-ink" style={{ font: "inherit", letterSpacing: "inherit" }} onClick={() => onSort(c.key)} data-sort={c.key}>
                    {c.label}
                    {sort?.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.map((r, i) => (
              <tr key={r.espn_athlete_id} className={cn("border-b border-line hover:bg-raised/60", i === benchAt && "border-t-2 border-t-rule-2")} data-testid="box-row" data-bench-start={i === benchAt ? "1" : undefined}>
                <th scope="row" className="sticky-col px-2 py-2 text-left font-normal">
                  <span className="flex items-center gap-2.5">
                    <PlayerAvatar name={r.name} src={r.headshot_url} size={28} />
                    <PlayerName r={r} />
                  </span>
                </th>
                {cols.map((c) => (
                  <td key={c.key} data-col={c.key} className={cn("num whitespace-nowrap px-2 py-2 text-right", sort?.key === c.key && "bg-raised font-bold", c.pregame ? "model" : c.key === "pts" ? "font-bold text-ink" : "text-soft")}>
                    {cellText(c, r)}
                  </td>
                ))}
              </tr>
            ))}
            {dnp.map((r) => (
              <tr key={r.espn_athlete_id} className="border-b border-line" data-testid="box-dnp">
                <th scope="row" className="sticky-col px-2 py-2 text-left font-normal">
                  <PlayerName r={r} />
                </th>
                <td colSpan={cols.length} className="px-2 py-2 text-sm text-faint">Did not play</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-bold text-ink" data-testid="box-totals">
              <th scope="row" className="sticky-col px-2 py-2.5 text-left">Team</th>
              {cols.map((c) => (
                <td key={c.key} className="num whitespace-nowrap px-2 py-2.5 text-right">{c.pregame || ["minutes", "plus_minus", "fg_pct", "true_shooting_pct", "pra", "pr", "pa", "ra"].includes(c.key) ? "" : totals(c)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {/* below lg: one ruled row per player that opens to the full line */}
      <ul className="border-t-2 border-ink lg:hidden" data-testid="box-cards">
        {active.map((r, i) => (
          <li key={r.espn_athlete_id} className={cn("border-b border-line py-1", i === benchAt && "border-t-2 border-t-rule-2")} data-testid="box-card">
            <button type="button" className="flex min-h-[48px] w-full items-center gap-3 text-left" aria-expanded={open === r.espn_athlete_id} onClick={() => setOpen((v) => (v === r.espn_athlete_id ? null : r.espn_athlete_id))}>
              <PlayerAvatar name={r.name} src={r.headshot_url} size={36} />
              <span className="min-w-0 flex-1">
                <PlayerName r={r} link={false} />
              </span>
              <span className="num grid shrink-0 grid-cols-4 gap-x-3 text-right text-sm">
                {main.map((c) => (
                  <span key={c.key}>
                    <span className="block text-2xs text-faint">{c.label}</span>
                    <span className={cn("text-ink", c.key === "pts" ? "font-extrabold" : "font-medium")}>{cellText(c, r)}</span>
                  </span>
                ))}
              </span>
            </button>
            {open === r.espn_athlete_id && (
              <dl className="num grid grid-cols-5 gap-x-2 gap-y-2 pb-2 pt-1 text-sm" data-testid="box-card-detail">
                {cols.slice(4).map((c) => (
                  <div key={c.key}>
                    <dt className={cn("text-2xs", c.pregame ? "model" : "text-faint")}>{c.label}</dt>
                    <dd className={c.pregame ? "model" : "text-ink"}>{cellText(c, r)}</dd>
                  </div>
                ))}
                {r.player_id !== null && (
                  <div className="col-span-5 pt-1">
                    <DLink href={`/players/${r.player_id}`} className="link inline-flex min-h-[44px] items-center text-sm" data-testid="box-card-player">
                      Player page
                    </DLink>
                  </div>
                )}
              </dl>
            )}
          </li>
        ))}
        {dnp.length > 0 && <li className="border-b border-line py-2.5 text-sm text-faint">Did not play: {dnp.map((r) => r.name).join(", ")}</li>}
        <li className="num flex flex-wrap gap-x-4 py-2.5 text-sm font-bold text-ink" data-testid="box-totals">
          <span className="font-semibold text-muted">Team</span>
          {COLS.slice(1, 4).map((c) => (
            <span key={c.key}>{c.label} {totals(c)}</span>
          ))}
          <span>FG {totals(COLS[9] as Col)}</span>
        </li>
      </ul>
    </section>
  );
}

export function BoxScoreTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["live", "game", id, "boxscore"], queryFn: () => live.boxscore(id) });
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [pre, setPre] = useState(false);
  const cols = pre ? [...COLS, ...PRE] : COLS;
  const onSort = (key: string) => setSort((s) => (s?.key === key ? (s.dir === -1 ? { key, dir: 1 } : null) : { key, dir: -1 }));
  return (
    <QueryView query={q} rows={8}>
      {(d) =>
        !d.available ? (
          <EmptyState title="The box score has not been published for this game yet.">It appears shortly after tipoff.</EmptyState>
        ) : (
          <div className="space-y-10" data-testid="box-score">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink">
                <input type="checkbox" checked={pre} onChange={(e) => setPre(e.target.checked)} className="h-5 w-5 accent-ink" data-testid="box-pregame" />
                Show pregame projection <span className="model font-normal">(model estimate)</span>
              </label>
              <span className="flex flex-wrap items-center gap-3 text-xs text-muted">
                {sort ? (
                  <Button variant="ghost" onClick={() => setSort(null)}>
                    Starters first
                  </Button>
                ) : (
                  <span>Starters first. Select a column head to sort.</span>
                )}
                <FreshnessMark f={d} long />
              </span>
            </div>
            <TeamBox t={offCourt(d.away, d.status)} cols={cols} sort={sort} onSort={onSort} />
            <TeamBox t={offCourt(d.home, d.status)} cols={cols} sort={sort} onSort={onSort} />
            <ul className="max-w-[76ch] space-y-1 text-sm text-faint">
              {d.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )
      }
    </QueryView>
  );
}

/* ------------------------------------------------------------------ plays */
const PAGE = 40;
export function PlaysTab({ id, g, version }: { id: string; g: GameRow; version: number }) {
  const [filter, setFilter] = useState("all");
  const [team, setTeam] = useState("");
  const [player, setPlayer] = useState("");
  const [items, setItems] = useState<Play[]>([]);
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [more, setMore] = useState(false);
  const box = useQuery({ queryKey: ["live", "game", id, "boxscore"], queryFn: () => live.boxscore(id) });
  const params = useMemo(() => ({ filter, team_id: team || undefined, player_id: player || undefined }), [filter, team, player]);
  const maxSeq = useRef(0);
  const key = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    live
      .plays(id, { ...params, order: "desc", limit: PAGE, offset: 0 })
      .then((d) => {
        if (cancelled) return;
        setItems(d.items);
        setTotal(d.total);
        setNote(d.note);
        maxSeq.current = Math.max(0, ...d.items.map((p) => p.sequence));
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the serialised filters
  }, [id, key]);

  // New plays only: fetched with after_sequence when the game's version increases, and prepended.
  useEffect(() => {
    if (state !== "ready" || version < 0) return;
    let cancelled = false;
    live
      .plays(id, { ...params, after_sequence: maxSeq.current, order: "desc", limit: 100 })
      .then((d) => {
        if (cancelled || d.items.length === 0) return;
        maxSeq.current = Math.max(maxSeq.current, ...d.items.map((p) => p.sequence));
        setItems((cur) => {
          const have = new Set(cur.map((p) => p.event_id));
          return [...d.items.filter((p) => !have.has(p.event_id)), ...cur];
        });
        setTotal((t) => Math.max(t, d.total));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on version change only
  }, [version]);

  const loadMore = () => {
    setMore(true);
    live
      .plays(id, { ...params, order: "desc", limit: PAGE, offset: items.length })
      .then((d) =>
        setItems((cur) => {
          const have = new Set(cur.map((p) => p.event_id));
          return [...cur, ...d.items.filter((p) => !have.has(p.event_id))];
        }),
      )
      .finally(() => setMore(false));
  };
  const periods = useMemo(() => {
    const m = new Map<number, Play[]>();
    for (const p of items) m.set(p.period, [...(m.get(p.period) ?? []), p]);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [items]);
  const players = useMemo(() => (box.data ? [...box.data.away.players, ...box.data.home.players].filter((r) => r.player_id !== null && !r.dnp) : []), [box.data]);

  return (
    <div className="space-y-4" data-testid="plays-tab">
      <div className="flex flex-wrap items-end gap-3">
        <Tabs label="Play filter" size="sm" value={filter} onChange={setFilter} items={[{ id: "all", label: "All" }, { id: "scoring", label: "Scoring" }, { id: "fouls", label: "Fouls" }, { id: "substitutions", label: "Substitutions" }]} />
        <Field label="Team" className="w-32">
          <Select value={team} onChange={(e) => setTeam(e.target.value)} data-testid="plays-team">
            <option value="">Both</option>
            <option value={g.away.team_id}>{g.away.abbr}</option>
            <option value={g.home.team_id}>{g.home.abbr}</option>
          </Select>
        </Field>
        <Field label="Player" className="w-48">
          <Select value={player} onChange={(e) => setPlayer(e.target.value)} data-testid="plays-player">
            <option value="">All players</option>
            {players.map((r) => (
              <option key={r.espn_athlete_id} value={String(r.player_id)}>{r.name}</option>
            ))}
          </Select>
        </Field>
        <span className="num ml-auto text-xs text-muted" data-testid="plays-count">{items.length} of {total} plays</span>
      </div>
      {state === "loading" ? (
        <LoadingState rows={6} />
      ) : state === "error" ? (
        <ErrorState error={new Error("The play-by-play could not be loaded.")} />
      ) : items.length === 0 ? (
        <EmptyState title={filter === "all" && !team && !player ? "No plays have been recorded for this game yet." : "No plays match these filters."} />
      ) : (
        <>
          {periods.map(([p, list]) => (
            <section key={p} data-testid="plays-period">
              <h3 className="h-sub border-b-2 border-ink pb-1.5">{periodLabel(p)}</h3>
              <ul className="divide-y divide-line">
                {list.map((x) => (
                  <PlayLine key={x.event_id} p={x} g={g} />
                ))}
              </ul>
            </section>
          ))}
          {items.length < total && (
            <Button size="md" onClick={loadMore} disabled={more} data-testid="plays-more">
              {more ? "Loading…" : `Load more (${total - items.length} earlier)`}
            </Button>
          )}
        </>
      )}
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ rotations */
function RotationTeamView({ t, total, quarters, now }: { t: RotationTeam; total: number; quarters: number[]; now: boolean }) {
  if (!t.determinable) {
    return (
      <section data-testid="rotation-team" data-determinable="0">
        <h3 className="team-name border-b-2 border-ink pb-1.5 text-[1.625rem] text-ink">{t.abbr}</h3>
        <p className="mt-3 text-base text-soft" data-testid="rotation-note">{t.note}</p>
        {t.problems.length > 0 && <p className="mt-1 text-xs text-muted">{t.problems.join("; ")}</p>}
      </section>
    );
  }
  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / total) * 100))}%`;
  const periods = quarters.map((_, i) => String(i + 1));
  return (
    <section data-testid="rotation-team" data-determinable="1">
      <h3 className="team-name border-b-2 border-ink pb-1.5 text-[1.625rem] text-ink">{t.abbr}</h3>
      <p className="text-xs text-muted">{t.note}</p>
      <div className="mt-3" data-testid="rotation-timeline" role="img" aria-label={`${t.abbr} stints by player across game time. The same minutes are in the table below.`}>
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2 text-2xs text-muted sm:grid-cols-[10rem_minmax(0,1fr)]">
          <span />
          <span className="relative block h-4">
            {quarters.map((end, i) => (
              <span key={end} className="absolute top-0 -translate-x-1/2" style={{ left: pct(end - (i < 4 ? 360 : 150)) }}>{periodLabel(i + 1)}</span>
            ))}
          </span>
        </div>
        <ul className="space-y-1">
          {t.players.filter((p) => p.stints.length > 0).map((p) => (
            <li key={p.espn_athlete_id} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-2 sm:grid-cols-[10rem_minmax(0,1fr)]" data-testid="rotation-row">
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                {p.on_court === true && <span className="h-2 w-2 shrink-0 rounded-full bg-ink" aria-label="on court" />}
                <span className="truncate text-soft">{p.name}</span>
              </span>
              <span className="relative block h-4 overflow-hidden bg-line">
                {quarters.slice(0, -1).map((end) => (
                  <span key={end} className="absolute inset-y-0 w-px bg-bg" style={{ left: pct(end) }} />
                ))}
                {p.stints.map((s, i) => (
                  <span key={i} className={cn("absolute inset-y-0", p.starter ? "bg-ink" : "bg-faint")} style={{ left: pct(s.start_s), width: `calc(${pct((s.end_s ?? total) - s.start_s)} )` }} data-testid="stint" />
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 bg-ink" aria-hidden /> Starter</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 bg-faint" aria-hidden /> Bench</span>
          {now && <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-ink" aria-hidden /> On court now</span>}
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm" data-testid="rotation-table">
          <caption className="sr-only">{t.abbr} minutes by player</caption>
          <thead>
            <tr className="border-b border-line text-2xs text-muted">
              <th scope="col" className="pb-2 pr-2 text-left font-semibold">Player</th>
              <th scope="col" className="px-1.5 pb-2 text-right font-semibold">MIN</th>
              {periods.map((p) => (
                <th key={p} scope="col" className="hidden px-1.5 pb-2 text-right font-semibold sm:table-cell">{periodLabel(Number(p))}</th>
              ))}
              <th scope="col" className="px-1.5 pb-2 text-right font-semibold">PF</th>
              <th scope="col" className="px-1.5 pb-2 text-right font-semibold" title="Pregame projected minutes">Proj</th>
              <th scope="col" className="pb-2 pl-1.5 text-right font-semibold" title="Minutes minus the pregame projection">Diff</th>
            </tr>
          </thead>
          <tbody>
            {t.players.map((p) => (
              <tr key={p.espn_athlete_id} className="border-b border-line last:border-0">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                  <span className="text-ink">{p.name}</span> <span className="text-xs text-muted">{p.starter ? "starter" : (p.role ?? "bench")}</span>
                  {p.foul_trouble === true && <span className="ml-1.5 text-2xs font-bold text-warn">Fouls</span>}
                </th>
                <td className="num px-1.5 py-1.5 text-right font-semibold text-ink"><Val v={fmtNum(p.minutes)} /></td>
                {periods.map((k) => (
                  <td key={k} className="num hidden px-1.5 py-1.5 text-right text-soft sm:table-cell">{p.minutes_by_period[k] === undefined ? "—" : p.minutes_by_period[k]?.toFixed(1)}</td>
                ))}
                <td className="num px-1.5 py-1.5 text-right text-soft"><Val v={p.pf} /></td>
                <td className="num model px-1.5 py-1.5 text-right"><Val v={fmtNum(p.proj_min)} className="model" /></td>
                <td className="num py-1.5 pl-1.5 text-right text-soft"><Val v={fmtSigned(p.minutes_vs_projection, 1)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RotationsTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["live", "game", id, "rotations"], queryFn: () => live.rotations(id) });
  return (
    <QueryView query={q} rows={8}>
      {(d) => {
        const lastPeriod = Math.max(4, d.period ?? 4);
        const quarters = Array.from({ length: lastPeriod }, (_, i) => periodEnd(i + 1));
        const total = Math.max(periodEnd(lastPeriod), d.elapsed_s ?? 0);
        return (
          <div className="space-y-4" data-testid="rotations-tab">
            <div className="grid gap-x-16 gap-y-10 2xl:grid-cols-2">
              <RotationTeamView t={offCourt(d.away, d.status)} total={total} quarters={quarters} now={isInProgress(d.status)} />
              <RotationTeamView t={offCourt(d.home, d.status)} total={total} quarters={quarters} now={isInProgress(d.status)} />
            </div>
            <ul className="space-y-0.5 text-xs text-muted" data-testid="rotation-notes">
              {d.notes.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
          </div>
        );
      }}
    </QueryView>
  );
}

export const tabDefault = (c: Pick<GameCenter, "mode" | "status">) => (c.mode === "pregame" || c.status === "scheduled" ? "research" : "overview");
export const gameInProgress = (g: Pick<GameRow, "status">) => isInProgress(g.status);
