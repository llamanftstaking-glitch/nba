"use client";

import { ExternalLink, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DLink, useSelectedDate } from "@/lib/date";
import { jarvis, type JarvisContextInput } from "@/lib/jarvis";
import { ApiError } from "@/lib/api";
import { ContextChips, JarvisConversationView } from "./conversation";
import { JarvisMark } from "./mark";
import { JarvisPill } from "./status";
import { pillState, useJarvisChat, useJarvisState } from "./use-jarvis";

type PanelApi = { open: (extra?: JarvisContextInput, draft?: string) => void; close: () => void; isOpen: boolean };
const Ctx = createContext<PanelApi>({ open: () => {}, close: () => {}, isOpen: false });
export const useJarvisPanel = () => useContext(Ctx);

/** Context implied by the current route. */
function routeContext(pathname: string, date: string | undefined): JarvisContextInput {
  const ctx: JarvisContextInput = { page: pathname };
  if (date) ctx.date = date;
  const seg = pathname.split("/").filter(Boolean);
  if (seg[0] === "games" && seg[1]) ctx.game_id = decodeURIComponent(seg[1]);
  else if (seg[0] === "players" && seg[1] && /^\d+$/.test(seg[1])) ctx.player_id = Number(seg[1]);
  else if (seg[0] === "kalshi-intelligence" && seg[1]) ctx.ticker = decodeURIComponent(seg[1]);
  return ctx;
}

function Panel({ contextInput, conversationId, creating, createError, onConversationId, onClose, draft }: { contextInput: JarvisContextInput; draft?: string; conversationId: number | string | null; creating: boolean; createError: string | null; onConversationId: (id: number | string) => void; onClose: () => void }) {
  const state = useJarvisState();
  const chat = useJarvisChat({ conversationId, onConversationId, context: contextInput });
  const pill = pillState(state.data?.state, chat.streaming, chat.error);
  return (
    <div className="fixed inset-0 z-50 md:inset-y-0 md:left-auto md:right-0 md:w-[420px]" role="dialog" aria-label="JARVIS assistant" data-testid="jarvis-panel">
      <div className="flex h-full flex-col bg-bg2 shadow-2xl ring-1 ring-line md:rounded-l-lg">
        <header className="flex items-center gap-2 border-b border-line/60 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <JarvisMark className="h-7 w-7" active={chat.streaming} />
          <span className="font-display text-lg font-semibold uppercase tracking-wide text-ink">JARVIS</span>
          <JarvisPill state={pill} message={chat.error?.message ?? state.data?.message} />
          <span className="flex-1" />
          <DLink href={conversationId !== null ? `/jarvis?c=${conversationId}` : "/jarvis"} onClick={onClose} className="inline-flex h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-raised md:h-8" data-testid="jarvis-open-full">
            Open full page <ExternalLink className="h-3 w-3" aria-hidden />
          </DLink>
          <button type="button" onClick={onClose} aria-label="Close JARVIS" className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-ink md:h-8 md:w-8" data-testid="jarvis-panel-close">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="border-b border-line/60 px-3 py-2" data-testid="jarvis-panel-context">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">JARVIS is looking at</div>
          {creating ? <span className="text-xs text-muted">Resolving page context…</span> : createError ? <span className="text-xs text-bad">{createError}</span> : <ContextChips context={chat.conversation?.context} />}
        </div>
        <JarvisConversationView
          compact
          messages={chat.conversation?.messages ?? []}
          live={chat.live}
          loading={chat.loading}
          error={chat.error}
          streaming={chat.streaming}
          serverState={state.data?.state}
          serverMessage={state.data?.message}
          contextInput={contextInput}
          draft={draft}
          onSend={chat.send}
          onStop={chat.stop}
        />
      </div>
    </div>
  );
}

/** Provides the global assistant panel: launcher button, Ctrl/Cmd+J, and "Ask JARVIS" actions. */
export function JarvisPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const date = useSelectedDate();
  const [isOpen, setOpen] = useState(false);
  const [extra, setExtra] = useState<JarvisContextInput>({});
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [byKey, setByKey] = useState<Record<string, number | string>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const contextInput = useMemo(() => ({ ...routeContext(pathname, date), ...extra }), [pathname, date, extra]);
  const key = JSON.stringify(contextInput);
  const conversationId = byKey[key] ?? null;

  // The "Ask JARVIS" context belongs to the page it was asked on.
  useEffect(() => {
    setExtra({});
    setDraft(undefined);
  }, [pathname]);

  // One conversation per context: reused while the context is unchanged, a new one when it changes.
  useEffect(() => {
    if (!isOpen || conversationId !== null || creating) return;
    let cancelled = false;
    setCreating(true);
    setCreateError(null);
    jarvis
      .create(contextInput)
      .then((c) => {
        if (!cancelled) setByKey((m) => ({ ...m, [key]: c.id }));
      })
      .catch((e: unknown) => {
        if (!cancelled) setCreateError(e instanceof ApiError ? e.message : "Could not start a conversation.");
      })
      .finally(() => {
        if (!cancelled) setCreating(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the serialised context
  }, [isOpen, key, conversationId]);

  const open = useCallback((x?: JarvisContextInput, text?: string) => {
    setExtra(x ?? {});
    setDraft(text);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const api = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {isOpen && <Panel key={key} contextInput={contextInput} conversationId={conversationId} creating={creating} createError={createError} onConversationId={(id) => setByKey((m) => ({ ...m, [key]: id }))} onClose={close} draft={draft} />}
    </Ctx.Provider>
  );
}

/** Top-bar launcher. Hidden on the /jarvis page itself. */
export function JarvisLauncher() {
  const { open, isOpen } = useJarvisPanel();
  const pathname = usePathname();
  if (pathname === "/jarvis") return null;
  return (
    <button type="button" onClick={() => open()} aria-expanded={isOpen} aria-keyshortcuts="Control+J Meta+J" title="Ask JARVIS (Ctrl/Cmd+J)" className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-raised px-2.5 text-sm font-medium text-ink ring-1 ring-inset ring-line hover:bg-line/70 md:h-9" data-testid="jarvis-launcher">
      <JarvisMark className="h-5 w-5" />
      <span className="hidden sm:inline">JARVIS</span>
    </button>
  );
}

/** "Ask JARVIS" action for selection and combination cards. */
export function AskJarvisButton({ context, className }: { context: JarvisContextInput; className?: string }) {
  const { open } = useJarvisPanel();
  return (
    <button type="button" onClick={() => open(context)} className={className ?? "inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted hover:bg-raised hover:text-ink md:min-h-0 md:h-8 md:text-xs"} data-testid="ask-jarvis">
      <JarvisMark className="h-4 w-4" />
      Ask JARVIS
    </button>
  );
}
