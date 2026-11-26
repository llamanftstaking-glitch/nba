"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { EXTRA_PAGES, MOBILE_NAV, NAV_GROUPS, isActive, type NavItem } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { SlashMark } from "@/components/ui/panel";
import { Sheet } from "@/components/ui/sheet";
import { Brand } from "./brand";
import { JarvisLauncher, JarvisPanelProvider } from "@/components/jarvis/panel";
import { DateSelector } from "./date-selector";
import { DisclaimerText } from "./disclaimer";

const COLLAPSE_KEY = "gizer.sidebar.collapsed";

function SideLink({ item, collapsed, pathname }: { item: NavItem; collapsed: boolean; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <DLink
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative mx-2 flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors",
        active ? "bg-accent/10 font-semibold text-ink shadow-accent" : "text-muted hover:bg-raised hover:text-ink",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-accent" : "text-faint")} aria-hidden />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </DLink>
  );
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
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      {m.isPending ? "Signing out…" : "Log out"}
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: api.me, staleTime: 5 * 60_000 });

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // storage unavailable; keep the default
    }
  }, []);
  useEffect(() => setMoreOpen(false), [pathname]);

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

  const mobileActive = (href: string) => (href === "/parlays" ? pathname.startsWith("/parlays") : isActive(pathname, href));
  const moreActive = !MOBILE_NAV.some((n) => mobileActive(n.href));

  return (
    <JarvisPanelProvider>
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line/60 bg-bg2 lg:flex", collapsed ? "w-[60px]" : "w-[252px]")} data-testid="sidebar">
        <div className={cn("flex h-[68px] items-center", collapsed ? "justify-center" : "justify-between pl-4 pr-1.5")}>
          {!collapsed && (
            <DLink href="/" className="rounded-md">
              <Brand />
            </DLink>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-faint hover:bg-raised hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        <nav className="no-scrollbar flex-1 overflow-y-auto pb-10" aria-label="Primary">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="mb-3">
              {collapsed ? (
                <div className="mx-3 mb-2 border-t border-line/60" />
              ) : (
                <div className="px-4 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{g.title}</div>
              )}
              <div className="space-y-0.5">
                {g.items.map((item) => (
                  <SideLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line/60 bg-bg2/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] md:px-5">
            <DLink href="/" className="shrink-0 lg:hidden">
              <Brand compact />
            </DLink>
            <DateSelector />
            <div className="flex shrink-0 items-center gap-3">
              <JarvisLauncher />
              <div className="hidden items-center gap-3 lg:flex">
              <span className="max-w-[240px] truncate text-sm text-muted" title={me.data?.user.email}>
                {me.data ? `${me.data.user.email} · ${me.data.user.role}` : ""}
              </span>
              <LogoutButton />
            </div>
            </div>
          </div>
          {/* Below the desktop breakpoint the persistent notice sits under the top bar so it never collides with the bottom nav. */}
          <DisclaimerText className="border-t border-line/60 bg-bg px-3 py-1 text-[11px] leading-[14px] text-muted lg:hidden" />
        </header>

        <main className="min-w-0 flex-1 px-3 pb-28 pt-4 md:px-5 lg:pb-14">
          <div className="mx-auto w-full max-w-[1640px]">{children}</div>
        </main>

        <footer className="fixed inset-x-0 bottom-0 z-20 hidden h-8 items-center justify-center gap-2 border-t border-line/60 bg-bg2 lg:flex">
          <SlashMark className="h-2.5 w-3.5" />
          <DisclaimerText className="text-xs text-muted" />
        </footer>
      </div>

      {/* Mobile / tablet bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line/60 bg-bg2 pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary mobile"
        data-testid="bottom-nav"
      >
        {MOBILE_NAV.map((item) => {
          const active = mobileActive(item.href);
          const Icon = item.icon;
          return (
            <DLink
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-ink" : "text-muted")}
            >
              <Icon className={cn("h-5 w-5", active ? "text-accent" : "text-faint")} aria-hidden />
              {item.label}
            </DLink>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", moreActive ? "text-ink" : "text-muted")}
          data-testid="more-button"
        >
          <Menu className={cn("h-5 w-5", moreActive ? "text-accent" : "text-faint")} aria-hidden />
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="space-y-4">
          {[...NAV_GROUPS, { title: "Also", items: EXTRA_PAGES }].map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{g.title}</div>
              <ul className="grid grid-cols-2 gap-1.5">
                {g.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <DLink
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          "flex min-h-[44px] items-center gap-2 rounded-md px-2.5 text-sm",
                          active ? "bg-accent/10 font-semibold text-ink ring-1 ring-inset ring-accent/40" : "bg-raised/60 text-soft",
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-faint")} aria-hidden />
                        <span className="min-w-0 leading-tight">{item.label}</span>
                      </DLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-3">
            <span className="min-w-0 truncate text-sm text-muted">{me.data?.user.email ?? ""}</span>
            <LogoutButton />
          </div>
        </div>
      </Sheet>
    </div>
    </JarvisPanelProvider>
  );
}
