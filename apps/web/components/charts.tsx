"use client";

import {
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
const SERIES = "#7dd3fc";
const GRID = "#1d2942";
const AXIS = "#2b3a5c";
const REFERENCE = "#94a3b8";
const TICK = { fill: "#94a3b8", fontSize: 11 } as const;

const tooltipStyle = {
  contentStyle: { background: "#0f172b", border: "1px solid #2b3a5c", borderRadius: 3, fontSize: 12, padding: "6px 8px" },
  labelStyle: { color: "#cbd5e1", marginBottom: 2 },
  itemStyle: { color: "#ffffff", fontFamily: "ui-monospace, Menlo, Consolas, monospace" },
} as const;

function LegendRow({ items }: { items: { label: string; kind: "dot" | "line" | "dash" }[] }) {
  return (
    <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
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
              label={{ value: "Predicted probability", position: "insideBottom", offset: -10, fill: REFERENCE, fontSize: 11 }}
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
            <Scatter dataKey="observed" fill={SERIES} stroke="#0a1020" strokeWidth={2} isAnimationActive={false}>
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
            <Line type="linear" dataKey="cumulative" stroke={SERIES} strokeWidth={2} dot={data.length <= 40 ? { r: 3, fill: SERIES, stroke: "#0a1020", strokeWidth: 2 } : false} activeDot={{ r: 5 }} isAnimationActive={false} />
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
      <div className="mb-1 text-2xs uppercase tracking-wide text-muted">{label}</div>
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
