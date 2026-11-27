"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useDateHref } from "@/lib/date";
import { ALL_PAGES, SHORTCUTS } from "@/lib/nav";
import { useReturnFocus } from "@/components/ui/sheet";
import { useDebounced } from "@/lib/use-debounced";

type Hit = { key: string; href: string; title: string; sub: string; kind: "page" | "player"; img?: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Pages whose label, workspace or keywords contain every typed word. Label matches rank first. */
function matchPages(q: string): Hit[] {
  const words = norm(q).split(" ").filter(Boolean);
  const all = [
    ...ALL_PAGES.map((p) => ({ href: p.href, label: p.label, group: p.workspace.label, keywords: p.keywords ?? "" })),
    ...SHORTCUTS.map((s) => ({ href: s.href, label: s.label, group: "JARVIS", keywords: "briefing morning read" })),
  ];
  const scored = all
    .map((p) => {
      const label = norm(p.label);
      const hay = `${label} ${norm(p.group)} ${norm(p.keywords)} ${norm(p.href)}`;
      if (!words.every((w) => hay.includes(w))) return null;
      const score = words.length === 0 ? 2 : label.startsWith(words[0] ?? "") ? 0 : words.every((w) => label.includes(w)) ? 1 : 2;
      return { p, score };
    })
    .filter((x): x is { p: (typeof all)[number]; score: number } => x !== null)
    .sort((a, b) => a.score - b.score);
  return scored.map(({ p }) => ({ key: `page:${p.href}`, href: p.href, title: p.label, sub: p.group, kind: "page" as const }));
}

/**
 * Global search: every navigation destination (matched in the browser) and players (GET /players?q=).
 * Nothing is listed that cannot be opened.
 */
export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const withDate = useDateHref();
  const returnFocus = useReturnFocus(open);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const term = useDebounced(text.trim(), 250);
  const players = useQuery({ queryKey: ["players", "search", term], queryFn: () => api.players({ q: term, limit: 8 }), enabled: open && term.length >= 2 });

  useEffect(() => {
    if (!open) {
      setText("");
      setCursor(0);
    }
  }, [open]);
  useEffect(() => setCursor(0), [text]);

  const pages = useMemo(() => matchPages(text), [text]);
  const playerHits: Hit[] = useMemo(
    () => (term.length >= 2 ? (players.data?.items ?? []).map((p) => ({ key: `player:${p.id}`, href: `/players/${p.id}`, title: p.name, sub: [p.team_abbr, p.position].filter(Boolean).join(", ") || "Player", kind: "player" as const })) : []),
    [players.data, term],
  );
  const hits = [...pages, ...playerHits];
  const go = (h: Hit) => {
    onOpenChange(false);
    router.push(withDate(h.href));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(hits.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      const h = hits[cursor];
      if (h) {
        e.preventDefault();
        go(h);
      }
    }
  };
  const row = (h: Hit, i: number) => (
    <li key={h.key} role="option" aria-selected={i === cursor} id={`sr-${i}`}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => go(h)}
        onMouseMove={() => setCursor(i)}
        className={cn("flex min-h-[52px] w-full items-center gap-3 rounded px-2 py-1.5 text-left", i === cursor && "bg-raised")}
        data-testid="search-hit"
        data-href={h.href}
        data-kind={h.kind}
      >
        {h.kind === "player" ? (
          <PlayerAvatar name={h.title} src={h.img} size={32} />
        ) : (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded bg-raised text-sm font-extrabold text-muted" style={{ fontStretch: "70%" }} aria-hidden>
            {h.title.slice(0, 1)}
          </span>
        )}
        <span className="grid min-w-0">
          <span className="truncate font-semibold leading-tight text-ink">{h.title}</span>
          <span className="truncate text-xs leading-tight text-faint">{h.sub}</span>
        </span>
      </button>
    </li>
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink/40" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus}
          className="fixed left-1/2 top-4 z-[70] flex max-h-[calc(100dvh-32px)] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded bg-bg2 shadow-overlay focus:outline-none md:top-[10vh] md:max-h-[76vh]"
          data-testid="search-dialog"
        >
          <Dialog.Title className="sr-only">Search pages and players</Dialog.Title>
          <div className="flex items-center gap-3 border-b-2 border-ink py-2 pl-5 pr-2">
            <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              placeholder="Search pages and players"
              aria-label="Search pages and players"
              role="combobox"
              aria-expanded
              aria-controls="search-results"
              aria-activedescendant={hits.length ? `sr-${cursor}` : undefined}
              className="h-[52px] min-w-0 flex-1 border-0 bg-transparent text-xl font-semibold text-ink outline-none placeholder:font-normal placeholder:text-faint focus-visible:outline-none"
              style={{ fontStretch: "90%" }}
              data-testid="search-input"
            />
            <Dialog.Close aria-label="Close search" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink hover:bg-raised">
              <X className="h-5 w-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto px-3 pb-4 pt-2" id="search-results" role="listbox" aria-label="Results">
            {pages.length > 0 && (
              <>
                <div className="px-2 pb-1 pt-3 text-xs font-semibold text-muted">{text.trim() ? "Pages" : "All pages"}</div>
                <ul>{pages.map((h, i) => row(h, i))}</ul>
              </>
            )}
            {term.length >= 2 && (
              <>
                <div className="px-2 pb-1 pt-4 text-xs font-semibold text-muted">Players</div>
                {players.isPending ? (
                  <p className="px-2 py-2 text-sm text-muted" role="status">Searching players…</p>
                ) : players.isError ? (
                  <p className="px-2 py-2 text-sm text-bad" role="alert">Player search failed. Pages are still listed above.</p>
                ) : playerHits.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-muted">No player matches “{term}”.</p>
                ) : (
                  <ul>{playerHits.map((h, i) => row(h, pages.length + i))}</ul>
                )}
              </>
            )}
            {hits.length === 0 && term.length < 2 && text.trim() !== "" && <p className="px-2 py-6 text-sm text-muted" data-testid="search-hint">No page matches “{text.trim()}”. Type at least two letters to search players too.</p>}
            {hits.length === 0 && term.length >= 2 && !players.isPending && pages.length === 0 && playerHits.length === 0 && <p className="px-2 py-3 text-sm text-muted" data-testid="search-empty">Nothing matches “{term}”. Search covers page names and players.</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
