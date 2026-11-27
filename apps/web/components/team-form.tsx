import { NA } from "@/components/ui/na";
import { EmptyState } from "@/components/ui/states";
import type { TeamForm, TeamFormStats } from "@/lib/types";

const ROWS: [keyof TeamFormStats, string, number | null][] = [
  ["record", "Record", null],
  ["last_10", "Last 10", null],
  ["points_per_game", "Points per game", 1],
  ["opp_points_per_game", "Opp. points per game", 1],
  ["off_rating", "Offensive rating", 1],
  ["def_rating", "Defensive rating", 1],
  ["pace", "Pace", 1],
  ["last_10_points_per_game", "L10 points per game", 1],
  ["last_10_opp_points_per_game", "L10 opp. points per game", 1],
  ["games_in_sample", "Games in sample", 0],
];

function cell(v: string | number | null | undefined, digits: number | null) {
  if (v === null || v === undefined || v === "") return <NA />;
  if (typeof v === "number") return <span className="num">{digits === 0 ? `n=${v}` : v.toFixed(digits ?? 1)}</span>;
  return <span className="num">{v}</span>;
}

/** Side-by-side team form. `{}` (no history) renders the explicit empty state. */
export function TeamFormComparison({ home, away, homeAbbr, awayAbbr }: { home: TeamForm; away: TeamForm; homeAbbr: string; awayAbbr: string }) {
  if (Object.keys(home ?? {}).length === 0 && Object.keys(away ?? {}).length === 0) return <EmptyState title="Team form is not available for this game." />;
  return (
    <table className="w-full border-collapse text-sm" data-testid="team-form">
      <caption className="sr-only">Team form comparison</caption>
      <thead>
        <tr className="border-b border-line text-2xs text-muted">
          <th scope="col" className="pb-2 pr-2 text-left font-semibold">Metric</th>
          <th scope="col" className="px-2 pb-2 text-right font-semibold">{awayAbbr}</th>
          <th scope="col" className="pb-2 pl-2 text-right font-semibold">{homeAbbr}</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(([k, label, d]) => (
          <tr key={k} className="border-b border-line last:border-0">
            <th scope="row" className="py-1.5 pr-2 text-left font-normal text-muted">{label}</th>
            <td className="px-2 py-1.5 text-right font-medium text-ink">{cell(away?.[k], d)}</td>
            <td className="py-1.5 pl-2 text-right font-medium text-ink">{cell(home?.[k], d)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
