"use client";

import { TeamLogo } from "@/components/team-logo";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { DLink } from "@/lib/date";
import { fmtInt, fmtNum } from "@/lib/format";
import { useTeams } from "@/lib/queries";
import type { TeamListItem } from "@/lib/types";

const COLUMNS: Column<TeamListItem>[] = [
  {
    key: "team",
    header: "Team",
    primary: true,
    cell: (t) => (
      <DLink href={`/teams/${t.id}`} className="inline-flex items-center gap-2 font-medium text-ink hover:underline">
        <TeamLogo team={t} size={22} />
        <span>{t.name}</span>
        <span className="num text-xs text-muted">{t.abbr}</span>
      </DLink>
    ),
  },
  { key: "g", header: "Games", align: "right", cell: (t) => (t.games === null ? <Val v={null} /> : <span className="num">n={fmtInt(t.games)}</span>) },
  { key: "w", header: "W", align: "right", cell: (t) => <Val v={fmtInt(t.wins)} /> },
  { key: "l", header: "L", align: "right", cell: (t) => <Val v={fmtInt(t.losses)} /> },
  { key: "off", header: "Off rtg", align: "right", cell: (t) => <Val v={fmtNum(t.off_rtg)} /> },
  { key: "def", header: "Def rtg", align: "right", cell: (t) => <Val v={fmtNum(t.def_rtg)} /> },
  { key: "pace", header: "Pace", align: "right", cell: (t) => <Val v={fmtNum(t.pace)} /> },
];

export default function TeamsPage() {
  const q = useTeams();
  return (
    <div>
      <PageHeader title="Teams" sub="Season record and efficiency from the games in the database." />
      <Panel title="Teams">
        <QueryView query={q} rows={10} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No teams are available." />}>
          {(d) => <DataTable columns={COLUMNS} rows={d.items} rowKey={(t) => t.id} caption="Teams" dense />}
        </QueryView>
      </Panel>
    </div>
  );
}
