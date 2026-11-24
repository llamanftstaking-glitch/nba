"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { DISCLAIMER } from "@/components/shell/disclaimer";

function safeNext(raw: string | null): string {
  // Only same-origin absolute paths are accepted as a post-login destination.
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) return "/";
  return raw;
}

function LoginForm() {
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      window.location.assign(safeNext(sp.get("next")));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError("Email or password is incorrect.");
      else if (err instanceof ApiError && err.status === 429) setError("Too many attempts. Wait a moment and try again.");
      else if (err instanceof ApiError) setError(err.message);
      else setError("Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="login-form">
      <Field label="Email">
        <Input type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9"
        />
      </Field>
      {error && (
        <p role="alert" className="rounded border border-bad/50 bg-bad-dim/40 px-2 py-1.5 text-xs text-bad">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="md" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 text-center">
          <div className="text-lg font-bold tracking-[0.2em] text-ink">
            GIZER <span className="text-accent">NBA</span>
          </div>
          <p className="mt-1 text-xs text-muted">Private quantitative research terminal · owner access only</p>
        </div>
        <div className="rounded border border-line bg-panel p-4">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-3 text-center text-2xs text-muted">{DISCLAIMER}</p>
      </div>
    </main>
  );
}
