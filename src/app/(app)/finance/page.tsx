"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useProjects } from "@/lib/store";
import {
  buildMonthlyPlan,
  type MonthlyProjectBreakdown,
} from "@/lib/finance-plan";
import { parseFinanceWorkbook } from "@/lib/finance-import";
import { downloadFinanceWorkbook } from "@/lib/finance-export";
import { projectsWithMergedFinancials } from "@/lib/finance-merge";
import {
  findLinkableDeadline,
  projectLinkableDeadlines,
} from "@/lib/gantt-finance";
import OverviewTimeline from "@/components/OverviewTimeline";
import ProjectMultiSelect, {
  colorForProjectIndex,
} from "@/components/ProjectMultiSelect";
import {
  CompanyMonthlyExpense,
  CompanyMonthlyExpenseStatus,
  PROJECT_EXPENSE_CATEGORY_LABELS,
  normalizeProjectExpense,
  todayDate,
} from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent";
const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

function ProjectBreakdownCell({
  amount,
  items,
  title,
  className,
}: {
  amount: number;
  items: MonthlyProjectBreakdown[];
  title: string;
  className?: string;
}) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  if (!amount) {
    return <td className={className}>—</td>;
  }
  return (
    <td
      className={className}
      onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setTip(null)}
    >
      <span className="cursor-help underline decoration-dotted decoration-muted/50 underline-offset-2">
        {formatMoneyCompact(amount)}
      </span>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[60] w-56 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-panel p-3 text-left shadow-lg"
          style={{
            left: Math.min(Math.max(tip.x, 120), window.innerWidth - 120),
            top: Math.max(tip.y - 12, 8),
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {title}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {items.map((p) => (
              <li
                key={p.projectId}
                className="flex items-baseline justify-between gap-3 text-[11px]"
              >
                <span className="min-w-0 truncate font-medium text-ink">
                  {p.projectName}
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-deep">
                  {formatMoneyCompact(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </td>
  );
}

const VIEW_RANGE_STORAGE_KEY = "hydrogenera-finance-view-range-v1";
const CASH_CHART_STORAGE_KEY = "hydrogenera-finance-cash-chart-open-v1";

function loadCashChartOpen(): boolean {
  try {
    const raw = window.localStorage.getItem(CASH_CHART_STORAGE_KEY);
    if (raw == null) return true;
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMoneyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = n / 1_000_000;
    return `€${m.toFixed(m % 1 === 0 ? 0 : 1)}M`;
  }
  if (abs >= 10_000) {
    return `€${Math.round(n / 1000)}k`;
  }
  return formatMoney(n);
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function parseNum(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function defaultViewRange(today: string): { from: string; to: string } {
  const [ys, ms] = today.split("-").map(Number);
  const fromDate = new Date(ys, ms - 1 - 6, 1);
  const toDate = new Date(ys, ms - 1 + 17, 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { from: fmt(fromDate), to: fmt(toDate) };
}

function loadViewRange(today: string): { from: string; to: string } {
  const fallback = defaultViewRange(today);
  try {
    const raw = window.localStorage.getItem(VIEW_RANGE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { from?: string; to?: string };
    const from = parsed.from?.slice(0, 7);
    const to = parsed.to?.slice(0, 7);
    if (
      from &&
      to &&
      /^\d{4}-\d{2}$/.test(from) &&
      /^\d{4}-\d{2}$/.test(to) &&
      from <= to
    ) {
      return { from, to };
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function isExcelFile(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".xlsm");
}

export default function FinancePage() {
  const {
    projects,
    ready,
    financeSettings,
    updateFinanceSettings,
    financeImport,
    applyFinanceImport,
    clearFinanceImport,
  } = useProjects();

  const [openingDraft, setOpeningDraft] = useState<string | null>(null);
  const [minWcDraft, setMinWcDraft] = useState<string | null>(null);
  const [fixedMonthlyDrafts, setFixedMonthlyDrafts] = useState<
    Record<string, string>
  >({});
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const today = todayDate();
  const [viewFrom, setViewFrom] = useState(() => loadViewRange(today).from);
  const [viewTo, setViewTo] = useState(() => loadViewRange(today).to);
  const [cashChartOpen, setCashChartOpen] = useState(true);
  const [cashChartPrefReady, setCashChartPrefReady] = useState(false);

  useEffect(() => {
    setCashChartOpen(loadCashChartOpen());
    setCashChartPrefReady(true);
  }, []);

  useEffect(() => {
    if (!cashChartPrefReady) return;
    try {
      window.localStorage.setItem(
        CASH_CHART_STORAGE_KEY,
        JSON.stringify(cashChartOpen),
      );
    } catch {
      /* ignore */
    }
  }, [cashChartOpen, cashChartPrefReady]);

  const planProjects = useMemo(
    () => projectsWithMergedFinancials(projects, financeImport, today),
    [projects, financeImport, today],
  );

  const filterableProjects = useMemo(
    () =>
      [...planProjects]
        .filter(
          (p) =>
            p.stage !== "cancelled" &&
            (p.financials.payments.length > 0 ||
              (p.financials.expenseSchedule?.length ?? 0) > 0),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [planProjects],
  );

  const [tableProjectIds, setTableProjectIds] = useState<Set<string> | null>(
    null,
  );
  const [scheduleProjectIds, setScheduleProjectIds] = useState<
    Set<string> | null
  >(null);
  const prevFilterIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const valid = new Set(filterableProjects.map((p) => p.id));
    const prev = prevFilterIdsRef.current;
    function syncSelection(curr: Set<string> | null): Set<string> {
      if (curr === null) return new Set(valid);
      const next = new Set([...curr].filter((id) => valid.has(id)));
      for (const id of valid) {
        if (!prev.has(id)) next.add(id);
      }
      return next;
    }
    setTableProjectIds(syncSelection);
    setScheduleProjectIds(syncSelection);
    prevFilterIdsRef.current = valid;
  }, [filterableProjects]);

  const selectedTableIds =
    tableProjectIds ?? new Set(filterableProjects.map((p) => p.id));
  const selectedScheduleIds =
    scheduleProjectIds ?? new Set(filterableProjects.map((p) => p.id));

  const tableProjects = useMemo(
    () => planProjects.filter((p) => selectedTableIds.has(p.id)),
    [planProjects, selectedTableIds],
  );

  const scheduleProjects = useMemo(
    () => planProjects.filter((p) => selectedScheduleIds.has(p.id)),
    [planProjects, selectedScheduleIds],
  );

  const tableColorById = useMemo(() => {
    const map = new Map<string, string>();
    filterableProjects.forEach((p, i) =>
      map.set(p.id, colorForProjectIndex(i)),
    );
    return map;
  }, [filterableProjects]);

  const months = useMemo(
    () =>
      buildMonthlyPlan(tableProjects, financeSettings, {
        fromMonth: viewFrom,
        toMonth: viewTo,
      }),
    [tableProjects, financeSettings, viewFrom, viewTo],
  );

  const scheduleRows = useMemo(() => {
    type Row = {
      key: string;
      projectId: string;
      projectName: string;
      kind: "income" | "expense";
      categoryLabel: string | null;
      label: string;
      amount: number;
      expectedDate: string;
      actualDate: string | null;
      ganttLabel: string | null;
      sortDate: string;
    };
    const rows: Row[] = [];
    for (const p of scheduleProjects) {
      const deadlines = projectLinkableDeadlines(p);
      for (const pay of p.financials.payments ?? []) {
        const linked = findLinkableDeadline(pay.milestoneId, deadlines);
        const expectedDate = linked?.date ?? pay.dueDate;
        rows.push({
          key: `in-${p.id}-${pay.id}`,
          projectId: p.id,
          projectName: p.name,
          kind: "income",
          categoryLabel: null,
          label: pay.label?.trim() || "—",
          amount: pay.amount,
          expectedDate,
          actualDate: pay.actualDate ?? null,
          ganttLabel: linked?.label ?? null,
          sortDate: pay.actualDate ?? expectedDate,
        });
      }
      for (const raw of p.financials.expenseSchedule ?? []) {
        const exp = normalizeProjectExpense(raw);
        const linked = findLinkableDeadline(exp.milestoneId, deadlines);
        const expectedDate = linked?.date ?? exp.dueDate;
        const cat = exp.category ?? "materials";
        rows.push({
          key: `out-${p.id}-${exp.id}`,
          projectId: p.id,
          projectName: p.name,
          kind: "expense",
          categoryLabel: PROJECT_EXPENSE_CATEGORY_LABELS[cat],
          label: exp.label?.trim() || "—",
          amount: exp.amount,
          expectedDate,
          actualDate: exp.actualDate ?? null,
          ganttLabel: linked?.label ?? null,
          sortDate: exp.actualDate ?? expectedDate,
        });
      }
    }
    return rows.sort((a, b) => {
      // Incomes first, then expenses; each group by date
      if (a.kind !== b.kind) {
        return a.kind === "income" ? -1 : 1;
      }
      const byDate = a.sortDate.localeCompare(b.sortDate);
      if (byDate !== 0) return byDate;
      return a.projectName.localeCompare(b.projectName);
    });
  }, [scheduleProjects]);

  const opexByMonth = useMemo(() => {
    const map = new Map<string, CompanyMonthlyExpense>();
    for (const e of financeSettings.monthlyExpenses ?? []) {
      map.set(e.month, e);
    }
    return map;
  }, [financeSettings.monthlyExpenses]);

  async function onImportFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const file = files[0];
      if (!isExcelFile(file.name)) {
        setImportError("Upload an Excel file (.xlsx) — e.g. finance2.xlsx");
        return;
      }
      const buffer = await file.arrayBuffer();
      const result = parseFinanceWorkbook(buffer, file.name);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }

      applyFinanceImport(result.data);

      const importMonths = [
        ...new Set(
          result.data.projectActuals.map((a) => a.dueDate.slice(0, 7)),
        ),
      ].sort();
      if (importMonths.length > 0) {
        const earliest = importMonths[0];
        const latest = importMonths[importMonths.length - 1];
        setViewRange({
          from: earliest < viewFrom ? earliest : viewFrom,
          to: latest > viewTo ? latest : viewTo,
        });
      }

      setImportError(null);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function saveOpening() {
    const n = parseNum(openingDraft ?? String(financeSettings.openingCash));
    if (n == null) {
      setOpeningDraft(null);
      return;
    }
    updateFinanceSettings({ openingCash: n });
    setOpeningDraft(null);
  }

  function setAsOf(month: string) {
    if (!month) {
      updateFinanceSettings({ openingCashAsOf: null });
      return;
    }
    const key = month.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    updateFinanceSettings({ openingCashAsOf: key });
  }

  function setViewRange(next: { from?: string; to?: string }) {
    const from = next.from ?? viewFrom;
    const to = next.to ?? viewTo;
    const ordered = from <= to ? { from, to } : { from: to, to: from };
    setViewFrom(ordered.from);
    setViewTo(ordered.to);
    try {
      window.localStorage.setItem(
        VIEW_RANGE_STORAGE_KEY,
        JSON.stringify(ordered),
      );
    } catch {
      /* ignore */
    }
  }

  function saveMinWc() {
    const n = parseNum(minWcDraft ?? String(financeSettings.minWorkingCapital));
    if (n == null) {
      setMinWcDraft(null);
      return;
    }
    updateFinanceSettings({ minWorkingCapital: n });
    setMinWcDraft(null);
  }

  function upsertMonthlyCompany(
    month: string,
    patch: {
      fixedMonthly?: number | null;
      status?: CompanyMonthlyExpenseStatus;
    },
  ) {
    const existing = opexByMonth.get(month);
    const defaultStatus: CompanyMonthlyExpenseStatus =
      month < today.slice(0, 7) ? "actual" : "projected";
    const nextStatus = patch.status ?? existing?.status ?? defaultStatus;
    const nextFixed =
      patch.fixedMonthly !== undefined
        ? patch.fixedMonthly
        : (existing?.fixedMonthly ?? 0);

    const rest = (financeSettings.monthlyExpenses ?? []).filter(
      (e) => e.month !== month,
    );
    const fixedMonthly = Math.max(0, nextFixed ?? 0);
    if (fixedMonthly <= 0) {
      updateFinanceSettings({ monthlyExpenses: rest });
      return;
    }
    updateFinanceSettings({
      monthlyExpenses: [
        ...rest,
        { month, fixedMonthly, status: nextStatus },
      ].sort((a, b) => a.month.localeCompare(b.month)),
    });
  }

  function saveFixedMonthly(month: string) {
    const raw = fixedMonthlyDrafts[month];
    if (raw === undefined) return;
    const n = parseNum(raw);
    setFixedMonthlyDrafts((d) => {
      const next = { ...d };
      delete next[month];
      return next;
    });
    if (raw.trim() === "" || n == null || n < 0) {
      upsertMonthlyCompany(month, { fixedMonthly: 0 });
      return;
    }
    upsertMonthlyCompany(month, { fixedMonthly: n });
  }

  if (!ready) {
    return (
      <div className="py-16 text-center text-sm text-muted">Loading…</div>
    );
  }

  const currentClosing = months.find((m) => m.period === "current");

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-deep">
            Financial plan
          </h1>
        </div>
        {currentClosing && (
          <div className="rounded-xl border border-line bg-surface px-4 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              This month closing cash
            </p>
            <p className="text-lg font-bold text-deep">
              {formatMoneyCompact(currentClosing.closingCash)}
            </p>
          </div>
        )}
      </header>

      {/* Project cash flow chart */}
      <section className="rounded-xl border border-line bg-panel shadow-sm">
        <button
          type="button"
          aria-expanded={cashChartOpen}
          onClick={() => setCashChartOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-surface-tint/40"
        >
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
              Cash flow chart
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Scheduled and actual income/expenses across projects
            </p>
          </div>
          <span
            className={`shrink-0 text-sm font-semibold text-muted transition ${
              cashChartOpen ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            ›
          </span>
        </button>
        {cashChartOpen && (
          <div className="border-t border-line px-5 pb-5 pt-4">
            <OverviewTimeline
              projects={planProjects}
              financeSettings={{
                ...financeSettings,
                openingCashAsOf:
                  financeSettings.openingCashAsOf ?? viewFrom,
              }}
              embedded
            />
          </div>
        )}
      </section>

      {/* Import / export */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
              Import / export
            </h2>
            {financeImport && (
              <p className="mt-2 text-xs text-green-accent">
                Loaded {financeImport.projectActuals.length} actual
                {financeImport.projectExpected?.length
                  ? ` · ${financeImport.projectExpected.length} expected`
                  : ""}
                {financeImport.importedAt
                  ? ` · ${new Date(financeImport.importedAt).toLocaleString()}`
                  : ""}
              </p>
            )}
            {importError && (
              <p className="mt-2 text-xs text-amber-accent">{importError}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void onImportFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={importBusy}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-olive px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-olive-ink hover:brightness-105 disabled:opacity-50"
            >
              {importBusy ? "Importing…" : "Upload Excel"}
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  const { rowCount } = downloadFinanceWorkbook(
                    projects,
                    financeImport,
                    `finance2-${today}.xlsx`,
                    financeSettings,
                  );
                  setImportError(null);
                  if (rowCount === 0) {
                    setImportError(
                      "Nothing to export yet — import actuals or add expected schedules on projects.",
                    );
                  }
                } catch (e) {
                  setImportError(
                    e instanceof Error ? e.message : "Export failed",
                  );
                }
              }}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-deep hover:border-teal-accent"
            >
              Export data
            </button>
            {financeImport && (
              <button
                type="button"
                onClick={() => {
                  clearFinanceImport();
                  setImportError(null);
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-deep"
              >
                Clear import
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Settings */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-deep">
          Company settings
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Cash on hand (€)</label>
            <input
              className={inputCls}
              inputMode="decimal"
              value={
                openingDraft ?? String(financeSettings.openingCash || "")
              }
              onChange={(e) => setOpeningDraft(e.target.value)}
              onBlur={saveOpening}
              placeholder="0"
            />
          </div>
          <div>
            <label className={labelCls}>As of month</label>
            <input
              className={inputCls}
              type="month"
              value={financeSettings.openingCashAsOf ?? viewFrom}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Min working capital (€)</label>
            <input
              className={inputCls}
              inputMode="decimal"
              value={
                minWcDraft ??
                String(financeSettings.minWorkingCapital || "")
              }
              onChange={(e) => setMinWcDraft(e.target.value)}
              onBlur={saveMinWc}
              placeholder="0"
            />
          </div>
        </div>
      </section>

      {/* Firm monthly cashflow */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
              Monthly cashflow
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] text-muted">
              Filter projects like the chart (All / Clear / pick). Company fixed
              monthly always stays; project income, materials, and installation
              follow the selection. Man-hr stays on projects for analysis only.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {filterableProjects.length > 0 && (
              <div>
                <label className={labelCls}>Projects</label>
                <ProjectMultiSelect
                  projects={filterableProjects}
                  selectedIds={selectedTableIds}
                  colorById={tableColorById}
                  onToggle={(id) => {
                    setTableProjectIds((prev) => {
                      const base =
                        prev ?? new Set(filterableProjects.map((p) => p.id));
                      const next = new Set(base);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  onSelectAll={() =>
                    setTableProjectIds(
                      new Set(filterableProjects.map((p) => p.id)),
                    )
                  }
                  onClear={() => setTableProjectIds(new Set())}
                />
              </div>
            )}
            <div>
              <label className={labelCls}>View from</label>
              <input
                className={`${inputCls} w-[9.5rem] py-1.5`}
                type="month"
                value={viewFrom}
                onChange={(e) => setViewRange({ from: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>View to</label>
              <input
                className={`${inputCls} w-[9.5rem] py-1.5`}
                type="month"
                value={viewTo}
                onChange={(e) => setViewRange({ to: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-muted">
                <th className="sticky left-0 z-10 bg-panel px-2 py-1.5">
                  Month
                </th>
                <th className="px-2 py-1.5 text-right">Open</th>
                <th className="border-l border-line bg-green-accent/5 px-2 py-1.5 text-right text-green-accent">
                  Project in
                </th>
                <th
                  className="border-l border-line bg-amber-accent/5 px-2 py-1.5 text-right text-amber-accent"
                  colSpan={2}
                >
                  Project out
                </th>
                <th
                  className="border-l border-line bg-muted/10 px-2 py-1.5 text-right text-muted"
                >
                  Company out
                </th>
                <th className="border-l border-line px-2 py-1.5 text-right font-bold text-deep">
                  Net
                </th>
                <th className="border-l border-line px-2 py-1.5 text-right font-bold text-teal-accent">
                  Close
                </th>
              </tr>
              <tr className="border-b border-line text-[10px] text-muted">
                <th className="sticky left-0 z-10 bg-panel px-2 py-1" />
                <th className="px-2 py-1 text-right" />
                <th className="border-l border-line bg-green-accent/5 px-2 py-1 text-right">
                  Income
                </th>
                <th className="border-l border-line bg-amber-accent/5 px-2 py-1 text-right">
                  Materials
                </th>
                <th className="bg-amber-accent/5 px-2 py-1 text-right">
                  Install
                </th>
                <th className="border-l border-line bg-muted/10 px-2 py-1 text-right">
                  Fixed monthly
                </th>
                <th className="border-l border-line px-2 py-1 text-right">€</th>
                <th className="border-l border-line px-2 py-1 text-right">€</th>
              </tr>
            </thead>
            <tbody>
              {months.map((row) => {
                const warn = row.belowMinWorkingCapital;
                const entry = opexByMonth.get(row.month);
                const defaultStatus: CompanyMonthlyExpenseStatus =
                  row.period === "past" ? "actual" : "projected";
                const status = entry?.status ?? defaultStatus;
                const inputsDisabled =
                  Boolean(financeImport) && status === "actual";
                const opexInputCls =
                  "w-[4.75rem] rounded border border-line bg-surface px-1.5 py-0.5 text-right text-[11px] text-ink outline-none focus:border-teal-accent disabled:cursor-not-allowed disabled:opacity-70";
                return (
                  <tr
                    key={row.month}
                    className={`border-b border-line/60 ${warn
                      ? "bg-amber-accent/10"
                      : row.period === "current"
                        ? "bg-teal-soft/30"
                        : row.period === "past"
                          ? "bg-surface/50"
                          : "hover:bg-surface"
                      }`}
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-1 font-semibold text-deep">
                      {row.label}
                      {row.period === "current" && (
                        <span className="ml-1 text-[9px] font-medium text-teal-accent">
                          now
                        </span>
                      )}
                      {warn && (
                        <span className="ml-1 text-[9px] font-medium text-amber-accent">
                          WC
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted">
                      {formatMoneyCompact(row.openingCash)}
                    </td>
                    <ProjectBreakdownCell
                      amount={row.projectIn}
                      items={row.projectInByProject}
                      title={`${row.label} · Income`}
                      className="border-l border-line px-2 py-1 text-right tabular-nums text-green-accent"
                    />
                    <ProjectBreakdownCell
                      amount={row.materialsOut}
                      items={row.materialsByProject}
                      title={`${row.label} · Materials`}
                      className="border-l border-line px-2 py-1 text-right tabular-nums text-amber-accent"
                    />
                    <ProjectBreakdownCell
                      amount={row.installationOut}
                      items={row.installationByProject}
                      title={`${row.label} · Installation`}
                      className="px-2 py-1 text-right tabular-nums text-amber-accent"
                    />
                    <td className="border-l border-line px-1.5 py-1">
                      <input
                        className={opexInputCls}
                        inputMode="decimal"
                        placeholder="—"
                        disabled={inputsDisabled}
                        title="Fixed monthly company cost"
                        value={
                          fixedMonthlyDrafts[row.month] ??
                          (entry?.fixedMonthly
                            ? String(entry.fixedMonthly)
                            : "")
                        }
                        onChange={(e) =>
                          setFixedMonthlyDrafts((d) => ({
                            ...d,
                            [row.month]: e.target.value,
                          }))
                        }
                        onBlur={() => saveFixedMonthly(row.month)}
                      />
                    </td>
                    <td
                      className={`border-l border-line px-2 py-1 text-right tabular-nums font-medium ${
                        row.net < 0 ? "text-amber-accent" : "text-deep"
                      }`}
                    >
                      {formatMoneyCompact(row.net)}
                    </td>
                    <td className="border-l border-line px-2 py-1 text-right tabular-nums font-bold text-teal-accent">
                      {formatMoneyCompact(row.closingCash)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
              Project income &amp; expenses
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              Incomes first (by date), then expenses (by date). Linked Gantt
              milestones shown when set.
            </p>
          </div>
          {filterableProjects.length > 0 && (
            <div>
              <label className={labelCls}>Projects</label>
              <ProjectMultiSelect
                projects={filterableProjects}
                selectedIds={selectedScheduleIds}
                colorById={tableColorById}
                onToggle={(id) => {
                  setScheduleProjectIds((prev) => {
                    const base =
                      prev ?? new Set(filterableProjects.map((p) => p.id));
                    const next = new Set(base);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onSelectAll={() =>
                  setScheduleProjectIds(
                    new Set(filterableProjects.map((p) => p.id)),
                  )
                }
                onClear={() => setScheduleProjectIds(new Set())}
              />
            </div>
          )}
        </div>
        {scheduleRows.length === 0 ? (
          <p className="text-sm text-muted">
            No income or expense lines for the selected projects.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wide text-muted">
                  <th className="sticky left-0 z-10 bg-panel px-2 py-1.5">
                    Project
                  </th>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Category</th>
                  <th className="px-2 py-1.5">Label</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5">Expected</th>
                  <th className="px-2 py-1.5">Actual</th>
                  <th className="px-2 py-1.5">Gantt link</th>
                  <th className="px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((row) => {
                  const isIncome = row.kind === "income";
                  const done = Boolean(row.actualDate);
                  const delayed =
                    !done && row.expectedDate < today;
                  return (
                    <tr
                      key={row.key}
                      className="border-b border-line/60 hover:bg-surface"
                    >
                      <td className="sticky left-0 z-10 bg-inherit px-2 py-1.5 font-semibold text-deep">
                        <Link
                          href={`/projects/${row.projectId}`}
                          className="hover:text-teal-accent"
                        >
                          {row.projectName}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isIncome
                              ? "bg-green-accent/15 text-green-accent"
                              : "bg-amber-accent/15 text-amber-accent"
                          }`}
                        >
                          {isIncome ? "Income" : "Expense"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-muted">
                        {row.categoryLabel ?? "—"}
                      </td>
                      <td className="max-w-[12rem] truncate px-2 py-1.5 text-ink">
                        {row.label}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                          isIncome ? "text-green-accent" : "text-amber-accent"
                        }`}
                      >
                        {formatMoneyCompact(row.amount)}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-muted">
                        {formatDate(row.expectedDate)}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-muted">
                        {row.actualDate ? formatDate(row.actualDate) : "—"}
                      </td>
                      <td className="max-w-[16rem] px-2 py-1.5">
                        {row.ganttLabel ? (
                          <span
                            className="inline-block truncate rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal-accent"
                            title={row.ganttLabel}
                          >
                            {row.ganttLabel}
                          </span>
                        ) : (
                          <span className="text-muted">Standalone</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {done ? (
                          <span className="rounded-full bg-green-accent/15 px-2 py-0.5 text-[10px] font-semibold text-green-accent">
                            {isIncome ? "Received" : "Paid"}
                          </span>
                        ) : delayed ? (
                          <span className="rounded-full bg-amber-accent/15 px-2 py-0.5 text-[10px] font-semibold text-amber-accent">
                            Delayed
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-semibold text-muted">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
