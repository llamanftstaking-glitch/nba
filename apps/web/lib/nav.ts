import data from "./nav-destinations.json";

// The navigation is data (lib/nav-destinations.json) so the shell, the All pages menu, the mobile
// More sheet, global search and the smoke test all read one list, and a test can prove that no
// destination was lost.
export type NavItem = { href: string; label: string; was?: string; keywords?: string };
export type Workspace = { id: string; label: string; href: string; primary: boolean; summary: string; pages: NavItem[] };
export type NavGroup = { title: string; items: NavItem[] };

export const WORKSPACES: Workspace[] = data.workspaces;
/** The five workspaces in the top bar. */
export const PRIMARY: Workspace[] = WORKSPACES.filter((w) => w.primary);
/** Every destination, in menu order. */
export const ALL_PAGES: (NavItem & { workspace: Workspace })[] = WORKSPACES.flatMap((w) => w.pages.map((p) => ({ ...p, workspace: w })));
export const SHORTCUTS: (NavItem & { workspace: string })[] = data.shortcuts;

/** Kept for older call sites: the grouped list of every page. */
export const NAV_GROUPS: NavGroup[] = WORKSPACES.map((w) => ({ title: w.label, items: w.pages }));
/** Pages that were not in the old sidebar. They are ordinary destinations now. */
export const EXTRA_PAGES: NavItem[] = ALL_PAGES.filter((p) => p.was?.startsWith("hidden"));

/** Bottom tab bar on phones: four workspaces, then More (the full grouped list). */
export const MOBILE_TABS: Workspace[] = ["today", "games", "players", "research"].map((id) => WORKSPACES.find((w) => w.id === id) as Workspace);

const ALL_HREFS = ALL_PAGES.map((i) => i.href);
const matches = (pathname: string, h: string) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`));

/** Active when it is the most specific navigation entry matching the path. */
export function isActive(pathname: string, href: string): boolean {
  if (!matches(pathname, href)) return false;
  return !ALL_HREFS.some((h) => h !== href && h.length > href.length && matches(pathname, h));
}

/** The destination a path belongs to (the most specific match), with its workspace. */
export function locate(pathname: string): { page: NavItem; workspace: Workspace; exact: boolean } | null {
  // Detail routes that live under another page's subject.
  const alias = pathname.startsWith("/kalshi-intelligence/") ? "/kalshi-intelligence" : pathname.startsWith("/cortex/") ? "/cortex" : pathname;
  const hit = ALL_PAGES.find((p) => isActive(alias, p.href));
  return hit ? { page: hit, workspace: hit.workspace, exact: hit.href === pathname } : null;
}
