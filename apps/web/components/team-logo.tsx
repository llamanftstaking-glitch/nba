"use client";

import { useState } from "react";
import type { TeamRef } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Team logo from logo_url with a text-abbreviation fallback (missing URL or failed load). */
export function TeamLogo({ team, size = 28, className }: { team: Pick<TeamRef, "abbr" | "name" | "logo_url">; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!team.logo_url || failed) {
    return (
      <span
        style={{ ...box, fontSize: Math.max(13, Math.round(size * 0.36)), fontStretch: "70%" }}
        title={team.name}
        className={cn("inline-flex shrink-0 items-center justify-center rounded bg-raised font-extrabold leading-none text-muted", className)}
      >
        {size < 30 ? team.abbr.slice(0, 1) : team.abbr}
      </span>
    );
  }
  return (
    <img
      src={team.logo_url}
      alt={`${team.name} logo`}
      width={size}
      height={size}
      loading="lazy"
      style={box}
      className={cn("shrink-0 object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}
