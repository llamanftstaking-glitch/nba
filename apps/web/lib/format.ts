// Formatting helpers. Every helper returns null for unavailable input so that callers
// render the explicit "not available" state (see components/ui/na.tsx) instead of a placeholder number.

const ET = "America/New_York";

export function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function fmtPct(v: number | null | undefined, digits = 1): string | null {
  return isNum(v) ? `${(v * 100).toFixed(digits)}%` : null;
}

export function fmtSignedPct(v: number | null | undefined, digits = 1): string | null {
  if (!isNum(v)) return null;
  const s = (v * 100).toFixed(digits);
  return `${v > 0 ? "+" : ""}${s}%`;
}

export function fmtNum(v: number | null | undefined, digits = 1): string | null {
  return isNum(v) ? v.toFixed(digits) : null;
}

export function fmtInt(v: number | null | undefined): string | null {
  return isNum(v) ? Math.round(v).toLocaleString("en-US") : null;
}

export function fmtSigned(v: number | null | undefined, digits = 2): string | null {
  if (!isNum(v)) return null;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}

export function fmtAmerican(v: number | null | undefined): string | null {
  if (!isNum(v)) return null;
  return v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`;
}

export function fmtLine(v: number | null | undefined): string | null {
  if (!isNum(v)) return null;
  return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);
}

export function fmtInterval(low: number | null | undefined, high: number | null | undefined, digits = 1): string | null {
  if (!isNum(low) || !isNum(high)) return null;
  return `[${(low * 100).toFixed(digits)}–${(high * 100).toFixed(digits)}]`;
}

export function fmtDuration(ms: number | null | undefined): string | null {
  if (!isNum(ms)) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtTimeET(iso: string | null | undefined): string | null {
  const d = parse(iso);
  if (!d) return null;
  return `${d.toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" })} ET`;
}

export function fmtDateTimeET(iso: string | null | undefined): string | null {
  const d = parse(iso);
  if (!d) return null;
  const date = d.toLocaleDateString("en-US", { timeZone: ET, month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
  return `${date}, ${time} ET`;
}

/** Format a YYYY-MM-DD slate date (already in ET) without shifting it through a timezone. */
export function fmtDate(ymd: string | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return null;
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    weekday: opts.weekday ? "short" : undefined,
    year: opts.year ? "numeric" : undefined,
  });
}

export function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days, 12));
  return date.toISOString().slice(0, 10);
}

export function titleCase(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export const MARKET_LABELS: Record<string, string> = {
  spread: "Spread",
  total: "Total",
  moneyline: "Moneyline",
  player_pts: "Player points",
  player_reb: "Player rebounds",
  player_ast: "Player assists",
  player_fg3m: "Player 3-pointers made",
};

export function marketName(m: string): string {
  return MARKET_LABELS[m] ?? titleCase(m);
}

export const ENGINES = ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "FIVE", "SIX"] as const;

export const STAT_LABELS: Record<string, string> = {
  min: "MIN",
  pts: "PTS",
  reb: "REB",
  ast: "AST",
  fg3m: "3PM",
  stl: "STL",
  blk: "BLK",
  tov: "TOV",
  pra: "PRA",
  pr: "PR",
  pa: "PA",
  ra: "RA",
};
export const HISTORY_STATS = ["pts", "reb", "ast", "fg3m", "stl", "blk", "tov", "pra", "pr", "pa", "ra"] as const;
export const HISTORY_WINDOWS = [
  ["L5", "L5"],
  ["L10", "L10"],
  ["L15", "L15"],
  ["L20", "L20"],
  ["L30", "L30"],
  ["season", "Season"],
] as const;

export function statLabel(stat: string): string {
  return STAT_LABELS[stat] ?? stat.toUpperCase();
}

export function propMarketName(market: string): string {
  return market.startsWith("player_") ? statLabel(market.slice(7)) : marketName(market);
}

export const ORIGIN_LABELS: Record<string, string> = {
  provider: "Provider",
  owner_entered: "Owner-entered",
  hypothetical: "Hypothetical",
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Kalshi prices are dollars per $1 contract (0–1); shown in cents. */
export function fmtCents(v: number | null | undefined): string | null {
  if (!isNum(v)) return null;
  const c = v * 100;
  return `${Number.isInteger(Math.round(c * 10) / 10) ? Math.round(c) : c.toFixed(1)}¢`;
}

/** Price movement in cents with an explicit sign, e.g. +4¢ / −2.5¢ / 0¢. */
export function fmtCentsMove(v: number | null | undefined): string | null {
  if (!isNum(v)) return null;
  const c = Math.round(v * 1000) / 10;
  if (c === 0) return "0¢";
  const abs = Math.abs(c);
  return `${c > 0 ? "+" : "−"}${Number.isInteger(abs) ? abs : abs.toFixed(1)}¢`;
}

export const CLASSIFICATION_LABELS: Record<string, string> = {
  high_confidence: "Validated research",
  standard: "Standard research",
  watchlist: "Watchlist",
  insufficient_evidence: "Insufficient information",
  stale: "Stale",
  invalidated: "Invalidated",
  rejected: "Rejected",
};
export function classLabel(c: string | null | undefined): string {
  if (!c) return "—";
  return CLASSIFICATION_LABELS[c] ?? titleCase(c);
}
