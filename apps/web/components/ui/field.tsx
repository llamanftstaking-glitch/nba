import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const BASE =
  "h-8 w-full min-w-0 rounded border border-line-strong bg-bg px-2 text-sm text-ink placeholder:text-muted focus:border-accent";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-0.5 block text-2xs uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(BASE, "pr-6", className)} {...rest}>
      {children}
    </select>
  );
}
