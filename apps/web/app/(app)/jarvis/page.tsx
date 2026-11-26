"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, PanelRight, Plus, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { ContextChips, JarvisConversationView, ToolActivity } from "@/components/jarvis/conversation";
import { Markdown } from "@/components/jarvis/markdown";
import { JarvisMark } from "@/components/jarvis/mark";
import { JarvisPill } from "@/components/jarvis/status";
import { pillState, useJarvisChat, useJarvisState, type LiveTool } from "@/components/jarvis/use-jarvis";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { Field, Input, Select } from "@/components/ui/field";
import { Label } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { Sheet } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DLink, useSelectedDate } from "@/lib/date";
import { fmtDate, fmtDateTimeET, titleCase } from "@/lib/format";
import { jarvis, type JarvisConversation, type JarvisState } from "@/lib/jarvis";

const usd = (v: number | null | undefined) => (typeof v === "number" ? `$${v.toFixed(2)}` : "—");

/** Two-step destructive action: the first click arms it, the second confirms. */
function ConfirmButton({ label, confirmLabel = "Confirm delete", onConfirm, disabled, testId }: { label: ReactNode; confirmLabel?: string; onConfirm: () => void; disabled?: boolean; testId?: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" disabled={disabled} onClick={() => setArmed(true)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-faint hover:bg-raised hover:text-ink md:h-8 md:w-8" data-testid={testId}>
        {label}
      </button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button variant="danger" onClick={() => { setArmed(false); onConfirm(); }} data-testid={testId ? `${testId}-confirm` : undefined}>
        {confirmLabel}
      </Button>
      <Button variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}

function LeftColumn({ activeId, onSelect, onNew, onSuggest, tab, setTab }: { activeId: string | null; onSelect: (id: string) => void; onNew: () => void; onSuggest: (text: string) => void; tab: string; setTab: (t: string) => void }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["jarvis", "conversations"], queryFn: () => jarvis.conversations(30) });
  const suggestions = useQuery({ queryKey: ["jarvis", "suggestions", {}], queryFn: () => jarvis.suggestions() });
  const del = useMutation({
    mutationFn: (id: number | string) => jarvis.remove(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ["jarvis", "conversations"] });
      if (String(id) === activeId) onNew();
    },
  });
  // A conversation gets its title from its first message; ones opened but never used are not listed.
  const started = (c: { id: number | string; title: string | null }) => Boolean(c.title) || String(c.id) === activeId;
  return (
    <div className="flex min-h-0 flex-col gap-4" data-testid="jarvis-left">
      <Button variant="primary" size="md" onClick={onNew} data-testid="jarvis-new">
        <Plus className="h-4 w-4" aria-hidden /> New conversation
      </Button>
      <div className="min-h-0">
        <Label>History</Label>
        <QueryView query={list} rows={3} isEmpty={(d) => d.items.filter(started).length === 0} empty={<p className="text-sm text-muted">No conversations yet. The first question starts one.</p>}>
          {(d) => (
            <ul className="max-h-[38vh] space-y-0.5 overflow-y-auto" data-testid="jarvis-history">
              {d.items.filter(started).map((c) => (
                <li key={c.id} className={cn("flex items-center gap-1 rounded-md", String(c.id) === activeId && tab === "conversation" ? "bg-accent/10 ring-1 ring-inset ring-accent/40" : "hover:bg-raised/60")} data-testid="jarvis-history-item">
                  <button type="button" className="min-w-0 flex-1 px-2.5 py-2 text-left" onClick={() => onSelect(String(c.id))}>
                    <span className="block truncate text-sm font-medium text-ink">{c.title || "Untitled conversation"}</span>
                    <span className="num block text-xs text-muted">{fmtDateTimeET(c.updated_at) ?? "—"}</span>
                  </button>
                  <ConfirmButton label={<Trash2 className="h-3.5 w-3.5" aria-label="Delete conversation" />} onConfirm={() => del.mutate(c.id)} disabled={del.isPending} testId="jarvis-delete" />
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </div>
      <div>
        <Label>Suggested research commands</Label>
        <ul className="space-y-1">
          {(suggestions.data?.items ?? []).slice(0, 6).map((s) => (
            <li key={s.text}>
              <button type="button" onClick={() => onSuggest(s.text)} className="flex min-h-[44px] w-full items-center rounded-md bg-raised/50 px-2.5 text-left text-sm text-soft hover:bg-raised hover:text-ink md:min-h-9" title={s.text}>
                <span className="min-w-0 truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <nav aria-label="JARVIS sections" className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line/60 pt-3 text-sm">
        {(["memory", "briefings", "events"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("min-h-[44px] font-medium md:min-h-0", tab === t ? "text-ink" : "text-accent hover:underline")}>
            {titleCase(t)}
          </button>
        ))}
        <DLink href="/admin/ai-budget" className="inline-flex min-h-[44px] items-center font-medium text-accent hover:underline md:min-h-0" data-testid="jarvis-budget-link">
          AI budget
        </DLink>
      </nav>
    </div>
  );
}

function RightColumn({ conversation, tools, streaming, state, lastModel }: { conversation: JarvisConversation | null; tools: LiveTool[]; streaming: boolean; state: JarvisState | undefined; lastModel: string | null }) {
  const date = useSelectedDate();
  const cc = useQuery({ queryKey: ["command-center", date ?? "today"], queryFn: () => api.commandCenter(date) });
  const b = state?.budget;
  return (
    <div className="space-y-5" data-testid="jarvis-right">
      <div>
        <Label>Research context</Label>
        {conversation ? <ContextChips context={conversation.context} /> : <p className="text-sm text-muted">No conversation selected. A new conversation starts without page context.</p>}
      </div>
      <div>
        <Label>Tool activity · this turn</Label>
        {tools.length === 0 ? <p className="text-sm text-muted">{streaming ? "No tool call has been reported yet." : "No tool calls in the current turn."}</p> : <ToolActivity tools={tools} />}
      </div>
      <div>
        <Label>Data freshness</Label>
        <p className="num text-sm text-soft">{cc.data ? `Latest research refresh ${fmtDateTimeET(cc.data.latest_refresh_at) ?? "not available"}` : cc.isError ? "Freshness not available" : "Loading…"}</p>
      </div>
      <div>
        <Label>Model in use</Label>
        {state ? (
          <dl className="space-y-0.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Standard</dt><dd className="num break-all text-right text-soft">{state.models.standard}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Deep review</dt><dd className="num break-all text-right text-soft">{state.models.deep}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Last answer</dt><dd className="num break-all text-right text-soft">{lastModel === "deterministic" ? "stored data, no model" : (lastModel ?? "—")}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-muted">—</p>
        )}
        {state && !state.models_verified && <p className="mt-1 text-xs text-warn">Model availability has not been verified with the provider.</p>}
      </div>
      <div data-testid="jarvis-budget">
        <Label>AI budget</Label>
        {b && state ? (
          <>
            <dl className="grid grid-cols-3 gap-2">
              <div><dt className="text-2xs font-medium uppercase text-muted">Spent</dt><dd className="num text-base font-semibold text-ink" data-testid="jarvis-spent">{usd(b.spent_usd)}</dd></div>
              <div><dt className="text-2xs font-medium uppercase text-muted">Remaining</dt><dd className="num text-base font-semibold text-ink">{usd(b.remaining_usd)}</dd></div>
              <div><dt className="text-2xs font-medium uppercase text-muted">Today</dt><dd className="num text-base font-semibold text-ink">{usd(b.today_usd)}</dd></div>
            </dl>
            <p className="num mt-1 text-xs text-muted">Daily cap {usd(state.daily_cap_usd)} · lifetime cap {usd(state.lifetime_cap_usd)}</p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line/70" role="img" aria-label={`Today ${usd(b.today_usd)} of ${usd(state.daily_cap_usd)}`}>
              <div className="h-full rounded-full bg-info" style={{ width: `${Math.min(100, state.daily_cap_usd > 0 ? (b.today_usd / state.daily_cap_usd) * 100 : 0)}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">—</p>
        )}
      </div>
    </div>
  );
}

function MemoryTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["jarvis", "memory"], queryFn: jarvis.memory });
  const [category, setCategory] = useState("research");
  const [text, setText] = useState("");
  const add = useMutation({ mutationFn: () => jarvis.addMemory({ category, text: text.trim() }), onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: ["jarvis", "memory"] }); } });
  const del = useMutation({ mutationFn: (id: number) => jarvis.removeMemory(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["jarvis", "memory"] }) });
  return (
    <div className="space-y-5 p-4 md:p-5" data-testid="jarvis-memory">
      <form className="grid gap-3 rounded-md bg-raised/40 p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} name="category">
            {["research", "operational", "preference", "conversation"].map((c) => (
              <option key={c} value={c}>{titleCase(c)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Add note">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="A note for JARVIS to remember" name="memory_text" maxLength={2000} />
        </Field>
        <Button type="submit" variant="primary" size="md" disabled={!text.trim() || add.isPending} data-testid="memory-add">
          {add.isPending ? "Saving…" : "Add note"}
        </Button>
        {add.isError && <p role="alert" className="text-sm text-bad sm:col-span-3">{add.error instanceof ApiError ? add.error.message : "Could not save the note."}</p>}
      </form>
      <QueryView query={q} rows={4} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="Nothing is stored in memory yet.">Notes you add here, and facts JARVIS records with their sources, will be listed with their status.</EmptyState>}>
        {(d) => (
          <ul className="divide-y divide-line/30">
            {d.items.map((m) => (
              <li key={m.id} className="flex items-start gap-3 py-3" data-testid="memory-item">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{titleCase(m.category)}</Badge>
                    <StatusDot tone={m.status === "verified" ? "accent" : m.status === "hypothesis" ? "warn" : "neutral"}>{titleCase(m.status)}</StatusDot>
                    {m.subject_type && <span className="num text-xs text-muted">{m.subject_type} {m.subject_id ?? ""}</span>}
                  </div>
                  <p className="mt-1 break-words text-sm text-soft">{m.text}</p>
                  <p className="num mt-0.5 break-words text-xs text-muted">
                    {m.sources.length ? `Sources: ${m.sources.map((s) => (typeof s === "string" ? s : JSON.stringify(s))).join("; ")}` : "No sources recorded"} · by {m.created_by} · {fmtDateTimeET(m.created_at) ?? "—"}
                    {m.observed_on ? ` · observed ${m.observed_on}` : ""}
                  </p>
                </div>
                <ConfirmButton label={<Trash2 className="h-3.5 w-3.5" aria-label="Delete memory item" />} onConfirm={() => del.mutate(m.id)} disabled={del.isPending} testId="memory-delete" />
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

const KINDS = ["overnight", "morning", "midday", "pregame", "postgame"] as const;

function BriefingsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["jarvis", "briefings"], queryFn: jarvis.briefings });
  const [kind, setKind] = useState<string>("morning");
  const run = useMutation({ mutationFn: () => jarvis.runBriefing(kind), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["jarvis", "briefings"] }); void qc.invalidateQueries({ queryKey: ["jarvis", "state"] }); } });
  return (
    <div className="space-y-5 p-4 md:p-5" data-testid="jarvis-briefings">
      <div className="flex flex-wrap items-end gap-3 rounded-md bg-raised/40 p-3">
        <Field label="Run now" className="w-44">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} data-testid="briefing-kind">
            {KINDS.map((k) => (
              <option key={k} value={k}>{titleCase(k)}</option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" size="md" disabled={run.isPending} onClick={() => run.mutate()} data-testid="briefing-run">
          {run.isPending ? "Running…" : "Run briefing"}
        </Button>
        {run.data && (
          <p role="status" className="text-sm text-soft" data-testid="briefing-result">
            {run.data.created ? `Briefing #${run.data.id ?? "—"} created.` : `Nothing was created: ${run.data.reason ?? "no reason given"}`}
          </p>
        )}
        {run.isError && <p role="alert" className="text-sm text-bad">{run.error instanceof ApiError ? run.error.message : "The briefing could not be run."}</p>}
      </div>
      <QueryView query={q} rows={4} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No briefings have been generated yet.">Briefings are written on the schedule, or when you run one above.</EmptyState>}>
        {(d) => (
          <ul className="space-y-2">
            {[...d.items].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((b, i) => (
              <li key={b.id} data-testid="briefing-item">
                <Collapsible
                  defaultOpen={i === 0}
                  title={
                    <span className="flex flex-wrap items-center gap-x-3">
                      <span className="font-display text-[15px] font-semibold uppercase tracking-wide text-ink">{titleCase(b.kind)}</span>
                      <span className="num text-xs text-muted">{fmtDate(b.date, { weekday: true }) ?? b.date}</span>
                    </span>
                  }
                  right={b.generator === "deterministic" ? "Generated from stored records" : `Written by ${b.generator}`}
                >
                  <Markdown text={b.text} />
                  <p className="num mt-2 text-xs text-muted">
                    {fmtDateTimeET(b.created_at) ?? "—"} · {b.cost_usd === null ? "cost —" : `$${b.cost_usd.toFixed(4)}`}
                  </p>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

function EventsTab() {
  const q = useQuery({ queryKey: ["jarvis", "events"], queryFn: jarvis.events });
  return (
    <div className="p-4 md:p-5" data-testid="jarvis-events">
      <QueryView query={q} rows={4} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No events have been recorded.">Availability, lineup, market and system events appear here as they are detected.</EmptyState>}>
        {(d) => (
          <ul className="divide-y divide-line/30">
            {d.items.map((e) => (
              <li key={e.id} className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[6.5rem_1fr_auto]" data-testid="event-item">
                <StatusDot tone={e.severity === "alert" ? "bad" : e.severity === "notice" ? "warn" : "neutral"}>{titleCase(e.severity)}</StatusDot>
                <div className="min-w-0">
                  <div className="break-words text-sm font-medium text-ink">{e.title}</div>
                  {e.detail && <div className="break-words text-xs text-muted">{e.detail}</div>}
                </div>
                <div className="num text-xs text-muted sm:text-right">
                  {titleCase(e.kind)} · {fmtDateTimeET(e.occurred_at) ?? "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

const TABS = [["conversation", "Conversation"], ["memory", "Memory"], ["briefings", "Briefings"], ["events", "Events"]] as const;

export default function JarvisPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeId = sp.get("c");
  const tab = TABS.some(([t]) => t === sp.get("tab")) ? (sp.get("tab") as string) : "conversation";
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) p.delete(k);
        else p.set(k, v);
      }
      const s = p.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );
  const onConversationId = useCallback((id: number | string) => setParams({ c: String(id), tab: null }), [setParams]);

  const state = useJarvisState();
  const chat = useJarvisChat({ conversationId: activeId, onConversationId });
  const pill = pillState(state.data?.state, chat.streaming, chat.error);
  const messages = chat.conversation?.messages ?? [];
  const lastModel = chat.live?.model ?? [...messages].reverse().find((m) => m.role === "assistant")?.model ?? null;
  const tools = chat.live ? chat.live.tools : chat.lastTools;

  const left = (
    <LeftColumn
      activeId={activeId}
      tab={tab}
      setTab={(t) => { setParams({ tab: t === "conversation" ? null : t }); setHistoryOpen(false); }}
      onSelect={(id) => { setParams({ c: id, tab: null }); setHistoryOpen(false); }}
      onNew={() => { setParams({ c: null, tab: null }); setHistoryOpen(false); }}
      onSuggest={(text) => { setParams({ tab: null }); setHistoryOpen(false); void chat.send(text, false); }}
    />
  );
  const right = <RightColumn conversation={chat.conversation} tools={tools} streaming={chat.streaming} state={state.data} lastModel={lastModel} />;

  return (
    <div className="flex h-[calc(100dvh-11.5rem-var(--strip-h,0px))] min-h-[420px] flex-col lg:h-[calc(100dvh-8.5rem-var(--strip-h,0px))]" data-testid="jarvis-page">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="jarvis-statusbar">
        <JarvisMark className="h-9 w-9" active={chat.streaming} />
        <h1 className="font-display text-[26px] font-bold uppercase italic leading-7 tracking-wide text-ink">JARVIS</h1>
        <JarvisPill state={pill} message={chat.error?.message ?? state.data?.message} showMessage className="min-w-0 flex-1" />
        <div className="flex gap-1.5 lg:hidden">
          <button type="button" onClick={() => setHistoryOpen(true)} aria-label="History and commands" className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-raised text-soft ring-1 ring-inset ring-line" data-testid="jarvis-history-btn">
            <History className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setDetailsOpen(true)} aria-label="Context, activity and budget" className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-raised text-soft ring-1 ring-inset ring-line" data-testid="jarvis-details-btn">
            <PanelRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mb-3 hidden text-xs text-muted lg:block">Joint Analytics, Research, Verification &amp; Intelligence System. Answers are assembled from tool calls over the platform’s verified records.</p>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="hidden min-h-0 overflow-y-auto rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60 lg:block">{left}</aside>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-card ring-1 ring-inset ring-line/60" aria-label="JARVIS workspace">
          <div className="border-b border-line/60 px-3 py-2">
            <Tabs label="JARVIS section" size="sm" scroll value={tab} onChange={(t) => setParams({ tab: t === "conversation" ? null : t })} items={TABS.map(([id, label]) => ({ id, label }))} />
          </div>
          {tab === "conversation" ? (
            <JarvisConversationView
              messages={messages}
              live={chat.live}
              loading={chat.loading}
              error={chat.error ?? (chat.loadError ? { code: "load", message: chat.loadError instanceof ApiError ? chat.loadError.message : "The conversation could not be loaded." } : null)}
              streaming={chat.streaming}
              serverState={state.data?.state}
              serverMessage={state.data?.message}
              onSend={chat.send}
              onStop={chat.stop}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">{tab === "memory" ? <MemoryTab /> : tab === "briefings" ? <BriefingsTab /> : <EventsTab />}</div>
          )}
        </section>
        <aside className="hidden min-h-0 overflow-y-auto rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60 lg:block">{right}</aside>
      </div>

      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="History and commands" side="auto" testId="jarvis-history-sheet">
        {left}
      </Sheet>
      <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Context and budget" side="auto" testId="jarvis-details-sheet">
        {right}
      </Sheet>
    </div>
  );
}
