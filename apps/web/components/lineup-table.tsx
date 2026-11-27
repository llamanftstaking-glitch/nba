"use client";

import { useState } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { AvailabilityStatus, FreshnessIndicator, LineupStatusLabel } from "@/components/status";
import { TeamLogo } from "@/components/team-logo";
import { Val } from "@/components/ui/na";
import { Tabs } from "@/components/ui/tabs";
import { DLink } from "@/lib/date";
import { cn } from "@/lib/cn";
import { fmtNum } from "@/lib/format";
import type { LineupPlayer, TeamLineup } from "@/lib/types";

function PlayerLine({ p }: { p: LineupPlayer }) {
  const name = <span className="font-medium text-ink">{p.name}</span>;
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 py-2 sm:grid-cols-[2rem_minmax(0,1fr)_6.5rem_3rem_3rem_3rem]" data-testid="lineup-player">
      <span className="num text-xs font-semibold text-muted">{p.position ?? "—"}</span>
      <span className="flex min-w-0 items-center gap-2">
        <PlayerAvatar name={p.name} src={p.headshot_url} size={30} />
        <span className="min-w-0">
          <span className="block truncate text-sm">
            {p.player_id !== null ? (
              <DLink href={`/players/${p.player_id}`} className="hover:underline">
                {name}
              </DLink>
            ) : (
              name
            )}
            {p.jersey && <span className="num ml-1.5 text-xs text-muted">#{p.jersey}</span>}
          </span>
          {p.injury_detail && <span className="block truncate text-xs text-muted">{p.injury_detail}</span>}
        </span>
      </span>
      <AvailabilityStatus value={p.availability} detail={p.injury_detail} className="justify-self-end sm:justify-self-start" />
      <span className="num col-start-2 text-xs text-muted sm:hidden">
        Proj <Val v={fmtNum(p.proj_min, 0)} /> min · recent <Val v={fmtNum(p.recent_min)} /> · starts L10 <Val v={p.starts_last10} />
      </span>
      <span className="num hidden text-right text-sm text-ink sm:block">
        <Val v={fmtNum(p.proj_min, 0)} />
      </span>
      <span className="num hidden text-right text-sm text-soft sm:block">
        <Val v={fmtNum(p.recent_min)} />
      </span>
      <span className="num hidden text-right text-sm text-soft sm:block">
        <Val v={p.starts_last10} />
      </span>
    </li>
  );
}

function Group({ title, players, empty }: { title: string; players: LineupPlayer[]; empty: string }) {
  return (
    <div>
      <div className="mt-3 flex items-baseline justify-between border-b border-line pb-1">
        <h4 className="text-2xs font-semibold text-muted">
          {title} <span className="num text-faint">· {players.length}</span>
        </h4>
      </div>
      {players.length === 0 ? <p className="py-2 text-sm text-muted">{empty}</p> : <ul className="divide-y divide-line">{players.map((p, i) => <PlayerLine key={`${p.player_id ?? p.name}-${i}`} p={p} />)}</ul>}
    </div>
  );
}

/** One team's lineup: status header, starters (never padded), bench, unavailable. */
export function TeamLineupPanel({ lineup, side }: { lineup: TeamLineup; side: "Away" | "Home" }) {
  return (
    <div className="min-w-0 blk p-4" data-testid="team-lineup" data-team={lineup.team.abbr}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamLogo team={lineup.team} size={32} />
          <div className="min-w-0">
            <div className="font-display text-lg font-semibold leading-5 text-ink">{lineup.team.name}</div>
            <div className="text-xs text-muted">{side}</div>
          </div>
        </div>
        <LineupStatusLabel status={lineup.status} className="text-sm" />
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
        <span>Source: {lineup.source || "—"}</span>
        <FreshnessIndicator at={lineup.verified_at} label="Verified" />
      </p>
      {lineup.note && <p className="mt-1 text-xs text-muted">{lineup.note}</p>}

      <div className="mt-3 hidden grid-cols-[2rem_minmax(0,1fr)_6.5rem_3rem_3rem_3rem] gap-x-2.5 text-2xs font-semibold text-muted sm:grid">
        <span>Pos</span>
        <span>Player</span>
        <span>Availability</span>
        <span className="text-right" title="Projected minutes">Proj</span>
        <span className="text-right" title="Recent average minutes">Recent</span>
        <span className="text-right" title="Starts in the last 10 games">St L10</span>
      </div>

      {lineup.starters.length === 0 ? (
        <p className="mt-3 border-l-2 border-line py-1 pl-3 text-sm font-medium text-soft" data-testid="no-lineup">
          No lineup information available
        </p>
      ) : (
        <Group title={lineup.status === "confirmed" ? "Starters" : lineup.status === "projected" ? "Projected starters" : "Starters"} players={lineup.starters} empty="" />
      )}
      <Group title="Bench" players={lineup.bench} empty="No bench information available." />
      <Group title="Unavailable" players={lineup.unavailable} empty="No players listed as unavailable." />
    </div>
  );
}

/** Away left / home right on desktop; a team switcher on small screens. */
export function LineupTable({ away, home }: { away: TeamLineup; home: TeamLineup }) {
  const [side, setSide] = useState<"away" | "home">("away");
  return (
    <div data-testid="lineup-table">
      <div className="mb-3 lg:hidden">
        <Tabs
          label="Team"
          value={side}
          onChange={(v) => setSide(v as "away" | "home")}
          items={[
            { id: "away", label: `${away.team.abbr} (away)` },
            { id: "home", label: `${home.team.abbr} (home)` },
          ]}
        />
      </div>
      <div className="grid gap-x-12 gap-y-9 lg:grid-cols-2">
        <div className={cn(side === "away" ? "block" : "hidden", "lg:block")}>
          <TeamLineupPanel lineup={away} side="Away" />
        </div>
        <div className={cn(side === "home" ? "block" : "hidden", "lg:block")}>
          <TeamLineupPanel lineup={home} side="Home" />
        </div>
      </div>
    </div>
  );
}
