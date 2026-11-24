"use client";

import { useMemo, useState } from "react";
import type { Selection } from "@/lib/types";
import { isQualified } from "@/components/classification-badge";
import { SelectionList } from "@/components/selection-card";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { useSelectedDate } from "@/lib/date";
import { fmtDateTimeET, marketName, titleCase } from "@/lib/format";
import { useSelections } from "@/lib/queries";

function sortSelections(items: Selection[]): Selection[] {
  // Rank by evidence quality first, then probability; unavailable values sort last.
  return [...items].sort(
    (a, b) => (b.evidence_score ?? -1) - (a.evidence_score ?? -1) || (b.prob ?? -1) - (a.prob ?? -1),
  );
}

/** Shared list view for Top Picks and Player Props. Filters are applied client-side on the latest edition. */
export function SelectionBrowser({
  title,
  description,
  marketFilter,
  emptyTitle,
}: {
  title: string;
  description: string;
  marketFilter?: (s: Selection) => boolean;
  emptyTitle: string;
}) {
  const date = useSelectedDate();
  const q = useSelections(date);
  const [scope, setScope] = useState<"qualified" | "all">("qualified");
  const [market, setMarket] = useState("");
  const [game, setGame] = useState("");

  const base = useMemo(() => (q.data?.items ?? []).filter((s) => (marketFilter ? marketFilter(s) : true)), [q.data, marketFilter]);
  const markets = useMemo(() => [...new Set(base.map((s) => s.market))], [base]);
  const games = useMemo(() => [...new Map(base.map((s) => [s.game_id, s.game_label])).entries()], [base]);
  const shown = useMemo(
    () =>
      sortSelections(
        base.filter(
          (s) =>
            (scope === "all" || isQualified(s.classification, s.invalidated)) &&
            (!market || s.market === market) &&
            (!game || s.game_id === game),
        ),
      ),
    [base, scope, market, game],
  );

  return (
    <div>
      <PageHeader
        title={title}
        sub={description}
        right={
          q.data?.edition ? (
            <span className="text-2xs text-muted">
              <Badge tone="info">{titleCase(q.data.edition.kind)}</Badge> v{q.data.edition.version} · {fmtDateTimeET(q.data.edition.published_at) ?? "—"}
            </span>
          ) : undefined
        }
      />
      <div className="mb-3 grid grid-cols-2 gap-2 rounded border border-line bg-panel p-2 sm:grid-cols-3 lg:max-w-2xl">
        <Field label="Show">
          <Select value={scope} onChange={(e) => setScope(e.target.value as "qualified" | "all")}>
            <option value="qualified">Qualified only</option>
            <option value="all">All evaluated (incl. rejected)</option>
          </Select>
        </Field>
        <Field label="Market">
          <Select value={market} onChange={(e) => setMarket(e.target.value)}>
            <option value="">All markets</option>
            {markets.map((m) => (
              <option key={m} value={m}>
                {marketName(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Game" className="col-span-2 sm:col-span-1">
          <Select value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="">All games</option>
            {games.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <QueryView query={q} rows={5}>
        {(d) =>
          !d.edition ? (
            <EmptyState title="No research edition has been published for this date." />
          ) : shown.length === 0 ? (
            <EmptyState title={emptyTitle}>
              {base.length > 0 && scope === "qualified"
                ? `${base.length} selection(s) were evaluated and none qualified with the current filters. Switch to "All evaluated" to review them and their rejection reasons.`
                : "Nothing matches the current filters."}
            </EmptyState>
          ) : (
            <>
              <p className="num mb-2 text-2xs text-muted">
                {shown.length} of {base.length} evaluated selection(s) shown
              </p>
              <SelectionList items={shown} />
            </>
          )
        }
      </QueryView>
    </div>
  );
}
