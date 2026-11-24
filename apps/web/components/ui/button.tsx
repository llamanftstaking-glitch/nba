import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "border-accent bg-accent text-bg hover:bg-emerald-300 disabled:bg-accent/40 disabled:border-accent/40",
  outline: "border-line-strong bg-transparent text-ink hover:bg-raised disabled:text-muted",
  ghost: "border-transparent bg-transparent text-soft hover:bg-raised hover:text-ink disabled:text-muted",
  danger: "border-bad/60 bg-bad-dim/60 text-bad hover:bg-bad-dim disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-9 px-3 text-sm",
};

export function Button({
  variant = "outline",
  size = "sm",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded border font-medium transition-colors disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
