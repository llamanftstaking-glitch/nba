"use client";

import { useEffect } from "react";

const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

/**
 * Reloads the page when the server has been updated since this tab loaded.
 * A tab left open across an update keeps running the old page code against the new API, which can
 * show empty lists. The check runs when the tab regains focus and every five minutes.
 */
export function VersionWatcher() {
  useEffect(() => {
    if (!MINE) return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch("/build-id.txt", { cache: "no-store" });
        if (!res.ok) return;
        const theirs = (await res.text()).trim();
        if (stopped || !theirs || theirs === MINE) return;
        // Reload at most once per server build, so a cached page can never cause a reload loop.
        const key = "gizer-reloaded-for";
        if (window.sessionStorage.getItem(key) === theirs) return;
        window.sessionStorage.setItem(key, theirs);
        window.location.reload();
      } catch {
        /* offline or mid-restart: try again later */
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(check, 5 * 60 * 1000);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
