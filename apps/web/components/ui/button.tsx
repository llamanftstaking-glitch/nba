import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-bg font-semibold shadow-accent hover:brightness-110 disabled:bg-accent/30 disabled:text-bg/70 disabled:shadow-none",
  outline: "bg-raised text-ink ring-1 ring-inset ring-line hover:bg-line/70 disabled:text-faint",
  ghost: "bg-transparent text-muted hover:bg-raised hover:text-ink disabled:text-faint",
  danger: "bg-bad/10 text-bad ring-1 ring-inset ring-bad/40 hover:bg-bad/20 disabled:opacity-50",
};

// Heights grow to the 44px touch target on small screens.
const SIZES: Record<Size, string> = {
  sm: "min-h-[44px] px-3 text-sm md:min-h-0 md:h-8 md:px-2.5 md:text-xs",
  md: "min-h-[44px] px-4 text-sm md:min-h-0 md:h-9",
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
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}

export const linkButton =
  "inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-raised px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line hover:bg-line/70 md:min-h-0 md:h-8 md:px-2.5 md:text-xs";
export const textLink = "inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline";
