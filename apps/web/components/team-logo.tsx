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
        style={box}
        title={team.name}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded border border-line-strong bg-raised font-mono text-[10px] font-semibold text-soft",
          className,
        )}
      >
        {team.abbr}
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
