"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Encyclopedia, Playbook, Statistics } from "@/components/cortex/library";
import { Overview } from "@/components/cortex/overview";
import { PlayerDnaSection, TeamDnaSection } from "@/components/cortex/profiles";
import { Coverage, Evaluations, ResearchJournal, Sources } from "@/components/cortex/reference";
import { PageHeader } from "@/components/ui/panel";
import { QueryView } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { cortex, CORTEX_TABS } from "@/lib/cortex";

export default function CortexPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = sp.get("tab");
  const tab = CORTEX_TABS.some(([t]) => t === requested) ? (requested as string) : "overview";
  const overview = useQuery({ queryKey: ["cortex", "overview"], queryFn: cortex.overview });

  // On a phone the tab row scrolls sideways: keep the selected tab in view.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('[role="tablist"][aria-label="CORTEX sections"] [aria-selected="true"]');
    const row = el?.parentElement;
    if (el && row) row.scrollTo({ left: Math.max(0, el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2) });
  }, [tab]);

  /** Section state lives in the URL so that every view is linkable. `null` removes a parameter. */
  const setParams = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const setTab = (t: string) => setParams({ tab: t, department: null, player: null, team: null, status: null });

  return (
    <div className="space-y-9" data-testid="cortex-page">
      <PageHeader
        title="CORTEX"
        sub="The basketball reference library JARVIS reads from: written knowledge records with their sources and verification status, and player and team profiles computed from this platform’s own box scores."
      />
      <Tabs label="CORTEX sections" scroll value={tab} onChange={setTab} items={CORTEX_TABS.map(([id, label]) => ({ id, label }))} />
      <div role="tabpanel" aria-label={CORTEX_TABS.find(([t]) => t === tab)?.[1]} data-testid="cortex-panel" data-tab={tab}>
        {tab === "overview" && (
          <QueryView query={overview} rows={8}>
            {(o) => <Overview o={o} onDepartment={(id) => setParams({ tab: "encyclopedia", department: String(id) })} />}
          </QueryView>
        )}
        {tab === "encyclopedia" && <Encyclopedia overview={overview.data} department={sp.get("department") ?? ""} onDepartment={(d) => setParams({ department: d || null })} />}
        {tab === "playbook" && <Playbook />}
        {tab === "statistics" && <Statistics />}
        {tab === "player-dna" && <PlayerDnaSection playerId={sp.get("player")} onSelect={(id) => setParams({ player: id })} />}
        {tab === "team-dna" && <TeamDnaSection teamId={sp.get("team")} onSelect={(id) => setParams({ team: id })} />}
        {tab === "coach-dna" && <TeamDnaSection coach teamId={sp.get("team")} onSelect={(id) => setParams({ team: id })} />}
        {tab === "research" && <ResearchJournal status={sp.get("status") ?? ""} onStatus={(s) => setParams({ status: s || null })} />}
        {tab === "sources" && <Sources />}
        {tab === "coverage" && (
          <QueryView query={overview} rows={8}>
            {(o) => <Coverage o={o} />}
          </QueryView>
        )}
        {tab === "evaluations" && <Evaluations />}
      </div>
    </div>
  );
}
