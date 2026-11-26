"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Star, Target, Users } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FollowButton, FreshnessMark, Score, StatusChip, TeamMark } from "@/components/live/common";
import { LiveNav } from "@/components/live/live-nav";
import { MilestoneRow, milestoneStat } from "@/components/live/milestones";
import { PlayerAvatar } from "@/components/player-avatar";
import { PlayerSearch } from "@/components/player-search";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { ApiError, http } from "@/lib/api";
import { DLink } from "@/lib/date";
import { live, MILESTONE_STATS, type BoxRow } from "@/lib/live";
import { useTeams } from "@/lib/queries";

const NOTIFY_KEY = "gizer.live.notify";
const SHOWN_KEY = "gizer.live.notified";
type EventRow = { id: number; kind: string; title: string; detail: unknown; occurred_at: string };

/** Optional browser notifications for reached thresholds. Works only while the app is open in a tab. */
function Notifications() {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [toasts, setToasts] = useState<EventRow[]>([]);
  const shown = useRef<Set<number>>(new Set());
  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(NOTIFY_KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted");
      shown.current = new Set(JSON.parse(window.localStorage.getItem(SHOWN_KEY) ?? "[]") as number[]);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const events = useQuery({ queryKey: ["jarvis", "events", "milestone_reached"], queryFn: () => http.get<{ items: EventRow[] }>("/jarvis/events", { kind: "milestone_reached", limit: 20 }), refetchInterval: on ? 30_000 : false, enabled: on });
  useEffect(() => {
    if (!on || !events.data) return;
    const fresh = events.data.items.filter((e) => !shown.current.has(e.id) && (e.detail as { notify?: boolean } | null)?.notify === true);
    if (fresh.length === 0) return;
    for (const e of fresh) {
      shown.current.add(e.id);
      try {
        new Notification("GIZER NBA — threshold reached", { body: e.title, tag: `milestone-${e.id}` });
      } catch {
        /* the in-app toast still shows */
      }
    }
    setToasts((t) => [...fresh, ...t].slice(0, 4));
    try {
      window.localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown.current].slice(-200)));
    } catch {
      /* ignore */
    }
  }, [on, events.data]);
  const toggle = async () => {
    setMsg(null);
    if (on) {
      setOn(false);
      try {
        window.localStorage.setItem(NOTIFY_KEY, "0");
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof Notification === "undefined") return setMsg("This browser does not support notifications.");
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return setMsg("Notification permission was not granted in the browser.");
    setOn(true);
    try {
      window.localStorage.setItem(NOTIFY_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <Panel title="Browser notifications for reached thresholds" icon={Bell}>
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="notify-setting" data-on={on ? "1" : "0"}>
        <p className="min-w-0 flex-1 text-sm text-muted">Off by default. When on, a notification is shown once for each reached threshold that has “notify” set. Notifications work only while the app is open in a browser tab.</p>
        <Button size="md" variant={on ? "primary" : "outline"} onClick={() => void toggle()} aria-pressed={on} data-testid="notify-toggle">
          {on ? "Turn off" : "Turn on"}
        </Button>
      </div>
      {msg && <p role="alert" className="mt-2 text-sm text-warn">{msg}</p>}
      {toasts.length > 0 && (
        <ul className="fixed bottom-20 right-3 z-40 space-y-2 lg:bottom-12" aria-live="polite" data-testid="live-toasts">
          {toasts.map((t) => (
            <li key={t.id} className="flex max-w-xs items-start gap-2 rounded-md bg-raised px-3 py-2 text-sm text-ink shadow-lg ring-1 ring-line">
              <span className="min-w-0 flex-1 break-words">{t.title}</span>
              <button type="button" aria-label="Dismiss" className="text-muted hover:text-ink" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AddThreshold() {
  const qc = useQueryClient();
  const [player, setPlayer] = useState<{ id: number; name: string } | null>(null);
  const [stat, setStat] = useState("pts");
  const [threshold, setThreshold] = useState("");
  const [notify, setNotify] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => live.addMilestone({ player_id: (player as { id: number }).id, stat, threshold: stat === "double_double" ? 1 : Number(threshold), notify }),
    onSuccess: () => {
      setThreshold("");
      void qc.invalidateQueries({ queryKey: ["live"] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!player) return setLocal("Choose a player first.");
    if (stat !== "double_double" && (threshold.trim() === "" || !Number.isFinite(Number(threshold)) || Number(threshold) <= 0)) return setLocal("Enter a threshold above zero.");
    setLocal(null);
    add.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="milestone-form">
      {player ? (
        <div className="flex items-center justify-between gap-2 rounded-md bg-raised/50 px-3 py-2">
          <span className="text-sm font-semibold text-ink" data-testid="milestone-player">{player.name}</span>
          <Button variant="ghost" onClick={() => setPlayer(null)}>
            Change player
          </Button>
        </div>
      ) : (
        <PlayerSearch
          placeholder="Search for a player to track"
          action={(p) => (
            <Button onClick={() => setPlayer({ id: p.id, name: p.name })} data-testid="milestone-pick">
              Select
            </Button>
          )}
        />
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <Field label="Stat">
          <Select value={stat} onChange={(e) => setStat(e.target.value)} name="milestone_stat">
            {MILESTONE_STATS.map((s) => (
              <option key={s} value={s}>{milestoneStat(s)}</option>
            ))}
          </Select>
        </Field>
        <Field label="Threshold">
          <Input type="number" step="0.5" min="0" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={stat === "double_double"} name="milestone_threshold" placeholder={stat === "double_double" ? "not needed" : ""} />
        </Field>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-soft md:min-h-9">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[rgb(0,229,160)]" name="milestone_notify" />
          Notify
        </label>
        <Button type="submit" variant="primary" size="md" disabled={add.isPending} data-testid="milestone-add">
          {add.isPending ? "Adding…" : "Add threshold"}
        </Button>
      </div>
      {(local || add.isError) && <p role="alert" className="text-sm text-bad" data-testid="milestone-error">{local ?? (add.error instanceof ApiError ? add.error.message : "Could not add the threshold.")}</p>}
      <p className="text-xs text-muted">A tracking threshold compares a player’s observed stat with a number you choose. It reports current, threshold and remaining — it is not an estimate of what will happen.</p>
    </form>
  );
}

const lineText = (l: BoxRow | null) => (l ? `${l.minutes ?? "—"} min · ${l.pts ?? "—"} pts · ${l.reb ?? "—"} reb · ${l.ast ?? "—"} ast` : null);

export default function FollowingPage() {
  const q = useQuery({ queryKey: ["live", "watchlist"], queryFn: () => live.watchlist(), refetchInterval: 30_000 });
  const teams = useTeams();
  const [team, setTeam] = useState("");
  return (
    <div className="space-y-5">
      <PageHeader title="My Following" sub="Followed games, your player watchlist with tracking thresholds, and favourite teams." />
      <LiveNav />
      <QueryView query={q} rows={6}>
        {(w) => (
          <div className="space-y-5">
            <Panel title="Followed games" icon={Star} right={<span className="num">{w.games.length}</span>}>
              {w.games.length === 0 ? (
                <EmptyState title="You are not following any game on this date." icon={Star}>
                  Use the star on a game card or in the game centre to follow it. Games of favourite teams are included automatically.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-line/30" data-testid="following-games">
                  {w.games.map((g) => (
                    <li key={g.game_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5" data-testid="following-game">
                      <DLink href={`/games/${encodeURIComponent(g.game_id)}?tab=live`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                        <TeamMark team={g.away} size={22} />
                        <span className="text-sm font-semibold text-ink">{g.away.abbr}</span>
                        <Score v={g.away.score} className="text-xl" />
                        <span className="text-faint">@</span>
                        <TeamMark team={g.home} size={22} />
                        <span className="text-sm font-semibold text-ink">{g.home.abbr}</span>
                        <Score v={g.home.score} className="text-xl" />
                      </DLink>
                      <StatusChip g={g} />
                      <FreshnessMark f={g} />
                      <FollowButton kind="game" refId={g.game_id} followed={g.followed} label={g.label} compact />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Player watchlist" icon={Users} right={<span className="num">{w.players.length}</span>}>
              {w.players.length === 0 ? (
                <EmptyState title="No players on your watchlist." icon={Users}>
                  Follow a player from their profile, or add a tracking threshold below — that adds the player here.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-line/30" data-testid="watchlist-players">
                  {w.players.map((p) => (
                    <li key={p.player_id} className="py-3" data-testid="watchlist-player">
                      <div className="flex flex-wrap items-center gap-3">
                        <PlayerAvatar name={p.name} src={p.headshot_url} size={36} />
                        <div className="min-w-0 flex-1">
                          <DLink href={`/players/${p.player_id}`} className="text-sm font-semibold text-ink hover:underline">
                            {p.name}
                          </DLink>
                          <span className="ml-1.5 text-xs text-muted">{p.team_abbr ?? "—"}</span>
                          <div className="num text-xs text-muted">
                            {p.live ? (
                              <>
                                <span className="text-soft">{lineText(p.live.line) ?? "No line published yet"}</span> · {p.live.label} · {p.live.status_label}
                                {p.live.line?.pregame ? ` · pregame projection ${p.live.line.pregame.pts ?? "—"} pts / ${p.live.line.pregame.proj_min ?? "—"} min` : " · no pregame projection"}
                              </>
                            ) : (
                              "No game in progress for this player on this date"
                            )}
                          </div>
                        </div>
                        <FollowButton kind="player" refId={p.player_id} followed label={p.name} compact />
                      </div>
                      {p.milestones.length > 0 && (
                        <ul className="mt-1 divide-y divide-line/20 pl-12">
                          {p.milestones.map((m) => (
                            <MilestoneRow key={m.id} m={m} />
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Add a tracking threshold" icon={Target}>
              <AddThreshold />
            </Panel>

            <Panel title="Favourite teams" icon={Star} right={<span className="num">{w.teams.length}</span>}>
              {w.teams.length === 0 ? <p className="text-sm text-muted">No favourite teams. Their games are placed first on the scoreboard.</p> : (
                <ul className="flex flex-wrap gap-2" data-testid="favorite-teams">
                  {w.teams.map((t) => (
                    <li key={t.team_id} className="flex items-center gap-2 rounded-md bg-raised/50 py-1 pl-3 pr-1">
                      <span className="text-sm font-medium text-ink">{t.name}</span>
                      <FollowButton kind="team" refId={t.team_id} followed label={t.name} compact />
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Add a favourite team" className="w-56">
                  <Select value={team} onChange={(e) => setTeam(e.target.value)} data-testid="favorite-team-select">
                    <option value="">Select a team</option>
                    {(teams.data?.items ?? []).filter((t) => !w.teams.some((x) => x.team_id === t.id)).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                </Field>
                {team && <FollowButton key={team} kind="team" refId={Number(team)} followed={false} label="team" />}
              </div>
            </Panel>

            <Notifications />
          </div>
        )}
      </QueryView>
    </div>
  );
}
