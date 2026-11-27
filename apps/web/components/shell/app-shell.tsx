"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, ClipboardList, LayoutGrid, LogOut, Search, Trophy, UserRound, Users, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { MOBILE_TABS, PRIMARY, SHORTCUTS, isActive, locate, type Workspace } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { JarvisLauncher, JarvisPanelProvider } from "@/components/jarvis/panel";
import { LiveDot } from "@/components/live/common";
import { MilestoneWatcher } from "@/components/live/notifications";
import { ScoreboardStrip } from "@/components/live/scoreboard-strip";
import { useScoreboard } from "@/lib/live";
import { AllPagesList } from "./all-pages";
import { Brand } from "./brand";
import { DateSelector } from "./date-selector";
import { DisclaimerText } from "./disclaimer";
import { useReturnFocus } from "@/components/ui/sheet";
import { SearchDialog } from "./search-dialog";

const TAB_ICON: Record<string, typeof CalendarDays> = { today: CalendarDays, games: Trophy, players: Users, research: ClipboardList };

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

/** The pages of the current workspace, as links. This row is the "you are here" of every page. */
function WorkspaceNav({ workspace, pathname, tab }: { workspace: Workspace; pathname: string; tab: string | null }) {
  const live = useLiveCount();
  const link = (href: string, label: string, active: boolean, dot = false) => (
    <li key={href}>
      <DLink
        href={href}
        aria-current={active ? "page" : undefined}
        data-nav-href={href}
        className={cn("inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap border-b-[3px] pt-[3px] text-sm md:min-h-[40px] md:text-xs", active ? "border-ink font-bold text-ink" : "border-transparent font-medium text-muted hover:text-ink")}
      >
        {label}
        {dot && <LiveDot />}
      </DLink>
    </li>
  );
  return (
    <nav aria-label={`${workspace.label} pages`} className="no-scrollbar min-w-0 flex-1 overflow-x-auto md:overflow-visible" data-testid="subnav" data-workspace={workspace.id}>
      <ul className="flex gap-x-5 md:flex-wrap">
        {workspace.pages.map((p) => link(p.href, p.label, isActive(pathname, p.href) && !(p.href === "/jarvis" && tab === "briefings"), p.href === "/live" && live > 0))}
        {SHORTCUTS.filter((s) => s.workspace === workspace.id).map((s) => link(s.href, s.label, false))}
      </ul>
    </nav>
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
    const parts = [name, here && (!exact || here.page.label !== here.workspace.label) ? (exact ? here.workspace.label : here.page.label) : null, "GIZER NBA"].filter(Boolean);
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
  const sp = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, staleTime: 5 * 60_000 });
  const liveCount = useLiveCount();
  const here = locate(pathname);
  const workspace = here?.workspace ?? PRIMARY[0]!;
  const { name, exact } = usePageName(pathname);
  const menuReturnFocus = useReturnFocus(menuOpen);
  const barRef = useRef<HTMLElement | null>(null);
  const subRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMenuOpen(false), [pathname]);

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

  const moreActive = !MOBILE_TABS.some((w) => w.id === workspace.id);
  const wrap = "mx-auto w-full max-w-[calc(1320px+2*var(--gutter))] px-[var(--gutter)]";

  return (
    <JarvisPanelProvider>
      <div className="flex min-h-screen flex-col">
        <a href="#main" className="absolute left-4 top-[-80px] z-[100] rounded bg-ink px-4 py-3 font-semibold text-bg2 focus:top-3" data-testid="skip-link">
          Skip to content
        </a>

        <header ref={barRef} className="z-40 border-b border-line bg-bg2 pt-[env(safe-area-inset-top)] md:sticky md:top-0" data-testid="topbar">
          <div className={cn(wrap, "flex h-[var(--bar-h)] items-center gap-3 lg:gap-8")}>
            <DLink href="/" className="shrink-0 rounded">
              <Brand />
            </DLink>
            <nav aria-label="Workspaces" className="hidden h-full lg:block" data-testid="primary-nav">
              <ul className="flex h-full gap-x-6 xl:gap-x-8">
                {PRIMARY.map((w) => {
                  const active = w.id === workspace.id;
                  return (
                    <li key={w.id} className="h-full">
                      <DLink href={w.href} aria-current={active ? "true" : undefined} data-workspace={w.id} className={cn("inline-flex h-full items-center gap-1.5 border-y-[3px] border-t-transparent text-base", active ? "border-b-ink font-bold text-ink" : "border-b-transparent font-medium text-muted hover:text-ink")}>
                        {w.label}
                        {w.id === "games" && liveCount > 0 && <LiveDot />}
                      </DLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="ml-auto flex items-center gap-1.5 md:gap-3">
              <button type="button" onClick={() => setSearchOpen(true)} aria-haspopup="dialog" aria-keyshortcuts="/" className="inline-flex h-11 w-11 items-center justify-center gap-2.5 rounded text-ink hover:bg-raised xl:w-[260px] xl:justify-start xl:bg-raised xl:px-3 xl:text-muted xl:hover:text-ink" data-testid="search-trigger">
                <Search className="h-5 w-5 shrink-0" aria-hidden />
                <span className="hidden flex-1 truncate text-left text-sm xl:block">Search pages and players</span>
                <span className="sr-only xl:hidden">Search pages and players</span>
                <kbd className="hidden rounded border border-rule-2 px-1.5 text-2xs font-semibold leading-5 text-muted xl:block">/</kbd>
              </button>
              <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen} className="hidden h-11 items-center gap-1.5 rounded px-2.5 text-sm font-semibold text-ink hover:bg-raised lg:inline-flex" data-testid="all-pages-button">
                <LayoutGrid className="h-4 w-4" aria-hidden />
                All pages
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
              <JarvisLauncher />
              <AccountMenu email={me.data?.user.email} role={me.data?.user.role} />
            </div>
          </div>
        </header>

        <div ref={subRef}>
          <div className="border-b border-line bg-bg2">
            <div className={cn(wrap, "flex flex-col-reverse gap-x-6 md:flex-row md:items-center")}>
              <WorkspaceNav workspace={workspace} pathname={pathname} tab={sp.get("tab")} />
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-0.5 md:border-0 md:py-0">
                <DateSelector />
              </div>
            </div>
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
                    <DLink href={here.workspace.href} className="hover:text-ink hover:underline">
                      {here.workspace.label}
                    </DLink>
                  </li>
                  <li aria-hidden>/</li>
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

        {/* Phone and tablet: four workspaces and More */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-bg2 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Workspaces" data-testid="bottom-nav">
          {MOBILE_TABS.map((w) => {
            const active = w.id === workspace.id;
            const Icon = TAB_ICON[w.id] ?? CalendarDays;
            return (
              <DLink key={w.id} href={w.href} aria-current={active ? "true" : undefined} data-workspace={w.id} className={cn("relative grid h-16 content-center justify-items-center gap-[3px] border-t-[3px] text-2xs", active ? "border-ink font-bold text-ink" : "border-transparent font-medium text-muted")}>
                <Icon className="h-5 w-5" aria-hidden />
                <span className="flex items-center gap-1">
                  {w.label}
                  {w.id === "games" && liveCount > 0 && <LiveDot />}
                </span>
              </DLink>
            );
          })}
          <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen} className={cn("grid h-16 content-center justify-items-center gap-[3px] border-t-[3px] text-2xs", moreActive ? "border-ink font-bold text-ink" : "border-transparent font-medium text-muted")} data-testid="more-button">
            <LayoutGrid className="h-5 w-5" aria-hidden />
            More
          </button>
        </nav>

        {/* All pages: a panel under the bar on desktop, a bottom sheet on phones. One list, every page. */}
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
            <Dialog.Content
              aria-describedby={undefined}
              onCloseAutoFocus={menuReturnFocus}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t bg-bg2 pb-[env(safe-area-inset-bottom)] shadow-overlay focus:outline-none lg:bottom-auto lg:top-0 lg:max-h-[92dvh] lg:rounded-none lg:border-b-2 lg:border-ink"
              data-testid="all-pages"
            >
              <div className={cn(wrap, "flex items-center justify-between gap-3 border-b border-line py-2 lg:h-[var(--bar-h)] lg:py-0")}>
                <Dialog.Title className="h-sub">All pages</Dialog.Title>
                <Dialog.Close aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink hover:bg-raised" data-testid="sheet-close">
                  <X className="h-5 w-5" aria-hidden />
                </Dialog.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className={cn(wrap, "py-5 lg:py-7")}>
                  <AllPagesList pathname={pathname} onNavigate={() => setMenuOpen(false)} />
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 lg:hidden">
                    <span className="min-w-0 break-all text-sm text-muted">{me.data ? `${me.data.user.email}, ${me.data.user.role}` : ""}</span>
                    <LogoutButton />
                  </div>
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
