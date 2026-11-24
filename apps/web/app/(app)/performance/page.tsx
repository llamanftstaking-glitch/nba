"use client";

import { BacktestsTable, ModelsTable } from "@/components/registry-tables";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { DLink } from "@/lib/date";
import { useBacktests, useModels } from "@/lib/queries";

export default function PerformancePage() {
  const models = useModels();
  const backtests = useBacktests();
  return (
    <div className="space-y-3">
      <PageHeader
        title="Performance"
        sub="Model registry and backtest evidence. Paper-ticket outcomes are on the Results page."
        right={
          <DLink href="/results" className="text-xs text-accent hover:underline">
            Paper-ticket results →
          </DLink>
        }
      />
      <Panel title="Model registry">
        <QueryView query={models} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No models are registered." />}>
          {(d) => <ModelsTable rows={d.items} />}
        </QueryView>
      </Panel>
      <Panel title="Backtests">
        <QueryView query={backtests} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No backtests have been run." />}>
          {(d) => <BacktestsTable rows={d.items} />}
        </QueryView>
      </Panel>
    </div>
  );
}
