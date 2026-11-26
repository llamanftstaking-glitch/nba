"use client";

import type { ReactNode } from "react";
import { Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { kindLabel, VERIFICATION_LABELS, type ConceptShort } from "@/lib/cortex";

/** Verification is a property of the record, stated plainly: emerald when checked against a source, amber when not. */
export function VerificationChip({ value }: { value: string }) {
  const checked = value === "checked_against_source";
  return (
    <span data-testid="verification-chip" data-verification={value}>
      <Badge tone={checked ? "accent" : "warn"} title={checked ? "The author compared this record with the cited source." : "Written from the author's knowledge; not compared with a source."}>
        {VERIFICATION_LABELS[value] ?? value.replace(/_/g, " ")}
      </Badge>
    </span>
  );
}

export function KindChip({ kind }: { kind: string }) {
  return (
    <span data-testid="kind-chip" data-kind={kind}>
      <Badge>{kindLabel(kind)}</Badge>
    </span>
  );
}

export function RulesetChip({ ruleset }: { ruleset: string }) {
  return (
    <span data-testid="ruleset-chip">
      <Badge tone={ruleset === "general" ? "neutral" : "info"}>{ruleset === "general" ? "General" : ruleset}</Badge>
    </span>
  );
}

export function ConceptChips({ c, className }: { c: Pick<ConceptShort, "kind" | "ruleset" | "verification">; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <KindChip kind={c.kind} />
      <RulesetChip ruleset={c.ruleset} />
      <VerificationChip value={c.verification} />
    </span>
  );
}

/** One knowledge record in a list. The whole row is a link to the record page. */
export function ConceptRow({ c, extra, showDepartment = true }: { c: ConceptShort; extra?: ReactNode; showDepartment?: boolean }) {
  return (
    <li data-testid="concept-row" data-slug={c.slug}>
      <DLink href={`/cortex/${encodeURIComponent(c.slug)}`} className="block rounded-md px-3 py-3 hover:bg-raised/50">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 break-words text-[15px] font-semibold text-ink">{c.title}</span>
          {showDepartment && <span className="text-xs text-muted">{c.department_name}</span>}
        </span>
        <ConceptChips c={c} className="mt-1.5" />
        <span className="mt-1.5 block break-words text-sm text-soft">{c.summary}</span>
        {extra}
      </DLink>
    </li>
  );
}

/** A capability that does not exist, with the reason the API gives. Never hidden, never softened. */
export function NotAvailablePanel({ title, reason, testId }: { title: string; reason: string; testId?: string }) {
  return (
    <section className="rounded-lg bg-card p-4 ring-1 ring-inset ring-line/60" data-testid={testId ?? "not-available-panel"}>
      <h3 className="flex items-center gap-2 font-display text-[17px] font-semibold uppercase tracking-wide text-ink">
        <Ban className="h-[18px] w-[18px] text-muted" aria-hidden />
        {title}
      </h3>
      <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-warn">Not available</p>
      <p className="mt-1 break-words text-sm text-soft">{reason}</p>
    </section>
  );
}

/** Plain list of things the platform does not hold or has not built. */
export function PlainList({ items, testId, tone = "muted" }: { items: string[]; testId?: string; tone?: "muted" | "warn" }) {
  return (
    <ul className="space-y-1.5" data-testid={testId}>
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm text-soft">
          <span className={cn("mt-[8px] h-1 w-1 shrink-0 rounded-full", tone === "warn" ? "bg-warn" : "bg-faint")} aria-hidden />
          <span className="min-w-0 break-words">{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Label / value cell for stat grids. A null value is the explicit marker, never zero. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="num text-[15px] font-semibold text-ink">{value}</dd>
      {sub && <dd className="num text-xs text-muted">{sub}</dd>}
    </div>
  );
}

/** Formula in a monospace block. Text only: rendered as a string, never as markup. */
export function FormulaBlock({ formula, className }: { formula: string; className?: string }) {
  return (
    <pre className={cn("overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-bg px-3 py-2 font-mono text-[13px] leading-5 text-info ring-1 ring-inset ring-line/60", className)} data-testid="formula">
      {formula}
    </pre>
  );
}
