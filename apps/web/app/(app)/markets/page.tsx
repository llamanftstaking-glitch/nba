"use client";

import { ProvidersTable } from "@/components/data-health-panels";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { PageHeader, Panel } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { DLink, useSelectedDate } from "@/lib/date";
import { fmtAmerican, fmtDateTimeET, fmtLine, titleCase } from "@/lib/format";
import { useDataHealth, useGames } from "@/lib/queries";
import type { Quote } from "@/lib/types";

const COLUMNS: Column<Quote>[] = [
  { key: "market", header: "Market", primary: true, cell: (r) => <span className="font-medium text-ink">{titleCase(r.market)}</span> },
  { key: "side", header: "Side", primary: true, cell: (r) => titleCase(r.side) },
  { key: "line", header: "Line", align: "right", cell: (r) => <Val v={fmtLine(r.line)} /> },
  { key: "price", header: "Price", align: "right", cell: (r) => <Val v={fmtAmerican(r.price_american)} /> },
  { key: "book", header: "Book", cell: (r) => r.book },
  { key: "at", header: "Observed", cell: (r) => <Val v={fmtDateTimeET(r.at)} /> },
];

export default function MarketsPage() {
  const date = useSelectedDate();
  const games = useGames(date);
  const health = useDataHealth();
  return (
    <div className="space-y-4">
      <PageHeader title="Markets" sub="Current verified quotes per game and the status of the providers that supply them." />
      <QueryView query={games} rows={6} isEmpty={(d) => d.games.length === 0} empty={<EmptyState title="No games are scheduled for this date." />}>
        {(d) => (
          <div className="grid gap-4 xl:grid-cols-2">
            {d.games.map((g) => (
              <Panel
                key={g.id}
                title={g.label}
                right={
                  <DLink href={`/games/${encodeURIComponent(g.id)}`} className="text-accent hover:underline">
                    Game research →
                  </DLink>
                }
              >
                {g.quotes.length === 0 ? <EmptyState title="No verified quotes are available for this game.">Main-line quotes appear here once a configured provider has listed this game.</EmptyState> : <DataTable columns={COLUMNS} rows={g.quotes} rowKey={(_, i) => i} caption={`Quotes for ${g.label}`} dense mobileLimit={2} />}
              </Panel>
            ))}
          </div>
        )}
      </QueryView>
      <Panel title="Provider status">
        <QueryView query={health} rows={3} isEmpty={(d) => d.providers.length === 0} empty={<EmptyState title="No providers are reported." />}>
          {(d) => <ProvidersTable rows={d.providers} />}
        </QueryView>
      </Panel>
    </div>
  );
}
