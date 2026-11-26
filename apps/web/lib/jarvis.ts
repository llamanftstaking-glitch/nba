import { API_BASE, ApiError, ensureCsrf, http } from "./api";

// Types transcribed from docs/architecture/API-CONTRACT.md, "JARVIS (assistant, memory, briefings, AI budget)".
export type JarvisServerState = "ready" | "provider_unavailable" | "budget_limited" | "paused";
export type JarvisState = {
  state: JarvisServerState;
  message: string;
  models: { standard: string; deep: string; light: string };
  models_verified: boolean;
  budget: { spent_usd: number; remaining_usd: number; usable_usd: number; today_usd: number; state: string };
  daily_cap_usd: number;
  lifetime_cap_usd: number;
};
export type JarvisContextInput = { game_id?: string; player_id?: number | string; ticker?: string; selection_id?: number; combo_id?: string | number; date?: string; page?: string };
export type JarvisContext = {
  game?: { game_id: string; label: string; date: string } | null;
  player?: { player_id: number; name: string; team: string | null } | null;
  kalshi_market?: { ticker: string; title: string } | null;
  selection?: { record_id: number | string } | null;
  combination?: { record_id: number | string } | null;
  date?: string | null;
  page?: string | null;
};
export type JarvisSource = { tool: string; label: string; args: Record<string, unknown> | null };
export type JarvisMessage = {
  id: number | string;
  role: "user" | "assistant";
  text: string;
  model: string | null;
  stop_reason: string | null;
  sources: JarvisSource[];
  cost_usd: number | null;
  created_at: string;
  tool_calls: { name: string; input: unknown }[];
  /** Number of images attached to this message; bytes at GET /jarvis/messages/{id}/images/{index}. */
  images?: number;
};
export type JarvisToolActivity = { tool: string; label: string; args: Record<string, unknown> | null; ok: boolean; error: string | null; ms: number | null; truncated: boolean; at: string };
export type JarvisConversationRef = { id: number | string; title: string | null; context: JarvisContext | null; created_at: string; updated_at: string };
export type JarvisConversation = JarvisConversationRef & { messages: JarvisMessage[]; tool_activity: JarvisToolActivity[] };
export type JarvisSuggestion = { label: string; text: string };
export type JarvisMemory = { id: number; category: string; status: string; subject_type: string | null; subject_id: string | number | null; text: string; sources: unknown[]; observed_on: string | null; created_by: string; created_at: string };
export type JarvisBriefing = { id: number; kind: string; date: string; text: string; generator: string; cost_usd: number | null; created_at: string };
export type JarvisEventRow = { id: number; kind: string; severity: "info" | "notice" | "alert"; title: string; detail: string | null; game_date: string | null; occurred_at: string };

export type JarvisStreamEvent =
  | { type: "status"; state: string; routing?: { handler?: string; mode?: string; tool?: string; reason?: string }; model?: string }
  | { type: "tool_start"; id: string | number; tool: string; label: string; args?: Record<string, unknown> }
  | { type: "tool_end"; id: string | number; tool: string; ok: boolean; ms?: number; error?: string; truncated?: boolean }
  | { type: "text"; delta: string }
  | { type: "usage"; cost_usd: number; total_cost_usd: number; input_tokens: number; output_tokens: number; cache_read_tokens: number }
  | { type: "done"; message_id: number | string; model: string; cost_usd: number; sources: JarvisSource[]; stop_reason: string | null }
  | { type: "error"; code: string; message: string; state?: string; message_id?: number | string; cost_usd?: number };

export type UsageRow = { key: string; requests: number; usd: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number };
export type BudgetPolicy = {
  lifetime_cap_usd: number;
  suspend_at_usd: number;
  daily_cap_usd: number;
  allocations: Record<string, number>;
  per_request_cap_usd: Record<string, number>;
  paused: boolean;
  buffer_released: boolean;
  notifications: boolean;
  updated_at: string | null;
  updated_by: string | null;
};
export type AiBudget = {
  policy: BudgetPolicy;
  spent_usd: number;
  pending_usd: number;
  remaining_usd: number;
  usable_usd: number;
  today_usd: number;
  month_usd: number;
  state: "ok" | "budget_limited" | "paused";
  checkpoints: { pct: number; usd: number; reached: boolean }[];
  buckets: { bucket: string; allocation_usd: number; used_usd: number }[];
  by_model: UsageRow[];
  by_task: UsageRow[];
  by_agent: UsageRow[];
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cache_savings_usd: number;
  avg_usd_per_day: number | null;
  est_days_remaining: number | null;
  daily: { date: string; requests: number; usd: number }[];
  prices: Record<string, { in: number; out: number; cache_read: number; cache_write: number }>;
  notes: string[];
  assistant: JarvisState;
};
export type BudgetRequest = {
  id: number | string;
  at: string;
  status: string;
  bucket: string;
  model: string;
  task: string;
  reserved_usd: number | null;
  actual_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  attempt: number | null;
  routing: unknown;
  error: string | null;
  conversation_id: number | string | null;
};

const qs = (p: Record<string, string | number | undefined | null>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export const jarvis = {
  state: () => http.get<JarvisState>("/jarvis/state"),
  suggestions: (ctx: JarvisContextInput = {}) => http.get<{ context: JarvisContext | null; items: JarvisSuggestion[] }>("/jarvis/suggestions", qs({ game_id: ctx.game_id, player_id: ctx.player_id, ticker: ctx.ticker, selection_id: ctx.selection_id, combo_id: ctx.combo_id })),
  conversations: (limit = 30) => http.get<{ items: JarvisConversationRef[] }>("/jarvis/conversations", { limit }),
  conversation: (id: number | string) => http.get<JarvisConversation>(`/jarvis/conversations/${id}`),
  create: (context?: JarvisContextInput) => http.post<JarvisConversationRef>("/jarvis/conversations", context ? { context } : {}),
  remove: (id: number | string) => http.post<{ deleted: boolean }>(`/jarvis/conversations/${id}/delete`),
  memory: () => http.get<{ items: JarvisMemory[] }>("/jarvis/memory", { limit: 100 }),
  addMemory: (body: { category: string; text: string }) => http.post<JarvisMemory>("/jarvis/memory", body),
  removeMemory: (id: number) => http.post<unknown>(`/jarvis/memory/${id}/delete`),
  briefings: () => http.get<{ items: JarvisBriefing[] }>("/jarvis/briefings", { limit: 30 }),
  runBriefing: (kind: string) => http.post<{ created: boolean; id?: number; generator?: string; cost_usd?: number; reason?: string }>("/jarvis/briefings/run", { kind }),
  events: () => http.get<{ items: JarvisEventRow[] }>("/jarvis/events", { limit: 50 }),
  budget: () => http.get<AiBudget>("/admin/ai-budget"),
  updateBudget: (body: Partial<BudgetPolicy>) => http.post<BudgetPolicy>("/admin/ai-budget", body),
  budgetRequests: (limit = 50) => http.get<{ items: BudgetRequest[] }>("/admin/ai-budget/requests", { limit }),
};

/**
 * POST a message and read the text/event-stream reply. Each event is one `data: {json}` line followed by a
 * blank line. Resolves "done" after a terminal event, "lost" when the stream ends without one, "aborted"
 * when the caller stopped it. A non-200 reply (JSON error envelope) throws ApiError.
 */
export async function streamMessage(
  conversationId: number | string,
  body: { text: string; mode: "quick" | "standard" | "deep"; context?: JarvisContextInput; images?: { media_type: string; data: string }[] },
  onEvent: (e: JarvisStreamEvent) => void,
  signal: AbortSignal,
): Promise<"done" | "lost" | "aborted"> {
  const csrf = await ensureCsrf();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/jarvis/conversations/${conversationId}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", "X-CSRF-Token": csrf },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch {
    return signal.aborted ? "aborted" : "lost";
  }
  if (!res.ok || !res.body) {
    let code = "http_error";
    let message = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { code?: string; message?: string } };
      if (j.error?.code) code = j.error.code;
      if (j.error?.message) message = j.error.message;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, code, message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  const flush = (block: string) => {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    try {
      const e = JSON.parse(data) as JarvisStreamEvent;
      if (e.type === "done" || e.type === "error") terminal = true;
      onEvent(e);
    } catch {
      /* ignore a malformed frame */
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        flush(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
      }
    }
    if (buffer.trim()) flush(buffer);
  } catch {
    return signal.aborted ? "aborted" : "lost";
  }
  return terminal ? "done" : signal.aborted ? "aborted" : "lost";
}

export const messageImageUrl = (messageId: number | string, index: number) => `${API_BASE}/jarvis/messages/${messageId}/images/${index}`;
