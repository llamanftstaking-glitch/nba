export type NavItem = { href: string; label: string; short?: string };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Command Center", short: "CC" },
  { href: "/games", label: "Today's Games", short: "GM" },
  { href: "/picks", label: "Top Picks", short: "TP" },
  { href: "/parlays", label: "Parlay Research", short: "PR" },
  { href: "/parlays/same-game", label: "Same-Game Research", short: "SG" },
  { href: "/props", label: "Player Props", short: "PP" },
  { href: "/tickets", label: "My Paper Tickets", short: "TK" },
  { href: "/results", label: "Results", short: "RS" },
  { href: "/performance", label: "Performance", short: "PF" },
  { href: "/research-lab", label: "Research Lab", short: "RL" },
  { href: "/agents", label: "Agent Operations", short: "AG" },
  { href: "/settings", label: "Settings", short: "ST" },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/builder", label: "Research Builder", short: "BD" },
  { href: "/exposure", label: "Shared-Risk Monitor", short: "EX" },
  { href: "/research/daily", label: "Daily Research Editions", short: "ED" },
  { href: "/injuries", label: "Injuries", short: "IN" },
  { href: "/players", label: "Players", short: "PL" },
  { href: "/teams", label: "Teams", short: "TM" },
  { href: "/markets", label: "Markets", short: "MK" },
  { href: "/simulations", label: "Simulations", short: "SM" },
  { href: "/backtesting", label: "Backtesting", short: "BT" },
  { href: "/data-health", label: "Data Health", short: "DH" },
  { href: "/admin", label: "Operations Admin", short: "AD" },
];

export const MOBILE_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Games" },
  { href: "/parlays", label: "Parlays" },
  { href: "/results", label: "Results" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/parlays") return pathname === "/parlays";
  return pathname === href || pathname.startsWith(`${href}/`);
}
