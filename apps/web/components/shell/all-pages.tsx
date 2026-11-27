"use client";

import { DLink } from "@/lib/date";
import { cn } from "@/lib/cn";
import { SHORTCUTS, WORKSPACES, isActive } from "@/lib/nav";

/**
 * Every page of the app, grouped by workspace. The same list is the desktop "All pages" menu and the
 * phone "More" sheet, so nothing is reachable only by typing a URL.
 */
export function AllPagesList({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <nav aria-label="All pages" className="grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-testid="all-pages-list">
      {WORKSPACES.map((w) => (
        <section key={w.id} aria-labelledby={`ap-${w.id}`} data-workspace={w.id}>
          <h3 id={`ap-${w.id}`} className="h-sub border-b-2 border-ink pb-1.5">
            {w.label}
          </h3>
          <ul>
            {w.pages.map((p) => {
              const active = isActive(pathname, p.href);
              return (
                <li key={p.href} className="border-b border-line">
                  <DLink
                    href={p.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    data-nav-href={p.href}
                    className={cn("flex min-h-[44px] items-center gap-2 py-1.5 text-base hover:bg-raised", active ? "font-bold text-ink" : "text-soft")}
                  >
                    {active && <span className="h-4 w-1 shrink-0 bg-ink" aria-hidden />}
                    {p.label}
                  </DLink>
                </li>
              );
            })}
            {SHORTCUTS.filter((s) => s.workspace === w.id).map((s) => (
              <li key={s.href} className="border-b border-line">
                <DLink href={s.href} onClick={onNavigate} className="flex min-h-[44px] items-center py-1.5 text-base text-soft hover:bg-raised" data-nav-shortcut={s.href}>
                  {s.label}
                </DLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
