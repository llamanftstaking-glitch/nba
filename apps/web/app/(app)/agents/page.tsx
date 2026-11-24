"use client";

import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/classification-badge";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { fmtDateTimeET, fmtDuration, fmtInt } from "@/lib/format";
import type { AgentItem } from "@/lib/types";

const NEVER = <span className="text-warn">never run</span>;

const COLUMNS: Column<AgentItem>[] = [
  {
    key: "name",
    header: "Agent",
    primary: true,
    cell: (a) => (
      <span>
        <span className="num text-muted">{String(a.number).padStart(2, "0")}</span> <span className="font-medium text-ink">{a.name}</span>
      </span>
    ),
  },
  { key: "status", header: "Status", primary: true, cell: (a) => <StatusBadge value={a.status} /> },
  {
    key: "role",
    header: "Role · trigger",
    cell: (a) => (
      <div className="min-w-0 max-w-xs">
        <div className="break-words text-xs">{a.role}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-2xs text-muted">
          <span>{a.trigger}</span>
          <Badge>{a.deterministic ? "Deterministic" : "LLM-assisted"}</Badge>
        </div>
      </div>
    ),
  },
  { key: "last", header: "Last execution", cell: (a) => (a.last_execution_at ? <Val v={fmtDateTimeET(a.last_execution_at)} /> : NEVER) },
  { key: "dur", header: "Duration", align: "right", cell: (a) => <Val v={fmtDuration(a.duration_ms)} /> },
  { key: "success", header: "Last success", cell: (a) => (a.last_success_at ? <Val v={fmtDateTimeET(a.last_success_at)} /> : a.last_execution_at ? <span className="text-warn">no success recorded</span> : NEVER) },
  {
    key: "summary",
    header: "Summary / error",
    cell: (a) => (
      <div className="min-w-0 max-w-sm break-words text-xs">
        {a.error ? <span className="text-bad">Error: {a.error}</span> : a.last_summary ? a.last_summary : <Val v={null} />}
      </div>
    ),
  },
  { key: "next", header: "Next run", cell: (a) => <Val v={fmtDateTimeET(a.next_run_at)} /> },
  { key: "calls", header: "Provider calls", align: "right", cell: (a) => <Val v={fmtInt(a.provider_calls)} /> },
];

export default function AgentsPage() {
  const q = useQuery({ queryKey: ["agents"], queryFn: api.agents });
  const items = q.data?.items ?? [];
  const count = (s: AgentItem["status"]) => items.filter((a) => a.status === s).length;
  return (
    <div>
      <PageHeader
        title="Agent Operations"
        sub={q.data ? `${items.length} agents · ${count("ok")} ok · ${count("failed")} failed · ${count("abstained")} abstained · ${count("never_run")} never run` : "Research agents"}
      />
      <Panel title="Agents">
        <QueryView query={q} rows={8} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No agents are registered." />}>
          {(d) => (
            <DataTable
              columns={COLUMNS}
              rows={d.items}
              rowKey={(a) => a.id}
              caption="Agent status"
              rowClassName={(a) => (a.status === "failed" ? "bg-bad-dim/20" : undefined)}
            />
          )}
        </QueryView>
      </Panel>
    </div>
  );
}
