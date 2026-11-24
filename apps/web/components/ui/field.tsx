import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const BASE =
  "h-11 w-full min-w-0 rounded-md bg-bg px-3 text-sm text-ink ring-1 ring-inset ring-line placeholder:text-faint focus:ring-accent md:h-9";

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">{label}</span>
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
    <select className={cn(BASE, "pr-7", className)} {...rest}>
      {children}
    </select>
  );
}
