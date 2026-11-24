"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { AvailabilityStatus, FreshnessIndicator, LineupStatusLabel } from "@/components/status";
import { StatusDot } from "@/components/ui/badge";
import { NA, Val } from "@/components/ui/na";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { fmtNum, fmtSigned, titleCase } from "@/lib/format";
import type { MinutesMeta, MinutesRow } from "@/lib/types";

/** Projected minutes with the model band when one exists. */
export function ProjMinutes({ r, className }: { r: Pick<MinutesRow, "proj_min" | "proj_min_low" | "proj_min_high">; className?: string }) {
  if (r.proj_min === null) return <NA className={className} />;
  return (
    <span className={cn("num whitespace-nowrap", className)}>
      <span className="font-semibold text-ink">{fmtNum(r.proj_min)}</span>
      {r.proj_min_low !== null && r.proj_min_high !== null && (
        <span className="ml-1 text-xs font-normal text-muted" title="Projected minutes band">
          [{fmtNum(r.proj_min_low, 0)}–{fmtNum(r.proj_min_high, 0)}]
        </span>
      )}
    </span>
  );
}

export function Variability({ r }: { r: Pick<MinutesRow, "sd_l10" | "min_l10" | "max_l10"> }) {
  if (r.sd_l10 === null && r.min_l10 === null) return <NA />;
  return (
    <span className="num whitespace-nowrap text-sm">
      <span className="text-ink">±{fmtNum(r.sd_l10) ?? "—"}</span>
      <span className="ml-1 text-xs text-muted">
        {fmtNum(r.min_l10, 0) ?? "—"}–{fmtNum(r.max_l10, 0) ?? "—"}
      </span>
    </span>
  );
}

export function MinutesFlags({ r }: { r: Pick<MinutesRow, "role_change" | "returned_recently" | "restriction" | "last_gap_days"> }) {
  if (r.role_change === null && !r.returned_recently && !r.restriction) return null;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs" data-testid="minutes-flags">
      {r.role_change !== null && (
        <span className="num text-info" title="L5 average minus L20 average minutes">
          {fmtSigned(r.role_change, 1)} vs L20
        </span>
      )}
      {r.returned_recently && (
        <span className="text-warn" title={`Last gap between games: ${r.last_gap_days} days`}>
          Returned recently
        </span>
      )}
      {r.restriction && <span className="text-warn">{r.restriction}</span>}
    </span>
  );
}

function Role({ r }: { r: MinutesRow }) {
  return (
    <span className="flex flex-col text-sm">
      <span className="text-ink">{r.lineup_role ? titleCase(r.lineup_role) : "Role —"}</span>
      <LineupStatusLabel status={r.lineup_status} short className="text-xs" />
    </span>
  );
}

/** Descriptive minutes classification; the reason is available as a tooltip and in the expanded row. */
export function MinutesClass({ r }: { r: Pick<MinutesRow, "classification" | "classification_label" | "classification_reason"> }) {
  const tone = r.classification === "returning" || r.classification === "uncertain" || r.classification === "variable" ? "warn" : "neutral";
  return (
    <StatusDot tone={tone} title={r.classification_reason} data-class={r.classification}>
      {r.classification_label}
    </StatusDot>
  );
}

/** Header note shared by the minutes page and the profile block. */
export function MinutesNotes({ meta }: { meta: MinutesMeta }) {
  const m = meta.model;
  const production = m?.status === "production";
  return (
    <div className="space-y-1.5 rounded-lg bg-card px-4 py-3 text-sm ring-1 ring-inset ring-line/60" data-testid="minutes-notes">
      <p className="text-soft">Tiers and classifications are descriptive context about playing time. They are not qualification rules and they are not predictions.</p>
      <p className="flex flex-wrap items-center gap-x-2 text-muted">
        <span>Minutes model:</span>
        {m ? (
          <>
            <span className="num font-medium text-soft">
              {m.name} {m.version}
            </span>
            <StatusDot tone={production ? "accent" : "warn"} data-testid="minutes-model-status">
              {production ? "Production" : `${titleCase(m.status)} — did not pass validation`}
            </StatusDot>
          </>
        ) : (
          <span>no minutes model is registered</span>
        )}
      </p>
      {meta.uncertainty && <p className="text-xs text-muted">{meta.uncertainty}</p>}
      {meta.restrictions_note && <p className="text-xs text-muted">{meta.restrictions_note}</p>}
      {meta.tiers.length > 0 && <p className="num text-xs text-muted">Tiers: {meta.tiers.join(" · ")}</p>}
    </div>
  );
}

export type MinutesSort = { key: string; order: "asc" | "desc" };
const TH = "px-2 pb-2 text-2xs font-semibold uppercase tracking-wide text-muted";

function PlayerCell({ r }: { r: MinutesRow }) {
  return (
    <span className="flex items-center gap-2.5">
      <PlayerAvatar name={r.player_name} src={r.headshot_url} size={32} />
      <span className="min-w-0">
        <DLink href={`/players/${r.player_id}`} className="block text-sm font-semibold leading-5 text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.player_name}
        </DLink>
        <span className="block text-xs text-muted">
          {r.position ?? "—"} · {r.team_abbr ?? "—"}
          {r.opp_abbr ? ` vs ${r.opp_abbr}` : ""}
        </span>
      </span>
    </span>
  );
}

function Card({ r, children }: { r: MinutesRow; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-lg bg-card ring-1 ring-inset ring-line/60" data-testid="minutes-card" data-player-id={r.player_id}>
      <div className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <PlayerCell r={r} />
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xs font-medium uppercase text-muted">Proj min</div>
          <ProjMinutes r={r} className="text-base" />
        </div>
        <button type="button" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${r.player_name}`} onClick={() => setOpen((v) => !v)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-raised" data-testid="minutes-card-toggle">
          {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-3">
        <MinutesClass r={r} />
        <AvailabilityStatus value={r.availability} detail={r.injury_detail} />
        <MinutesFlags r={r} />
      </div>
      {open && (
        <div className="space-y-3 border-t border-line/50 p-3">
          <dl className="grid grid-cols-5 gap-2">
            {(
              [
                ["L3", r.l3],
                ["L5", r.l5],
                ["L10", r.l10],
                ["L20", r.l20],
                ["Season", r.season_avg],
              ] as const
            ).map(([l, v]) => (
              <div key={l}>
                <dt className="text-2xs font-medium uppercase text-muted">{l}</dt>
                <dd className="num text-sm text-ink">
                  <Val v={fmtNum(v)} />
                </dd>
              </div>
            ))}
          </dl>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">Starting status</dt>
              <dd><Role r={r} /></dd>
            </div>
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">Variability (L10)</dt>
              <dd><Variability r={r} /></dd>
            </div>
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">Starts L10 · tier</dt>
              <dd className="num text-ink"><Val v={r.starts_l10} /> · {r.tier ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-2xs font-medium uppercase text-muted">Sample</dt>
              <dd className="num text-ink">n={r.games_season} season</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">{r.classification_reason}</p>
          <FreshnessIndicator at={r.source_updated_at} label="Source updated" />
          {children}
        </div>
      )}
    </article>
  );
}

/** Full minutes table (xl and up, server-side sort) with expandable cards below. */
export function MinutesTable({ rows, sort, onSort }: { rows: MinutesRow[]; sort: MinutesSort; onSort: (key: string) => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const th = (key: string | null, label: string, align = "text-right", title?: string) => (
    <th scope="col" className={cn(TH, align)} title={title} aria-sort={key && sort.key === key ? (sort.order === "asc" ? "ascending" : "descending") : undefined}>
      {key ? (
        <button type="button" className={cn("uppercase hover:text-ink", sort.key === key && "text-ink")} onClick={() => onSort(key)} data-sort={key}>
          {label}
          {sort.key === key ? (sort.order === "asc" ? " ↑" : " ↓") : ""}
        </button>
      ) : (
        label
      )}
    </th>
  );
  return (
    <>
      <div className="hidden xl:block" data-testid="minutes-table">
        <table className="w-full table-auto border-collapse">
          <caption className="sr-only">Player minutes</caption>
          <thead>
            <tr className="border-b border-line text-left">
              {th("player_name", "Player", "text-left")}
              {th(null, "Starting status", "text-left")}
              {th("proj_min", "Proj min [band]")}
              {th("l3", "L3")}
              {th("l5", "L5")}
              {th("l10", "L10")}
              {th("l20", "L20")}
              {th("season_avg", "Season")}
              {th("sd_l10", "Variability", "text-right", "Standard deviation and min–max over the last 10 games")}
              {th("starts_l10", "St L10", "text-right", "Starts in the last 10 games")}
              {th(null, "Classification · tier", "text-left")}
              {th(null, "Availability", "text-left")}
              <th scope="col" className={cn(TH, "hidden text-right 2xl:table-cell")}>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <FragmentRow key={r.player_id} r={r} open={expanded === r.player_id} onToggle={() => setExpanded((v) => (v === r.player_id ? null : r.player_id))} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 xl:hidden">
        {rows.map((r) => (
          <Card key={r.player_id} r={r} />
        ))}
      </div>
    </>
  );
}

function FragmentRow({ r, open, onToggle }: { r: MinutesRow; open: boolean; onToggle: () => void }) {
  const n = (v: number | null) => (
    <td className="num px-2 py-2 text-right text-sm text-soft">
      <Val v={fmtNum(v)} />
    </td>
  );
  return (
    <>
      <tr className="cursor-pointer border-b border-line/40 align-middle hover:bg-raised/40" onClick={onToggle} data-testid="minutes-row" data-player-id={r.player_id} aria-expanded={open}>
        <td className="px-2 py-2">
          <PlayerCell r={r} />
        </td>
        <td className="px-2 py-2">
          <Role r={r} />
        </td>
        <td className="px-2 py-2 text-right text-sm" data-col="proj_min">
          <ProjMinutes r={r} />
        </td>
        {n(r.l3)}
        {n(r.l5)}
        {n(r.l10)}
        {n(r.l20)}
        <td className="num px-2 py-2 text-right text-sm text-soft">
          <Val v={fmtNum(r.season_avg)} />
          <span className="block text-xs text-muted">n={r.games_season}</span>
        </td>
        <td className="px-2 py-2 text-right">
          <Variability r={r} />
        </td>
        <td className="num px-2 py-2 text-right text-sm text-soft">
          <Val v={r.starts_l10} />
        </td>
        <td className="px-2 py-2">
          <MinutesClass r={r} />
          <span className="num block text-xs text-muted">Tier {r.tier ?? "—"}</span>
          <MinutesFlags r={r} />
        </td>
        <td className="px-2 py-2">
          <AvailabilityStatus value={r.availability} detail={r.injury_detail} />
        </td>
        <td className="hidden px-2 py-2 text-right 2xl:table-cell">
          <FreshnessIndicator at={r.source_updated_at} label="" />
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line/40 bg-raised/30" data-testid="minutes-row-detail">
          <td colSpan={13} className="px-3 py-2 text-sm text-soft">
            <span className="font-medium text-ink">{r.classification_label}:</span> {r.classification_reason}
            <span className="num ml-3 text-xs text-muted">
              Season median {fmtNum(r.season_median) ?? "—"} · starts {r.starts_season ?? "—"} / bench {r.bench_season ?? "—"} · last game {r.last_game_date}
              {r.injury_detail ? ` · ${r.injury_detail}` : ""}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

/** Compact minutes table for a game: player, role, projected minutes, L5, L10, season, variability, classification. */
export function MinutesCompact({ rows }: { rows: MinutesRow[] }) {
  return (
    <ul className="divide-y divide-line/30" data-testid="minutes-compact">
      <li className="hidden grid-cols-[minmax(0,2.2fr)_1.1fr_1.1fr_0.6fr_0.6fr_0.7fr_1fr_1.6fr] gap-x-3 pb-2 text-2xs font-semibold uppercase tracking-wide text-muted lg:grid" aria-hidden>
        <span>Player</span>
        <span>Role</span>
        <span className="text-right">Proj min [band]</span>
        <span className="text-right">L5</span>
        <span className="text-right">L10</span>
        <span className="text-right">Season</span>
        <span className="text-right">Variability</span>
        <span>Classification</span>
      </li>
      {rows.map((r) => (
        <li key={r.player_id} className="grid grid-cols-2 gap-x-3 gap-y-1 py-2 lg:grid-cols-[minmax(0,2.2fr)_1.1fr_1.1fr_0.6fr_0.6fr_0.7fr_1fr_1.6fr] lg:items-center" data-testid="minutes-compact-row">
          <span className="col-span-2 min-w-0 lg:col-span-1">
            <DLink href={`/players/${r.player_id}`} className="text-sm font-semibold text-ink hover:underline">
              {r.player_name}
            </DLink>
            <span className="ml-1.5 text-xs text-muted">
              {r.team_abbr ?? "—"} · {r.position ?? "—"}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {r.lineup_role ? titleCase(r.lineup_role) : "Role —"} <LineupStatusLabel status={r.lineup_status} short className="text-xs" />
          </span>
          <span className="text-right text-sm">
            <span className="mr-1 text-2xs uppercase text-muted lg:hidden">Proj</span>
            <ProjMinutes r={r} />
          </span>
          {(
            [
              ["L5", r.l5],
              ["L10", r.l10],
              ["Season", r.season_avg],
            ] as const
          ).map(([l, v]) => (
            <span key={l} className="num text-sm text-soft lg:text-right">
              <span className="mr-1 text-2xs uppercase text-muted lg:hidden">{l}</span>
              <Val v={fmtNum(v)} />
            </span>
          ))}
          <span className="lg:text-right">
            <Variability r={r} />
          </span>
          <span className="col-span-2 flex flex-wrap items-center gap-x-2 lg:col-span-1">
            <MinutesClass r={r} />
            <MinutesFlags r={r} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Minutes & role" block for the player profile. */
export function MinutesProfile({ r }: { r: MinutesRow }) {
  const cell = (label: string, v: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="num text-sm font-medium text-ink">{v}</dd>
    </div>
  );
  return (
    <div className="space-y-3" data-testid="minutes-profile">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className="text-2xs font-medium uppercase tracking-wide text-muted">Projected minutes [band]</div>
          <ProjMinutes r={r} className="text-xl" />
        </div>
        <div>
          <div className="text-2xs font-medium uppercase tracking-wide text-muted">Classification · tier</div>
          <MinutesClass r={r} />
          <span className="num ml-2 text-xs text-muted">Tier {r.tier ?? "—"}</span>
        </div>
        <MinutesFlags r={r} />
      </div>
      <p className="text-sm text-soft">{r.classification_reason}</p>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-md bg-raised/50 p-3 sm:grid-cols-5 lg:grid-cols-10">
        {cell("L3", <Val v={fmtNum(r.l3)} />)}
        {cell("L5", <Val v={fmtNum(r.l5)} />)}
        {cell("L10", <Val v={fmtNum(r.l10)} />)}
        {cell("L20", <Val v={fmtNum(r.l20)} />)}
        {cell("Season avg", <Val v={fmtNum(r.season_avg)} />)}
        {cell("Median", <Val v={fmtNum(r.season_median)} />)}
        {cell("Min–max L10", `${fmtNum(r.min_l10, 0) ?? "—"}–${fmtNum(r.max_l10, 0) ?? "—"}`)}
        {cell("SD L10", <Val v={fmtNum(r.sd_l10)} />)}
        {cell("Starts / bench", `${r.starts_season ?? "—"} / ${r.bench_season ?? "—"}`)}
        {cell("Games", `n=${r.games_season}`)}
      </dl>
      <FreshnessIndicator at={r.source_updated_at} label="Source updated" />
    </div>
  );
}
