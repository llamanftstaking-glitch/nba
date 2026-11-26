"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { DLink } from "@/lib/date";

const ITEMS = [
  ["/live", "Live games"],
  ["/live/following", "My following"],
  ["/live/research-tracker", "Research tracker"],
] as const;

export function LiveNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Live sections" className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
      {ITEMS.map(([href, label]) => (
        <DLink key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("inline-flex min-h-[44px] shrink-0 items-center rounded-md px-3 text-sm font-medium md:min-h-0 md:h-9", pathname === href ? "bg-accent/10 text-ink ring-1 ring-inset ring-accent/50" : "bg-raised/60 text-muted hover:text-ink")}>
          {label}
        </DLink>
      ))}
    </nav>
  );
}
