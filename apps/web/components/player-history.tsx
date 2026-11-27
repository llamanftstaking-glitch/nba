"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { HistoryBarChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Label } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { fmtDate, fmtNum, HISTORY_STATS, HISTORY_WINDOWS, statLabel } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import type { Threshold } from "@/lib/types";

export const NOT_A_PROBABILITY = "descriptive history, not a probability";

function MeasurementB({ mh }: { mh: Threshold["market_history"] }) {
  return (
    <div className="border-l-2 border-line py-1 pl-3" data-testid="measurement-b">
      <Label>Measurement B · results against the lines that were actually quoted</Label>
      {mh.available ? (
        <p className="num text-sm text-ink">
          Over {mh.over} · Under {mh.under} · Push {mh.push} <span className="text-muted">of {mh.n} quoted games</span>
        </p>
      ) : (
        <p className="text-sm text-muted">Not available: {mh.reason}</p>
      )}
    </div>
  );
}

/**
 * Historical performance against a user-selected threshold (Measurement A).
 * Everything here is descriptive: counts of past games, never a probability.
 */
export function PlayerHistory({
  playerId,
  initialStat = "pts",
  lines = {},
  compact = false,
}: {
  playerId: number | string;
  initialStat?: string;
  /** Today's quoted line per stat, used as the default threshold. */
  lines?: Record<string, number | null | undefined>;
  compact?: boolean;
}) {
  const [stat, setStat] = useState(initialStat);
  const [win, setWin] = useState("L10");
  const [venue, setVenue] = useState("");
  const [role, setRole] = useState("");
  const [lineText, setLineText] = useState("");
  const [touched, setTouched] = useState(false);
  const [asTable, setAsTable] = useState(false);

  const averages = useQuery({ queryKey: ["player-averages", String(playerId)], queryFn: () => api.playerAverages(playerId) });

  // Default threshold: today's line for the stat, otherwise the L10 average rounded to the nearest half.
  const fallback = useMemo(() => {
    const quoted = lines[stat];
    if (typeof quoted === "number") return { value: quoted, source: "today's line" };
    const l10 = averages.data?.windows.find((w) => w.key === "L10")?.stats[stat]?.mean;
    if (typeof l10 === "number") return { value: Math.round(l10 * 2) / 2 || 0.5, source: "L10 average, rounded" };
    return null;
  }, [lines, stat, averages.data]);

  useEffect(() => {
    if (!touched && fallback) setLineText(String(fallback.value));
  }, [fallback, touched]);

  const parsed = Number(lineText);
  const valid = lineText.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const line = useDebounced(valid ? parsed : null, 300);

  const q = useQuery({
    queryKey: ["player-threshold", String(playerId), stat, line, win, venue, role],
    queryFn: () => api.playerThreshold(playerId, { stat, line: line as number, window: win, venue: venue || undefined, role: role || undefined }),
    enabled: line !== null,
    placeholderData: (prev) => prev,
  });
  const t = q.data;

  return (
    <div className="space-y-4" data-testid="player-history" data-stat={stat} data-window={win}>
      <div className="space-y-3">
        <div>
          <Label>Stat</Label>
          <Tabs label="Stat" size="sm" scroll value={stat} onChange={(v) => { setStat(v); setTouched(false); }} items={HISTORY_STATS.map((s) => ({ id: s, label: statLabel(s) }))} />
        </div>
        <div>
          <Label>Window</Label>
          <Tabs label="Window" size="sm" scroll value={win} onChange={setWin} items={HISTORY_WINDOWS.map(([id, label]) => ({ id, label }))} />
        </div>
        <div className={compact ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-2xl"}>
          <Field label="Threshold" className="col-span-2 sm:col-span-1">
            <Input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              value={lineText}
              onChange={(e) => { setTouched(true); setLineText(e.target.value); }}
              aria-invalid={!valid}
              data-testid="threshold-input"
            />
          </Field>
          <Field label="Venue">
            <Select value={venue} onChange={(e) => setVenue(e.target.value)}>
              <option value="">Home + away</option>
              <option value="home">Home</option>
              <option value="away">Away</option>
            </Select>
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Starter + bench</option>
              <option value="starter">Starter</option>
              <option value="bench">Bench</option>
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted">
          {touched ? "Hypothetical threshold entered by you." : fallback ? `Threshold defaults to ${fallback.source}.` : "Enter a threshold to compare past games against."} Type any number to test a different one.
        </p>
      </div>

      {!valid ? (
        <EmptyState title="Enter a threshold of zero or more to see historical results." />
      ) : q.isPending ? (
        <LoadingState rows={3} label="Loading history" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : t && t.n === 0 ? (
        <EmptyState title="No games match these filters.">Try a longer window or remove the venue / role filter.</EmptyState>
      ) : t ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">{t.label}</p>
            <Button variant="ghost" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)} data-testid="history-table-toggle">
              {asTable ? "Show chart" : "Show as table"}
            </Button>
          </div>
          {asTable ? (
            <div className="overflow-hidden rounded-md bg-raised/40" data-testid="history-table">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {statLabel(t.stat)} by game against a threshold of {t.line}
                </caption>
                <thead>
                  <tr className="text-left text-2xs text-muted">
                    <th scope="col" className="px-3 py-2 font-semibold">Date</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Opp</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Min</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{statLabel(t.stat)}</th>
                    <th scope="col" className="px-3 py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {t.games.map((g) => (
                    <tr key={g.game_id} className="border-t border-line">
                      <td className="num px-3 py-1.5 text-soft">{fmtDate(g.date) ?? g.date}</td>
                      <td className="num px-2 py-1.5 text-soft">{g.is_home ? "vs" : "@"} {g.opp_abbr}</td>
                      <td className="num px-2 py-1.5 text-right text-soft">{g.min}</td>
                      <td className="num px-2 py-1.5 text-right font-semibold text-ink">{g.value}</td>
                      <td className="px-3 py-1.5 capitalize text-soft">{g.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <HistoryBarChart games={t.games} line={t.line} statLabel={statLabel(t.stat)} height={compact ? 190 : 240} />
          )}
          <p className="text-sm text-ink" data-testid="history-summary">
            <span className="num font-semibold">
              Over {t.over} · Under {t.under} · Equal {t.equal} of {t.n}
            </span>
            <span className="text-muted"> — {NOT_A_PROBABILITY}</span>
            {t.average !== null && (
              <span className="num text-muted">
                {" "}· average {fmtNum(t.average)} {statLabel(t.stat)}
              </span>
            )}
          </p>
          <MeasurementB mh={t.market_history} />
          {t.notes.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted">
              {t.notes.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
