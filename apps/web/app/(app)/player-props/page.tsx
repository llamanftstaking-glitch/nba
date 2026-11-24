"use client";

import { useQuery } from "@tanstack/react-query";
import { PenLine, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { ManualEntries, ManualEntryForm, MarketTable, PropDrawer, propKey, type ManualPrefill } from "@/components/props";
import { StatusDot } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useSelectedDate } from "@/lib/date";
import { useGames, useMe, usePlayerProps, useTeams } from "@/lib/queries";
import { useDebounced } from "@/lib/use-debounced";
import type { PropRow } from "@/lib/types";

const LIMIT = 50;

export default function PlayerPropsPage() {
  const date = useSelectedDate();
  const [text, setText] = useState("");
  const [game, setGame] = useState("");
  const [team, setTeam] = useState("");
  const [market, setMarket] = useState("");
  const [quoted, setQuoted] = useState(false);
  const [lineup, setLineup] = useState("");
  const [ready, setReady] = useState("");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<PropRow | null>(null);
  const [prefill, setPrefill] = useState<ManualPrefill | undefined>();
  const [formKey, setFormKey] = useState(0);

  const search = useDebounced(text.trim(), 300);
  const q = usePlayerProps({ date, game_id: game || undefined, team: team || undefined, market: market || undefined, q: search || undefined, quoted: quoted ? true : undefined, limit: LIMIT, offset });
  const games = useGames(date);
  const teams = useTeams();
  const me = useMe();
  const manual = useQuery({ queryKey: ["manual-entries", date ?? "today"], queryFn: () => api.manualEntries(date) });
  const isOwner = me.data?.user.role === "owner";

  // Lineup status and model readiness have no server-side filter in the contract; they narrow the loaded page.
  const rows = useMemo(
    () => (q.data?.items ?? []).filter((p) => (!lineup || p.lineup_status === lineup) && (!ready || (ready === "ready") === p.model_ready)),
    [q.data, lineup, ready],
  );
  const reset = () => setOffset(0);

  const addManual = (p: PropRow) => {
    setPrefill({ game_id: p.game_id, player_id: p.player_id, player_name: p.player_name, market: p.market, line: p.line });
    setFormKey((k) => k + 1);
    setOpen(null);
    setTimeout(() => document.getElementById("manual")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Player Props"
        sub="Quoted and projected player markets for the slate, with descriptive history beside each line. Historical counts describe past games; model output is labelled separately."
      />

      {q.data && (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="quote-status">
          <StatusDot tone={q.data.quote_status.provider_configured ? "accent" : "warn"}>{q.data.quote_status.provider_configured ? "Quote provider configured" : "No quote provider configured"}</StatusDot>
          <span className="text-muted">{q.data.quote_status.message}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60 md:grid-cols-4 xl:grid-cols-8" data-testid="props-filters">
        <Field label="Search" className="col-span-2">
          <Input type="search" placeholder="Player name" value={text} onChange={(e) => { setText(e.target.value); reset(); }} data-testid="props-search" />
        </Field>
        <Field label="Game">
          <Select value={game} onChange={(e) => { setGame(e.target.value); reset(); }}>
            <option value="">All games</option>
            {(games.data?.games ?? []).map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Team">
          <Select value={team} onChange={(e) => { setTeam(e.target.value); reset(); }}>
            <option value="">All teams</option>
            {(teams.data?.items ?? []).map((t) => (
              <option key={t.id} value={t.abbr}>{t.abbr}</option>
            ))}
          </Select>
        </Field>
        <Field label="Market">
          <Select value={market} onChange={(e) => { setMarket(e.target.value); reset(); }} data-testid="props-market">
            <option value="">All markets</option>
            {(q.data?.markets ?? []).map((m) => (
              <option key={m.key} value={m.key}>{m.label}{m.operational ? "" : " (not operational)"}</option>
            ))}
          </Select>
        </Field>
        <Field label="Lineup status">
          <Select value={lineup} onChange={(e) => setLineup(e.target.value)}>
            <option value="">Any</option>
            <option value="confirmed">Confirmed</option>
            <option value="projected">Projected</option>
            <option value="unknown">Awaiting</option>
          </Select>
        </Field>
        <Field label="Model">
          <Select value={ready} onChange={(e) => setReady(e.target.value)}>
            <option value="">Any</option>
            <option value="ready">Ready</option>
            <option value="not_ready">Not ready</option>
          </Select>
        </Field>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 self-end text-sm text-soft md:min-h-9">
          <input type="checkbox" checked={quoted} onChange={(e) => { setQuoted(e.target.checked); reset(); }} className="h-4 w-4 accent-[rgb(0,229,160)]" data-testid="props-quoted" />
          Quoted only
        </label>
      </div>

      <Panel title="Markets" icon={Target} right={q.data ? <span className="num">{rows.length} shown · {q.data.total} total</span> : undefined}>
        <QueryView query={q} rows={8}>
          {(d) =>
            rows.length === 0 ? (
              <EmptyState title={d.total === 0 ? "No player prop markets match these filters." : "No markets on this page match the lineup / model filters."} icon={Target}>
                {d.quote_status.message}
              </EmptyState>
            ) : (
              <>
                <MarketTable rows={rows} onOpen={setOpen} caption="Player prop markets" />
                <Pagination offset={offset} limit={LIMIT} total={d.total} onChange={setOffset} />
                {d.markets.some((m) => !m.operational) && (
                  <ul className="mt-3 space-y-0.5 text-xs text-muted">
                    {d.markets.filter((m) => !m.operational).map((m) => (
                      <li key={m.key}>
                        {m.label}: not operational{m.note ? ` — ${m.note}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          }
        </QueryView>
      </Panel>

      <Panel id="manual" title="Manual market entry" icon={PenLine}>
        {me.isPending ? null : isOwner ? (
          <ManualEntryForm key={formKey} markets={q.data?.markets ?? []} prefill={prefill} date={date} />
        ) : (
          <EmptyState title="Manual market entry is available to the owner account only." />
        )}
        <div className="mt-5 border-t border-line/50 pt-4">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Manual entries for this date</div>
          <QueryView query={manual} rows={2}>
            {(d) => <ManualEntries items={d.items} />}
          </QueryView>
        </div>
      </Panel>

      <PropDrawer key={open ? propKey(open) : "none"} p={open} onClose={() => setOpen(null)} onAddManual={isOwner ? addManual : undefined} />
    </div>
  );
}
