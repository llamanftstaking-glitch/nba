import { cn } from "@/lib/cn";

/** Explicit "not available" marker. Never substitute 0 for a missing value. */
export function NA({ className }: { className?: string }) {
  return (
    <span className={cn("text-muted", className)} title="not available" aria-label="not available">
      —
    </span>
  );
}

/** Render a pre-formatted value, or the explicit unavailable marker when the formatter returned null. */
export function Val({ v, className }: { v: string | number | null | undefined; className?: string }) {
  if (v === null || v === undefined || v === "") return <NA className={className} />;
  return <span className={cn("num", className)}>{v}</span>;
}
