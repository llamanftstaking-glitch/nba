"use client";

import { useQuery } from "@tanstack/react-query";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ShareBar } from "@/components/ui/meter";
import { Val } from "@/components/ui/na";
import { BulletList, PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { Tile } from "@/components/summary";
import { api } from "@/lib/api";
import { useSelectedDate } from "@/lib/date";
import { fmtDate, fmtInt, fmtPct, fmtSigned } from "@/lib/format";
import type { Exposure } from "@/lib/types";

type Pair = Exposure["pairwise"][number];

const PAIR_COLUMNS: Column<Pair>[] = [
  { key: "a", header: "Ticket A", primary: true, cell: (r) => <span className="text-ink">{r.a}</span> },
  { key: "b", header: "Ticket B", primary: true, cell: (r) => <span className="text-ink">× {r.b}</span> },
  { key: "shared", header: "Shared legs", align: "right", cell: (r) => <span className="num">{r.shared_legs}</span> },
  { key: "rho", header: "Outcome dependency (ρ)", align: "right", cell: (r) => <Val v={r.rho === null ? null : `${r.rho > 0 ? "+" : ""}${r.rho.toFixed(2)}`} /> },
];

function Bars({ title, rows }: { title: string; rows: { label: string; tickets: number; share: number }[] }) {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <EmptyState title="No repeated exposure in this group." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <ShareBar key={r.label} label={r.label} value={r.share} right={`${r.tickets} tickets · ${fmtPct(r.share, 0)}`} tone={r.share >= 0.5 ? "warn" : "info"} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function View({ d }: { d: Exposure }) {
  if (d.n_tickets === 0) {
    return (
      <EmptyState title="No open paper tickets for this date.">Shared-risk analysis appears once at least one paper ticket is saved for the slate.</EmptyState>
    );
  }
  const sim = d.simulation;
  return (
    <div className="space-y-3">
      <p className="rounded border border-warn/50 bg-warn-dim/50 px-3 py-2 text-xs text-warn">
        Tickets that share a player, team, game or selection tend to win and lose together. Holding more overlapping tickets raises the chance
        that at least one wins without improving the expected aggregate result.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <Bars title="Repeated player exposure" rows={d.players.map((p) => ({ label: p.name, tickets: p.tickets, share: p.share }))} />
        <Bars title="Repeated team exposure" rows={d.teams.map((p) => ({ label: p.abbr, tickets: p.tickets, share: p.share }))} />
        <Bars title="Repeated game exposure" rows={d.games.map((p) => ({ label: p.label, tickets: p.tickets, share: p.share }))} />
        <Bars title="Repeated selection exposure" rows={d.selections.map((p) => ({ label: p.label, tickets: p.tickets, share: p.share }))} />
      </div>

      <Panel title="Simulation · chance of at least one win versus expected aggregate result" tone="warn">
        {!sim ? (
          <EmptyState title="Simulation not available for this set of tickets." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="exposure-sim">
              <Tile label="P(at least one ticket wins)" sub="with shared legs modelled jointly">
                <Val v={fmtPct(sim.p_at_least_one)} />
              </Tile>
              <Tile label="Expected aggregate P&L (units)" sub={`p10 ${fmtSigned(sim.pnl_p10) ?? "—"} · p90 ${fmtSigned(sim.pnl_p90) ?? "—"}`}>
                <Val v={fmtSigned(sim.expected_pnl_units)} />
              </Tile>
              <Tile label="P(all tickets lose)">
                <Val v={fmtPct(sim.p_all_lose)} />
              </Tile>
              <Tile label="Naive figure ignoring overlap" sub="comparison only — overstates diversification">
                <Val v={fmtPct(sim.independent_p_at_least_one)} />
              </Tile>
            </div>
            <p className="mt-2 text-xs text-soft">
              A high chance that at least one ticket wins says nothing about the aggregate: compare it with the expected P&L and its p10–p90 range above.
            </p>
            <p className="num mt-1 text-2xs text-muted">
              {fmtInt(sim.draws)} draws · seed {sim.seed}
            </p>
          </>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Pairwise ticket dependency">
          {d.pairwise.length === 0 ? (
            <EmptyState title="No pair of tickets shares a leg." />
          ) : (
            <DataTable columns={PAIR_COLUMNS} rows={d.pairwise} rowKey={(_, i) => i} caption="Pairwise ticket dependency" dense />
          )}
        </Panel>
        <Panel title="Shared assumptions">
          {d.shared_assumptions.length === 0 ? <EmptyState title="No shared assumptions were identified." /> : <BulletList items={d.shared_assumptions} tone="warn" />}
        </Panel>
      </div>

      <Panel title="Notes">{d.notes.length === 0 ? <p className="text-xs text-muted">No notes provided.</p> : <BulletList items={d.notes} />}</Panel>
    </div>
  );
}

export default function ExposurePage() {
  const date = useSelectedDate();
  const q = useQuery({ queryKey: ["exposure", date ?? "today"], queryFn: () => api.exposure(date) });
  return (
    <div>
      <PageHeader
        title="Shared-Risk Monitor"
        sub={q.data ? `Paper tickets for ${fmtDate(q.data.date, { weekday: true, year: true }) ?? q.data.date} · ${q.data.n_tickets} ticket(s)` : "Overlap between paper tickets"}
      />
      <QueryView query={q} rows={6}>
        {(d) => <View d={d} />}
      </QueryView>
    </div>
  );
}
