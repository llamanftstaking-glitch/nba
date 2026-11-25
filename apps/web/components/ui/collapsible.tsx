import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Native disclosure block. Closed by default; used to keep long or technical content off the first screen. */
export function Collapsible({ title, right, children, defaultOpen = false, className, testId }: { title: ReactNode; right?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string; testId?: string }) {
  return (
    <details className={cn("group rounded-md bg-raised/40", className)} open={defaultOpen || undefined} data-testid={testId}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-1.5 text-sm font-medium text-soft marker:hidden md:min-h-10 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{title}</span>
        {right && <span className="shrink-0 text-xs text-muted">{right}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line/40 p-3">{children}</div>
    </details>
  );
}
