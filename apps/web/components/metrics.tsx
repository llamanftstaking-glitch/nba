import { NA } from "@/components/ui/na";
import { titleCase } from "@/lib/format";

function show(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(Math.abs(v) < 1 ? 4 : 2);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** Render an arbitrary metrics record as compact key/value pairs. null stays visibly unavailable. */
export function MetricsInline({ metrics }: { metrics: Record<string, unknown> | null | undefined }) {
  const entries = Object.entries(metrics ?? {});
  if (entries.length === 0) return <span className="text-xs text-muted">No metrics recorded</span>;
  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {entries.map(([k, v]) => {
        const s = show(v);
        return (
          <div key={k} className="flex items-baseline gap-1">
            <dt className="text-muted">{titleCase(k)}</dt>
            <dd className="num break-all text-ink">{s === null ? <NA /> : s}</dd>
          </div>
        );
      })}
    </dl>
  );
}
