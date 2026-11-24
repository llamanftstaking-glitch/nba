import {
  Activity,
  CandlestickChart,
  Timer,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Database,
  FlaskConical,
  GitCompare,
  HeartPulse,
  History,
  Home,
  Layers,
  LayoutDashboard,
  LineChart,
  ListOrdered,
  Network,
  Settings,
  Swords,
  Target,
  Ticket,
  Trophy,
  UserSearch,
  Users,
  Wrench,
  Bot,
  Boxes,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; short?: string };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Command Center",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/games", label: "Today's Games", icon: CalendarDays },
      { href: "/picks", label: "Top Picks", icon: ListOrdered },
      { href: "/player-props", label: "Player Props", icon: Target },
      { href: "/kalshi-intelligence", label: "Kalshi Markets", icon: CandlestickChart },
      { href: "/lineups", label: "Starting Lineups", icon: Users },
      { href: "/parlays", label: "Parlay Research", icon: Layers },
      { href: "/parlays/same-game", label: "Same-Game Research", icon: Network },
    ],
  },
  {
    title: "Player Intelligence",
    items: [
      { href: "/players", label: "Player Explorer", icon: UserSearch },
      { href: "/minutes", label: "Minutes Intelligence", icon: Timer },
      { href: "/players/compare", label: "Player Comparison", icon: GitCompare },
      { href: "/players/history", label: "Historical Performance", icon: History },
      { href: "/matchups", label: "Matchup Intelligence", icon: Swords },
      { href: "/injuries", label: "Injuries & Availability", icon: HeartPulse },
    ],
  },
  {
    title: "My Research",
    items: [
      { href: "/builder", label: "Research Builder", icon: Wrench },
      { href: "/tickets", label: "Paper Tickets", icon: Ticket },
      { href: "/research/daily", label: "Daily Editions", icon: BookOpen },
      { href: "/results", label: "Results", icon: Trophy },
      { href: "/performance", label: "Strategy Performance", icon: LineChart },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/research-lab", label: "Research Lab", icon: FlaskConical },
      { href: "/agents", label: "Agent Operations", icon: Bot },
      { href: "/models", label: "Model Registry", icon: Boxes },
      { href: "/data-health", label: "Data Health", icon: Database },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Reachable from within System / Research pages (Settings lists them), not from the sidebar. */
export const EXTRA_PAGES: NavItem[] = [
  { href: "/admin", label: "Operations Admin", icon: Activity },
  { href: "/exposure", label: "Shared-Risk Monitor", icon: Network },
  { href: "/markets", label: "Markets", icon: BarChart3 },
  { href: "/simulations", label: "Simulations", icon: ClipboardList },
  { href: "/backtesting", label: "Backtesting", icon: History },
  { href: "/teams", label: "Teams", icon: Users },
];

export const MOBILE_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/games", label: "Games", icon: CalendarDays },
  { href: "/player-props", label: "Props", icon: Target },
  { href: "/parlays", label: "Parlays", icon: Layers },
];

const ALL_HREFS = [...NAV_GROUPS.flatMap((g) => g.items), ...EXTRA_PAGES].map((i) => i.href);

/** Active when it is the most specific navigation entry matching the path. */
export function isActive(pathname: string, href: string): boolean {
  const matches = (h: string) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`));
  if (!matches(href)) return false;
  return !ALL_HREFS.some((h) => h !== href && h.length > href.length && matches(h));
}
