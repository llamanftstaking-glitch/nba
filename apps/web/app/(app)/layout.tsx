import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  // useSearchParams (the ?date= context) requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={<div className="p-4 text-xs text-muted">Loading…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
