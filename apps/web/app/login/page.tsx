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
    <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
      <Field label="Email">
        <Input type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="border-l-4 border-bad pl-3 text-sm font-semibold text-bad">
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
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <h1 className="flex items-baseline gap-2 border-b-2 border-ink pb-3 text-[2.5rem] leading-none text-ink" style={{ fontStretch: "62%" }}>
          <span className="font-black">GIZER</span>
          <span className="font-normal">NBA</span>
        </h1>
        <p className="mb-6 mt-3 text-base text-muted">Private NBA research terminal. Owner access only.</p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-sm text-faint">{DISCLAIMER}</p>
      </div>
    </main>
  );
}
