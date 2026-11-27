"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { EXTRA_PAGES, EXTRA_TITLE, MOBILE_NAV, NAV_GROUPS, isActive, locate, type NavItem } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { JarvisLauncher, JarvisPanelProvider } from "@/components/jarvis/panel";
import { LiveDot } from "@/components/live/common";
import { MilestoneWatcher } from "@/components/live/notifications";
import { ScoreboardStrip } from "@/components/live/scoreboard-strip";
import { useScoreboard } from "@/lib/live";
import { Brand } from "./brand";
import { DateSelector } from "./date-selector";
import { DisclaimerText } from "./disclaimer";
import { useReturnFocus } from "@/components/ui/sheet";
import { SearchDialog } from "./search-dialog";

function useLiveCount() {
  const q = useScoreboard();
  return q.data?.live_count ?? 0;
}

function LogoutButton({ className }: { className?: string }) {
  const m = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      window.location.assign("/login");
    },
  });
  return (
    <Button className={className} onClick={() => m.mutate()} disabled={m.isPending} data-testid="logout">
      <LogOut className="h-4 w-4" aria-hidden />
      {m.isPending ? "Signing out…" : "Log out"}
    </Button>
  );
}

/** Account: who is signed in, and the way out. A small disclosure, closed by Escape or a click elsewhere. */
function AccountMenu({ email, role }: { email?: string; role?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative hidden lg:block">
      <button type="button" aria-expanded={open} aria-haspopup="true" aria-label={email ? `Account: ${email}` : "Account"} onClick={() => setOpen((v) => !v)} className="inline-flex h-11 w-11 items-center justify-center rounded text-ink hover:bg-raised" data-testid="account-button">
        <UserRound className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded border border-line bg-bg2 p-4 shadow-overlay" data-testid="account-menu">
          <p className="break-all text-sm font-semibold text-ink">{email ?? "Signed in"}</p>
          {role && <p className="text-xs text-muted">Role: {role}</p>}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
            <DLink href="/settings" className="link text-sm">
              Settings
            </DLink>
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}

const COLLAPSE_KEY = "gizer.sidebar.collapsed";

function NavLiveDot() {
  return useLiveCount() > 0 ? <LiveDot className="ml-auto" /> : null;
}

/** One sidebar entry. The current page is marked with an ink bar and weight; no fill glow, no ring. */
function SideLink({ item, collapsed, pathname }: { item: NavItem; collapsed: boolean; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <DLink
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      data-nav-href={item.href}
      className={cn(
        "relative flex h-9 items-center gap-3 border-l-4 pr-3 text-sm transition-colors",
        active ? "border-ink bg-raised font-bold text-ink" : "border-transparent font-medium text-muted hover:bg-raised hover:text-ink",
        collapsed ? "justify-center pl-0 pr-1" : "pl-3",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-ink" : "text-faint")} aria-hidden />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
      {item.href === "/live" && !collapsed && <NavLiveDot />}
    </DLink>
  );
}

/**
 * Keeps the document title and the breadcrumb in step with the page. A navigation destination is named
 * by the navigation list; a detail page (a game, a player, a contract, a library record) is named by
 * its own h1 once it has rendered.
 */
function usePageName(pathname: string): { name: string | null; exact: boolean } {
  const here = locate(pathname);
  const exact = Boolean(here?.exact);
  const [h1, setH1] = useState<string | null>(null);
  useEffect(() => {
    setH1(null);
    if (exact) return;
    const main = document.getElementById("main");
    if (!main) return;
    const read = () => {
      const t = main.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim();
      setH1(t ? t.replace(/ · game centre$/, "") : null);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(main, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [pathname, exact]);
  const name = exact ? (here?.page.label ?? null) : h1;
  useEffect(() => {
    const parts = [name, here ? (exact ? (here.group === EXTRA_TITLE ? null : here.group) : here.page.label) : null, "GIZER NBA"].filter(Boolean);
    const title = parts.join(" · ");
    document.title = title;
    // Next re-applies the layout's default title after a client navigation; put ours back.
    const el = document.querySelector("title");
    if (!el) return;
    const mo = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    return () => mo.disconnect();
  }, [name, exact, here]);
  return { name, exact };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, staleTime: 5 * 60_000 });
  const here = locate(pathname);
  const { name, exact } = usePageName(pathname);
  const menuReturnFocus = useReturnFocus(menuOpen);
  const barRef = useRef<HTMLElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // storage unavailable; keep the default
    }
  }, []);
  useEffect(() => setMenuOpen(false), [pathname]);
  const toggle = () => {
    setCollapsed((v) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        // ignore
      }
      return !v;
    });
  };

  // "/" and Ctrl/Cmd+K open search, unless the owner is typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Full-height pages (JARVIS) subtract the height of everything above <main>.
  useEffect(() => {
    const set = () => document.documentElement.style.setProperty("--chrome-h", `${(barRef.current?.offsetHeight ?? 0) + (subRef.current?.offsetHeight ?? 0)}px`);
    set();
    const ro = new ResizeObserver(set);
    if (barRef.current) ro.observe(barRef.current);
    if (subRef.current) ro.observe(subRef.current);
    return () => ro.disconnect();
  }, []);

  // Same rule as main: Parlays stays lit on its sub-pages; More is lit when none of the four tabs is.
  const mobileActive = (href: string) => (href === "/parlays" ? pathname.startsWith("/parlays") : isActive(pathname, href));
  const moreActive = !MOBILE_NAV.some((n) => mobileActive(n.href));
  const wrap = "mx-auto w-full max-w-[calc(1320px+2*var(--gutter))] px-[var(--gutter)]";

  return (
    <JarvisPanelProvider>
      <div className="flex min-h-screen">
        <a href="#main" className="absolute left-4 top-[-80px] z-[100] rounded bg-ink px-4 py-3 font-semibold text-bg2 focus:top-3" data-testid="skip-link">
          Skip to content
        </a>

        {/* Desktop sidebar: the same four groups, order and names as before, set on the sheet with rules. */}
        <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-bg2 lg:flex", collapsed ? "w-[60px]" : "w-[252px]")} data-testid="sidebar">
          <div className={cn("flex h-[var(--bar-h)] shrink-0 items-center border-b border-line", collapsed ? "justify-center" : "justify-between pl-4 pr-1.5")}>
            {!collapsed && (
              <DLink href="/" className="rounded">
                <Brand caption />
              </DLink>
            )}
            <button type="button" onClick={toggle} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} className="inline-flex h-9 w-9 items-center justify-center rounded text-muted hover:bg-raised hover:text-ink">
              {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto pb-6 pt-2" aria-label="Primary">
            {NAV_GROUPS.map((g) => (
              <div key={g.title} className="mb-3" data-nav-group={g.title}>
                {collapsed ? <div className="mx-3 mb-2 border-t border-line" /> : <div className="px-4 pb-1 pt-2 text-2xs font-bold text-ink">{g.title}</div>}
                <div>
                  {g.items.map((item) => (
                    <SideLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header ref={barRef} className="z-30 border-b border-line bg-bg2 pt-[env(safe-area-inset-top)] md:sticky md:top-0" data-testid="topbar">
            <div className={cn(wrap, "flex h-[var(--bar-h)] items-center gap-2 md:gap-4")}>
              <DLink href="/" className="shrink-0 rounded lg:hidden">
                <Brand />
              </DLink>
              <div className="hidden md:block">
                <DateSelector />
              </div>
              <div className="ml-auto flex items-center gap-1.5 md:gap-3">
                <button type="button" onClick={() => setSearchOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="/" className="inline-flex h-11 w-11 items-center justify-center gap-2.5 rounded text-ink hover:bg-raised xl:w-[260px] xl:justify-start xl:bg-raised xl:px-3 xl:text-muted xl:hover:text-ink" data-testid="search-trigger">
                  <Search className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="hidden flex-1 truncate text-left text-sm xl:block">Search pages and players</span>
                  <span className="sr-only xl:hidden">Search pages and players</span>
                  <kbd className="hidden rounded border border-rule-2 px-1.5 text-2xs font-semibold leading-5 text-muted xl:block">/</kbd>
                </button>
                <JarvisLauncher />
                <AccountMenu email={me.data?.user.email} role={me.data?.user.role} />
              </div>
            </div>
          </header>

          <div ref={subRef}>
            <div className="border-b border-line bg-bg2 px-[var(--gutter)] py-0.5 md:hidden">
              <DateSelector />
            </div>
            <ScoreboardStrip />
          </div>
          <MilestoneWatcher />

          <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-16 pt-5 focus:outline-none md:pt-7">
            <div className={wrap}>
              {!exact && here && (
                <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted" data-testid="breadcrumb">
                  <ol className="flex flex-wrap items-center gap-x-2">
                    <li>
                      <DLink href={here.page.href} className="hover:text-ink hover:underline">
                        {here.page.label}
                      </DLink>
                    </li>
                    {name && (
                      <>
                        <li aria-hidden>/</li>
                        <li aria-current="page" className="font-semibold text-ink">
                          {name}
                        </li>
                      </>
                    )}
                  </ol>
                </nav>
              )}
              {children}
            </div>
          </main>

          <footer className="border-t border-line pb-24 text-sm text-faint lg:pb-0">
            <div className={cn(wrap, "flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-5")}>
              <DisclaimerText className="max-w-[70ch]" />
              <p>Scores and prices are polled observations with their timestamps. Model estimates are shown in orange.</p>
            </div>
          </footer>
        </div>

        {/* Phone and tablet: the same four tabs as before, and More */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-bg2 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Primary mobile" data-testid="bottom-nav">
          {MOBILE_NAV.map((item) => {
            const active = mobileActive(item.href);
            const Icon = item.icon;
            return (
              <DLink key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("grid h-16 content-center justify-items-center gap-[3px] border-t-[3px] text-2xs", active ? "border-ink font-bold text-ink" : "border-transparent font-medium text-muted")}>
                <Icon className="h-5 w-5" aria-hidden />
                {item.label}
              </DLink>
            );
          })}
          <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen} className={cn("grid h-16 content-center justify-items-center gap-[3px] border-t-[3px] text-2xs", moreActive ? "border-ink font-bold text-ink" : "border-transparent font-medium text-muted")} data-testid="more-button">
            <Menu className="h-5 w-5" aria-hidden />
            More
          </button>
        </nav>

        {/* More: the four sidebar groups and "Also" (the pages that are not in the sidebar), as before. */}
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
            <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={menuReturnFocus} className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t bg-bg2 pb-[env(safe-area-inset-bottom)] shadow-overlay focus:outline-none" data-testid="more-sheet">
              <div className="flex items-center justify-between gap-3 border-b-2 border-ink py-2 pl-4 pr-2">
                <Dialog.Title className="h-sub">More</Dialog.Title>
                <Dialog.Close aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink hover:bg-raised" data-testid="sheet-close">
                  <X className="h-5 w-5" aria-hidden />
                </Dialog.Close>
              </div>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                {[...NAV_GROUPS, { title: EXTRA_TITLE, items: EXTRA_PAGES }].map((g) => (
                  <div key={g.title} data-nav-group={g.title}>
                    <div className="border-b border-rule-2 pb-1 text-sm font-bold text-ink">{g.title}</div>
                    <ul className="grid grid-cols-2 gap-x-4">
                      {g.items.map((item) => {
                        const active = isActive(pathname, item.href);
                        const Icon = item.icon;
                        return (
                          <li key={item.href} className="border-b border-line">
                            <DLink href={item.href} onClick={() => setMenuOpen(false)} aria-current={active ? "page" : undefined} data-nav-href={item.href} className={cn("flex min-h-[48px] items-center gap-2.5 border-l-4 py-1 pl-2 text-sm", active ? "border-ink bg-raised font-bold text-ink" : "border-transparent text-soft")}>
                              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-ink" : "text-faint")} aria-hidden />
                              <span className="min-w-0 leading-tight">{item.label}</span>
                            </DLink>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="min-w-0 break-all text-sm text-muted">{me.data ? `${me.data.user.email}, ${me.data.user.role}` : ""}</span>
                  <LogoutButton />
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </JarvisPanelProvider>
  );
}
