"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Gauge, ListOrdered, ShieldAlert, SlidersHorizontal, Table2, Wallet } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { JarvisMark } from "@/components/jarvis/mark";
import { Tile } from "@/components/summary";
import { StatusDot } from "@/components/ui/badge";
import { Button, textLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { Val } from "@/components/ui/na";
import { Label, PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, ErrorState, LoadingState, QueryView } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { DLink } from "@/lib/date";
import { fmtDate, fmtDateTimeET, fmtInt, titleCase } from "@/lib/format";
import { jarvis, type AiBudget, type BudgetPolicy, type BudgetRequest, type UsageRow } from "@/lib/jarvis";

const usd = (v: number | null | undefined, d = 2) => (typeof v === "number" ? `$${v.toFixed(d)}` : null);

function LifetimeBar({ b }: { b: AiBudget }) {
  const cap = b.policy.lifetime_cap_usd || 1;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / cap) * 100))}%`;
  return (
    <div data-testid="budget-lifetime">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
        <span className="num text-ink">
          <span className="text-xl font-semibold">{usd(b.spent_usd)}</span> spent · {usd(b.pending_usd)} pending · {usd(b.remaining_usd)} remaining
        </span>
        <span className="num text-muted">cap {usd(cap)} · usable {usd(b.usable_usd)}</span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-line/70" role="img" aria-label={`${usd(b.spent_usd)} spent and ${usd(b.pending_usd)} pending of a ${usd(cap)} lifetime cap`}>
        <div className="absolute inset-y-0 left-0 bg-info" style={{ width: pct(b.spent_usd) }} />
        <div className="absolute inset-y-0 bg-info/40" style={{ left: pct(b.spent_usd), width: pct(b.pending_usd) }} />
        {b.checkpoints.map((c) => (
          <span key={c.pct} className="absolute inset-y-0 w-px bg-bg" style={{ left: pct(c.usd) }} aria-hidden />
        ))}
        <span className="absolute inset-y-0 w-0.5 bg-warn" style={{ left: pct(b.policy.suspend_at_usd) }} aria-hidden data-testid="budget-suspend-line" />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" data-testid="budget-checkpoints">
        {b.checkpoints.map((c) => (
          <li key={c.pct} className="num flex items-center gap-1.5">
            <span className={c.reached ? "h-1.5 w-1.5 rounded-full bg-info" : "h-1.5 w-1.5 rounded-full bg-faint"} aria-hidden />
            {c.pct}% · {usd(c.usd)} {c.reached ? "reached" : "not reached"}
          </li>
        ))}
        <li className="num flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-warn" aria-hidden />
          Suspends at {usd(b.policy.suspend_at_usd)}
          {b.policy.buffer_released ? " (safety buffer released)" : ""}
        </li>
      </ul>
    </div>
  );
}

function Share({ label, used, of, right }: { label: string; used: number; of: number; right: string }) {
  const pct = of > 0 ? Math.min(100, (used / of) * 100) : 0;
  return (
    <div className="min-w-0" data-testid="budget-bar">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-soft">{label}</span>
        <span className="num text-ink">{right}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line/70" role="img" aria-label={`${label}: ${right}`}>
        <div className={pct >= 90 ? "h-full rounded-full bg-warn" : "h-full rounded-full bg-info"} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const usageColumns = (first: string): Column<UsageRow>[] => [
  { key: "key", header: first, primary: true, cell: (r) => <span className="num break-all font-medium text-ink">{r.key}</span> },
  { key: "req", header: "Requests", align: "right", cell: (r) => <span className="num">{fmtInt(r.requests)}</span> },
  { key: "in", header: "Input tokens", align: "right", cell: (r) => <span className="num">{fmtInt(r.input_tokens)}</span> },
  { key: "out", header: "Output tokens", align: "right", cell: (r) => <span className="num">{fmtInt(r.output_tokens)}</span> },
  { key: "cr", header: "Cached (read)", align: "right", cell: (r) => <span className="num">{fmtInt(r.cache_read_tokens)}</span> },
  { key: "cw", header: "Cached (write)", align: "right", cell: (r) => <span className="num">{fmtInt(r.cache_write_tokens)}</span> },
  { key: "usd", header: "USD", align: "right", cell: (r) => <span className="num font-semibold text-ink">{usd(r.usd, 4)}</span> },
];

const REQ_COLUMNS: Column<BudgetRequest>[] = [
  { key: "at", header: "Time", primary: true, cell: (r) => <span className="num text-ink">{fmtDateTimeET(r.at) ?? "—"}</span> },
  { key: "status", header: "Status", primary: true, cell: (r) => <StatusDot tone={r.status === "settled" ? "accent" : r.status === "released" ? "neutral" : "warn"}>{titleCase(r.status)}</StatusDot> },
  { key: "bucket", header: "Bucket", cell: (r) => titleCase(r.bucket) },
  { key: "model", header: "Model", cell: (r) => <span className="num break-all">{r.model}</span> },
  { key: "task", header: "Task", cell: (r) => <span className="break-words">{r.task}</span> },
  { key: "res", header: "Reserved", align: "right", cell: (r) => <Val v={usd(r.reserved_usd, 4)} /> },
  { key: "act", header: "Actual", align: "right", cell: (r) => <Val v={usd(r.actual_usd, 4)} /> },
  { key: "tok", header: "Tokens in / out / cached", align: "right", cell: (r) => <span className="num whitespace-nowrap">{fmtInt(r.input_tokens) ?? "—"} / {fmtInt(r.output_tokens) ?? "—"} / {fmtInt(r.cache_read_tokens) ?? "—"}</span> },
  { key: "err", header: "Error", cell: (r) => (r.error ? <span className="break-words text-xs text-bad">{r.error}</span> : <span className="text-muted">none</span>) },
];

/** A switch whose risky direction needs a second, explicit click. */
function Toggle({ label, help, on, onChange, confirm, pending, testId, tone }: { label: string; help: ReactNode; on: boolean; onChange: (next: boolean) => void; confirm?: string; pending: boolean; testId: string; tone?: "danger" }) {
  const [armed, setArmed] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-raised/40 p-3" data-testid={testId} data-on={on ? "1" : "0"}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">{label}</span>
          <StatusDot tone={on ? (tone === "danger" ? "warn" : "accent") : "neutral"}>{on ? "On" : "Off"}</StatusDot>
        </div>
        <p className="mt-0.5 text-xs text-muted">{help}</p>
        {armed && confirm && <p className="mt-1 text-sm text-warn">{confirm}</p>}
      </div>
      {armed ? (
        <span className="flex gap-2">
          <Button variant="danger" size="md" disabled={pending} onClick={() => { setArmed(false); onChange(!on); }} data-testid={`${testId}-confirm`}>
            Confirm
          </Button>
          <Button variant="ghost" size="md" onClick={() => setArmed(false)}>
            Cancel
          </Button>
        </span>
      ) : (
        <Button variant={on && tone === "danger" ? "primary" : "outline"} size="md" disabled={pending} onClick={() => (confirm ? setArmed(true) : onChange(!on))} data-testid={`${testId}-btn`}>
          {on ? "Turn off" : "Turn on"}
        </Button>
      )}
    </div>
  );
}

function LimitsForm({ policy, onSave, pending, error }: { policy: BudgetPolicy; onSave: (body: Partial<BudgetPolicy>) => void; pending: boolean; error: string | null }) {
  const [daily, setDaily] = useState(String(policy.daily_cap_usd));
  const [lifetime, setLifetime] = useState(String(policy.lifetime_cap_usd));
  const [alloc, setAlloc] = useState<Record<string, string>>(Object.fromEntries(Object.entries(policy.allocations).map(([k, v]) => [k, String(v)])));
  const [per, setPer] = useState<Record<string, string>>(Object.fromEntries(Object.entries(policy.per_request_cap_usd).map(([k, v]) => [k, String(v)])));
  const [local, setLocal] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nums = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]));
    const body = { daily_cap_usd: Number(daily), lifetime_cap_usd: Number(lifetime), allocations: nums(alloc), per_request_cap_usd: nums(per) };
    const all = [body.daily_cap_usd, body.lifetime_cap_usd, ...Object.values(body.allocations), ...Object.values(body.per_request_cap_usd)];
    if (all.some((v) => !Number.isFinite(v) || v < 0)) return setLocal("Every limit must be a number of zero or more.");
    setLocal(null);
    onSave(body);
  };
  const num = (value: string, set: (v: string) => void, name: string, max?: number) => <Input type="number" step="0.01" min="0" max={max} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} name={name} />;
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="budget-limits-form">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Daily cap (USD)">{num(daily, setDaily, "daily_cap_usd")}</Field>
        <Field label="Lifetime cap (USD, max 100)">{num(lifetime, setLifetime, "lifetime_cap_usd", 100)}</Field>
      </div>
      <div>
        <Label>Allocations (USD)</Label>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.keys(alloc).map((k) => (
            <Field key={k} label={titleCase(k)}>{num(alloc[k] ?? "", (v) => setAlloc((a) => ({ ...a, [k]: v })), `allocation_${k}`)}</Field>
          ))}
        </div>
      </div>
      <div>
        <Label>Per-request caps (USD)</Label>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.keys(per).map((k) => (
            <Field key={k} label={titleCase(k)}>{num(per[k] ?? "", (v) => setPer((a) => ({ ...a, [k]: v })), `per_request_${k}`)}</Field>
          ))}
        </div>
      </div>
      {(local || error) && (
        <p role="alert" className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad ring-1 ring-inset ring-bad/40" data-testid="budget-form-error">
          {local ?? error}
        </p>
      )}
      <Button type="submit" variant="primary" size="md" disabled={pending} data-testid="budget-save">
        {pending ? "Saving…" : "Save limits"}
      </Button>
    </form>
  );
}

function View({ b }: { b: AiBudget }) {
  const qc = useQueryClient();
  const requests = useQuery({ queryKey: ["ai-budget", "requests"], queryFn: () => jarvis.budgetRequests(50) });
  const [formError, setFormError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["ai-budget"] });
    void qc.invalidateQueries({ queryKey: ["jarvis", "state"] });
  };
  const toggle = useMutation({ mutationFn: (body: Partial<BudgetPolicy>) => jarvis.updateBudget(body), onSuccess: () => { setToggleError(null); refresh(); }, onError: (e) => setToggleError(e instanceof ApiError ? e.message : "The change could not be saved.") });
  const save = useMutation({ mutationFn: (body: Partial<BudgetPolicy>) => jarvis.updateBudget(body), onSuccess: () => { setFormError(null); setEditing(false); refresh(); }, onError: (e) => setFormError(e instanceof ApiError ? e.message : "The limits could not be saved.") });
  const p = b.policy;
  const daily = b.daily.slice(-30);

  return (
    <div className="space-y-5" data-testid="ai-budget">
      <Panel title="Lifetime budget" icon={Wallet} right={<StatusDot tone={b.state === "ok" ? "accent" : "warn"} data-testid="budget-state">{b.state === "ok" ? "Within budget" : titleCase(b.state)}</StatusDot>}>
        <LifetimeBar b={b} />
        <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
          <Share label="Today vs daily cap" used={b.today_usd} of={p.daily_cap_usd} right={`${usd(b.today_usd)} of ${usd(p.daily_cap_usd)}`} />
          <div className="num text-sm text-muted">This month {usd(b.month_usd)}</div>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={ListOrdered} label="Requests" sub={`${fmtInt(b.input_tokens)} in · ${fmtInt(b.output_tokens)} out`}>{fmtInt(b.requests)}</Tile>
        <Tile icon={Gauge} label="Cache savings" sub={`${fmtInt(b.cache_read_tokens)} cached tokens read`}>{usd(b.cache_savings_usd)}</Tile>
        <Tile icon={Wallet} label="Average per day"><Val v={usd(b.avg_usd_per_day)} /></Tile>
        <Tile icon={Gauge} label="Est. days remaining" sub="at the average daily spend"><Val v={b.est_days_remaining === null ? null : b.est_days_remaining.toFixed(0)} /></Tile>
      </div>

      <Panel title="Controls" icon={ShieldAlert} id="controls">
        <div className="space-y-2">
          <Toggle testId="budget-pause" tone="danger" label="Emergency AI pause" on={p.paused} pending={toggle.isPending} onChange={(v) => toggle.mutate({ paused: v })} confirm={p.paused ? "Resume model requests?" : "Pause every model request now? Slash commands and data collection keep working."} help="Stops all model requests immediately. Stored-data commands and data collection continue." />
          <Toggle testId="budget-briefings" label="Proactive briefings" on={p.notifications} pending={toggle.isPending} onChange={(v) => toggle.mutate({ notifications: v })} help="When off, scheduled briefings are not written; data collection continues." />
          <Toggle testId="budget-buffer" tone="danger" label="Release safety buffer" on={p.buffer_released} pending={toggle.isPending} onChange={(v) => toggle.mutate({ buffer_released: v })} confirm={p.buffer_released ? "Restore the safety buffer?" : `Allow spending the last ${usd(p.lifetime_cap_usd - p.suspend_at_usd)} up to the ${usd(p.lifetime_cap_usd)} cap?`} help={`Requests normally stop at ${usd(p.suspend_at_usd)}. Releasing the buffer allows spending the remaining ${usd(p.lifetime_cap_usd - p.suspend_at_usd)} up to the cap.`} />
        </div>
        {toggleError && <p role="alert" className="mt-2 text-sm text-bad" data-testid="budget-toggle-error">{toggleError}</p>}
        <p className="num mt-2 text-xs text-muted">Policy last updated {fmtDateTimeET(p.updated_at) ?? "—"} by {p.updated_by ?? "—"}</p>
      </Panel>

      <Panel title="Allocations" icon={SlidersHorizontal} right={<Button onClick={() => setEditing((v) => !v)} aria-expanded={editing} data-testid="budget-edit">{editing ? "Close" : "Edit limits"}</Button>}>
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2" data-testid="budget-buckets">
          {b.buckets.map((k) => (
            <Share key={k.bucket} label={titleCase(k.bucket)} used={k.used_usd} of={k.allocation_usd} right={`${usd(k.used_usd)} of ${usd(k.allocation_usd)}`} />
          ))}
        </div>
        {editing && (
          <div className="mt-4 border-t border-line/50 pt-4">
            <LimitsForm policy={p} onSave={(body) => save.mutate(body)} pending={save.isPending} error={formError} />
          </div>
        )}
      </Panel>

      <Panel title="Daily spend · last 30 days" icon={Gauge}>
        {daily.length === 0 ? (
          <EmptyState title="No model spend has been recorded yet.">The chart fills as model requests are settled.</EmptyState>
        ) : (
          <div className="h-56 w-full" role="img" aria-label="Daily model spend in US dollars for the last 30 days." data-testid="budget-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#1A2732" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d) ?? d} stroke="#22313E" tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} minTickGap={24} />
                <YAxis stroke="#22313E" tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} width={44} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} contentStyle={{ background: "#121F2B", border: "1px solid #22313E", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#C7D1DD" }} itemStyle={{ color: "#F3F6FA" }} labelFormatter={(d) => fmtDate(String(d), { year: true }) ?? String(d)} formatter={(v) => [typeof v === "number" ? `$${v.toFixed(4)}` : String(v), "Spend"]} />
                <Bar dataKey="usd" fill="#7DC4F0" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {(
        [
          ["By model", "Model", b.by_model],
          ["By task", "Task", b.by_task],
          ["By agent", "Agent", b.by_agent],
        ] as const
      ).map(([title, first, rows]) => (
        <Panel key={title} title={title} icon={Table2}>
          {rows.length === 0 ? <EmptyState title={`No requests recorded ${title.toLowerCase()} yet.`} /> : <DataTable columns={usageColumns(first)} rows={rows} rowKey={(r) => r.key} caption={title} dense mobileLimit={4} />}
        </Panel>
      ))}

      <Panel title="Price table (USD per million tokens)" icon={Table2}>
        <DataTable
          columns={[
            { key: "m", header: "Model", primary: true, cell: (r: [string, AiBudget["prices"][string]]) => <span className="num break-all font-medium text-ink">{r[0]}</span> },
            { key: "in", header: "Input", align: "right", cell: (r) => <span className="num">{usd(r[1].in)}</span> },
            { key: "out", header: "Output", align: "right", cell: (r) => <span className="num">{usd(r[1].out)}</span> },
            { key: "cr", header: "Cache read", align: "right", cell: (r) => <span className="num">{usd(r[1].cache_read)}</span> },
            { key: "cw", header: "Cache write", align: "right", cell: (r) => <span className="num">{usd(r[1].cache_write)}</span> },
          ]}
          rows={Object.entries(b.prices)}
          rowKey={(r) => r[0]}
          caption="Model prices"
          dense
        />
        {b.notes.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-xs text-muted" data-testid="budget-notes">
            {b.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent requests" icon={ListOrdered}>
        <QueryView query={requests} rows={4} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No model requests have been recorded yet." />}>
          {(d) => <DataTable columns={REQ_COLUMNS} rows={d.items} rowKey={(r) => String(r.id)} caption="Recent model requests" dense mobileLimit={5} />}
        </QueryView>
      </Panel>
    </div>
  );
}

export default function AiBudgetPage() {
  const q = useQuery({ queryKey: ["ai-budget"], queryFn: jarvis.budget, retry: false });
  const forbidden = q.error instanceof ApiError && q.error.status === 403;
  return (
    <div>
      <PageHeader
        title="AI Budget"
        sub="Spend, limits and controls for every model request the platform makes. Owner only."
        right={
          <DLink href="/jarvis" className={textLink}>
            <JarvisMark className="h-4 w-4" /> JARVIS <ArrowRight className="h-3 w-3" aria-hidden />
          </DLink>
        }
      />
      {q.isPending ? (
        <LoadingState rows={6} />
      ) : forbidden ? (
        <div role="alert" className="rounded-lg bg-card p-5 ring-1 ring-inset ring-warn/40" data-testid="budget-forbidden">
          <p className="font-display text-lg font-semibold uppercase tracking-wide text-warn">Owner access required</p>
          <p className="mt-1 text-sm text-soft">{q.error.message}</p>
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <View b={q.data} />
      )}
    </div>
  );
}
