import { SlashMark } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

/** GIZER NBA wordmark: double-slash emerald mark, italic condensed wordmark, product caption. Pure SVG/CSS. */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label="GIZER NBA — Parlay Command Center">
      <SlashMark className={compact ? "h-5 w-6" : "h-7 w-8"} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-display font-bold uppercase italic tracking-wide text-ink", compact ? "text-xl" : "text-[26px]")}>
          GIZER <span className="text-accent">NBA</span>
        </span>
        {!compact && <span className="mt-0.5 whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Parlay Command Center</span>}
      </span>
    </span>
  );
}
