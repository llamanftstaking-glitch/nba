"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Val } from "@/components/ui/na";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";
import { fmtDate, fmtInt, fmtNum } from "@/lib/format";
import { useTeams } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import type { PlayerListItem } from "@/lib/types";

const LIMIT = 25;

const COLUMNS: Column<PlayerListItem>[] = [
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
  { key: "team", header: "Team", cell: (p) => <Val v={p.team_abbr} /> },
  { key: "pos", header: "Pos", cell: (p) => <Val v={p.position} /> },
  { key: "g", header: "Games", align: "right", cell: (p) => (p.games === null ? <Val v={null} /> : <span className="num">n={fmtInt(p.games)}</span>) },
  { key: "min", header: "MIN", align: "right", cell: (p) => <Val v={fmtNum(p.min)} /> },
  { key: "pts", header: "PTS", align: "right", cell: (p) => <Val v={fmtNum(p.pts)} /> },
  { key: "reb", header: "REB", align: "right", cell: (p) => <Val v={fmtNum(p.reb)} /> },
  { key: "ast", header: "AST", align: "right", cell: (p) => <Val v={fmtNum(p.ast)} /> },
  { key: "fg3m", header: "3PM", align: "right", cell: (p) => <Val v={fmtNum(p.fg3m)} /> },
  { key: "last", header: "Last game", cell: (p) => <Val v={fmtDate(p.last_game_date, { year: true })} /> },
];

export default function PlayersPage() {
  const [text, setText] = useState("");
  const [team, setTeam] = useState("");
  const [offset, setOffset] = useState(0);
  const search = useDebounced(text.trim(), 300);
  const teams = useTeams();
  const q = useQuery({
    queryKey: ["players", search, team, offset],
    queryFn: () => api.players({ q: search, team, limit: LIMIT, offset }),
    placeholderData: (prev) => prev,
  });
  return (
    <div>
      <PageHeader title="Players" sub="Per-game averages over the games in the database. The sample size is shown for every player." />
      <div className="mb-3 grid grid-cols-2 gap-2 blk p-2 sm:max-w-lg">
        <Field label="Search">
          <Input
            type="search"
            placeholder="Player name"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <Field label="Team">
          <Select
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All teams</option>
            {(teams.data?.items ?? []).map((t) => (
              <option key={t.id} value={t.abbr}>
                {t.abbr}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Panel title="Players" right={q.data ? <span className="num">{q.data.total} total</span> : undefined}>
        <QueryView query={q} rows={8} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No players match this search." />}>
          {(d) => (
            <>
              <DataTable columns={COLUMNS} rows={d.items} rowKey={(p) => p.id} caption="Players" dense />
              <Pagination offset={offset} limit={LIMIT} total={d.total} onChange={setOffset} />
            </>
          )}
        </QueryView>
      </Panel>
    </div>
  );
}
