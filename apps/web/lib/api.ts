import type {
  AgentItem,
  AuthResponse,
  BacktestItem,
  BuilderEvaluation,
  CombosResponse,
  CommandCenter,
  DataHealth,
  EditionDetail,
  EditionListItem,
  Exposure,
  GameCard,
  GameDetail,
  InjuriesResponse,
  ModelItem,
  Operations,
  PlayerDetail,
  PlayerListItem,
  ReadyResponse,
  ResearchLab,
  ResultsResponse,
  SelectionsResponse,
  SettingsResponse,
  TeamDetail,
  TeamListItem,
  Ticket,
} from "./types";

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// The CSRF token lives in memory only. It is re-fetched from /auth/me after a page load.
let csrfToken: string | null = null;
export function setCsrf(token: string | null): void {
  csrfToken = token;
}

type Params = Record<string, string | number | boolean | null | undefined>;

function qs(params?: Params): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

async function parseError(res: Response): Promise<ApiError> {
  let code = "http_error";
  let message = `Request failed (${res.status})`;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body) {
      const err = (body as { error?: { code?: unknown; message?: unknown } }).error;
      if (err && typeof err.code === "string") code = err.code;
      if (err && typeof err.message === "string") message = err.message;
    }
  } catch {
    // non-JSON error body; keep the generic message
  }
  return new ApiError(res.status, code, message);
}

type RequestOptions = { redirectOn401?: boolean };

async function request<T>(method: "GET" | "POST", path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network_error", "The API could not be reached.");
  }
  if (res.status === 401 && opts.redirectOn401 !== false) {
    redirectToLogin();
    throw await parseError(res);
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

function get<T>(path: string, params?: Params): Promise<T> {
  return request<T>("GET", `${path}${qs(params)}`);
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  // After a hard reload the token is gone from memory; restore it before the first mutation.
  if (!csrfToken) {
    const me = await request<AuthResponse>("GET", "/auth/me");
    csrfToken = me.csrf;
  }
  return request<T>("POST", path, body);
}

export type ResultsFilters = {
  date_from?: string;
  date_to?: string;
  season?: string;
  engine?: string;
  market?: string;
  classification?: string;
  model_version_id?: string;
  team?: string;
  player_id?: string;
  limit?: number;
  offset?: number;
};

export type TicketFilters = {
  status?: "open" | "settled";
  engine?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
};

export type SaveTicketBody = { combo_uid?: string; selection_ids?: number[]; stake_units?: number };

export const api = {
  ready: () => get<ReadyResponse>("/health/ready"),

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const res = await request<AuthResponse>("POST", "/auth/login", { email, password }, { redirectOn401: false });
    csrfToken = res.csrf;
    return res;
  },
  logout: async (): Promise<{ ok: boolean }> => {
    const res = await post<{ ok: boolean }>("/auth/logout");
    csrfToken = null;
    return res;
  },
  me: async (): Promise<AuthResponse> => {
    const res = await get<AuthResponse>("/auth/me");
    csrfToken = res.csrf;
    return res;
  },

  commandCenter: (date?: string) => get<CommandCenter>("/command-center", { date }),
  games: (date?: string) => get<{ date: string; games: GameCard[] }>("/games", { date }),
  game: (id: string) => get<GameDetail>(`/games/${encodeURIComponent(id)}`),
  selections: (p: { date?: string; classification?: string; market?: string; game_id?: string }) =>
    get<SelectionsResponse>("/selections", p),
  combos: (p: { date?: string; category: string }) => get<CombosResponse>("/combos", p),
  editions: (date?: string) => get<{ items: EditionListItem[] }>("/editions", { date }),
  edition: (id: number) => get<EditionDetail>(`/editions/${id}`),
  builderEvaluate: (selection_ids: number[]) => post<BuilderEvaluation>("/builder/evaluate", { selection_ids }),
  tickets: (p: TicketFilters) => get<{ items: Ticket[]; total: number }>("/paper/tickets", p),
  saveTicket: (body: SaveTicketBody) => post<Ticket>("/paper/tickets", body),
  results: (p: ResultsFilters) => get<ResultsResponse>("/results", p),
  exposure: (date?: string) => get<Exposure>("/exposure", { date }),
  players: (p: { q?: string; team?: string; limit?: number; offset?: number }) =>
    get<{ items: PlayerListItem[]; total: number }>("/players", p),
  player: (id: string) => get<PlayerDetail>(`/players/${encodeURIComponent(id)}`),
  teams: () => get<{ items: TeamListItem[] }>("/teams"),
  team: (id: string) => get<TeamDetail>(`/teams/${encodeURIComponent(id)}`),
  injuries: () => get<InjuriesResponse>("/injuries"),
  models: () => get<{ items: ModelItem[] }>("/models"),
  backtests: () => get<{ items: BacktestItem[] }>("/backtests"),
  researchLab: () => get<ResearchLab>("/research-lab"),
  agents: () => get<{ items: AgentItem[] }>("/agents"),
  dataHealth: () => get<DataHealth>("/data-health"),
  operations: () => get<Operations>("/operations"),
  setPaused: (paused: boolean) => post<{ paused: boolean }>("/operations/pause", { paused }),
  settings: () => get<SettingsResponse>("/settings"),
};
