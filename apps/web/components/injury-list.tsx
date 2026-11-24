import type { InjuryRow } from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Val } from "@/components/ui/na";
import { fmtDateTimeET } from "@/lib/format";

function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes("out")) return "bad";
  if (s.includes("doubt") || s.includes("question") || s.includes("day") || s.includes("game")) return "warn";
  return "neutral";
}

const COLUMNS: Column<InjuryRow>[] = [
  { key: "player", header: "Player", primary: true, cell: (r) => <span className="font-medium text-ink">{r.player_name}</span> },
  { key: "team", header: "Team", cell: (r) => <Val v={r.team_abbr} /> },
  { key: "status", header: "Status", cell: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
  { key: "detail", header: "Detail", cell: (r) => (r.detail || r.comment ? <span className="break-words">{[r.detail, r.comment].filter(Boolean).join(" — ")}</span> : <Val v={null} />) },
  { key: "source", header: "Source", cell: (r) => r.source },
  { key: "published", header: "Source published", cell: (r) => <Val v={fmtDateTimeET(r.source_published_at)} /> },
  { key: "ingested", header: "Ingested", cell: (r) => <Val v={fmtDateTimeET(r.ingested_at)} /> },
];

export function InjuryTable({ rows, caption }: { rows: InjuryRow[]; caption: string }) {
  return <DataTable columns={COLUMNS} rows={rows} rowKey={(r, i) => `${r.player_name}-${i}`} caption={caption} dense />;
}
