"use client";

import { BacktestsTable } from "@/components/registry-tables";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { useBacktests } from "@/lib/queries";

export default function BacktestingPage() {
  const q = useBacktests();
  return (
    <div>
      <PageHeader title="Backtesting" sub="Historical evaluations recorded by the API. Sample sizes are shown for every run." />
      <Panel title="Backtest runs">
        <QueryView query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No backtests have been run." />}>
          {(d) => <BacktestsTable rows={d.items} />}
        </QueryView>
      </Panel>
    </div>
  );
}
