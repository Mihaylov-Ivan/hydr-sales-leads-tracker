"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    // Uncontrolled fields + FormData so browser autofill (esp. on LAN/mobile)
    // is not blocked by React state that never received onChange.
    const form = new FormData(e.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        home?: string;
        user?: { mustChangePassword?: boolean };
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Incorrect username or password.");
        return;
      }
      // AuthProvider survives client navigations; reload session into context
      // before leaving /login so the app doesn't render as logged-out.
      await refresh();
      if (data?.user?.mustChangePassword) {
        router.replace("/change-password");
        router.refresh();
        return;
      }
      const next = searchParams.get("next");
      const fallback = data?.home && data.home.startsWith("/") ? data.home : "/";
      router.replace(next && next.startsWith("/") ? next : fallback);
      router.refresh();
    } catch {
      setError("Could not sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-16">
      <form
        method="post"
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 shadow-sm"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Image
            src="/hydrogenera-logo.png"
            alt="Hydrogenera"
            width={140}
            height={22}
            priority
            className="h-5 w-auto"
          />
          <h1 className="text-lg font-bold text-deep">Sales Tracker</h1>
          <p className="text-sm text-muted">Sign in with your account.</p>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Username
        </label>
        <input
          type="text"
          name="username"
          autoFocus
          autoComplete="username"
          defaultValue=""
          className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-teal-accent"
        />

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Password
        </label>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          defaultValue=""
          className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-teal-accent"
        />

        {error && (
          <p className="mb-3 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-olive px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
