"use client";

import { FormEvent, Suspense, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { defaultHomePath, type SessionUser } from "@/lib/permissions";

function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        user?: SessionUser;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not change password.");
        return;
      }
      const home = data?.user ? defaultHomePath(data.user) : "/";
      router.replace(home);
      router.refresh();
    } catch {
      setError("Could not change password. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center px-4 py-16">
      <form
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
          <h1 className="text-lg font-bold text-deep">Change password</h1>
          <p className="text-sm text-muted">
            Set a new password to continue using the app.
          </p>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Current password
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-teal-accent"
          required
        />

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          New password
        </label>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-teal-accent"
          required
          minLength={8}
        />

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Confirm new password
        </label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-teal-accent"
          required
          minLength={8}
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
          {submitting ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense
      fallback={
        <p className="py-20 text-center text-sm text-muted">Loading…</p>
      }
    >
      <ChangePasswordForm />
    </Suspense>
  );
}
