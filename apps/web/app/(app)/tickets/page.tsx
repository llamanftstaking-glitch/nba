"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TicketCard } from "@/components/ticket-card";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";

const LIMIT = 20;

export default function TicketsPage() {
  const [status, setStatus] = useState<"open" | "settled">("open");
  const [offset, setOffset] = useState(0);
  const q = useQuery({
    queryKey: ["tickets", status, offset],
    queryFn: () => api.tickets({ status, limit: LIMIT, offset }),
  });
  const openCount = useQuery({ queryKey: ["tickets", "count", "open"], queryFn: () => api.tickets({ status: "open", limit: 1 }) });
  const settledCount = useQuery({ queryKey: ["tickets", "count", "settled"], queryFn: () => api.tickets({ status: "settled", limit: 1 }) });

  return (
    <div>
      <PageHeader
        title="My Paper Tickets"
        sub="Virtual-unit tickets saved to the paper ledger. Nothing here is placed with a sportsbook."
        right={
          <DLink href="/exposure" className="inline-flex h-7 items-center rounded border border-line-strong px-2 text-xs font-medium text-ink hover:bg-raised">
            Shared-risk monitor
          </DLink>
        }
      />
      <Tabs
        label="Ticket status"
        value={status}
        onChange={(id) => {
          setStatus(id as "open" | "settled");
          setOffset(0);
        }}
        items={[
          { id: "open", label: "Open", count: openCount.data ? openCount.data.total : null },
          { id: "settled", label: "Settled", count: settledCount.data ? settledCount.data.total : null },
        ]}
      />
      <div className="mt-3">
        <QueryView
          query={q}
          rows={4}
          isEmpty={(d) => d.items.length === 0}
          empty={
            <EmptyState title={status === "open" ? "No open paper tickets." : "No settled paper tickets yet."}>
              {status === "open" ? "Save a selection or combination to the paper ledger to track it here." : "Tickets settle after their games are final."}
            </EmptyState>
          }
        >
          {(d) => (
            <>
              <div className="grid gap-3 xl:grid-cols-2">
                {d.items.map((t) => (
                  <TicketCard key={t.id} t={t} />
                ))}
              </div>
              <Pagination offset={offset} limit={LIMIT} total={d.total} onChange={setOffset} />
            </>
          )}
        </QueryView>
      </div>
    </div>
  );
}
