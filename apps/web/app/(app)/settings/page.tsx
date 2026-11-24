"use client";

import { useQuery } from "@tanstack/react-query";
import { MetricsInline } from "@/components/metrics";
import { Badge } from "@/components/ui/badge";
import { Metric, PageHeader, Panel } from "@/components/ui/panel";
import { QueryView } from "@/components/ui/states";
import { api } from "@/lib/api";
import { DLink } from "@/lib/date";
import { EXTRA_PAGES } from "@/lib/nav";

export default function SettingsPage() {
  const q = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" sub="Read-only view of the server configuration. Values are changed on the server, not from this terminal." />
      <QueryView query={q} rows={5}>
        {(d) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Environment">
              <dl className="grid grid-cols-2 gap-3">
                <Metric label="Environment">
                  <span className="num">{d.env}</span>
                </Metric>
                <Metric label="Timezone">
                  <span className="num">{d.timezone}</span>
                </Metric>
                <Metric label="Paper unit">
                  <span className="num">{String(d.paper_unit)}</span>
                </Metric>
                <Metric label="LLM assistance">
                  <Badge tone={d.llm_enabled ? "info" : "neutral"}>{d.llm_enabled ? "Enabled" : "Disabled"}</Badge>
                </Metric>
                <Metric label="Mode" className="col-span-2">
                  <Badge tone="warn">Research / paper testing only</Badge>
                </Metric>
              </dl>
            </Panel>
            <Panel title="Providers configured">
              {Object.keys(d.providers_configured).length === 0 ? (
                <p className="text-xs text-muted">No providers are listed.</p>
              ) : (
                <ul className="divide-y divide-line/40">
                  {Object.entries(d.providers_configured).map(([name, ok]) => (
                    <li key={name} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-soft">{name}</span>
                      <Badge tone={ok ? "accent" : "warn"}>{ok ? "Configured" : "Not configured"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Risk policy" className="lg:col-span-2">
              <MetricsInline metrics={d.risk_policy} />
            </Panel>
          </div>
        )}
      </QueryView>
      <Panel title="Operations and research tools">
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {EXTRA_PAGES.map((n) => (
            <li key={n.href}>
              <DLink href={n.href} className="flex h-9 items-center rounded border border-line bg-bg px-2 text-xs text-soft hover:border-line-strong hover:text-ink">
                {n.label}
              </DLink>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
