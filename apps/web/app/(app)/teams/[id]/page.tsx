"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { InjuryTable } from "@/components/injury-list";
import { Tile } from "@/components/summary";
import { TeamLogo } from "@/components/team-logo";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";
import { fmtDate, fmtInt, fmtNum } from "@/lib/format";
import type { TeamDetail } from "@/lib/types";

type Recent = TeamDetail["recent"][number];
type Roster = TeamDetail["roster"][number];

const RECENT_COLUMNS: Column<Recent>[] = [
  { key: "date", header: "Date", primary: true, cell: (r) => <span className="num text-ink">{fmtDate(r.date, { year: true }) ?? r.date}</span> },
  { key: "opp", header: "Opponent", primary: true, cell: (r) => <span className="num">{r.is_home ? "vs" : "@"} {r.opp_abbr}</span> },
  { key: "pts", header: "Points", align: "right", cell: (r) => <Val v={fmtInt(r.points)} /> },
  { key: "opp_pts", header: "Opp. points", align: "right", cell: (r) => <Val v={fmtInt(r.opp_points)} /> },
  {
    key: "res",
    header: "Result",
    cell: (r) => (r.points === null || r.opp_points === null ? <Val v={null} /> : <span className="num">{r.points > r.opp_points ? "W" : "L"} {r.points > r.opp_points ? "+" : ""}{r.points - r.opp_points}</span>),
  },
];

const ROSTER_COLUMNS: Column<Roster>[] = [
  {
    key: "name",
    header: "Player",
    primary: true,
    cell: (p) => (
      <DLink href={`/players/${p.id}`} className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-accent">
        {p.name}
      </DLink>
    ),
  },
  { key: "pos", header: "Pos", cell: (p) => <Val v={p.position} /> },
  { key: "g", header: "Games", align: "right", cell: (p) => (p.games === null ? <Val v={null} /> : <span className="num">n={p.games}</span>) },
  { key: "min", header: "MIN", align: "right", cell: (p) => <Val v={fmtNum(p.min)} /> },
  { key: "pts", header: "PTS", align: "right", cell: (p) => <Val v={fmtNum(p.pts)} /> },
  { key: "reb", header: "REB", align: "right", cell: (p) => <Val v={fmtNum(p.reb)} /> },
  { key: "ast", header: "AST", align: "right", cell: (p) => <Val v={fmtNum(p.ast)} /> },
];

function View({ d }: { d: TeamDetail }) {
  const t = d.team;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <TeamLogo team={t} size={44} />
        <div>
          <h1 className="text-[17px] font-semibold leading-6 text-ink">{t.name}</h1>
          <p className="num text-xs text-muted">{t.abbr}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Tile label="Record">
          <Val v={t.wins === null || t.losses === null ? null : `${t.wins}–${t.losses}`} />
        </Tile>
        <Tile label="Games">{t.games === null ? <Val v={null} /> : `n=${t.games}`}</Tile>
        <Tile label="Off rating">
          <Val v={fmtNum(t.off_rtg)} />
        </Tile>
        <Tile label="Def rating">
          <Val v={fmtNum(t.def_rtg)} />
        </Tile>
        <Tile label="Pace">
          <Val v={fmtNum(t.pace)} />
        </Tile>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent games">
          {d.recent.length === 0 ? <EmptyState title="No recent games in the database." /> : <DataTable columns={RECENT_COLUMNS} rows={d.recent} rowKey={(r, i) => `${r.date}-${i}`} caption="Recent games" dense />}
        </Panel>
        <Panel title="Roster">
          {d.roster.length === 0 ? <EmptyState title="No roster data available." /> : <DataTable columns={ROSTER_COLUMNS} rows={d.roster} rowKey={(p) => p.id} caption="Roster" dense />}
        </Panel>
      </div>
      <Panel title="Injuries">{d.injuries.length === 0 ? <EmptyState title="No injuries listed for this team." /> : <InjuryTable rows={d.injuries} caption="Team injuries" />}</Panel>
    </div>
  );
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: ["team", id], queryFn: () => api.team(id) });
  return (
    <div>
      <div className="mb-2 text-xs">
        <DLink href="/teams" className="text-accent hover:underline">
          ← All teams
        </DLink>
      </div>
      <QueryView query={q} rows={8}>
        {(d) => <View d={d} />}
      </QueryView>
    </div>
  );
}
