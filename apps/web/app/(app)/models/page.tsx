"use client";

import { ArrowRight, Boxes, History } from "lucide-react";
import { BacktestsTable, ModelsTable } from "@/components/registry-tables";
import { textLink } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { DLink } from "@/lib/date";
import { useBacktests, useModels } from "@/lib/queries";

export default function ModelsPage() {
  const models = useModels();
  const backtests = useBacktests();
  return (
    <div className="space-y-9">
      <PageHeader
        title="Model Registry"
        sub="Registered models, their status, data periods, latest evaluation and stated limitations."
        right={
          <DLink href="/backtesting" className={textLink}>
            Backtesting <ArrowRight className="h-3 w-3" aria-hidden />
          </DLink>
        }
      />
      <Panel title="Models" icon={Boxes}>
        <QueryView query={models} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No models are registered." />}>
          {(d) => <ModelsTable rows={d.items} />}
        </QueryView>
      </Panel>
      <Panel title="Backtests" icon={History}>
        <QueryView query={backtests} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No backtests have been run." />}>
          {(d) => <BacktestsTable rows={d.items} />}
        </QueryView>
      </Panel>
    </div>
  );
}
