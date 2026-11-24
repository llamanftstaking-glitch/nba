"use client";

import { useQuery } from "@tanstack/react-query";
import { Timer } from "lucide-react";
import { useState } from "react";
import { MinutesNotes, MinutesTable, type MinutesSort } from "@/components/minutes";
import { Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useSelectedDate } from "@/lib/date";
import { useTeams } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";

const LIMIT = 50;
const CLASSES: [string, string][] = [
  ["returning", "Returning"],
  ["uncertain", "Uncertain"],
  ["high_minute_starter", "High-minute starter"],
  ["stable_starter", "Stable starter"],
  ["primary", "Primary"],
  ["variable", "Variable"],
  ["secondary", "Secondary"],
  ["limited", "Limited"],
];
const SORTS: [string, string][] = [["proj_min", "Projected minutes"], ["l3", "L3"], ["l5", "L5"], ["l10", "L10"], ["l20", "L20"], ["season_avg", "Season average"], ["sd_l10", "Variability"], ["starts_l10", "Starts L10"], ["player_name", "Player"]];

export default function MinutesPage() {
  const date = useSelectedDate();
  const [text, setText] = useState("");
  const [team, setTeam] = useState("");
  const [cls, setCls] = useState("");
  const [sort, setSort] = useState<MinutesSort>({ key: "proj_min", order: "desc" });
  const [offset, setOffset] = useState(0);
  const search = useDebounced(text.trim(), 300);
  const teams = useTeams();
  const params = { date, team: team || undefined, q: search || undefined, classification: cls || undefined, sort: sort.key, order: sort.order, limit: LIMIT, offset };
  const q = useQuery({ queryKey: ["minutes", params], queryFn: () => api.minutes(params), placeholderData: (prev) => prev });
  const onSort = (key: string) => {
    setOffset(0);
    setSort((s) => ({ key, order: s.key === key ? (s.order === "desc" ? "asc" : "desc") : key === "player_name" ? "asc" : "desc" }));
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Minutes Intelligence" sub="Projected and recent playing time for players on the slate, with role, variability and availability. Averages count games played; a missed game is never a zero." />
      {q.data && <MinutesNotes meta={q.data} />}
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60 md:grid-cols-5" data-testid="minutes-filters">
        <Field label="Search" className="col-span-2">
          <Input type="search" placeholder="Player name" value={text} onChange={(e) => { setText(e.target.value); setOffset(0); }} data-testid="minutes-search" />
        </Field>
        <Field label="Team">
          <Select value={team} onChange={(e) => { setTeam(e.target.value); setOffset(0); }} data-testid="minutes-team">
            <option value="">All teams</option>
            {(teams.data?.items ?? []).map((t) => (
              <option key={t.id} value={t.abbr}>{t.abbr}</option>
            ))}
          </Select>
        </Field>
        <Field label="Classification">
          <Select value={cls} onChange={(e) => { setCls(e.target.value); setOffset(0); }} data-testid="minutes-class">
            <option value="">All</option>
            {CLASSES.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sort">
          <Select value={`${sort.key}:${sort.order}`} onChange={(e) => { const [key, order] = e.target.value.split(":"); setSort({ key: key ?? "proj_min", order: order === "asc" ? "asc" : "desc" }); setOffset(0); }} data-testid="minutes-sort">
            {SORTS.flatMap(([k, l]) => [
              <option key={`${k}:desc`} value={`${k}:desc`}>{l} ↓</option>,
              <option key={`${k}:asc`} value={`${k}:asc`}>{l} ↑</option>,
            ])}
          </Select>
        </Field>
      </div>
      <Panel title="Player minutes" icon={Timer} right={q.data ? <span className="num">{q.data.items.length} shown · {q.data.total} total</span> : undefined}>
        <QueryView query={q} rows={8} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No players match these filters." icon={Timer} />}>
          {(d) => (
            <>
              <MinutesTable rows={d.items} sort={sort} onSort={onSort} />
              <Pagination offset={offset} limit={LIMIT} total={d.total} onChange={setOffset} />
            </>
          )}
        </QueryView>
      </Panel>
    </div>
  );
}
