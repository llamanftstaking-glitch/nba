import { cn } from "@/lib/cn";

/** GIZER NBA wordmark: the condensed black weight for the name, the regular weight for the league. Type only. */
export function Brand({ className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap text-[1.375rem] leading-none md:text-2xl", className)} style={{ fontStretch: "62%" }} aria-label="GIZER NBA, home">
      <span className="font-black tracking-[0.01em]">GIZER</span>
      <span className="font-normal">NBA</span>
    </span>
  );
}
