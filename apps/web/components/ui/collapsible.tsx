import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Native disclosure block on a hairline. Closed by default; keeps long or technical content off the first screen. */
export function Collapsible({ title, right, children, defaultOpen = false, className, testId }: { title: ReactNode; right?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string; testId?: string }) {
  return (
    <details className={cn("group border-t border-line", className)} open={defaultOpen || undefined} data-testid={testId}>
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{title}</span>
        {right && <span className="shrink-0 text-xs font-normal text-muted">{right}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
  );
}
