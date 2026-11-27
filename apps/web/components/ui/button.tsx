import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-bg2 font-semibold hover:bg-soft disabled:bg-raised disabled:text-faint",
  outline: "bg-bg2 text-ink border border-line-strong hover:border-ink hover:bg-raised disabled:text-faint disabled:border-line",
  ghost: "bg-transparent text-muted hover:bg-raised hover:text-ink disabled:text-faint",
  danger: "bg-bg2 text-bad border border-bad hover:bg-bad-dim disabled:text-faint disabled:border-line",
};

// 44px touch targets on small screens, 36–40px on a pointer.
const SIZES: Record<Size, string> = {
  sm: "min-h-[44px] px-3.5 text-sm md:min-h-0 md:h-9 md:px-3",
  md: "min-h-[44px] px-4 text-sm md:min-h-0 md:h-10",
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
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded font-semibold transition-colors disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}

export const linkButton =
  "inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded border border-line-strong bg-bg2 px-3.5 text-sm font-semibold text-ink hover:border-ink hover:bg-raised md:min-h-0 md:h-9 md:px-3";
export const textLink = "link inline-flex min-h-[44px] items-center gap-1 text-sm text-ink md:min-h-0";
