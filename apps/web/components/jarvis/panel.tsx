"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
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
  // The panel mounts when it opens: remember what had focus (the launcher, an "Ask JARVIS" button, or
  // wherever the owner was when pressing Ctrl/Cmd+J) and give it back on close.
  const [opener] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25" />
        {/* A modal sheet: focus moves to the question field, stays inside, and returns to what opened it. */}
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (opener && opener.isConnected) opener.focus();
          }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.querySelector<HTMLTextAreaElement>('[data-testid="jarvis-input"]')?.focus();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-bg2 shadow-sheet focus:outline-none md:inset-y-0 md:left-auto md:right-0 md:w-[420px] md:border-l md:border-line"
          data-testid="jarvis-panel"
        >
          <header className="flex items-center gap-2.5 border-b-2 border-ink py-1.5 pl-4 pr-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
            <JarvisMark className="h-6 w-6" active={chat.streaming} />
            <Dialog.Title className="text-2xl leading-none text-ink" style={{ fontStretch: "62%", fontWeight: 900 }}>
              JARVIS
            </Dialog.Title>
            <JarvisPill state={pill} message={chat.error?.message ?? state.data?.message} />
            <span className="flex-1" />
            <DLink href={conversationId !== null ? `/jarvis?c=${conversationId}` : "/jarvis"} onClick={onClose} className="link inline-flex h-11 items-center gap-1 px-1 text-sm text-ink" data-testid="jarvis-open-full">
              Open full page
            </DLink>
            <Dialog.Close aria-label="Close JARVIS" className="inline-flex h-11 w-11 items-center justify-center rounded text-ink hover:bg-raised" data-testid="jarvis-panel-close">
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </header>
          <div className="border-b border-line px-4 py-2.5" data-testid="jarvis-panel-context">
            <div className="mb-1 text-sm text-faint">Looking at</div>
            {creating ? <span className="text-sm text-muted">Resolving page context…</span> : createError ? <span className="text-sm font-semibold text-bad">{createError}</span> : <ContextChips context={chat.conversation?.context} />}
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
      }
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
    <button type="button" onClick={() => open()} aria-haspopup="dialog" aria-expanded={isOpen} aria-keyshortcuts="Control+J Meta+J" title="Ask JARVIS (Ctrl/Cmd+J)" className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded bg-ink px-3 text-sm font-semibold text-bg2 hover:bg-soft md:px-4" data-testid="jarvis-launcher">
      <JarvisMark className="h-5 w-5" onDark />
      <span className="sm:hidden">Ask</span>
      <span className="hidden sm:inline">Ask JARVIS</span>
    </button>
  );
}

/** "Ask JARVIS" action for selection and combination cards. */
export function AskJarvisButton({ context, className }: { context: JarvisContextInput; className?: string }) {
  const { open } = useJarvisPanel();
  return (
    <button type="button" onClick={() => open(context)} className={className ?? "inline-flex min-h-[44px] items-center gap-2 rounded border border-line-strong bg-bg2 px-3 text-sm font-semibold text-ink hover:border-ink md:min-h-0 md:h-9"} data-testid="ask-jarvis">
      <JarvisMark className="h-4 w-4" />
      Ask JARVIS
    </button>
  );
}
