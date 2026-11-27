"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { Input } from "@/components/ui/field";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import type { PlayerListItem } from "@/lib/types";

/** Search box over GET /players with a result list. `action` renders the control for each result. */
export function PlayerSearch({ action, placeholder = "Search players by name", exclude = [] }: { action: (p: PlayerListItem) => ReactNode; placeholder?: string; exclude?: number[] }) {
  const [text, setText] = useState("");
  const search = useDebounced(text.trim(), 300);
  const q = useQuery({ queryKey: ["players", "search", search], queryFn: () => api.players({ q: search, limit: 12 }), enabled: search.length >= 2 });
  const items = (q.data?.items ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <div data-testid="player-search">
      <label className="relative block">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
        <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="pl-9" />
      </label>
      {search.length < 2 ? (
        <p className="mt-2 text-xs text-muted">Type at least two letters.</p>
      ) : q.isPending ? (
        <p className="mt-2 text-xs text-muted" role="status">Searching…</p>
      ) : q.isError ? (
        <p className="mt-2 text-sm text-bad" role="alert">Search failed. Try again.</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No players match “{search}”.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line" data-testid="player-search-results">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-4 py-2">
              <PlayerAvatar name={p.name} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                <span className="num block text-xs text-muted">
                  {p.team_abbr ?? "—"} · {p.position ?? "—"} · {p.games === null ? "sample —" : `n=${p.games}`}
                </span>
              </span>
              {action(p)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
