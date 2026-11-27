"use client";

import { ArrowRight } from "lucide-react";
import { TeamLogo } from "@/components/team-logo";
import { DLink } from "@/lib/date";
import { cn } from "@/lib/cn";
import { fmtAmerican, fmtLine, fmtTimeET } from "@/lib/format";
import type { GameCard, LineupGame, LineupPlayer, TeamLineup } from "@/lib/types";

/**
 * Compact lineup card: both teams side by side with the five starters, a "May not play" list and the
 * game line. Layout familiar from lineup boards; data and status wording are GIZER's own.
 */

const OUT = /out|suspension|injured reserve/i;

function tag(av: string): { text: string; cls: string } | null {
  const a = av.toLowerCase();
  if (a === "available") return null;
  if (OUT.test(a)) return { text: "OUT", cls: "bg-bad-dim text-bad" };
  if (a.includes("doubt")) return { text: "D", cls: "bg-warn-dim text-warn" };
  if (a.includes("question")) return { text: "Q", cls: "bg-warn-dim text-warn" };
  if (a.includes("day")) return { text: "DTD", cls: "bg-warn-dim text-warn" };
  if (a.includes("prob")) return { text: "P", cls: "bg-warn-dim text-warn" };
  return { text: av.slice(0, 4).toUpperCase(), cls: "bg-warn-dim text-warn" };
}

function Row({ p }: { p: LineupPlayer }) {
  const t = tag(p.availability);
  const name = <span className={cn("truncate", t?.text === "OUT" ? "text-muted line-through" : "text-ink")}>{p.name}</span>;
  return (
    <li className="flex min-h-[28px] min-w-0 items-center gap-1.5 text-sm" data-testid="lc-player">
      <span className="w-5 shrink-0 text-xs font-semibold text-muted">{p.position ?? "—"}</span>
      {p.player_id !== null ? (
        <DLink href={`/players/${p.player_id}`} className="min-w-0 truncate hover:underline">
          {name}
        </DLink>
      ) : (
        name
      )}
      {t && (
        <span className={cn("shrink-0 rounded px-1 text-2xs font-semibold leading-4", t.cls)} title={`${p.availability}${p.injury_detail ? ` — ${p.injury_detail}` : ""}`}>
          {t.text}
        </span>
      )}
    </li>
  );
}

type StatusStyle = { label: string; bar: string; text: string };
const UNKNOWN: StatusStyle = { label: "Awaiting Lineup", bar: "bg-faint", text: "text-muted" };
const STATUS: Record<string, StatusStyle> = {
  confirmed: { label: "Confirmed Lineup", bar: "bg-accent", text: "text-accent" },
  projected: { label: "Projected Lineup", bar: "bg-warn", text: "text-warn" },
  unknown: UNKNOWN,
};

function TeamColumn({ lu, align }: { lu: TeamLineup; align: "left" | "right" }) {
  const s = STATUS[lu.status] ?? UNKNOWN;
  const mayNot = [...lu.bench.filter((p) => p.availability.toLowerCase() !== "available"), ...lu.unavailable];
  return (
    <div className="min-w-0 flex-1" data-testid="lc-team" data-team={lu.team.abbr} data-lineup-status={lu.status}>
      <div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse text-right")}>
        <TeamLogo team={lu.team} size={36} />
        <div className="min-w-0">
          <div className="font-display text-xl font-semibold leading-none text-ink">{lu.team.abbr}</div>
          <div className="truncate text-xs text-muted">{lu.team.name}</div>
        </div>
      </div>
      <div className={cn("mt-3 h-0.5 w-full rounded", s.bar)} aria-hidden />
      <div className={cn("mt-1.5 text-xs font-semibold", s.text)}>
        {s.label}
        {lu.status === "projected" && <span className="ml-1 font-normal normal-case tracking-normal text-muted">· not official</span>}
      </div>
      {lu.starters.length > 0 ? (
        <ul className="mt-1.5">
          {lu.starters.map((p, i) => (
            <Row key={`${p.player_id ?? p.name}-${i}`} p={p} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted" data-testid="lc-no-lineup">
          No lineup information available.
        </p>
      )}
      <div className="mt-3 text-2xs font-semibold text-muted">May not play</div>
      {mayNot.length > 0 ? (
        <ul className="mt-0.5">
          {mayNot.slice(0, 8).map((p, i) => (
            <Row key={`${p.player_id ?? p.name}-m${i}`} p={p} />
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-sm text-muted">None listed</p>
      )}
    </div>
  );
}

function GameLine({ card }: { card: GameCard | undefined }) {
  if (!card) return null;
  const q = (m: string, side: string) => card.quotes.find((x) => x.market === m && x.side === side);
  const fav = [q("spread", "home"), q("spread", "away")].filter((x) => x && x.line !== null && x.line < 0)[0];
  const ml = [q("moneyline", "home"), q("moneyline", "away")].filter((x) => x && x.price_american !== null && x.price_american < 0)[0];
  const total = q("total", "over");
  const book = (fav ?? total ?? ml)?.book;
  const abbr = (side: string | undefined) => (side === "home" ? card.home.abbr : side === "away" ? card.away.abbr : "");
  if (!fav && !total && !ml) return <p className="text-xs text-muted">No verified game line available.</p>;
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs" data-testid="lc-line">
      {ml && (
        <div className="flex gap-1.5">
          <dt className="font-semibold text-muted">Line</dt>
          <dd className="num text-ink">{abbr(ml.side)} {fmtAmerican(ml.price_american)}</dd>
        </div>
      )}
      {fav && (
        <div className="flex gap-1.5">
          <dt className="font-semibold text-muted">Spread</dt>
          <dd className="num text-ink">{abbr(fav.side)} {fmtLine(fav.line)}</dd>
        </div>
      )}
      {total && (
        <div className="flex gap-1.5">
          <dt className="font-semibold text-muted">O/U</dt>
          <dd className="num text-ink">{total.line} pts</dd>
        </div>
      )}
      {book && <div className="text-muted">{book}</div>}
    </dl>
  );
}

export function LineupCard({ g, card }: { g: LineupGame; card?: GameCard }) {
  const live = g.game.status !== "scheduled";
  return (
    <article className="min-w-0 blk p-3 sm:p-4" data-testid="lineup-card" data-game-id={g.game.id}>
      <header className="flex items-center justify-between gap-2 border-b border-line pb-2">
        <div className="num text-sm font-semibold text-ink">{fmtTimeET(g.game.tipoff_utc) ?? "Time TBD"}</div>
        <div className="text-xs text-muted">{live ? g.game.status : g.game.label}</div>
      </header>
      <div className="mt-3 flex gap-3 sm:gap-4">
        <TeamColumn lu={g.away} align="left" />
        <div className="w-px shrink-0 bg-line" aria-hidden />
        <TeamColumn lu={g.home} align="left" />
      </div>
      <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <GameLine card={card} />
        <DLink href={`/games/${encodeURIComponent(g.game.id)}`} className="inline-flex items-center gap-1 text-xs font-medium link">
          Game research <ArrowRight className="h-3 w-3" aria-hidden />
        </DLink>
      </footer>
    </article>
  );
}
