"use client";

import { SelectionBrowser } from "@/components/selection-browser";
import type { Selection } from "@/lib/types";

const isPlayerProp = (s: Selection) => s.subject_type === "player" || s.market.startsWith("player_");

export default function PropsPage() {
  return (
    <SelectionBrowser
      title="Player Props"
      description="Player points, rebounds, assists and 3-pointers made from the latest edition."
      marketFilter={isPlayerProp}
      emptyTitle="No player prop qualified for this slate."
    />
  );
}
