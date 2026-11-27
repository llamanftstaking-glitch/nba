"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";

const ITEMS = [
  ["/live", "Live games"],
  ["/live/following", "My following"],
  ["/live/research-tracker", "Research tracker"],
] as const;

/** Sub-navigation of the live pages (as on main): the way to My following and the Research tracker. */
export function LiveNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Live sections" className="no-scrollbar !mt-0 mb-2 flex gap-x-6 overflow-x-auto border-b border-line" data-testid="live-nav">
      {ITEMS.map(([href, label]) => (
        <DLink key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("-mb-px inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap border-b-[3px] pt-[3px] text-base", pathname === href ? "border-ink font-bold text-ink" : "border-transparent font-medium text-muted hover:text-ink")}>
          {label}
        </DLink>
      ))}
    </nav>
  );
}
