"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, Loader2, Send, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LoadingState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { jarvis, type JarvisContext, type JarvisContextInput, type JarvisMessage, type JarvisServerState, type JarvisSource } from "@/lib/jarvis";
import { JarvisMark } from "./mark";
import { Markdown } from "./markdown";
import type { LiveTool, LiveTurn, TurnError } from "./use-jarvis";

const modelLabel = (model: string | null) => (model === "deterministic" ? "Answered from stored data, no model" : model ? model : "Model not recorded");

function argText(args: Record<string, unknown> | null | undefined): string {
  const e = Object.entries(args ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  return e.length ? e.map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ") : "no arguments";
}

/** One activity line per real tool call: spinner while running, check or cross when the stream reports the end. */
export function ToolActivity({ tools, className }: { tools: LiveTool[]; className?: string }) {
  if (tools.length === 0) return null;
  return (
    <ul className={cn("space-y-1", className)} data-testid="jarvis-tools">
      {tools.map((t) => (
        <li key={t.id} className="flex items-center gap-2 text-xs text-muted" data-testid="jarvis-tool" data-status={t.status}>
          {t.status === "running" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-info" aria-label="running" /> : t.status === "ok" ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-label="finished" /> : <X className="h-3.5 w-3.5 shrink-0 text-bad" aria-label="failed" />}
          <span className="min-w-0 break-words text-soft">{t.label}</span>
          {t.ms !== undefined && <span className="num shrink-0">{t.ms} ms</span>}
          {t.error && <span className="min-w-0 break-words text-bad">{t.error}</span>}
        </li>
      ))}
    </ul>
  );
}

function Sources({ sources }: { sources: JarvisSource[] }) {
  if (sources.length === 0) return <span className="text-xs text-muted">No sources recorded</span>;
  return (
    <details className="group" data-testid="jarvis-sources">
      <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 text-xs font-medium text-accent md:min-h-0 [&::-webkit-details-marker]:hidden">
        Sources ({sources.length}) <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="mt-1 space-y-1">
        {sources.map((s, i) => (
          <li key={i} className="text-xs">
            <span className="text-soft">{s.label}</span>
            <span className="num block break-all text-faint">
              {s.tool} · {argText(s.args)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Answer({ text, model, cost, sources, streaming }: { text: string; model: string | null; cost: number | null; sources?: JarvisSource[]; streaming?: boolean }) {
  return (
    <div className="flex gap-3" data-testid="jarvis-answer" data-streaming={streaming ? "1" : "0"}>
      <JarvisMark className="mt-0.5 h-6 w-6" active={streaming} />
      <div className="min-w-0 flex-1">
        {text ? <Markdown text={text} /> : streaming ? null : <p className="text-sm text-muted">No text was returned for this turn.</p>}
        {!streaming && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" data-testid="jarvis-meta">
            <span>{modelLabel(model)}</span>
            <span className="num">{cost === null ? "Cost —" : `$${cost.toFixed(4)}`}</span>
            {sources && <Sources sources={sources} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Owner({ text }: { text: string }) {
  return (
    <div className="flex justify-end" data-testid="jarvis-owner">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-raised px-3.5 py-2 text-sm text-ink">{text}</p>
    </div>
  );
}

export function ContextChips({ context, className }: { context: JarvisContext | null | undefined; className?: string }) {
  const c = context ?? {};
  const chip = "inline-flex min-h-[28px] max-w-full items-center gap-1 rounded-full bg-raised px-2.5 text-xs text-soft";
  const items = [
    c.game && <DLink key="g" href={`/games/${encodeURIComponent(c.game.game_id)}`} className={cn(chip, "hover:text-ink")} data-testid="ctx-game"><span className="text-muted">Game</span> <span className="truncate">{c.game.label}</span></DLink>,
    c.player && <DLink key="p" href={`/players/${c.player.player_id}`} className={cn(chip, "hover:text-ink")} data-testid="ctx-player"><span className="text-muted">Player</span> <span className="truncate">{c.player.name}</span></DLink>,
    c.kalshi_market && <DLink key="k" href={`/kalshi-intelligence/${encodeURIComponent(c.kalshi_market.ticker)}`} className={cn(chip, "hover:text-ink")} data-testid="ctx-market"><span className="text-muted">Market</span> <span className="truncate">{c.kalshi_market.title}</span></DLink>,
    c.selection && <span key="s" className={chip} data-testid="ctx-selection"><span className="text-muted">Selection record</span> <span className="num">{String(c.selection.record_id)}</span></span>,
    c.combination && <span key="c" className={chip} data-testid="ctx-combo"><span className="text-muted">Combination record</span> <span className="num">{String(c.combination.record_id)}</span></span>,
    c.page && <span key="pg" className={chip} data-testid="ctx-page"><span className="text-muted">Page</span> <span className="num truncate">{c.page}</span></span>,
    c.date && <span key="d" className={chip}><span className="text-muted">Date</span> <span className="num">{c.date}</span></span>,
  ].filter(Boolean);
  if (items.length === 0) return <span className={cn("text-xs text-muted", className)}>No page context</span>;
  return <div className={cn("flex flex-wrap gap-1.5", className)} data-testid="jarvis-context">{items}</div>;
}

const SLASH_NOTE = "Slash commands still work without a model: /budget, /status, /health, /events, /agents, /briefing.";

/** The conversation surface shared by the /jarvis page and the side panel. */
export function JarvisConversationView({
  messages,
  live,
  loading,
  error,
  streaming,
  serverState,
  serverMessage,
  contextInput,
  onSend,
  onStop,
  compact = false,
}: {
  messages: JarvisMessage[];
  live: LiveTurn | null;
  loading: boolean;
  error: TurnError | null;
  streaming: boolean;
  serverState: JarvisServerState | undefined;
  serverMessage: string | undefined;
  contextInput?: JarvisContextInput;
  onSend: (text: string, deep: boolean) => void;
  onStop: () => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [deep, setDeep] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const suggestions = useQuery({ queryKey: ["jarvis", "suggestions", contextInput ?? {}], queryFn: () => jarvis.suggestions(contextInput) });
  const empty = messages.length === 0 && !live;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, live?.text, live?.tools.length]);

  const submit = (value: string) => {
    if (!value.trim() || streaming) return;
    onSend(value, deep);
    setText("");
    setDeep(false); // deep review is a per-message choice
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(text);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="jarvis-conversation">
      <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto", compact ? "p-3" : "p-4 md:p-5")} data-testid="jarvis-scroll">
        {serverState === "provider_unavailable" && (
          <div role="status" className="flex items-start gap-2.5 rounded-md bg-warn/10 px-3 py-2.5 text-sm text-soft ring-1 ring-inset ring-warn/40" data-testid="jarvis-unavailable">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
            <span className="min-w-0">
              <span className="block font-semibold text-warn">The model provider is unavailable.</span>
              <span className="block break-words">{serverMessage}</span>
              <span className="block text-muted">{SLASH_NOTE}</span>
            </span>
          </div>
        )}
        {loading ? (
          <LoadingState rows={3} label="Loading conversation" />
        ) : empty ? (
          <div className="mx-auto flex max-w-xl flex-col items-center py-6 text-center" data-testid="jarvis-empty">
            <JarvisMark className={compact ? "h-12 w-12" : "h-16 w-16"} />
            <p className="mt-3 text-sm text-soft">JARVIS answers questions about the slate, players, markets, research records and system health by calling the platform’s own tools. Every number in an answer comes from platform records.</p>
            {suggestions.data && suggestions.data.items.length > 0 && (
              <ul className="mt-4 flex flex-wrap justify-center gap-2" data-testid="jarvis-suggestions">
                {suggestions.data.items.slice(0, compact ? 5 : 8).map((s) => (
                  <li key={s.text}>
                    <button type="button" disabled={streaming} onClick={() => submit(s.text)} className="inline-flex min-h-[44px] items-center rounded-full bg-raised/70 px-3.5 text-left text-sm text-soft ring-1 ring-inset ring-line hover:bg-raised hover:text-ink disabled:cursor-not-allowed md:min-h-9" title={s.text} data-testid="jarvis-suggestion">
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          messages.map((m) => (m.role === "user" ? <Owner key={m.id} text={m.text} /> : <Answer key={m.id} text={m.text} model={m.model} cost={m.cost_usd} sources={m.sources ?? []} />))
        )}
        {live && (
          <>
            <Owner text={live.userText} />
            <div data-testid="jarvis-live">
              <ToolActivity tools={live.tools} className="mb-2 pl-9" />
              <Answer text={live.text} model={live.model} cost={live.cost} streaming />
            </div>
          </>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-md bg-bad/10 px-3 py-2.5 text-sm ring-1 ring-inset ring-bad/40" data-testid="jarvis-error" data-code={error.code}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
            <span className="min-w-0 break-words text-soft">{error.message}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className={cn("border-t border-line/60 bg-bg2", compact ? "p-2.5" : "p-3 md:p-4")}
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        data-testid="jarvis-composer"
      >
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Message to JARVIS</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              rows={compact ? 2 : 3}
              maxLength={8000}
              placeholder="Ask about a game, player, market or the system"
              className="block w-full resize-none rounded-md bg-bg px-3 py-2 text-sm text-ink ring-1 ring-inset ring-line placeholder:text-faint focus:outline-none focus:ring-accent"
              data-testid="jarvis-input"
            />
          </label>
          {streaming ? (
            <button type="button" onClick={onStop} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-raised px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line" data-testid="jarvis-stop">
              <Square className="h-3.5 w-3.5" aria-hidden /> Stop
            </button>
          ) : (
            <button type="submit" disabled={!text.trim()} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 text-sm font-semibold text-bg shadow-accent disabled:bg-accent/30 disabled:shadow-none" data-testid="jarvis-send">
              <Send className="h-3.5 w-3.5" aria-hidden /> Send
            </button>
          )}
        </div>
        <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2 text-xs text-muted md:min-h-0">
          <input type="checkbox" checked={deep} disabled={streaming} onChange={(e) => setDeep(e.target.checked)} className="h-4 w-4 accent-[rgb(0,229,160)]" data-testid="jarvis-deep" />
          Deep review (Opus, costs more)
          <span className="ml-auto hidden text-faint sm:inline">Enter to send · Shift+Enter for a new line</span>
        </label>
      </form>
    </div>
  );
}
