"use client";

import { useState } from "react";
import { ClassificationBadge } from "@/components/classification-badge";
import { ProbInterval } from "@/components/prob";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useSelectedDate } from "@/lib/date";
import { fmtInt, fmtNum, fmtPct } from "@/lib/format";
import { useCombos } from "@/lib/queries";
import type { Combo } from "@/lib/types";

const CATS = [
  ["double", "2-Leg"],
  ["triple", "3-Leg"],
  ["quad", "4-Leg"],
  ["five", "5-Leg"],
  ["six", "6-Leg"],
  ["sgp", "Same-Game"],
  ["cross", "Cross-Game"],
] as const;

const COLUMNS: Column<Combo>[] = [
  { key: "name", header: "Combination", primary: true, cell: (c) => <span className="font-medium text-ink">{c.name}</span> },
  { key: "class", header: "Class", primary: true, cell: (c) => <ClassificationBadge value={c.classification} invalidated={c.invalidated} /> },
  { key: "method", header: "Method", cell: (c) => <span className="break-words">{c.correlation.method}</span> },
  { key: "seed", header: "Seed", align: "right", cell: (c) => <Val v={c.correlation.seed} /> },
  { key: "draws", header: "Draws", align: "right", cell: (c) => <Val v={fmtInt(c.correlation.draws)} /> },
  { key: "se", header: "MC error", align: "right", cell: (c) => <Val v={c.correlation.mc_se === null ? null : fmtNum(c.correlation.mc_se, 4)} /> },
  { key: "joint", header: "Joint probability", align: "right", cell: (c) => <ProbInterval prob={c.joint_prob} low={c.joint_low} high={c.joint_high} /> },
  { key: "ind", header: "Independent product", align: "right", cell: (c) => <Val v={fmtPct(c.independent_prob)} /> },
];

export default function SimulationsPage() {
  const date = useSelectedDate();
  const [cat, setCat] = useState<string>("double");
  const q = useCombos(cat, date);
  return (
    <div>
      <PageHeader title="Simulations" sub="Simulation metadata behind each combination: method, seed, number of draws and Monte Carlo standard error." />
      <Tabs
        label="Category"
        value={cat}
        onChange={setCat}
        items={CATS.map(([id, label]) => ({ id, label, count: q.data ? (q.data.counts[id] ?? 0) : null }))}
      />
      <Panel title="Simulation runs" className="mt-3">
        <QueryView query={q} rows={4} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No combinations in this category for the date." />}>
          {(d) => <DataTable columns={COLUMNS} rows={d.items} rowKey={(c) => c.uid} caption="Simulation metadata" dense />}
        </QueryView>
      </Panel>
    </div>
  );
}
