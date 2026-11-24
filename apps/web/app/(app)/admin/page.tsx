"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/classification-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api, ApiError } from "@/lib/api";
import { fmtDateTimeET, fmtInt } from "@/lib/format";
import type { Operations } from "@/lib/types";

type Job = Operations["recent_jobs"][number];
type Beat = Operations["heartbeats"][number];
type Sched = Operations["schedule"][number];

const JOB_COLUMNS: Column<Job>[] = [
  { key: "name", header: "Job", primary: true, cell: (j) => <span className="font-medium text-ink">{j.name}</span> },
  { key: "status", header: "Status", primary: true, cell: (j) => <StatusBadge value={j.status} /> },
  { key: "id", header: "ID", cell: (j) => <span className="num break-all">{String(j.id)}</span> },
  { key: "attempts", header: "Attempts", align: "right", cell: (j) => <Val v={fmtInt(j.attempts)} /> },
  { key: "created", header: "Created", cell: (j) => <Val v={fmtDateTimeET(j.created_at)} /> },
  { key: "finished", header: "Finished", cell: (j) => (j.finished_at ? <Val v={fmtDateTimeET(j.finished_at)} /> : <span className="text-muted">not finished</span>) },
  { key: "error", header: "Error", cell: (j) => (j.error ? <span className="break-words text-xs text-bad">{j.error}</span> : <span className="text-muted">none</span>) },
];

const BEAT_COLUMNS: Column<Beat>[] = [
  { key: "worker", header: "Worker", primary: true, cell: (b) => <span className="num font-medium text-ink">{b.worker}</span> },
  { key: "alive", header: "State", primary: true, cell: (b) => <Badge tone={b.alive ? "accent" : "bad"}>{b.alive ? "Alive" : "No heartbeat"}</Badge> },
  { key: "role", header: "Role", cell: (b) => b.role },
  { key: "beat", header: "Last heartbeat", cell: (b) => <Val v={fmtDateTimeET(b.beat_at)} /> },
];

const SCHED_COLUMNS: Column<Sched>[] = [
  { key: "name", header: "Schedule", primary: true, cell: (s) => <span className="font-medium text-ink">{s.name}</span> },
  { key: "desc", header: "Description", cell: (s) => <span className="break-words">{s.description}</span> },
  { key: "next", header: "Next run (ET)", cell: (s) => <Val v={s.next_run_et} /> },
];

function PauseControl({ paused }: { paused: boolean }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (next: boolean) => api.setPaused(next),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["operations"] }),
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-testid="pause-control">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink">Scheduled research</span>
          <Badge tone={paused ? "warn" : "accent"}>{paused ? "Paused" : "Running"}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {paused ? "No scheduled jobs will start until research is resumed. Published editions go stale." : "Jobs run on the schedule below."}
        </p>
        {m.isError && (
          <p role="alert" className="mt-1 text-xs text-bad">
            {m.error instanceof ApiError ? m.error.message : "Request failed."}
          </p>
        )}
      </div>
      <Button variant={paused ? "primary" : "danger"} size="md" disabled={m.isPending} onClick={() => m.mutate(!paused)} data-testid="pause-toggle">
        {m.isPending ? "Updating…" : paused ? "Resume research" : "Pause research"}
      </Button>
    </div>
  );
}

export default function AdminPage() {
  const q = useQuery({ queryKey: ["operations"], queryFn: api.operations, refetchInterval: 30_000 });
  const ready = useQuery({ queryKey: ["ready"], queryFn: api.ready, refetchInterval: 30_000 });
  return (
    <div className="space-y-4">
      <PageHeader title="Operations Admin" sub="Owner-only controls. Pausing affects research jobs only; this system has no execution path." />
      <Panel title="Service readiness">
        <QueryView query={ready} rows={1}>
          {(r) => (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge value={r.status} />
              {Object.entries(r.checks).map(([k, ok]) => (
                <Badge key={k} tone={ok ? "accent" : "bad"}>
                  {k}: {ok ? "up" : "down"}
                </Badge>
              ))}
            </div>
          )}
        </QueryView>
      </Panel>
      <QueryView query={q} rows={8}>
        {(d) => (
          <div className="space-y-4">
            <Panel title="Pause toggle" tone={d.paused ? "warn" : undefined}>
              <PauseControl paused={d.paused} />
            </Panel>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Heartbeats">
                {d.heartbeats.length === 0 ? <EmptyState title="No worker has reported a heartbeat." /> : <DataTable columns={BEAT_COLUMNS} rows={d.heartbeats} rowKey={(b) => b.worker} caption="Worker heartbeats" dense />}
              </Panel>
              <Panel title="Schedule">
                {d.schedule.length === 0 ? <EmptyState title="No schedule is configured." /> : <DataTable columns={SCHED_COLUMNS} rows={d.schedule} rowKey={(s) => s.name} caption="Schedule" dense />}
              </Panel>
            </div>
            <Panel
              title="Recent jobs"
              right={
                <span className={d.dead_letter > 0 ? "num text-bad" : "num"}>
                  dead letter: {d.dead_letter}
                </span>
              }
            >
              {d.recent_jobs.length === 0 ? <EmptyState title="No jobs have run yet." /> : <DataTable columns={JOB_COLUMNS} rows={d.recent_jobs} rowKey={(j) => String(j.id)} caption="Recent jobs" dense />}
            </Panel>
          </div>
        )}
      </QueryView>
    </div>
  );
}
