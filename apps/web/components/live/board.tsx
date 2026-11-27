"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { teamColor } from "@/lib/team-colors";
import type { GameRow } from "@/lib/live";
import { TeamMark, leader } from "./common";

type Size = "hero" | "header" | "row";

// One scoreboard, three sizes. Away over home, periods, total; columns line up down the page.
const SIZES: Record<Size, { row: string; mark: number; markSm: number; name: string; abbr: string; q: string; total: string; bar: string; qw: string; tw: string }> = {
  hero: {
    row: "py-2.5 md:py-3",
    mark: 48,
    markSm: 36,
    name: "text-[2.5rem] xl:text-[2.75rem]",
    abbr: "text-[2rem]",
    q: "text-base md:text-xl",
    total: "text-[3.25rem] md:text-[4.5rem]",
    bar: "w-1.5 md:w-2",
    qw: "[--qw:30px] sm:[--qw:44px] md:[--qw:52px]",
    tw: "[--tw:72px] md:[--tw:128px]",
  },
  header: {
    row: "py-1 md:py-1.5",
    mark: 32,
    markSm: 28,
    name: "text-[1.75rem]",
    abbr: "text-2xl md:text-[1.75rem]",
    q: "text-sm md:text-base",
    total: "text-[2.25rem] md:text-[2.75rem]",
    bar: "w-1 md:w-1.5",
    qw: "[--qw:28px] sm:[--qw:40px] md:[--qw:48px]",
    tw: "[--tw:60px] md:[--tw:96px]",
  },
  row: {
    row: "py-1",
    mark: 28,
    markSm: 26,
    name: "text-sm",
    abbr: "text-[1.375rem]",
    q: "text-sm md:text-base",
    total: "text-[2rem]",
    bar: "w-1",
    qw: "[--qw:30px] sm:[--qw:44px] md:[--qw:52px]",
    tw: "[--tw:60px] md:[--tw:80px]",
  },
};

const periodHead = (i: number) => (i < 4 ? String(i + 1) : i === 4 ? "OT" : `${i - 3}OT`);

/**
 * The stacked scoreboard: two team rows on a ruled grid with the period scores and the total.
 * Team colour appears only as the bar at the start of each row. A period the source has not
 * published is a dash, never a zero. Before tipoff there are no period columns and no line score.
 */
export function StackedBoard({ g, size, head, className }: { g: Pick<GameRow, "home" | "away" | "status">; size: Size; head?: ReactNode; className?: string }) {
  const S = SIZES[size];
  const started = g.status !== "scheduled" && (g.home.score !== null || g.away.score !== null || g.home.linescores.length > 0);
  const n = started ? Math.max(4, g.home.linescores.length, g.away.linescores.length) : 0;
  const lead = leader(g);
  const cols = { gridTemplateColumns: `minmax(0,1fr) repeat(${n}, var(--qw)) var(--tw)` } as CSSProperties;
  const cell = (v: number | null | undefined) => (v === null || v === undefined ? <span className="text-faint">—</span> : v);
  return (
    <div className={cn(S.qw, S.tw, className)}>
      <table className="block w-full" data-testid={started ? "line-score" : undefined}>
        <caption className="sr-only">{started ? "Line score by period" : "Teams"}</caption>
        <thead className="block">
          <tr className="grid items-end !border-t-0 border-b-2 !border-b-ink !bg-transparent pb-1.5" style={cols}>
            <th scope="col" className="!p-0 text-left !normal-case !tracking-normal">
              {head ?? <span className="sr-only">Team</span>}
            </th>
            {Array.from({ length: n }, (_, i) => (
              <th key={i} scope="col" className="!p-0 text-right">
                <span className="sr-only">{i < 4 ? "Quarter " : ""}</span>
                {periodHead(i)}
              </th>
            ))}
            <th scope="col" className="!p-0 text-right">
              {started ? <abbr title="Total" className="no-underline">T</abbr> : <span className="sr-only">Score</span>}
            </th>
          </tr>
        </thead>
        <tbody className="block">
          {([["away", g.away], ["home", g.home]] as const).map(([side, t], idx) => {
            const behind = lead !== null && lead !== side;
            return (
              <tr key={t.abbr} className={cn("grid items-center border-b", idx === 1 ? (size === "row" ? "border-transparent" : "border-ink") : "border-line", S.row)} style={cols} data-side={side}>
                <th scope="row" className="flex min-w-0 items-center gap-2.5 !pl-0 text-left font-normal md:gap-4">
                  <span className={cn("self-stretch", S.bar)} style={{ background: teamColor(t.abbr) }} aria-hidden />
                  <span className="hidden md:inline-flex">
                    <TeamMark team={t} size={S.mark} />
                  </span>
                  <span className="md:hidden">
                    <TeamMark team={t} size={S.markSm} />
                  </span>
                  {size === "row" ? (
                    <span className="flex min-w-0 items-baseline gap-3">
                      <span className={cn("team-name w-12 shrink-0", S.abbr, behind && "!font-medium text-faint")}>{t.abbr}</span>
                      <span className="hidden truncate text-sm text-muted lg:inline">{t.name}</span>
                    </span>
                  ) : (
                    <span className="min-w-0">
                      <span className={cn("team-name hidden truncate lg:block", S.name, behind && "!font-semibold text-faint")}>{t.name}</span>
                      <span className={cn("team-name block lg:hidden", S.abbr, behind && "!font-semibold text-faint")}>{t.abbr}</span>
                    </span>
                  )}
                </th>
                {Array.from({ length: n }, (_, i) => (
                  <td key={i} className={cn("num text-right", S.q, behind ? "text-muted" : "text-ink")} style={{ fontStretch: "80%" }}>
                    {cell(t.linescores[i])}
                  </td>
                ))}
                <td className={cn("score !pr-0 text-right", S.total, behind && "!font-medium text-faint")}>
                  {t.score === null || t.score === undefined ? started ? <span className="text-faint" aria-label="score not available">—</span> : null : t.score}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
