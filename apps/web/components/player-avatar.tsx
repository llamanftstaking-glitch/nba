"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

/** Player headshot from `headshot_url`, with an initials fallback when it is missing or fails to load. */
export function PlayerAvatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!src || failed) {
    return (
      <span
        style={{ ...box, fontSize: Math.max(11, Math.round(size * 0.36)) }}
        aria-hidden
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-raised font-semibold text-muted ring-1 ring-inset ring-line", className)}
        data-testid="avatar-fallback"
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      style={box}
      className={cn("shrink-0 rounded-full bg-raised object-cover ring-1 ring-inset ring-line", className)}
      onError={() => setFailed(true)}
    />
  );
}
