"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { jarvis, streamMessage, type JarvisContextInput, type JarvisServerState } from "@/lib/jarvis";

/** The owner's saved preference for cheaper answers (per browser). Deep review overrides it for one message. */
export const QUICK_KEY = "gizer-jarvis-quick";
function quickPreferred(): boolean {
  try {
    return window.localStorage.getItem(QUICK_KEY) === "1";
  } catch {
    return false;
  }
}

export type LiveTool = { id: string; tool: string; label: string; status: "running" | "ok" | "error"; ms?: number; error?: string };
/** The turn in flight. Everything in it comes from the stream; nothing is invented client-side. */
export type LiveTurn = { userText: string; images: string[]; text: string; tools: LiveTool[]; model: string | null; cost: number | null };
export type OutgoingImage = { media_type: string; data: string; url: string };
export type TurnError = { code: string; message: string; state?: string };
export type PillState = JarvisServerState | "processing" | "error";

export function useJarvisState() {
  return useQuery({ queryKey: ["jarvis", "state"], queryFn: jarvis.state, staleTime: 15_000 });
}

export function useJarvisChat({ conversationId, onConversationId, context }: { conversationId: number | string | null; onConversationId: (id: number | string) => void; context?: JarvisContextInput }) {
  const qc = useQueryClient();
  const convQ = useQuery({ queryKey: ["jarvis", "conversation", conversationId === null ? null : String(conversationId)], queryFn: () => jarvis.conversation(conversationId as number | string), enabled: conversationId !== null });
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [lastTools, setLastTools] = useState<LiveTool[]>([]);
  const [error, setError] = useState<TurnError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streaming = live !== null;

  // Changing conversation abandons any stream and clears turn-local state.
  const createdRef = useRef<number | string | null>(null);
  useEffect(() => {
    // The id changing because this hook just created the conversation is not a switch.
    if (conversationId !== null && createdRef.current !== null && String(createdRef.current) === String(conversationId)) {
      createdRef.current = null;
      return;
    }
    abortRef.current?.abort();
    setLive(null);
    setError(null);
    setLastTools([]);
  }, [conversationId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string, deep: boolean, images: OutgoingImage[] = []): Promise<boolean> => {
      const trimmed = text.trim();
      if ((!trimmed && images.length === 0) || abortRef.current) return false;
      let ok = false;
      const ac = new AbortController();
      abortRef.current = ac;
      setError(null);
      setLastTools([]);
      setLive({ userText: trimmed, images: images.map((i) => i.url), text: "", tools: [], model: null, cost: null });
      let id = conversationId;
      let tools: LiveTool[] = [];
      try {
        if (id === null) {
          const c = await jarvis.create(context);
          id = c.id;
          qc.setQueryData(["jarvis", "conversation", String(id)], { ...c, messages: [], tool_activity: [] });
          createdRef.current = id;
          onConversationId(id);
        }
        const outcome = await streamMessage(
          id,
          { text: trimmed, mode: deep ? "deep" : quickPreferred() ? "quick" : "standard", context, ...(images.length ? { images: images.map((i) => ({ media_type: i.media_type, data: i.data })) } : {}) },
          (e) => {
            if (e.type === "tool_start") tools = [...tools, { id: String(e.id), tool: e.tool, label: e.label, status: "running" }];
            else if (e.type === "tool_end") tools = tools.map((t) => (t.id === String(e.id) ? { ...t, status: e.ok ? "ok" : "error", ms: e.ms, error: e.error } : t));
            setLive((cur) => {
              if (!cur) return cur;
              if (e.type === "status") return { ...cur, model: e.model ?? cur.model };
              if (e.type === "tool_start" || e.type === "tool_end") return { ...cur, tools };
              if (e.type === "text") return { ...cur, text: cur.text + e.delta };
              if (e.type === "usage") return { ...cur, cost: e.total_cost_usd };
              if (e.type === "done") return { ...cur, model: e.model, cost: e.cost_usd };
              return cur;
            });
            if (e.type === "error") setError({ code: e.code, message: e.message, state: e.state });
            if (e.type === "done") ok = true;
          },
          ac.signal,
        );
        if (outcome === "lost") setError({ code: "connection_lost", message: "Connection lost before the answer finished. The conversation has been reloaded from the server." });
      } catch (err) {
        setError(err instanceof ApiError ? { code: err.code, message: err.message } : { code: "error", message: "The request could not be sent." });
      } finally {
        setLastTools(tools);
        // Reload the stored conversation before dropping the live turn, so the answer never flickers away.
        if (id !== null) await qc.invalidateQueries({ queryKey: ["jarvis", "conversation", String(id)] }).catch(() => {});
        void qc.invalidateQueries({ queryKey: ["jarvis", "state"] });
        void qc.invalidateQueries({ queryKey: ["jarvis", "conversations"] });
        abortRef.current = null;
        setLive(null);
      }
      return ok;
    },
    [conversationId, context, onConversationId, qc],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  return { conversation: convQ.data ?? null, loading: conversationId !== null && convQ.isPending, loadError: convQ.error, live, streaming, lastTools, error, send, stop };
}

/** Status shown in the pill: "processing" only while a stream is open; otherwise the last turn's error state or the server state. */
export function pillState(server: JarvisServerState | undefined, streaming: boolean, error: TurnError | null): PillState {
  if (streaming) return "processing";
  if (error) {
    if (error.state === "budget_limited" || error.state === "paused" || error.state === "provider_unavailable") return error.state;
    return "error";
  }
  return server ?? "ready";
}
