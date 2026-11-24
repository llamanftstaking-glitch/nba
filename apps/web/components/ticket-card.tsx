"use client";

import type { Ticket } from "@/lib/types";
import { ClassificationBadge, StatusBadge } from "@/components/classification-badge";
import { ProbInterval } from "@/components/prob";
import { Badge } from "@/components/ui/badge";
import { Val } from "@/components/ui/na";
import { BulletList, Metric } from "@/components/ui/panel";
import { fmtAmerican, fmtDate, fmtDateTimeET, fmtLine, fmtNum, fmtPct, fmtSigned } from "@/lib/format";
import { REFERENCE_PRICE_LABEL } from "@/components/combo-card";

const BASIS: Record<Ticket["price_basis"], string> = {
  observed_quote: "Observed sportsbook quote",
  leg_product_reference: REFERENCE_PRICE_LABEL,
  none: "No price basis — probability tracking only",
};

/** One paper ticket. Wins and losses share the same layout and prominence. */
export function TicketCard({ t }: { t: Ticket }) {
  const s = t.settlement;
  return (
    <article className="min-w-0 rounded-lg bg-card ring-1 ring-inset ring-line/60" data-testid="ticket-card" data-ticket-id={t.id}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        <span className="num text-sm font-semibold text-ink">Paper ticket #{t.id}</span>
        <Badge>{t.engine}</Badge>
        <Badge>{t.structure}</Badge>
        <ClassificationBadge value={t.classification} />
        <span className="ml-auto">{s ? <StatusBadge value={s.result} /> : <Badge tone="info">Open</Badge>}</span>
      </header>
      <div className="space-y-4 p-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
          <Metric label="Slate date">
            <Val v={fmtDate(t.game_date, { year: true })} />
          </Metric>
          <Metric label="Model probability">
            <ProbInterval prob={t.model_prob} low={t.prob_low} high={t.prob_high} />
          </Metric>
          <Metric label="Price (decimal)">
            <Val v={fmtNum(t.price_decimal, 2)} />
          </Metric>
          <Metric label="Stake (virtual units)">
            <Val v={fmtNum(t.stake_units, 2)} />
          </Metric>
          <Metric label="Simulated P&L (units)">
            <Val v={s ? fmtSigned(s.pnl_units) : null} />
          </Metric>
        </dl>
        <p className="text-2xs text-muted">
          Price basis: <span className="text-soft">{BASIS[t.price_basis] ?? t.price_basis}</span> · Source {t.source} · Saved{" "}
          {fmtDateTimeET(t.created_at) ?? "—"}
          {s ? ` · Settled ${fmtDateTimeET(s.settled_at) ?? "—"}` : ""}
        </p>

        <div>
          <h4 className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Legs</h4>
          <ul className="divide-y divide-line/40 rounded-md bg-raised/40">
            {t.legs.map((l, i) => {
              const lr = s?.leg_results.find((r) => r.label === l.label) ?? s?.leg_results[i];
              return (
                <li key={`${l.selection_id}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="break-words text-sm text-ink">{l.label}</div>
                    <div className="num text-2xs text-muted">
                      {l.game_label} · line <Val v={fmtLine(l.line)} /> · price <Val v={fmtAmerican(l.price_american)} /> · model{" "}
                      <Val v={fmtPct(l.prob)} />
                    </div>
                  </div>
                  <div className="text-right">
                    {lr ? (
                      <>
                        <StatusBadge value={lr.result} />
                        <div className="num mt-0.5 text-2xs text-muted">
                          actual <Val v={fmtLine(lr.actual)} />
                        </div>
                      </>
                    ) : (
                      <span className="text-2xs text-muted">{s ? "no leg result" : "pending"}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {s && (
          <div className="rounded-md bg-raised/50 p-3" data-testid="forensic-report">
            <h4 className="text-2xs font-semibold uppercase tracking-wide text-muted">Forensic report</h4>
            <p className="mt-1 break-words text-sm text-ink">{s.forensic.verdict}</p>
            {s.forensic.findings.length > 0 ? (
              <div className="mt-1.5">
                <BulletList items={s.forensic.findings} />
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">No findings were recorded.</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
