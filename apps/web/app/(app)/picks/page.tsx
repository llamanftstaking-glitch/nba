"use client";

import { SelectionBrowser } from "@/components/selection-browser";

export default function PicksPage() {
  return (
    <SelectionBrowser
      title="Top Picks"
      description="Qualified individual selections from the latest edition, ordered by evidence quality and then model probability."
      emptyTitle="No selection qualified for this slate. That is a valid research outcome."
    />
  );
}
