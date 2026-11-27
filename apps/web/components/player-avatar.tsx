"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

/** Player headshot from `headshot_url` in a 4px mask, with an initials fallback when it is missing or fails to load. */
export function PlayerAvatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!src || failed) {
    return (
      <span
        style={{ ...box, fontSize: Math.max(13, Math.round(size * 0.36)), fontStretch: "75%" }}
        aria-hidden
        className={cn("inline-flex shrink-0 items-center justify-center rounded bg-raised font-bold leading-none text-muted", className)}
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
      className={cn("shrink-0 rounded bg-raised object-cover object-top", className)}
      onError={() => setFailed(true)}
    />
  );
}
