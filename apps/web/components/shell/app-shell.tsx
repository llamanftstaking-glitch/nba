"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";
import { MOBILE_NAV, PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { DateSelector } from "./date-selector";
import { DisclaimerText } from "./disclaimer";

const COLLAPSE_KEY = "gizer.sidebar.collapsed";

function SideLink({ item, collapsed, pathname, index }: { item: NavItem; collapsed: boolean; pathname: string; index?: number }) {
  const active = isActive(pathname, item.href);
  return (
    <DLink
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2 border-l-2 px-3 text-xs transition-colors",
        active ? "border-accent bg-raised text-ink" : "border-transparent text-muted hover:bg-raised/60 hover:text-ink",
      )}
    >
      <span className={cn("num w-5 shrink-0 text-2xs", active ? "text-accent" : "text-muted")} aria-hidden>
        {collapsed ? item.short : index !== undefined ? String(index).padStart(2, "0") : "··"}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
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

  const moreActive = !MOBILE_NAV.some((n) => isActive(pathname, n.href));
  const moreItems = [...PRIMARY_NAV.filter((p) => !MOBILE_NAV.some((m) => m.href === p.href)), ...SECONDARY_NAV];

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-panel md:flex",
          collapsed ? "w-12" : "w-52",
        )}
        data-testid="sidebar"
      >
        <div className="flex h-11 items-center justify-between border-b border-line px-3">
          {!collapsed && (
            <DLink href="/" className="text-sm font-bold tracking-[0.18em] text-ink">
              GIZER <span className="text-accent">NBA</span>
            </DLink>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-line-strong text-xs text-soft hover:bg-raised"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Primary">
          {PRIMARY_NAV.map((item, i) => (
            <SideLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} index={i + 1} />
          ))}
          <div className="mx-3 my-2 border-t border-line" />
          {!collapsed && <div className="px-3 pb-1 text-2xs uppercase tracking-wider text-muted">More</div>}
          {SECONDARY_NAV.map((item) => (
            <SideLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
          ))}
        </nav>
        {!collapsed && (
          <div className="border-t border-line px-3 py-2 text-2xs text-muted">
            Mode <span className="font-semibold text-warn">RESEARCH / PAPER</span>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
          <div className="flex h-11 items-center justify-between gap-2 px-3">
            <DLink href="/" className="shrink-0 text-xs font-bold tracking-[0.16em] text-ink md:hidden">
              GIZER <span className="text-accent">NBA</span>
            </DLink>
            <DateSelector />
            <div className="hidden items-center gap-3 md:flex">
              <span className="max-w-[220px] truncate text-xs text-muted" title={me.data?.user.email}>
                {me.data ? `${me.data.user.email} · ${me.data.user.role}` : ""}
              </span>
              <LogoutButton />
            </div>
          </div>
          {/* Mobile: the persistent notice sits under the top bar so it never collides with the bottom nav. */}
          <DisclaimerText className="border-t border-line bg-bg px-3 py-1 text-[10px] leading-[13px] text-muted md:hidden" />
        </header>

        <main className="min-w-0 flex-1 px-3 pb-24 pt-3 md:px-4 md:pb-12">{children}</main>

        <footer className="fixed inset-x-0 bottom-0 z-20 hidden h-7 items-center justify-center border-t border-line bg-bg md:flex">
          <DisclaimerText className="text-2xs text-muted" />
        </footer>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid h-14 grid-cols-5 border-t border-line-strong bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Primary mobile"
        data-testid="bottom-nav"
      >
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item.href) || (item.href === "/parlays" && pathname.startsWith("/parlays"));
          return (
            <DLink
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center border-t-2 text-xs font-medium",
                active ? "border-accent text-ink" : "border-transparent text-muted",
              )}
            >
              {item.label}
            </DLink>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex flex-col items-center justify-center border-t-2 text-xs font-medium",
            moreActive && !pathname.startsWith("/parlays") ? "border-accent text-ink" : "border-transparent text-muted",
          )}
          data-testid="more-button"
        >
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="grid grid-cols-2 gap-1.5">
          {moreItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <DLink
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex h-10 items-center rounded border px-2 text-xs",
                    active ? "border-accent/60 bg-accent-dim/40 text-ink" : "border-line bg-bg text-soft",
                  )}
                >
                  {item.label}
                </DLink>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="min-w-0 truncate text-xs text-muted">{me.data?.user.email ?? ""}</span>
          <LogoutButton />
        </div>
      </Sheet>
    </div>
  );
}
