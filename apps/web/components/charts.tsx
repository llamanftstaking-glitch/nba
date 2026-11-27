"use client";

import {
  Area,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CalibrationBucket } from "@/lib/types";
import { fmtDate } from "@/lib/format";

// Chart tokens. One data hue (sky) on the dark surface; reference marks are neutral.
// Emerald/amber/red are reserved for research status and are never used as series colours.
const SERIES = "#1F4E79";
const GRID = "#E6E7E2";
const AXIS = "#D5D7D1";
const REFERENCE = "#646B72";
const TICK = { fill: "#646B72", fontSize: 13 } as const;

const tooltipStyle = {
  contentStyle: { background: "#FFFFFF", border: "1px solid #D5D7D1", borderRadius: 4, fontSize: 13, padding: "8px 10px" },
  labelStyle: { color: "#454C53", marginBottom: 2 },
  itemStyle: { color: "#12161A", fontVariantNumeric: "tabular-nums" },
} as const;

function LegendRow({ items }: { items: { label: string; kind: "dot" | "line" | "dash" }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.kind === "dot" && <span className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES }} aria-hidden />}
          {it.kind === "line" && <span className="inline-block h-0.5 w-4" style={{ background: SERIES }} aria-hidden />}
          {it.kind === "dash" && <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: REFERENCE }} aria-hidden />}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

type CalPoint = { bucket: string; n: number; predicted: number; observed: number; err: [number, number] | undefined };

/** Predicted vs observed frequency per probability bucket, with the interval on the observed rate. */
export function CalibrationChart({ data }: { data: CalibrationBucket[] }) {
  const points: CalPoint[] = data
    .filter((d): d is CalibrationBucket & { observed: number } => d.observed !== null)
    .map((d) => ({
      bucket: d.bucket,
      n: d.n,
      predicted: d.predicted,
      observed: d.observed,
      err: d.ci ? [Math.max(0, d.observed - d.ci[0]), Math.max(0, d.ci[1] - d.observed)] : undefined,
    }));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div data-testid="calibration-chart">
      <LegendRow
        items={[
          { label: "Observed hit rate per bucket (bar = 95% CI)", kind: "dot" },
          { label: "Perfect calibration", kind: "dash" },
        ]}
      />
      <div className="h-64 w-full" role="img" aria-label="Calibration chart: predicted probability against observed hit rate. The same values are listed in the table below.">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="0" />
            <XAxis
              type="number"
              dataKey="predicted"
              domain={[0, 1]}
              ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
              tickFormatter={pct}
              stroke={AXIS}
              tickLine={false} tick={TICK}
              label={{ value: "Predicted probability", position: "insideBottom", offset: -10, fill: REFERENCE, fontSize: 13 }}
            />
            <YAxis type="number" dataKey="observed" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={pct} stroke={AXIS} tickLine={false} tick={TICK} width={40} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={REFERENCE} strokeDasharray="4 4" ifOverflow="visible" />
            <Tooltip
              {...tooltipStyle}
              cursor={{ stroke: AXIS }}
              formatter={(value, name) => [typeof value === "number" ? `${(value * 100).toFixed(1)}%` : String(value), name === "observed" ? "Observed" : "Predicted"]}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as CalPoint | undefined;
                return p ? `Bucket ${p.bucket} · n=${p.n}` : "";
              }}
            />
            <Scatter dataKey="observed" fill={SERIES} stroke="#F5F5F1" strokeWidth={2} isAnimationActive={false}>
              <ErrorBar dataKey="err" direction="y" width={5} strokeWidth={1.5} stroke={SERIES} />
            </Scatter>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Cumulative simulated P&L in virtual units. */
export function EquityChart({ data }: { data: { date: string; pnl_units: number; cumulative: number }[] }) {
  return (
    <div data-testid="equity-chart">
      <LegendRow items={[{ label: "Cumulative simulated P&L (virtual units)", kind: "line" }]} />
      <div className="h-64 w-full" role="img" aria-label="Equity curve: cumulative simulated profit and loss in virtual units by date.">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d) ?? d} stroke={AXIS} tickLine={false} tick={TICK} minTickGap={28} />
            <YAxis stroke={AXIS} tickLine={false} tick={TICK} width={40} />
            <ReferenceLine y={0} stroke={REFERENCE} strokeDasharray="4 4" />
            <Tooltip
              {...tooltipStyle}
              cursor={{ stroke: AXIS }}
              labelFormatter={(d) => fmtDate(String(d), { year: true }) ?? String(d)}
              formatter={(value, name) => [
                typeof value === "number" ? `${value > 0 ? "+" : ""}${value.toFixed(2)} u` : String(value),
                name === "cumulative" ? "Cumulative" : "Day",
              ]}
            />
            <Line type="linear" dataKey="cumulative" stroke={SERIES} strokeWidth={2} dot={data.length <= 40 ? { r: 3, fill: SERIES, stroke: "#F5F5F1", strokeWidth: 2 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Single-stat trend line (player game log). */
export function TrendChart({ data, label }: { data: { x: string; y: number | null }[]; label: string }) {
  return (
    <div>
      <div className="mb-1 text-2xs text-muted">{label}</div>
      <div className="h-36 w-full" role="img" aria-label={`${label} by game. Values are listed in the game log table.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="x" tickFormatter={(d: string) => fmtDate(d) ?? d} stroke={AXIS} tickLine={false} tick={TICK} minTickGap={28} />
            <YAxis stroke={AXIS} tickLine={false} tick={TICK} width={30} />
            <Tooltip {...tooltipStyle} cursor={{ stroke: AXIS }} labelFormatter={(d) => fmtDate(String(d), { year: true }) ?? String(d)} formatter={(v) => [String(v), label]} />
            <Line type="linear" dataKey="y" stroke={SERIES} strokeWidth={2} dot={{ r: 2.5, fill: SERIES }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- HistoryBarChart ----------
// Over / under / equal are descriptive categories, so they use brand-neutral data colours rather than
// the status palette: teal (over), slate (under), amber (equal). The legend and tooltip carry the labels.
export const HISTORY_COLORS = { over: "#5F6B76", under: "#7C858E", equal: "#B36B00" } as const;

export type HistoryBar = { date: string; opp_abbr: string; is_home: boolean; min: number | null; value: number; outcome: "over" | "under" | "equal"; starter?: boolean | null };

function HistoryTooltip({ active, payload, statLabel }: { active?: boolean; payload?: { payload: HistoryBar }[]; statLabel: string }) {
  const g = active ? payload?.[0]?.payload : undefined;
  if (!g) return null;
  return (
    <div className="rounded-md bg-bg2 px-3 py-2 text-xs shadow-lg ring-1 ring-line-strong" data-testid="history-tooltip">
      <div className="font-semibold text-ink">
        {fmtDate(g.date, { year: true }) ?? g.date} · {g.is_home ? "vs" : "@"} {g.opp_abbr}
      </div>
      <div className="num mt-0.5 text-soft">
        {statLabel} <span className="font-semibold text-ink">{g.value}</span> · {g.min === null ? "—" : g.min} min · {g.is_home ? "Home" : "Away"}
        {g.starter === true ? " · Started" : g.starter === false ? " · Bench" : ""}
      </div>
      <div className="mt-0.5 capitalize text-muted">{g.outcome === "equal" ? "Equal to" : g.outcome === "over" ? "Over" : "Under"} the selected threshold</div>
    </div>
  );
}

/** One bar per game, oldest → newest, coloured by the result against the horizontal threshold line. */
export function HistoryBarChart({ games, line, statLabel, height = 220 }: { games: HistoryBar[]; line: number; statLabel: string; height?: number }) {
  const max = Math.max(line, ...games.map((g) => g.value), 1);
  return (
    <div data-testid="history-chart">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {(["over", "under", "equal"] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5 capitalize">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: HISTORY_COLORS[k] }} aria-hidden />
            {k}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: "#12161A" }} aria-hidden />
          Threshold <span className="num text-soft">{line}</span>
        </li>
      </ul>
      <div style={{ height }} className="w-full" role="img" aria-label={`${statLabel} by game, oldest to newest, against a threshold of ${line}. The same values are available as a table.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={games} margin={{ top: 8, right: 6, bottom: 0, left: 0 }} barCategoryGap="18%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d) ?? d} stroke={AXIS} tickLine={false} tick={TICK} minTickGap={16} interval="preserveStartEnd" />
            <YAxis stroke={AXIS} tickLine={false} tick={TICK} width={30} domain={[0, Math.ceil(max * 1.1)]} allowDecimals={false} />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<HistoryTooltip statLabel={statLabel} />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              {games.map((g, i) => (
                <Cell key={i} fill={HISTORY_COLORS[g.outcome]} />
              ))}
            </Bar>
            <ReferenceLine y={line} stroke="#12161A" strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const OVERLAY = ["#2F6FA8", "#8A5200", "#7A4FB3"] as const; // validated with the dataviz palette checker (dark)

/** Up to three players' recent values on one axis (same stat, same unit). */
export function OverlayLineChart({ series, statLabel }: { series: { name: string; values: number[] }[]; statLabel: string }) {
  const len = Math.max(0, ...series.map((s) => s.values.length));
  const data = Array.from({ length: len }, (_, i) => {
    const row: Record<string, number | string | null> = { game: `G${i + 1}` };
    series.forEach((s, k) => {
      // right-align so the last point is each player's most recent game
      const off = len - s.values.length;
      row[`s${k}`] = i >= off ? (s.values[i - off] ?? null) : null;
    });
    return row;
  });
  return (
    <div data-testid="overlay-chart">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
        {series.map((s, k) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: OVERLAY[k] }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="h-64 w-full" role="img" aria-label={`${statLabel} over each player's most recent games, oldest to newest.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="game" stroke={AXIS} tickLine={false} tick={TICK} />
            <YAxis stroke={AXIS} tickLine={false} tick={TICK} width={30} />
            <Tooltip {...tooltipStyle} cursor={{ stroke: AXIS }} formatter={(v, name) => [String(v), series[Number(String(name).slice(1))]?.name ?? String(name)]} />
            {series.map((s, k) => (
              <Line key={s.name} type="linear" dataKey={`s${k}`} stroke={OVERLAY[k]} strokeWidth={2} dot={{ r: 3, fill: OVERLAY[k], stroke: "#F5F5F1", strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Kalshi price history ----------
export const TIMELINE_COLORS = { availability: "#B36B00", lineup: "#5F6B76", market_status: "#646B72" } as const;
export type PricePoint = { t: number; price: number | null; band: [number, number] | null; spread: number | null; volume: number | null };
export type TimelineMark = { t: number; type: keyof typeof TIMELINE_COLORS; own: boolean; text: string };

const timeTick = (t: number) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const timeLabel = (t: number) => `${new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`;

/**
 * Market price over time (cents) with the bid–ask range as a faint band and availability / lineup /
 * market-status events as vertical markers. One axis; markers are listed again as text under the chart.
 */
export function KalshiPriceChart({ points, marks, metric = "price" }: { points: PricePoint[]; marks: TimelineMark[]; metric?: "price" | "spread" | "volume" }) {
  const isPrice = metric === "price";
  const label = metric === "price" ? "Market price" : metric === "spread" ? "Bid–ask spread" : "Volume";
  const fmt = (v: number) => (metric === "volume" ? v.toLocaleString("en-US") : `${Math.round(v * 1000) / 10}¢`);
  const lo = points[0]?.t ?? 0;
  const hi = points[points.length - 1]?.t ?? 0;
  const inRange = marks.filter((m) => m.t >= lo && m.t <= hi);
  return (
    <div data-testid="kalshi-chart" data-metric={metric}>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: SERIES }} aria-hidden />
          {label}
        </li>
        {isPrice && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: SERIES, opacity: 0.18 }} aria-hidden />
            Bid–ask range
          </li>
        )}
        {(Object.keys(TIMELINE_COLORS) as (keyof typeof TIMELINE_COLORS)[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="inline-block h-3 border-l-2" style={{ borderColor: TIMELINE_COLORS[k] }} aria-hidden />
            {k === "availability" ? "Availability change" : k === "lineup" ? "Lineup change" : "Market status"}
          </li>
        ))}
      </ul>
      <div className="h-64 w-full" role="img" aria-label={`${label} over time with event markers. The events are listed under the chart.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={timeTick} stroke={AXIS} tickLine={false} tick={TICK} minTickGap={40} />
            <YAxis stroke={AXIS} tickLine={false} tick={TICK} width={44} tickFormatter={fmt} domain={isPrice ? [(min: number) => Math.max(0, Math.floor(min * 20 - 0.5) / 20), (max: number) => Math.min(1, Math.ceil(max * 20 + 0.5) / 20)] : [0, "auto"]} />
            <Tooltip
              {...tooltipStyle}
              cursor={{ stroke: AXIS }}
              labelFormatter={(t) => timeLabel(Number(t))}
              formatter={(value, name) => {
                if (Array.isArray(value)) return [`${fmt(Number(value[0]))} – ${fmt(Number(value[1]))}`, "Bid–ask"];
                return [typeof value === "number" ? fmt(value) : String(value), name === "band" ? "Bid–ask" : label];
              }}
            />
            {isPrice && <Area dataKey="band" stroke="none" fill={SERIES} fillOpacity={0.14} isAnimationActive={false} connectNulls />}
            {inRange.map((m, i) => (
              <ReferenceLine key={i} x={m.t} stroke={TIMELINE_COLORS[m.type]} strokeWidth={m.own ? 2 : 1} strokeDasharray={m.own ? undefined : "3 3"} strokeOpacity={m.own ? 1 : 0.7} />
            ))}
            <Line type="linear" dataKey={metric} stroke={SERIES} strokeWidth={2} dot={points.length <= 30 ? { r: 2.5, fill: SERIES } : false} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
