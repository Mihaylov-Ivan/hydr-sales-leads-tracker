"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useProjects } from "@/lib/store";
import { useAuth } from "@/lib/auth-context";
import { visibleNavItems } from "@/lib/permissions";
import NotificationBell from "@/components/NotificationBell";
import VoiceAssistant from "@/components/VoiceAssistant";
import { FEATURE_AI_CHAT_AND_VOICE } from "@/lib/feature-flags";
import { downloadFinancialCsv } from "@/lib/financial-csv";
import { buildDefaultSkladMaps } from "@/lib/warehouse-sklad-map";

type MenuPos = { top: number; left: number };

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, can, canWrite } = useAuth();
  const {
    ready,
    projects,
    financeSettings,
    warehouse,
    importFinancialCsvText,
  } = useProjects();
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  const displayName = user?.name ?? "Account";
  const showFinanceCsv = can("finance");
  const showFinanceCsvImport = showFinanceCsv && canWrite;
  const navItems = visibleNavItems(user);

  useLayoutEffect(() => {
    if (!menuOpen || !btnRef.current) {
      setMenuPos(null);
      return;
    }
    function update() {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const menuW = 224; // w-56
      const pad = 8;
      let left = r.right - menuW;
      left = Math.min(Math.max(pad, left), window.innerWidth - pad - menuW);
      setMenuPos({ top: r.bottom + 6, left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || panelRef.current?.contains(t)) return;
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

  async function onLogout() {
    setMenuOpen(false);
    await logout();
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
        key={href}
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
          <Link href={navItems[0]?.href ?? "/todos"} className="flex flex-col items-start gap-0.5">
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
          <nav className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => navLink(item.href, item.label))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showFinanceCsv && (
            <>
              {showFinanceCsvImport && (
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => void onImportCsv(e.target.files)}
                />
              )}
              <button
                type="button"
                disabled={!ready}
                onClick={async () => {
                  const result = await downloadFinancialCsv(
                    projects,
                    financeSettings,
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
              {showFinanceCsvImport && (
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
              )}
            </>
          )}

          {FEATURE_AI_CHAT_AND_VOICE ? <VoiceAssistant /> : null}

          <NotificationBell />

          <div ref={menuRef} className="relative shrink-0">
            <button
              ref={btnRef}
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex max-w-[12rem] items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm font-medium text-deep shadow-sm transition hover:border-teal-accent/40"
            >
              <span className="truncate">{displayName}</span>
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

            {menuOpen &&
              menuPos &&
              typeof document !== "undefined" &&
              createPortal(
                <div
                  ref={panelRef}
                  role="menu"
                  className="fixed z-[80] w-56 overflow-hidden rounded-lg border border-line bg-panel shadow-lg"
                  style={{ top: menuPos.top, left: menuPos.left }}
                >
                  <div className="border-b border-line px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-deep">
                      {displayName}
                    </p>
                    {user?.username && (
                      <p className="truncate text-[11px] text-muted">
                        @{user.username}
                        {user.isAdmin ? " · Admin" : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-0.5 p-1.5">
                    <Link
                      href="/change-password"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={menuBtnCls}
                    >
                      Change password
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void onLogout()}
                      className={`${menuBtnCls} text-muted hover:text-deep`}
                    >
                      Log out
                    </button>
                  </div>
                </div>,
                document.body,
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
