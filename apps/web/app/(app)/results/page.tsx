"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalibrationChart, EquityChart } from "@/components/charts";
import { SummaryTiles, ciText } from "@/components/summary";
import { TicketCard } from "@/components/ticket-card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { NA, Val } from "@/components/ui/na";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api, type ResultsFilters } from "@/lib/api";
import { ENGINES, MARKET_LABELS, fmtInt, fmtPct, fmtSigned, fmtSignedPct } from "@/lib/format";
import { useDataHealth, useModels, useTeams } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import type { CalibrationBucket, ResultsResponse, Summary } from "@/lib/types";

const LIMIT = 10;
const CLASSES = ["high_confidence", "standard", "watchlist", "insufficient_evidence", "rejected", "invalidated"];
const ENGINE_LABEL: Record<string, string> = {
  SINGLE: "SINGLE · 1 leg",
  DOUBLE: "DOUBLE · 2 legs",
  TRIPLE: "TRIPLE · 3 legs",
  QUAD: "QUAD · 4 legs",
  FIVE: "FIVE · 5 legs",
  SIX: "SIX · 6 legs",
};
const NO_RECORDS = "n=0 — no settled records";

type Row = { key: string; s: Summary | null };

function NoRec() {
  return <span className="text-muted">—</span>;
}

function breakdownColumns(first: string): Column<Row>[] {
  const has = (r: Row): r is { key: string; s: Summary } => r.s !== null && r.s.settled > 0;
  const empty = (r: Row) => !has(r);
  const cols: Column<Row>[] = [
    { key: "k", header: first, primary: true, className: "whitespace-nowrap", cell: (r) => <span className="num font-medium text-ink">{r.key}</span> },
    {
      key: "settled",
      header: "Settled",
      align: "right",
      className: "md:whitespace-nowrap",
      cell: (r) => (has(r) ? <span className="num">n={fmtInt(r.s.settled)}</span> : <span className="text-muted" data-testid="engine-empty">{NO_RECORDS}</span>),
    },
    { key: "wl", header: "W / L / P / V", align: "right", className: "whitespace-nowrap", cell: (r) => (has(r) ? <span className="num">{r.s.wins} / {r.s.losses} / {r.s.pushes} / {r.s.voids}</span> : <NoRec />) },
    {
      key: "hit",
      header: "Hit rate [95% CI]",
      align: "right",
      cell: (r) =>
        has(r) ? (
          <span className="num">
            <Val v={fmtPct(r.s.hit_rate)} /> <span className="block whitespace-nowrap text-2xs text-muted">{ciText(r.s.hit_rate_ci)}</span>
          </span>
        ) : (
          <NoRec />
        ),
    },
    { key: "pred", header: "Avg predicted", align: "right", cell: (r) => (has(r) ? <Val v={fmtPct(r.s.avg_model_prob)} /> : <NoRec />) },
    {
      key: "roi",
      header: "Simulated ROI [95% CI]",
      align: "right",
      cell: (r) =>
        has(r) ? (
          <span className="num">
            <Val v={fmtSignedPct(r.s.roi)} /> <span className="block whitespace-nowrap text-2xs text-muted">{ciText(r.s.roi_ci, true)}</span>
          </span>
        ) : (
          <NoRec />
        ),
    },
    { key: "pnl", header: "P&L (units)", align: "right", cell: (r) => (has(r) ? <Val v={fmtSigned(r.s.pnl_units)} /> : <NoRec />) },
    { key: "dd", header: "Max drawdown", align: "right", cell: (r) => (has(r) ? <Val v={r.s.max_drawdown_units === null ? null : r.s.max_drawdown_units.toFixed(2)} /> : <NoRec />) },
  ];
  // On the stacked mobile card an empty engine shows only its "n=0" line instead of a column of dashes.
  return cols.map((c) => (c.key === "k" || c.key === "settled" ? c : { ...c, hideOnMobile: empty }));
}

const CAL_COLUMNS: Column<CalibrationBucket>[] = [
  { key: "bucket", header: "Bucket", primary: true, cell: (r) => <span className="num text-ink">{r.bucket}</span> },
  { key: "n", header: "n", align: "right", cell: (r) => <span className="num">{r.n}</span> },
  { key: "pred", header: "Predicted", align: "right", cell: (r) => <Val v={fmtPct(r.predicted)} /> },
  { key: "obs", header: "Observed", align: "right", cell: (r) => (r.n === 0 ? <span className="text-muted">n=0</span> : <Val v={fmtPct(r.observed)} />) },
  { key: "ci", header: "95% CI", align: "right", cell: (r) => (r.ci ? <span className="num">[{fmtPct(r.ci[0])} – {fmtPct(r.ci[1])}]</span> : <NA />) },
];

function ResultsView({ d, offset, setOffset }: { d: ResultsResponse; offset: number; setOffset: (n: number) => void }) {
  const engineRows: Row[] = ENGINES.map((e) => ({ key: ENGINE_LABEL[e] ?? e, s: d.by_engine.find((x) => x.engine.toUpperCase() === e) ?? null }));
  const structureRows: Row[] = ["SGP", "CROSS"].map((k) => ({ key: k, s: d.by_structure.find((x) => x.structure.toUpperCase() === k) ?? null }));
  const calPoints = d.calibration.filter((c) => c.observed !== null);

  return (
    <div className="space-y-3">
      {d.summary.settled === 0 ? (
        <EmptyState title="n=0 — no settled records match these filters.">Hit rate, ROI and drawdown are not reported for an empty sample.</EmptyState>
      ) : (
        <SummaryTiles s={d.summary} />
      )}

      <Panel title="By engine · combination size">
        <DataTable columns={breakdownColumns("Engine")} rows={engineRows} rowKey={(r) => r.key} caption="Results by engine" dense />
      </Panel>

      <Panel title="By structure">
        <DataTable columns={breakdownColumns("Structure")} rows={structureRows} rowKey={(r) => r.key} caption="Results by structure" dense />
      </Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Calibration · predicted vs observed">
          {calPoints.length === 0 ? (
            <EmptyState title="No calibration buckets with settled records." />
          ) : (
            <>
              <CalibrationChart data={d.calibration} />
              <div className="mt-2">
                <DataTable columns={CAL_COLUMNS} rows={d.calibration} rowKey={(r) => r.bucket} caption="Calibration buckets" dense />
              </div>
            </>
          )}
        </Panel>
        <Panel title="Equity curve · simulated, virtual units">
          {d.equity_curve.length === 0 ? <EmptyState title="No settled, priced tickets to chart." /> : <EquityChart data={d.equity_curve} />}
          <p className="mt-2 text-2xs text-muted">
            Selection outcomes tracked: <span className="num text-soft">n={fmtInt(d.selection_outcomes.n)}</span>
            {d.selection_outcomes.note ? ` — ${d.selection_outcomes.note}` : ""}
          </p>
        </Panel>
      </div>

      <Panel title="All tickets" right={<span className="num">{d.total} total</span>}>
        {d.items.length === 0 ? (
          <EmptyState title="No tickets match these filters." />
        ) : (
          <>
            <div className="grid gap-3 xl:grid-cols-2">
              {d.items.map((t) => (
                <TicketCard key={t.id} t={t} />
              ))}
            </div>
            <Pagination offset={offset} limit={LIMIT} total={d.total} onChange={setOffset} />
          </>
        )}
      </Panel>

      <p className="rounded border border-line bg-panel px-3 py-2 text-xs text-soft" data-testid="results-disclaimer">
        {d.disclaimer}
      </p>
    </div>
  );
}

const EMPTY: ResultsFilters = {};

export default function ResultsPage() {
  const [f, setF] = useState<ResultsFilters>(EMPTY);
  const [offset, setOffset] = useState(0);
  const [playerQ, setPlayerQ] = useState("");
  const playerSearch = useDebounced(playerQ.trim(), 300);

  const models = useModels();
  const teams = useTeams();
  const health = useDataHealth();
  const players = useQuery({
    queryKey: ["players", "search", playerSearch],
    queryFn: () => api.players({ q: playerSearch, limit: 20 }),
    enabled: playerSearch.length >= 2,
  });

  const q = useQuery({
    queryKey: ["results", f, offset],
    queryFn: () => api.results({ ...f, limit: LIMIT, offset }),
    placeholderData: (prev) => prev,
  });

  const set = (k: keyof ResultsFilters, v: string) => {
    setOffset(0);
    setF((cur) => ({ ...cur, [k]: v || undefined }));
  };
  const active = Object.values(f).filter(Boolean).length;

  return (
    <div>
      <PageHeader title="Results" sub="Settled paper tickets. Losses are listed with the same detail as wins; nothing is filtered out by outcome." />

      <form
        className="mb-3 grid grid-cols-2 gap-2 rounded border border-line bg-panel p-2 md:grid-cols-4 xl:grid-cols-5"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Result filters"
        data-testid="results-filters"
      >
        <Field label="From">
          <Input type="date" value={f.date_from ?? ""} onChange={(e) => set("date_from", e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={f.date_to ?? ""} onChange={(e) => set("date_to", e.target.value)} />
        </Field>
        <Field label="Season">
          <Select value={f.season ?? ""} onChange={(e) => set("season", e.target.value)}>
            <option value="">All seasons</option>
            {(health.data?.coverage ?? []).map((c) => (
              <option key={String(c.season)} value={String(c.season)}>
                {String(c.season)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Engine / size">
          <Select value={f.engine ?? ""} onChange={(e) => set("engine", e.target.value)}>
            <option value="">All engines</option>
            {ENGINES.map((e) => (
              <option key={e} value={e}>
                {ENGINE_LABEL[e]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Market">
          <Select value={f.market ?? ""} onChange={(e) => set("market", e.target.value)}>
            <option value="">All markets</option>
            {Object.entries(MARKET_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Classification">
          <Select value={f.classification ?? ""} onChange={(e) => set("classification", e.target.value)}>
            <option value="">All classifications</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Model version">
          <Select value={f.model_version_id ?? ""} onChange={(e) => set("model_version_id", e.target.value)}>
            <option value="">All model versions</option>
            {(models.data?.items ?? []).map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.name} {m.version}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Team">
          <Select value={f.team ?? ""} onChange={(e) => set("team", e.target.value)}>
            <option value="">All teams</option>
            {(teams.data?.items ?? []).map((t) => (
              <option key={t.id} value={t.abbr}>
                {t.abbr} · {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Player search">
          <Input type="search" placeholder="Type 2+ letters" value={playerQ} onChange={(e) => setPlayerQ(e.target.value)} />
        </Field>
        <Field label="Player">
          <Select value={f.player_id ?? ""} onChange={(e) => set("player_id", e.target.value)} disabled={!players.data && !f.player_id}>
            <option value="">{players.data ? `All players (${players.data.items.length} matches)` : "All players"}</option>
            {(players.data?.items ?? []).map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
                {p.team_abbr ? ` · ${p.team_abbr}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2 flex items-end justify-between gap-2 md:col-span-4 xl:col-span-5">
          <span className="num text-2xs text-muted">{active} filter(s) active</span>
          <Button
            disabled={active === 0 && !playerQ}
            onClick={() => {
              setF(EMPTY);
              setPlayerQ("");
              setOffset(0);
            }}
          >
            Reset filters
          </Button>
        </div>
      </form>

      <QueryView query={q} rows={8}>
        {(d) => <ResultsView d={d} offset={offset} setOffset={setOffset} />}
      </QueryView>
    </div>
  );
}
