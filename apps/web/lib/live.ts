"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, http } from "./api";
import { useTeams } from "./queries";

// Types transcribed from docs/architecture/API-CONTRACT.md, "GIZER LIVE (observed in-game data)".
export type LiveStatus = "scheduled" | "live" | "halftime" | "end_period" | "overtime" | "final" | "delayed" | "postponed" | "suspended" | "cancelled";
export type Freshness = { observed_at: string | null; provider_updated_at: string | null; age_s: number | null; stale: boolean; feed: "ok" | "stale" | "not_started" | string };
export type LiveTeam = { team_id: number; abbr: string; name: string; score: number | null; linescores: (number | null)[] };
export type GameRow = Freshness & {
  game_id: string;
  label: string;
  game_date: string;
  tipoff_utc: string | null;
  venue: string | null;
  status: LiveStatus | string;
  status_label: string;
  period: number | null;
  period_label: string;
  clock: string | null;
  home: LiveTeam;
  away: LiveTeam;
  version: number;
  followed: boolean;
  favorite_team: boolean;
};
export type Scoreboard = { date: string; prev: string; next: string; today: string; live_count: number; server_time: string; poll_note: string; games: GameRow[] };
export type Play = {
  event_id: string;
  sequence: number;
  period: number;
  clock: string | null;
  elapsed_s: number | null;
  team_id: number | null;
  team_side: "home" | "away" | null;
  kind: string;
  type_text: string | null;
  text: string;
  scoring: boolean;
  score_value: number | null;
  home_score: number | null;
  away_score: number | null;
  player_ids: number[];
  provider_at: string | null;
  ingested_at: string | null;
  corrected: boolean;
};
export type Leader = { player_id: number | null; name: string; value: number | null } | null;
export type Leaders = { pts: Leader; reb: Leader; ast: Leader };
export type Run = { team: "home" | "away"; points: number; start_s: number; end_s: number };
export type MomentumSummary = { lead_changes: number | null; ties: number | null; largest_lead: { home: number | null; away: number | null } | null; runs: Run[]; note: string };
export type GameCenter = GameRow & {
  mode: string;
  leaders: { home: Leaders | null; away: Leaders | null } | null;
  momentum: (MomentumSummary & { points: number }) | null;
  last_plays: Play[];
  plays_count: number;
  summaries: { kind: string; text: string; created_at: string }[];
  poll_note: string;
  notes: string[];
};
export type BoxRow = {
  espn_athlete_id: string;
  player_id: number | null;
  team_id: number;
  name: string;
  position: string | null;
  jersey: string | null;
  headshot_url: string | null;
  starter: boolean;
  role: "starter" | "bench" | null;
  dnp: boolean;
  ejected: boolean;
  on_court: boolean | null;
  minutes: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  pf: number | null;
  fgm: number | null;
  fga: number | null;
  fg3m: number | null;
  fg3a: number | null;
  ftm: number | null;
  fta: number | null;
  oreb: number | null;
  dreb: number | null;
  plus_minus: number | null;
  pra: number | null;
  pr: number | null;
  pa: number | null;
  ra: number | null;
  fg_pct: number | null;
  fg3_pct: number | null;
  ft_pct: number | null;
  true_shooting_pct: number | null;
  foul_trouble: boolean | null;
  pregame: { proj_min: number | null; pts: number | null; reb: number | null; ast: number | null; fg3m: number | null; published_at: string | null } | null;
};
export type BoxTeam = { team_id: number; abbr: string; name: string; players: BoxRow[]; totals: Record<string, number | null> };
export type BoxScore = Freshness & { game_id: string; status: string; period: number | null; available: boolean; home: BoxTeam; away: BoxTeam; notes: string[] };
export type PlayByPlay = Freshness & { game_id: string; total: number; items: Play[]; note: string };
export type RotationPlayer = {
  espn_athlete_id: string;
  player_id: number | null;
  name: string;
  starter: boolean;
  role: string | null;
  on_court: boolean | null;
  stints: { start_s: number; end_s: number | null }[];
  minutes_by_period: Record<string, number>;
  minutes: number | null;
  pf: number | null;
  foul_trouble: boolean | null;
  proj_min: number | null;
  minutes_vs_projection: number | null;
};
export type RotationTeam = { team_id: number; abbr: string; determinable: boolean; problems: string[]; note: string; players: RotationPlayer[] };
export type Rotations = { game_id: string; status: string; period: number | null; elapsed_s: number | null; home: RotationTeam; away: RotationTeam; notes: string[] };
export type TeamStats = { game_id: string; home: { team_id: number; abbr: string }; away: { team_id: number; abbr: string }; available: boolean; items: { key: string; label: string; home: string | null; away: string | null; home_value: number | null; away_value: number | null }[]; not_published: string[] };
export type Momentum = MomentumSummary & { points: { t: number; period: number; home: number; away: number; diff: number }[] };
export type Milestone = {
  id: number;
  player_id: number;
  player_name?: string;
  stat: string;
  threshold: number;
  game_date: string;
  notify: boolean;
  current: number | null;
  remaining: number | null;
  reached: boolean;
  reached_at: string | null;
  reached_value: number | null;
  game_status: string | null;
  observed_at: string | null;
  note: string | null;
};
export type PlayerLiveBlock = (Freshness & { game_id: string; label: string; status: string; status_label: string; period: number | null; period_label: string; clock: string | null; line: BoxRow | null }) | null;
export type LivePlayer = { player_id: number; name: string; headshot_url: string | null; date: string; followed: boolean; live: PlayerLiveBlock; milestones: Milestone[] };
export type Watchlist = { date: string; games: GameRow[]; players: { player_id: number; name: string; team_abbr: string | null; headshot_url: string | null; live: PlayerLiveBlock; milestones: Milestone[] }[]; teams: { team_id: number; abbr: string; name: string }[]; counts: Record<string, number> };
export type TrackerLeg = {
  label: string;
  market: string;
  side: string;
  line: number | null;
  game_id: string | null;
  game_label: string | null;
  subject_id: number | null;
  current: number | null;
  current_basis: string | null;
  difference_to_line: number | null;
  game_status: string | null;
  status_label: string | null;
  period_label: string | null;
  clock: string | null;
  observation: string;
  observed_at: string | null;
  stale: boolean;
};
export type TrackerItem = { ticket_id: number; kind: string; engine: string; structure: string; classification: string; created_at: string; status: "pending" | "settled"; settlement: { result: string; settled_at: string; reason: string | null } | null; legs: TrackerLeg[] };
export type Tracker = { date: string; total: number; notes: string[]; items: TrackerItem[] };

export const MILESTONE_STATS = ["pts", "reb", "ast", "fg3m", "stl", "blk", "min", "pra", "pr", "pa", "ra", "double_double"] as const;

const g = encodeURIComponent;
export const live = {
  scoreboard: (date?: string) => http.get<Scoreboard>("/live/scoreboard", { date }),
  game: (id: string) => http.get<GameCenter>(`/live/games/${g(id)}`),
  boxscore: (id: string) => http.get<BoxScore>(`/live/games/${g(id)}/boxscore`),
  plays: (id: string, p: { filter?: string; team_id?: number | string; player_id?: number | string; after_sequence?: number; limit?: number; offset?: number; order?: string }) => http.get<PlayByPlay>(`/live/games/${g(id)}/play-by-play`, p),
  rotations: (id: string) => http.get<Rotations>(`/live/games/${g(id)}/rotations`),
  teamStats: (id: string) => http.get<TeamStats>(`/live/games/${g(id)}/team-stats`),
  momentum: (id: string) => http.get<Momentum>(`/live/games/${g(id)}/momentum`),
  player: (id: string | number, date?: string) => http.get<LivePlayer>(`/live/players/${id}`, { date }),
  watchlist: (date?: string) => http.get<Watchlist>("/live/watchlist", { date }),
  follow: (kind: "game" | "player" | "team", ref_id: string | number, on: boolean) => http.post<{ following: boolean; kind: string; ref_id: string | number }>(`/live/watchlist/${on ? "follow" : "unfollow"}`, { kind, ref_id }),
  milestones: (date?: string) => http.get<{ date: string; items: Milestone[]; stats: string[] }>("/live/milestones", { date }),
  addMilestone: (body: { player_id: number; stat: string; threshold: number; date?: string; notify?: boolean }) => http.post<Milestone>("/live/milestones", body),
  deleteMilestone: (id: number) => http.post<unknown>(`/live/milestones/${id}/delete`),
  tracker: (date?: string) => http.get<Tracker>("/live/research-tracker", { date }),
};

export const isInProgress = (status: string) => status === "live" || status === "overtime" || status === "halftime" || status === "end_period";
/** A pulsing LIVE indicator is allowed only for these two statuses. */
export const isLive = (status: string) => status === "live" || status === "overtime";

function useVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== "hidden");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/** Scoreboard polling: every 15 s while games are in progress, every 60 s otherwise, paused while the tab is hidden. */
export function useScoreboard(date?: string) {
  const visible = useVisible();
  return useQuery({
    queryKey: ["live", "scoreboard", date ?? "today"],
    queryFn: () => live.scoreboard(date),
    refetchInterval: (q) => (!visible ? false : (q.state.data?.live_count ?? 0) > 0 ? 15_000 : 60_000),
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
}

/** Team logos keyed by abbreviation (live rows carry no logo URL). */
export function useTeamLogos(): Record<string, string | null> {
  const teams = useTeams();
  return useMemo(() => Object.fromEntries((teams.data?.items ?? []).map((t) => [t.abbr, t.logo_url])), [teams.data]);
}

export type StreamState = "connecting" | "open" | "reconnecting" | "polling";
const BACKOFF = [1000, 2000, 5000, 10000];

/**
 * Live game row kept current by EventSource on /live/games/{id}/stream. On error it reconnects with backoff
 * (1 s, 2 s, 5 s, 10 s); if the stream cannot be opened at all it falls back to polling the game every 15 s.
 * Queries under ["live","game",id] are invalidated whenever `version` increases.
 */
export function useGameStream(id: string, enabled: boolean) {
  const qc = useQueryClient();
  const [row, setRow] = useState<GameRow | null>(null);
  const [state, setState] = useState<StreamState>("connecting");
  const version = useRef(-1);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;
    let everOpened = false;
    let closed = false;
    const apply = (r: GameRow) => {
      setRow(r);
      if (r.version > version.current) {
        const first = version.current === -1;
        version.current = r.version;
        if (!first) void qc.invalidateQueries({ queryKey: ["live", "game", id] });
      }
    };
    const startPolling = () => {
      setState("polling");
      if (poll) return;
      const tick = () => live.game(id).then(apply).catch(() => {});
      void tick();
      poll = setInterval(tick, 15_000);
    };
    const connect = () => {
      if (closed) return;
      if (typeof EventSource === "undefined") return startPolling();
      es = new EventSource(`${API_BASE}/live/games/${encodeURIComponent(id)}/stream`, { withCredentials: true });
      es.onopen = () => {
        everOpened = true;
        attempt = 0;
        setState("open");
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
      };
      es.onmessage = (e) => {
        try {
          apply(JSON.parse(e.data) as GameRow);
        } catch {
          /* ignore a malformed frame */
        }
      };
      const retry = () => {
        es?.close();
        es = null;
        if (closed) return;
        if (!everOpened && attempt >= BACKOFF.length) return startPolling();
        setState("reconnecting");
        timer = setTimeout(connect, BACKOFF[Math.min(attempt, BACKOFF.length - 1)]);
        attempt++;
      };
      es.addEventListener("end", () => {
        // the server closes the stream after five minutes: reconnect straight away, quietly
        es?.close();
        es = null;
        if (!closed) timer = setTimeout(connect, 200);
      });
      es.onerror = retry;
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
    };
  }, [id, enabled, qc]);

  return { row, state };
}
