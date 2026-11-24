"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { InjuryTable } from "@/components/injury-list";
import { StaleTag } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/field";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { fmtDateTimeET } from "@/lib/format";

export default function InjuriesPage() {
  const q = useQuery({ queryKey: ["injuries"], queryFn: api.injuries });
  const [team, setTeam] = useState("");
  const teams = useMemo(() => [...new Set((q.data?.items ?? []).map((i) => i.team_abbr).filter((t): t is string => Boolean(t)))].sort(), [q.data]);
  return (
    <div>
      <PageHeader
        title="Injuries"
        sub={
          q.data ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              Source {q.data.source} · as of {fmtDateTimeET(q.data.as_of) ?? "not available"}
              {!q.data.as_of && <StaleTag label="no timestamp" />}
            </span>
          ) : (
            "Latest injury report"
          )
        }
      />
      <QueryView query={q} rows={6}>
        {(d) => {
          const rows = d.items.filter((i) => !team || i.team_abbr === team);
          return (
            <div className="space-y-3">
              <Panel title="Changes">
                {d.changes.length === 0 ? (
                  <EmptyState title="No injury changes recorded." />
                ) : (
                  <ul className="divide-y divide-line/70">
                    {d.changes.map((c, i) => (
                      <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-xs">
                        <span className="min-w-0 break-words text-soft">{c.text}</span>
                        <span className="num text-muted">{fmtDateTimeET(c.at) ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel
                title="Injury report"
                right={
                  <Field label="Team" className="w-32">
                    <Select value={team} onChange={(e) => setTeam(e.target.value)}>
                      <option value="">All teams</option>
                      {teams.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </Field>
                }
              >
                {rows.length === 0 ? <EmptyState title="No injuries listed." /> : <InjuryTable rows={rows} caption="Injury report" />}
              </Panel>
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
