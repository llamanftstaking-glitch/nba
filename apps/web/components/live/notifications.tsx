"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { http } from "@/lib/api";

const NOTIFY_KEY = "gizer.live.notify";
const SHOWN_KEY = "gizer.live.notified";
const CHANGED = "gizer:notify-changed";
type EventRow = { id: number; kind: string; title: string; detail: unknown; occurred_at: string };

function readOn(): boolean {
  try {
    return window.localStorage.getItem(NOTIFY_KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted";
  } catch {
    return false;
  }
}

/** The per-browser notification setting. Off by default; turning it on asks the browser for permission. */
export function useNotifySetting() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(readOn());
    sync();
    window.addEventListener(CHANGED, sync);
    return () => window.removeEventListener(CHANGED, sync);
  }, []);
  const set = useCallback(async (next: boolean): Promise<string | null> => {
    if (next) {
      if (typeof Notification === "undefined") return "This browser does not support notifications.";
      const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (perm !== "granted") return "Notification permission was not granted in the browser.";
    }
    try {
      window.localStorage.setItem(NOTIFY_KEY, next ? "1" : "0");
    } catch {
      return "This browser does not allow the setting to be stored.";
    }
    window.dispatchEvent(new Event(CHANGED));
    return null;
  }, []);
  return { on, set };
}

/**
 * Mounted once in the app shell. While the setting is on and the app is open, reads reached-threshold events
 * every 30 seconds and shows each one once (browser notification plus an in-app toast). Nothing runs in the
 * background: there is no service worker.
 */
export function MilestoneWatcher() {
  const { on } = useNotifySetting();
  const [toasts, setToasts] = useState<EventRow[]>([]);
  const shown = useRef<Set<number> | null>(null);
  const events = useQuery({
    queryKey: ["jarvis", "events", "milestone_reached"],
    queryFn: () => http.get<{ items: EventRow[] }>("/jarvis/events", { kind: "milestone_reached", limit: 20 }),
    refetchInterval: on ? 30_000 : false,
    enabled: on,
  });
  useEffect(() => {
    if (!on || !events.data) return;
    if (!shown.current) {
      try {
        shown.current = new Set(JSON.parse(window.localStorage.getItem(SHOWN_KEY) ?? "[]") as number[]);
      } catch {
        shown.current = new Set();
      }
    }
    const seen = shown.current;
    const fresh = events.data.items.filter((e) => !seen.has(e.id) && (e.detail as { notify?: boolean } | null)?.notify === true);
    if (fresh.length === 0) return;
    for (const e of fresh) {
      seen.add(e.id);
      try {
        new Notification("GIZER NBA — threshold reached", { body: e.title, tag: `milestone-${e.id}` });
      } catch {
        /* the in-app toast still shows */
      }
    }
    setToasts((t) => [...fresh, ...t].slice(0, 4));
    try {
      window.localStorage.setItem(SHOWN_KEY, JSON.stringify([...seen].slice(-200)));
    } catch {
      /* ignore */
    }
  }, [on, events.data]);
  if (toasts.length === 0) return null;
  return (
    <ul className="fixed bottom-20 right-3 z-40 space-y-2 lg:bottom-12" aria-live="polite" data-testid="live-toasts">
      {toasts.map((t) => (
        <li key={t.id} className="flex max-w-xs items-start gap-2 rounded-md bg-raised px-3 py-2 text-sm text-ink shadow-lg ring-1 ring-line" data-testid="live-toast">
          <span className="min-w-0 flex-1 break-words">{t.title}</span>
          <button type="button" aria-label="Dismiss" className="-m-2 p-2 text-muted hover:text-ink" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
