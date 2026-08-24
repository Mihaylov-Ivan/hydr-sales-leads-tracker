"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { downloadFinancialCsv, downloadFinancialHistoryCsv } from "@/lib/financial-csv";
import { buildDefaultSkladMaps } from "@/lib/warehouse-sklad-map";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    teamMembers,
    currentUserId,
    setCurrentUserId,
    meaningfulChangeMode,
    setMeaningfulChangeMode,
    financialHistory,
    ready,
    projects,
    financeSettings,
    warehouse,
    importFinancialCsvText,
  } = useProjects();
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedUserId =
    currentUserId && teamMembers.some((m) => m.id === currentUserId)
      ? currentUserId
      : (teamMembers[0]?.id ?? "");
  const selectedUserName =
    teamMembers.find((m) => m.id === selectedUserId)?.name ?? "Menu";

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function logout() {
    setMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function onImportCsv(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setCsvMsg(null);
    setMenuOpen(false);
    try {
      const text = await file.text();
      const result = importFinancialCsvText(text);
      if (!result.ok) {
        setCsvMsg(result.error);
      } else {
        const histNote =
          result.historyRows > 0
            ? ` Merged ${result.historyRows} history row${result.historyRows === 1 ? "" : "s"} by event_id.`
            : "";
        setCsvMsg(
          result.matched > 0
            ? `Imported financials for ${result.matched} project${result.matched === 1 ? "" : "s"}.${histNote}`
            : `CSV loaded (no matching projects by id/name).${histNote}`,
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

  const menuBtnCls =
    "flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs font-semibold text-deep transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50";

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
            {navLink("/", "Sales Projects")}
            {navLink("/expenses", "Expenses")}
            {navLink("/warehouse", "Warehouse")}
            {navLink("/production", "Production")}
            {navLink("/finance", "Finance")}
            {navLink("/metrics", "Metrics")}
            {navLink("/history", "History")}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
            onClick={async () => {
              const result = await downloadFinancialCsv(
                projects,
                financeSettings,
                financialHistory,
                warehouse,
                undefined,
                buildDefaultSkladMaps(projects),
              );
              setCsvMsg(
                result.ok
                  ? `Saved financial data to ${result.path}`
                  : `CSV export failed: ${result.error}`,
              );
            }}
            title="Save financial data CSV to OneDrive Finances folder"
            className="shrink-0 rounded-lg border border-line bg-panel px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted shadow-sm transition hover:border-teal-accent/40 hover:text-teal-accent disabled:opacity-50 sm:px-3 sm:text-xs"
          >
            <span className="sm:hidden">CSV ↓</span>
            <span className="hidden sm:inline">Download financial data</span>
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => fileRef.current?.click()}
            title="Import financial data CSV (history rows merge by event_id)"
            className="shrink-0 rounded-lg border border-line bg-panel px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted shadow-sm transition hover:border-teal-accent/40 hover:text-teal-accent disabled:opacity-50 sm:px-3 sm:text-xs"
          >
            <span className="sm:hidden">CSV ↑</span>
            <span className="hidden sm:inline">Import financial data</span>
          </button>

          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex max-w-[12rem] items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm font-medium text-deep shadow-sm transition hover:border-teal-accent/40"
            >
              <span className="truncate">{selectedUserName}</span>
              <svg
                viewBox="0 0 12 8"
                className={`h-2.5 w-2.5 shrink-0 text-muted transition ${menuOpen ? "rotate-180" : ""}`}
                aria-hidden
              >
                <path
                  d="M1 1.5 L6 6.5 L11 1.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-lg border border-line bg-panel shadow-lg"
              >
                <div className="border-b border-line px-3 py-2.5">
                  <label className="mb-1 block text-[9px] font-semibold uppercase tracking-wide text-muted">
                    Working as
                  </label>
                  <select
                    value={selectedUserId}
                    disabled={!ready || teamMembers.length === 0}
                    onChange={(e) => setCurrentUserId(e.target.value)}
                    aria-label="Select current user"
                    className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm font-medium text-deep outline-none focus:border-teal-accent disabled:cursor-not-allowed disabled:opacity-50"
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
                </div>

                <div className="border-b border-line px-3 py-2.5">
                  <label
                    className={`flex cursor-pointer items-center gap-2 text-xs font-semibold ${
                      meaningfulChangeMode ? "text-teal-accent" : "text-deep"
                    }`}
                    title={
                      meaningfulChangeMode
                        ? "On: edits are tagged as intentional process changes"
                        : "Off: edits are tagged as corrections / typo fixes"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={meaningfulChangeMode}
                      disabled={!ready}
                      onChange={(e) => setMeaningfulChangeMode(e.target.checked)}
                      className="h-3.5 w-3.5 accent-teal-accent"
                    />
                    Real change
                  </label>
                </div>

                <div className="flex flex-col gap-0.5 p-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!ready || financialHistory.length === 0}
                    onClick={async () => {
                      const result =
                        await downloadFinancialHistoryCsv(financialHistory);
                      setCsvMsg(
                        result.ok
                          ? `Saved history to ${result.path}`
                          : `History export failed: ${result.error}`,
                      );
                      setMenuOpen(false);
                    }}
                    title="Save financial history CSV to OneDrive Finances folder"
                    className={menuBtnCls}
                  >
                    Download history
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void logout()}
                    className={`${menuBtnCls} text-muted hover:text-deep`}
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
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
