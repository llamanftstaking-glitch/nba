"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ComboCard } from "@/components/combo-card";
import { SelectionsByGame } from "@/components/selection-row";
import { PageHeader } from "@/components/ui/panel";
import { EmptyState, QueryView } from "@/components/ui/states";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { DLink, useSelectedDate } from "@/lib/date";
import { useCombos, useSelections } from "@/lib/queries";

const TABS: { id: string; label: string; category?: string; noun: string }[] = [
  { id: "picks", label: "Individual Picks", noun: "individual pick" },
  { id: "double", label: "2-Leg", category: "double", noun: "2-leg combination" },
  { id: "triple", label: "3-Leg", category: "triple", noun: "3-leg combination" },
  { id: "quad", label: "4-Leg", category: "quad", noun: "4-leg combination" },
  { id: "five", label: "5-Leg", category: "five", noun: "5-leg combination" },
  { id: "six", label: "6-Leg Experimental", category: "six", noun: "6-leg experimental combination" },
  { id: "sgp", label: "Same-Game", category: "sgp", noun: "same-game combination" },
  { id: "cross", label: "Cross-Game", category: "cross", noun: "cross-game combination" },
];

export default function ParlaysPage() {
  const date = useSelectedDate();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabId = TABS.some((t) => t.id === sp.get("tab")) ? (sp.get("tab") as string) : "double";
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[1]!;

  // Any category response carries the counts for all categories; "double" doubles as the counts source.
  const countsQ = useCombos("double", date);
  const combosQ = useCombos(tab.category ?? "double", date, Boolean(tab.category));
  // Individual picks = the API's ranked view (bounded: at most five per game).
  const selQ = useSelections({ date, ranked: true, limit: 200 });
  const qualified = selQ.data?.items ?? [];

  const counts = combosQ.data?.counts ?? countsQ.data?.counts;
  const items: TabItem[] = TABS.map((t) => ({
    id: t.id,
    label: t.label,
    count: t.category ? (counts ? (counts[t.category] ?? 0) : null) : selQ.data ? qualified.length : null,
  }));

  const setTab = (id: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set("tab", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div>
      <PageHeader
        title="Parlay Research"
        sub="Combination research with correlation-adjusted joint probabilities. Every combination is research only or paper testing."
        right={
          <DLink href="/builder" className="inline-flex min-h-[44px] items-center rounded-md bg-bg2 px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line-strong hover:bg-line md:min-h-0 md:h-8 md:text-xs">
            Open research builder
          </DLink>
        }
      />
      <Tabs items={items} value={tab.id} onChange={setTab} label="Combination category" />
      <div className="mt-3" role="tabpanel" aria-label={tab.label}>
        {tab.id === "six" && (
          <p className="mb-2 border-l-4 border-warn pl-3 px-2 py-1.5 text-xs text-warn">
            Experimental: six-leg joint probabilities are small and their intervals are wide. Treat as exploratory research.
          </p>
        )}
        {tab.category ? (
          <QueryView
            query={combosQ}
            rows={4}
            isEmpty={(d) => d.items.length === 0}
            empty={
              <EmptyState title={`No ${tab.noun} met the research criteria for this slate.`}>
                Empty categories are reported as-is; combinations are never added to fill a tab.
              </EmptyState>
            }
          >
            {(d) => (
              <div className="space-y-2">
                {d.items.map((c) => (
                  <ComboCard key={c.uid} combo={c} />
                ))}
              </div>
            )}
          </QueryView>
        ) : (
          <QueryView
            query={selQ}
            rows={4}
            isEmpty={() => qualified.length === 0}
            empty={<EmptyState title="No individual selection qualified for this slate. That is a valid research outcome." />}
          >
            {() => <SelectionsByGame items={qualified} perGame={5} />}
          </QueryView>
        )}
      </div>
    </div>
  );
}
