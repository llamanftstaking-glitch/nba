"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { TeamMark } from "@/components/live/common";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge } from "@/components/ui/badge";
import { linkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { NA } from "@/components/ui/na";
import { Label, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { cortex, type CortexTeamRow, type PlayerDna, type TeamDna, type TeamRotation } from "@/lib/cortex";
import { DLink } from "@/lib/date";
import { fmtDate, fmtDateTimeET, fmtInt, fmtNum, fmtSigned } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import { NotAvailablePanel, PlainList, Stat } from "./common";

const n1 = (v: number | null | undefined, d = 1): ReactNode => fmtNum(v, d) ?? <NA />;
const int = (v: number | null | undefined): ReactNode => fmtInt(v) ?? <NA />;

function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium link md:min-h-0" data-testid="profile-back">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {children}
    </button>
  );
}

function ProfileMeta({ method, generated, season }: { method: string | null; generated: string | null; season: string }) {
  return (
    <p className="break-words text-xs text-muted" data-testid="profile-method">
      Season {season}
      {generated ? ` · computed ${fmtDateTimeET(generated)}` : ""}
      {method ? ` · ${method}` : ""}
    </p>
  );
}

/* ------------------------------------------------------------------ player DNA */
/** A descriptive label that always travels with the rule that produced it. */
export function ArchetypeChip({ a }: { a: { key: string; label: string; rule: string } }) {
  return (
    <li className="border-l-2 border-line py-1 pl-3" data-testid="archetype" data-key={a.key}>
      <Badge tone="info">{a.label}</Badge>
      <p className="mt-1.5 break-words font-mono text-xs text-soft" data-testid="archetype-rule">{a.rule}</p>
    </li>
  );
}

function PlayerProfile({ d }: { d: PlayerDna }) {
  const id = d.identity;
  const s = d.season_line;
  const r = d.recent_10;
  return (
    <div className="space-y-4" data-testid="player-dna" data-available={d.available ? "1" : "0"}>
      <section className="blk p-4">
        <div className="flex flex-wrap items-center gap-4">
          <PlayerAvatar name={id.name} src={id.headshot_url} size={64} />
          <div className="min-w-0 flex-1">
            <h2 className="break-words font-display text-2xl font-semibold text-ink">{id.name}</h2>
            <p className="num text-sm text-soft">
              {[id.team, id.position, id.jersey ? `#${id.jersey}` : null].filter(Boolean).join(" · ") || "Team not recorded"}
              {id.last_game_date ? ` · last game ${fmtDate(id.last_game_date, { year: true })}` : ""}
            </p>
          </div>
          <DLink href={`/players/${id.player_id}`} className={`${linkButton} max-sm:w-full max-sm:justify-center`} data-testid="player-full-page">
            Full player page
          </DLink>
        </div>
        <div className="mt-2">
          <ProfileMeta method={d.method} generated={d.generated_at} season={d.season} />
        </div>
        {id.not_held.length > 0 && (
          <p className="mt-3 break-words text-xs text-muted" data-testid="identity-not-held">Not held for this player: {id.not_held.join(", ")}.</p>
        )}
        {d.team_history.length > 0 && (
          <div className="mt-3">
            <Label>Team history in our data</Label>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-soft" data-testid="team-history">
              {d.team_history.map((t, i) => (
                <li key={i} className="num">
                  <span className="font-semibold text-ink">{t.season}</span> {t.team} · {t.games} games{t.first && t.last ? ` (${fmtDate(t.first)} – ${fmtDate(t.last)})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {!d.available ? (
        <NotAvailablePanel title="Profile" reason={d.note ?? "The server did not give a reason."} testId="player-dna-unavailable" />
      ) : (
        <>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title={`Season line · ${d.season}`}>
              {s ? (
                <>
                  <dl className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-6" data-testid="season-line">
                    <Stat label="Games" value={int(s.games)} />
                    <Stat label="Minutes" value={int(s.minutes_total)} />
                    <Stat label="Min / game" value={n1(s.mpg)} sub={s.minutes_sd !== null ? `sd ${fmtNum(s.minutes_sd)}` : undefined} />
                    <Stat label="Usage %" value={n1(s.usage)} sub={s.usage_games !== null ? `${s.usage_games} games` : undefined} />
                    <Stat label="True shooting %" value={n1(s.true_shooting_pct)} />
                    <Stat label="Start share" value={s.start_share === null ? <NA /> : `${fmtNum(s.start_share * 100, 0)}%`} sub={s.starts_known_games !== null ? `${s.starts_known_games} games known` : undefined} />
                    <Stat label="PTS per 36" value={n1(s.pts36)} />
                    <Stat label="REB per 36" value={n1(s.reb36)} />
                    <Stat label="AST per 36" value={n1(s.ast36)} />
                    <Stat label="3PM per 36" value={n1(s.fg3m36)} />
                    <Stat label="STL per 36" value={n1(s.stl36)} />
                    <Stat label="BLK per 36" value={n1(s.blk36)} />
                    <Stat label="TOV per 36" value={n1(s.tov36)} />
                    <Stat label="FGA per 36" value={n1(s.fga36)} />
                    <Stat label="FTA per 36" value={n1(s.fta36)} />
                  </dl>
                  <p className="mt-3 text-xs text-muted">“Per 36” scales the season totals to 36 minutes. It describes what happened in the minutes played; it is not a projection of a larger role.</p>
                </>
              ) : (
                <p className="text-sm text-soft">No season line was returned.</p>
              )}
            </Panel>
            <Panel title="Recent 10 games">
              {r ? (
                <dl className="grid grid-cols-3 gap-x-4 gap-y-3" data-testid="recent-10">
                  <Stat label="Games" value={int(r.games)} />
                  <Stat label="Min / game" value={n1(r.mpg)} />
                  <Stat label="Usage %" value={n1(r.usage)} />
                  <Stat label="PTS / game" value={n1(r.pts)} />
                  <Stat label="REB / game" value={n1(r.reb)} />
                  <Stat label="AST / game" value={n1(r.ast)} />
                </dl>
              ) : (
                <p className="text-sm text-soft">No recent-games block was returned.</p>
              )}
            </Panel>
          </div>

          <Panel title="Archetypes (descriptive labels)" right={d.archetype_status ? <span data-testid="archetype-status">status: {d.archetype_status}</span> : undefined}>
            {(d.archetypes ?? []).length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="archetypes">
                {(d.archetypes ?? []).map((a) => (
                  <ArchetypeChip key={a.key} a={a} />
                ))}
              </ul>
            ) : d.archetype_status === "derived" ? (
              <p className="text-sm text-soft" data-testid="archetypes-none">The rules were applied and this player matched none of them this season. That is a result, not a gap.</p>
            ) : (
              <p className="text-sm text-soft" data-testid="archetypes-not-derived">
                Not derived: <span className="font-medium text-ink">{d.archetype_status ?? "the server gave no status"}</span>
              </p>
            )}
            <p className="mt-3 text-xs text-muted">Each label is shown with the rule that produced it. Labels describe this season’s box scores; they are not scouting verdicts.</p>
          </Panel>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel title="Usage with and without teammates">
              {d.teammate_context === null || d.teammate_context === undefined ? (
                <p className="text-sm text-soft" data-testid="teammates-none">Not available for this player.</p>
              ) : d.teammate_context.length === 0 ? (
                <p className="text-sm text-soft" data-testid="teammates-none">No teammate rows were returned.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-sm" data-testid="teammate-context">
                    <caption className="sr-only">Usage with and without each teammate</caption>
                    <thead>
                      <tr className="border-b border-line text-2xs font-semibold text-muted">
                        <th scope="col" className="pb-2 pr-2 text-left">Teammate</th>
                        <th scope="col" className="px-2 pb-2 text-right">Games with</th>
                        <th scope="col" className="px-2 pb-2 text-right">Usage with</th>
                        <th scope="col" className="px-2 pb-2 text-right">Games without</th>
                        <th scope="col" className="pb-2 pl-2 text-right">Usage without</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.teammate_context.map((t) => (
                        <tr key={t.teammate} className="border-b border-line" data-testid="teammate-row" data-small={t.small_sample ? "1" : "0"}>
                          <th scope="row" className="py-1.5 pr-2 text-left font-medium text-ink">
                            {t.teammate}
                            {t.small_sample && <span className="ml-2 whitespace-nowrap text-2xs font-semibold text-warn" data-testid="small-sample">small sample</span>}
                          </th>
                          <td className="num px-2 py-1.5 text-right text-soft">{fmtInt(t.games_with)}</td>
                          <td className="num px-2 py-1.5 text-right text-ink">{n1(t.usage_with)}</td>
                          <td className="num px-2 py-1.5 text-right text-soft">{fmtInt(t.games_without)}</td>
                          <td className="num py-1.5 pl-2 text-right text-ink">{n1(t.usage_without)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-xs text-muted">Usage is in percent. A row marked “small sample” rests on too few games on one side to read anything into the difference.</p>
            </Panel>
            <NotAvailablePanel title="Tactical profile" reason={d.tactical_profile?.reason ?? "The server did not give a reason."} testId="tactical-profile" />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Panel title="Not available for this profile">
              {(d.not_available ?? []).length ? <PlainList items={d.not_available ?? []} testId="dna-not-available" tone="warn" /> : <p className="text-sm text-soft">The server lists nothing here.</p>}
            </Panel>
            <Panel title="Notes">
              {(d.notes ?? []).length ? <PlainList items={d.notes ?? []} testId="dna-notes" /> : <p className="text-sm text-soft">No notes.</p>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

export function PlayerDnaSection({ playerId, onSelect }: { playerId: string | null; onSelect: (id: string | null) => void }) {
  const [text, setText] = useState("");
  const search = useDebounced(text.trim(), 300);
  const list = useQuery({ queryKey: ["cortex", "players", search], queryFn: () => cortex.players(search, 60), enabled: playerId === null });
  const dna = useQuery({ queryKey: ["cortex", "player-dna", playerId], queryFn: () => cortex.playerDna(playerId as string), enabled: playerId !== null, retry: false });
  if (playerId !== null) {
    return (
      <div className="space-y-3">
        <BackButton onClick={() => onSelect(null)}>All player profiles</BackButton>
        <QueryView query={dna} rows={8}>
          {(d) => <PlayerProfile d={d} />}
        </QueryView>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="player-dna-list">
      <p className="max-w-3xl text-sm text-muted">Profiles are computed from this platform’s stored box scores for the current season. Players are listed by minutes played.</p>
      <label className="relative block max-w-md">
        <span className="sr-only">Search players by name</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
        <Input type="search" name="cortex_player_q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search players by name" className="pl-9" />
      </label>
      <QueryView query={list} rows={8}>
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState title={search ? `No player matches “${search}”.` : "No player profiles are available."} icon={Search} />
          ) : (
            <>
              <p className="text-xs text-muted" data-testid="player-list-count">
                Season {d.season} · showing {d.items.length} {search ? "matching players" : "players with the most minutes"}. Search by name to find anyone else.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="cortex-players">
                {d.items.map((p) => (
                  <li key={p.player_id}>
                    <button type="button" onClick={() => onSelect(String(p.player_id))} className="flex min-h-[56px] w-full items-center gap-3 blk px-3 py-2 text-left hover:ring-accent/50" data-testid="cortex-player" data-player-id={p.player_id}>
                      <PlayerAvatar name={p.name} src={p.headshot_url} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                        <span className="num block text-xs text-muted">{[p.team_abbr, p.position].filter(Boolean).join(" · ") || "team not recorded"}</span>
                      </span>
                      <span className="num shrink-0 text-right text-xs text-muted">
                        <span className="block text-sm font-semibold text-ink">{p.games ?? "—"} g</span>
                        {p.minutes ?? "—"} min
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )
        }
      </QueryView>
    </div>
  );
}

/* ------------------------------------------------------------------ team + coach DNA */
function TeamGrid({ onSelect, intro }: { onSelect: (id: string) => void; intro: string }) {
  const q = useQuery({ queryKey: ["cortex", "teams"], queryFn: cortex.teams });
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted">{intro}</p>
      <QueryView query={q} rows={8} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No teams were returned." />}>
        {(d) => (
          <>
            <p className="text-xs text-muted" data-testid="team-grid-count">
              Season {d.season} · {d.items.filter((t) => t.profile_available).length} of {d.items.length} teams have a profile.
            </p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" data-testid="cortex-teams">
              {d.items.map((t: CortexTeamRow) => (
                <li key={t.team_id}>
                  <button type="button" onClick={() => onSelect(String(t.team_id))} className="flex min-h-[64px] w-full items-center gap-3 blk px-3 py-2 text-left hover:ring-accent/50" data-testid="cortex-team" data-team-id={t.team_id} data-available={t.profile_available ? "1" : "0"}>
                    <TeamMark team={t} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold text-ink">{t.name}</span>
                      <span className={`block text-xs ${t.profile_available ? "text-muted" : "font-semibold text-warn"}`}>{t.profile_available ? "Profile available" : "No profile yet"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryView>
    </div>
  );
}

function TeamHeader({ d, sub }: { d: TeamDna; sub?: ReactNode }) {
  return (
    <section className="blk p-4">
      <div className="flex flex-wrap items-center gap-4">
        <TeamMark team={d} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-display text-2xl font-semibold text-ink">{d.name}</h2>
        </div>
        <DLink href={`/teams/${d.team_id}`} className={`${linkButton} max-sm:w-full max-sm:justify-center`}>
          Team page
        </DLink>
      </div>
      <div className="mt-2">
        <ProfileMeta method={d.method} generated={d.generated_at} season={d.season} />
      </div>
      {sub}
    </section>
  );
}

/** The rotation block of a team profile: observed minutes patterns, with the games count behind each number. */
function RotationBlock({ r }: { r: TeamRotation }) {
  const fs = r.first_substitution;
  return (
    <div className="space-y-4" data-testid="rotation-block">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Games" value={int(r.games)} />
        <Stat label="Rotation length" value={n1(r.players_10_plus_minutes_per_game)} sub="players with 10+ min per game" />
        <Stat label="Range" value={r.rotation_length_range ? `${r.rotation_length_range[0]}–${r.rotation_length_range[1]}` : <NA />} sub="fewest – most in a game" />
        <Stat label="Starter minutes" value={n1(r.starter_minutes_avg)} sub={r.games_with_confirmed_starters !== null ? `${r.games_with_confirmed_starters} games with confirmed starters` : undefined} />
        <Stat label="Bench points" value={n1(r.bench_points_per_game)} sub="per game" />
        <Stat label="Starting fives" value={int(r.distinct_starting_fives)} sub="distinct line-ups used" />
      </dl>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div>
          <Label>Most used starting fives</Label>
          {r.most_used_starting_fives.length === 0 ? (
            <p className="text-sm text-muted">None recorded.</p>
          ) : (
            <ul className="space-y-2" data-testid="starting-fives">
              {r.most_used_starting_fives.map((f, i) => (
                <li key={i} className="flex items-start justify-between gap-3 border-l-2 border-line py-1 pl-3 text-sm">
                  <span className="min-w-0 break-words text-soft">{f.players.join(" · ")}</span>
                  <span className="num shrink-0 font-semibold text-ink">{f.games} g</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <Label>Minutes leaders</Label>
          {r.minutes_leaders.length === 0 ? (
            <p className="text-sm text-muted">None recorded.</p>
          ) : (
            <ul className="divide-y divide-line" data-testid="minutes-leaders">
              {r.minutes_leaders.map((p) => (
                <li key={`${p.player_id}-${p.name}`} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  {p.player_id !== null ? (
                    <DLink href={`/players/${p.player_id}`} className="min-w-0 truncate font-medium text-ink hover:underline">{p.name}</DLink>
                  ) : (
                    <span className="min-w-0 truncate font-medium text-ink">{p.name}</span>
                  )}
                  <span className="num shrink-0 text-muted">
                    <span className="font-semibold text-ink">{n1(p.mpg)}</span> min · {p.games} g
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border-l-2 border-line py-1 pl-3 text-sm" data-testid="first-substitution">
        <span className="text-2xs font-semibold text-muted">First substitution</span>
        {fs === null ? (
          <p className="text-soft">Not available.</p>
        ) : fs.average_minutes_into_game !== null && fs.average_minutes_into_game !== undefined ? (
          <p className="num text-soft">
            On average <span className="font-semibold text-ink">{fmtNum(fs.average_minutes_into_game)}</span> minutes into the game, over {fs.games_observed_live} games observed live.{fs.note ? ` ${fs.note}` : ""}
          </p>
        ) : (
          <p className="break-words text-soft">{fs.note ?? "Not available."} <span className="num text-muted">({fs.games_observed_live} games observed live)</span></p>
        )}
      </div>
    </div>
  );
}

function TeamProfile({ d }: { d: TeamDna }) {
  const rec = d.record;
  return (
    <div className="space-y-4" data-testid="team-dna" data-available={d.available ? "1" : "0"}>
      <TeamHeader d={d} />
      {!d.available ? (
        <NotAvailablePanel title="Profile" reason={d.note ?? "The server did not give a reason."} testId="team-dna-unavailable" />
      ) : (
        <>
          <div className="grid items-start gap-4 xl:grid-cols-3">
            <Panel title="Record">
              {rec ? (
                <dl className="grid grid-cols-3 gap-x-4 gap-y-3" data-testid="team-record">
                  <Stat label="Record" value={`${rec.wins}–${rec.losses}`} sub={`${rec.games} games`} />
                  <Stat label="Home" value={rec.home ?? <NA />} />
                  <Stat label="Away" value={rec.away ?? <NA />} />
                  <Stat label="Points" value={n1(rec.points_per_game)} sub="per game" />
                  <Stat label="Allowed" value={n1(rec.points_allowed_per_game)} sub="per game" />
                  <Stat label="Differential" value={fmtSigned(rec.point_differential, 1) ?? <NA />} />
                </dl>
              ) : (
                <p className="text-sm text-soft">Not available.</p>
              )}
            </Panel>
            <Panel title="Ratings">
              {d.ratings ? (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3" data-testid="team-ratings">
                    <Stat label="Offensive" value={n1(d.ratings.offensive_rating)} />
                    <Stat label="Defensive" value={n1(d.ratings.defensive_rating)} />
                    <Stat label="Net" value={fmtSigned(d.ratings.net_rating, 1) ?? <NA />} />
                    <Stat label="Pace" value={n1(d.ratings.pace_possessions_per_game)} sub="possessions per game" />
                  </dl>
                  <p className="mt-3 break-words text-xs text-muted">
                    {d.ratings.games_with_possessions !== null ? `${d.ratings.games_with_possessions} games with possession counts. ` : ""}
                    {d.ratings.note ?? ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-soft" data-testid="team-ratings-unavailable">
                  <span className="font-semibold text-warn">Not available.</span> No possession counts are held for this team’s games, so no rating is computed.
                </p>
              )}
            </Panel>
            <Panel title="Shot volume">
              {d.shot_volume ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3" data-testid="team-shot-volume">
                  <Stat label="3PM" value={n1(d.shot_volume.three_pointers_made_per_game)} sub="per game" />
                  <Stat label="FGA" value={n1(d.shot_volume.field_goal_attempts_per_game)} sub="per game" />
                  <Stat label="FTA" value={n1(d.shot_volume.free_throw_attempts_per_game)} sub="per game" />
                  <Stat label="Turnovers" value={n1(d.shot_volume.turnovers_per_game)} sub="per game" />
                </dl>
              ) : (
                <p className="text-sm text-soft">
                  <span className="font-semibold text-warn">Not available.</span>
                </p>
              )}
            </Panel>
          </div>
          <Panel title="Rotation">
            {d.rotation ? <RotationBlock r={d.rotation} /> : <p className="text-sm text-soft"><span className="font-semibold text-warn">Not available.</span></p>}
          </Panel>
          <div className="grid items-start gap-4 xl:grid-cols-3">
            <NotAvailablePanel title="Tactical identity" reason={d.tactical_identity?.reason ?? "The server did not give a reason."} testId="tactical-identity" />
            <Panel title="Not available for this profile">
              {(d.not_available ?? []).length ? <PlainList items={d.not_available ?? []} testId="dna-not-available" tone="warn" /> : <p className="text-sm text-soft">The server lists nothing here.</p>}
            </Panel>
            <Panel title="Notes">
              {(d.notes ?? []).length ? <PlainList items={d.notes ?? []} testId="dna-notes" /> : <p className="text-sm text-soft">No notes.</p>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function CoachProfile({ d }: { d: TeamDna }) {
  return (
    <div className="space-y-4" data-testid="coach-dna" data-available={d.available ? "1" : "0"}>
      <TeamHeader d={d} />
      <div className="border-l-4 border-warn py-1 pl-4" data-testid="coach-note">
        <p className="font-display text-lg font-semibold text-warn">Coach not identified</p>
        <p className="mt-1 break-words text-sm text-soft">{d.coach?.note ?? d.note ?? "Coach identities are not in our data."}</p>
      </div>
      <Panel title="Rotation tendencies (coach not identified)">
        {d.available && d.rotation ? (
          <RotationBlock r={d.rotation} />
        ) : (
          <p className="text-sm text-soft" data-testid="coach-rotation-unavailable">
            <span className="font-semibold text-warn">Not available.</span> {d.note ?? "No rotation data is held for this team."}
          </p>
        )}
      </Panel>
      {(d.notes ?? []).length > 0 && (
        <Panel title="Notes">
          <PlainList items={d.notes ?? []} testId="dna-notes" />
        </Panel>
      )}
    </div>
  );
}

export function TeamDnaSection({ teamId, onSelect, coach = false }: { teamId: string | null; onSelect: (id: string | null) => void; coach?: boolean }) {
  const dna = useQuery({ queryKey: ["cortex", "team-dna", teamId], queryFn: () => cortex.teamDna(teamId as string), enabled: teamId !== null, retry: false });
  if (teamId === null) {
    return (
      <div data-testid={coach ? "coach-dna-grid" : "team-dna-grid"}>
        <TeamGrid
          onSelect={onSelect}
          intro={
            coach
              ? "Coach identities are not in our data, so there are no coach profiles. Choose a team to see its observed rotation tendencies this season, under whoever is coaching it."
              : "Team profiles are computed from this platform’s stored final scores and box scores for the current season."
          }
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <BackButton onClick={() => onSelect(null)}>All teams</BackButton>
      <QueryView query={dna} rows={8}>
        {(d) => (coach ? <CoachProfile d={d} /> : <TeamProfile d={d} />)}
      </QueryView>
    </div>
  );
}
