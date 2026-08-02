"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { downloadFinancialCsv } from "@/lib/financial-csv";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    teamMembers,
    currentUserId,
    setCurrentUserId,
    ready,
    projects,
    financeSettings,
    importFinancialCsvText,
  } = useProjects();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const selectedUserId =
    currentUserId && teamMembers.some((m) => m.id === currentUserId)
      ? currentUserId
      : (teamMembers[0]?.id ?? "");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function onImportCsv(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setCsvMsg(null);
    try {
      const text = await file.text();
      const result = importFinancialCsvText(text);
      if (!result.ok) {
        setCsvMsg(result.error);
      } else {
        setCsvMsg(
          result.matched > 0
            ? `Imported financials for ${result.matched} project${result.matched === 1 ? "" : "s"}.`
            : "CSV loaded (no matching projects by id/name).",
        );
      }
    } catch (e) {
      setCsvMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const navLink = (href: string, label: string) => {
    const active =
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition ${active
            ? "bg-teal-soft text-teal-accent"
            : "text-muted hover:bg-surface hover:text-deep"
          }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="z-40 shrink-0 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1800px] items-center justify-between gap-4 px-4 sm:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <Link href="/" className="flex flex-col items-start gap-0.5">
            <Image
              src="/hydrogenera-logo.png"
              alt="Hydrogenera"
              width={110}
              height={18}
              priority
              className="h-4 w-auto sm:h-[18px]"
            />
            <span className="mt-1 text-[14px] leading-none text-muted">
              Sales Tracker
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {navLink("/", "Board")}
            {navLink("/finance", "Finance")}
            {navLink("/metrics", "Metrics")}
          </nav>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <label className="flex min-w-0 items-center gap-2">
            <span className="hidden text-[11px] font-semibold uppercase tracking-wide text-muted sm:inline">
              Working as
            </span>
            <select
              value={selectedUserId}
              disabled={!ready || teamMembers.length === 0}
              onChange={(e) => setCurrentUserId(e.target.value)}
              aria-label="Select current user"
              className="max-w-[12rem] rounded-lg border border-line bg-panel px-3 py-2 text-sm font-medium text-deep shadow-sm outline-none transition hover:border-teal-accent/40 focus:border-teal-accent disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[16rem]"
            >
              {teamMembers.length === 0 ? (
                <option value="" disabled>
                  No team members
                </option>
              ) : (
                teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void onImportCsv(e.target.files)}
          />
          <button
            type="button"
            disabled={!ready}
            onClick={() =>
              downloadFinancialCsv(projects, financeSettings)
            }
            title="Download financial data CSV"
            className="shrink-0 rounded-lg border border-line bg-panel px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted shadow-sm transition hover:border-teal-accent/40 hover:text-teal-accent disabled:opacity-50 sm:px-3 sm:text-xs"
          >
            <span className="sm:hidden">CSV ↓</span>
            <span className="hidden sm:inline">Download financial data</span>
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => fileRef.current?.click()}
            title="Import financial data CSV"
            className="shrink-0 rounded-lg border border-line bg-panel px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted shadow-sm transition hover:border-teal-accent/40 hover:text-teal-accent disabled:opacity-50 sm:px-3 sm:text-xs"
          >
            <span className="sm:hidden">CSV ↑</span>
            <span className="hidden sm:inline">Import financial data</span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="shrink-0 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted shadow-sm transition hover:border-teal-accent/40 hover:text-teal-accent"
          >
            Log out
          </button>
        </div>
      </div>
      {csvMsg && (
        <div className="border-t border-line bg-panel px-4 py-1.5 text-center text-[11px] text-muted sm:px-6 xl:px-8">
          <span className="text-deep">{csvMsg}</span>
          <button
            type="button"
            className="ml-2 font-semibold text-teal-accent hover:underline"
            onClick={() => setCsvMsg(null)}
          >
            Dismiss
          </button>
        </div>
      )}
    </header>
  );
}
