import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// 16px text in inputs stops iOS from zooming on focus; the boundary is 5.4:1 on the sheet.
const BASE =
  "h-11 w-full min-w-0 rounded border border-line-strong bg-bg2 px-3 text-base text-ink placeholder:text-faint hover:border-ink md:h-10 md:text-sm";

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(BASE, "pr-8", className)} {...rest}>
      {children}
    </select>
  );
}
