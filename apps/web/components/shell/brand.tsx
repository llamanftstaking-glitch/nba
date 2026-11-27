import { cn } from "@/lib/cn";

/**
 * GIZER NBA wordmark: the condensed black weight for the name, the regular weight for the league.
 * `caption` adds the product line under it, as in the sidebar. Type only.
 */
export function Brand({ caption = false, className }: { caption?: boolean; compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex min-h-[44px] flex-col justify-center whitespace-nowrap leading-none", className)} aria-label="GIZER NBA — Parlay Command Center">
      <span className="inline-flex items-baseline gap-1.5 text-[1.375rem] md:text-2xl" style={{ fontStretch: "62%" }}>
        <span className="font-black tracking-[0.01em]">GIZER</span>
        <span className="font-normal">NBA</span>
      </span>
      {caption && <span className="mt-1 text-2xs font-medium text-muted">Parlay Command Center</span>}
    </span>
  );
}
