"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useProjects } from "@/lib/store";
import {
  buildMonthlyPlan,
  partitionFinanceProjects,
} from "@/lib/finance-plan";
import { parseFinanceWorkbook } from "@/lib/finance-import";
import { downloadFinanceWorkbook } from "@/lib/finance-export";
import { projectsWithMergedFinancials } from "@/lib/finance-merge";
import {
  CompanyMonthlyExpense,
  CompanyMonthlyExpenseStatus,
  STAGE_LABELS,
  Stage,
  todayDate,
} from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent";
const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

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

function parseNum(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const PIPELINE_STAGES: Stage[] = ["cold-lead", "hot-lead"];
const VIEW_RANGE_STORAGE_KEY = "hydrogenera-finance-view-range-v1";

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
  const [probDrafts, setProbDrafts] = useState<Partial<Record<Stage, string>>>(
    {},
  );
  const [opexAmountDrafts, setOpexAmountDrafts] = useState<
    Record<string, string>
  >({});
  const [bulkProjected, setBulkProjected] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const today = todayDate();
  const [viewFrom, setViewFrom] = useState(() => loadViewRange(today).from);
  const [viewTo, setViewTo] = useState(() => loadViewRange(today).to);

  const planProjects = useMemo(
    () => projectsWithMergedFinancials(projects, financeImport, today),
    [projects, financeImport, today],
  );

  const months = useMemo(
    () =>
      buildMonthlyPlan(planProjects, financeSettings, {
        fromMonth: viewFrom,
        toMonth: viewTo,
      }),
    [planProjects, financeSettings, viewFrom, viewTo],
  );
  const { contracted, pipeline } = useMemo(
    () => partitionFinanceProjects(planProjects, financeSettings, today),
    [planProjects, financeSettings, today],
  );

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

  function saveProb(stage: Stage) {
    const raw =
      probDrafts[stage] ??
      String(financeSettings.stageProbabilities[stage] ?? 0);
    const n = parseNum(raw);
    if (n == null) {
      setProbDrafts((d) => {
        const next = { ...d };
        delete next[stage];
        return next;
      });
      return;
    }
    updateFinanceSettings({
      stageProbabilities: {
        ...financeSettings.stageProbabilities,
        [stage]: Math.min(100, Math.max(0, n)),
      },
    });
    setProbDrafts((d) => {
      const next = { ...d };
      delete next[stage];
      return next;
    });
  }

  function upsertOpex(
    month: string,
    patch: { amount?: number | null; status?: CompanyMonthlyExpenseStatus },
  ) {
    const existing = opexByMonth.get(month);
    const defaultStatus: CompanyMonthlyExpenseStatus =
      month < today.slice(0, 7) ? "actual" : "projected";
    const nextStatus = patch.status ?? existing?.status ?? defaultStatus;
    const nextAmount =
      patch.amount !== undefined
        ? patch.amount
        : (existing?.amount ?? null);

    const rest = (financeSettings.monthlyExpenses ?? []).filter(
      (e) => e.month !== month,
    );
    if (nextAmount == null || nextAmount <= 0) {
      updateFinanceSettings({ monthlyExpenses: rest });
      return;
    }
    updateFinanceSettings({
      monthlyExpenses: [
        ...rest,
        { month, amount: nextAmount, status: nextStatus },
      ].sort((a, b) => a.month.localeCompare(b.month)),
    });
  }

  function saveOpexAmount(month: string) {
    const raw = opexAmountDrafts[month];
    if (raw === undefined) return;
    const n = parseNum(raw);
    setOpexAmountDrafts((d) => {
      const next = { ...d };
      delete next[month];
      return next;
    });
    if (raw.trim() === "" || n == null || n <= 0) {
      upsertOpex(month, { amount: null });
      return;
    }
    upsertOpex(month, { amount: n });
  }

  function applyBulkProjected() {
    const n = parseNum(bulkProjected);
    if (n == null || n <= 0) return;
    const byMonth = new Map(
      (financeSettings.monthlyExpenses ?? []).map((e) => [e.month, e]),
    );
    for (const row of months) {
      if (row.period === "past") continue;
      const existing = byMonth.get(row.month);
      byMonth.set(row.month, {
        month: row.month,
        amount: n,
        status: existing?.status === "actual" ? "actual" : "projected",
      });
    }
    updateFinanceSettings({
      monthlyExpenses: [...byMonth.values()].sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
    });
    setBulkProjected("");
  }

  if (!ready) {
    return (
      <div className="py-16 text-center text-sm text-muted">Loading…</div>
    );
  }

  const currentClosing = months.find((m) => m.period === "current");
  const windowOpening = months[0]?.openingCash;
  const windowFirstLabel = months[0]?.label;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-deep">
            Financial plan
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Project actuals load from Excel. Future company opex starts at zero
            — enter and apply it here. Pipeline projects keep projected
            schedules from the app; contracted past cash comes from the file.
          </p>
        </div>
        {currentClosing && (
          <div className="rounded-xl border border-line bg-surface px-4 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              This month confirmed / expected
            </p>
            <p className="text-lg font-bold text-deep">
              {formatMoneyCompact(currentClosing.confirmedClosing)}
              <span className="mx-1.5 text-muted">·</span>
              <span className="text-teal-accent">
                {formatMoneyCompact(currentClosing.expectedCash)}
              </span>
            </p>
          </div>
        )}
      </header>

      {/* Import */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-deep">
              Actuals import
            </h2>
            <p className="max-w-2xl text-[11px] text-muted">
              Upload{" "}
              <code className="text-ink">finance2.xlsx</code> (sheet{" "}
              <code className="text-ink">Data</code>: Project, Date, Income,
              Expense, Deadline). While an import is loaded, only Excel rows
              are shown. Add futures in the app after clearing the import, or
              put them in the file and re-upload / export.
            </p>
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
            <a
              href="/templates/finance-import/finance2.xlsx"
              download
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-deep hover:bg-surface"
            >
              Download template
            </a>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage}>
              <label className={labelCls}>
                {STAGE_LABELS[stage]} win %
              </label>
              <input
                className={inputCls}
                inputMode="decimal"
                value={
                  probDrafts[stage] ??
                  String(
                    financeSettings.stageProbabilities[stage] ??
                      (stage === "cold-lead" ? 10 : 40),
                  )
                }
                onChange={(e) =>
                  setProbDrafts((d) => ({ ...d, [stage]: e.target.value }))
                }
                onBlur={() => saveProb(stage)}
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Cash on hand is your bank balance at the start of the as-of month.
          Flows before that month are ignored. Import sets as-of to the earliest
          Excel month so project actuals appear in the table. Company opex is
          manual (not in the Excel file). The table range is only a view filter.
          {windowFirstLabel != null && windowOpening != null && (
            <>
              {" "}
              First visible month ({windowFirstLabel}) opens at{" "}
              <span className="font-semibold text-deep">
                {formatMoneyCompact(windowOpening)}
              </span>
              .
            </>
          )}
        </p>
      </section>

      {/* Combined monthly cashflow + company opex */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
              Monthly cashflow
            </h2>
            <p className="mt-1 max-w-2xl text-[11px] text-muted">
              Actual opex comes from the import (read-only). Enter projected
              opex for current/future months, or use Fill future opex. Confirmed
              = opening + actual + contracted. Expected = confirmed + weighted
              pipeline.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
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
            <div>
              <label className={labelCls}>Fill future opex (€)</label>
              <input
                className={`${inputCls} w-32 py-1.5`}
                inputMode="decimal"
                value={bulkProjected}
                onChange={(e) => setBulkProjected(e.target.value)}
                placeholder="45000"
              />
            </div>
            <button
              type="button"
              onClick={applyBulkProjected}
              className="rounded-lg bg-olive px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-olive-ink hover:brightness-105"
            >
              Apply
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-muted">
                <th className="sticky left-0 z-10 bg-panel px-2 py-1.5">
                  Month
                </th>
                <th className="px-2 py-1.5 text-right">Open</th>
                <th
                  className="border-l border-line bg-muted/10 px-2 py-1.5 text-center text-muted"
                  colSpan={2}
                >
                  Company opex
                </th>
                <th
                  className="border-l border-line bg-green-accent/5 px-2 py-1.5 text-right text-green-accent"
                  colSpan={2}
                >
                  Actual
                </th>
                <th
                  className="border-l border-line bg-deep/5 px-2 py-1.5 text-right text-deep"
                  colSpan={3}
                >
                  Contracted
                </th>
                <th className="border-l border-line px-2 py-1.5 text-right font-bold text-deep">
                  Confirmed
                </th>
                <th
                  className="border-l border-line bg-amber-accent/5 px-2 py-1.5 text-right text-amber-accent"
                  colSpan={2}
                >
                  Weighted
                </th>
                <th className="border-l border-line px-2 py-1.5 text-right font-bold text-teal-accent">
                  Expected
                </th>
                <th
                  className="border-l border-line bg-muted/5 px-2 py-1.5 text-right text-muted"
                  colSpan={2}
                >
                  Unweighted
                </th>
              </tr>
              <tr className="border-b border-line text-[10px] text-muted">
                <th className="sticky left-0 z-10 bg-panel px-2 py-1" />
                <th className="px-2 py-1 text-right" />
                <th className="border-l border-line bg-muted/10 px-2 py-1 text-right">
                  €
                </th>
                <th className="bg-muted/10 px-2 py-1 text-center">Type</th>
                <th className="border-l border-line bg-green-accent/5 px-2 py-1 text-right">
                  In
                </th>
                <th className="bg-green-accent/5 px-2 py-1 text-right">Out</th>
                <th className="border-l border-line bg-deep/5 px-2 py-1 text-right">
                  In
                </th>
                <th className="bg-deep/5 px-2 py-1 text-right">Out</th>
                <th className="bg-deep/5 px-2 py-1 text-right">Net</th>
                <th className="border-l border-line px-2 py-1 text-right">
                  Close
                </th>
                <th className="border-l border-line bg-amber-accent/5 px-2 py-1 text-right">
                  In
                </th>
                <th className="bg-amber-accent/5 px-2 py-1 text-right">Out</th>
                <th className="border-l border-line px-2 py-1 text-right">
                  Cash
                </th>
                <th className="border-l border-line bg-muted/5 px-2 py-1 text-right">
                  In
                </th>
                <th className="bg-muted/5 px-2 py-1 text-right">Out</th>
              </tr>
            </thead>
            <tbody>
              {months.map((row) => {
                const warn =
                  row.belowMinWorkingCapital ||
                  row.expectedBelowMinWorkingCapital;
                const entry = opexByMonth.get(row.month);
                const defaultStatus: CompanyMonthlyExpenseStatus =
                  row.period === "past" ? "actual" : "projected";
                const status = entry?.status ?? defaultStatus;
                return (
                  <tr
                    key={row.month}
                    className={`border-b border-line/60 ${
                      warn
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
                    <td className="border-l border-line px-1.5 py-1">
                      <input
                        className="w-[5.5rem] rounded border border-line bg-surface px-1.5 py-0.5 text-right text-[11px] text-ink outline-none focus:border-teal-accent disabled:cursor-not-allowed disabled:opacity-70"
                        inputMode="decimal"
                        placeholder="—"
                        disabled={
                          Boolean(financeImport) && status === "actual"
                        }
                        value={
                          opexAmountDrafts[row.month] ??
                          (entry ? String(entry.amount) : "")
                        }
                        onChange={(e) =>
                          setOpexAmountDrafts((d) => ({
                            ...d,
                            [row.month]: e.target.value,
                          }))
                        }
                        onBlur={() => saveOpexAmount(row.month)}
                      />
                    </td>
                    <td className="px-1.5 py-1 text-center">
                      <div className="inline-flex rounded border border-line bg-surface p-0.5">
                        {(
                          [
                            ["actual", "A"],
                            ["projected", "P"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            disabled={
                              (!entry && !opexAmountDrafts[row.month]) ||
                              (Boolean(financeImport) && status === "actual")
                            }
                            title={
                              value === "actual" ? "Actual" : "Projected"
                            }
                            onClick={() => {
                              const draft = opexAmountDrafts[row.month];
                              const amt =
                                entry?.amount ??
                                (draft != null ? parseNum(draft) : null);
                              if (amt == null || amt <= 0) return;
                              upsertOpex(row.month, {
                                status: value,
                                amount: amt,
                              });
                            }}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition disabled:opacity-40 ${
                              status === value
                                ? value === "actual"
                                  ? "bg-green-accent/20 text-green-accent"
                                  : "bg-deep/15 text-deep"
                                : "text-muted hover:text-ink"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="border-l border-line px-2 py-1 text-right tabular-nums text-green-accent">
                      {row.actualInflows
                        ? formatMoneyCompact(row.actualInflows)
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-green-accent">
                      {row.actualOutflows
                        ? formatMoneyCompact(row.actualOutflows)
                        : "—"}
                    </td>
                    <td className="border-l border-line px-2 py-1 text-right tabular-nums text-deep">
                      {row.contractedInflows
                        ? formatMoneyCompact(row.contractedInflows)
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-deep">
                      {row.contractedOutflows
                        ? formatMoneyCompact(row.contractedOutflows)
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums font-medium text-deep">
                      {formatMoneyCompact(row.contractedNet)}
                    </td>
                    <td className="border-l border-line px-2 py-1 text-right tabular-nums font-bold text-deep">
                      {formatMoneyCompact(row.confirmedClosing)}
                    </td>
                    <td className="border-l border-line px-2 py-1 text-right tabular-nums text-amber-accent">
                      {row.weightedInflows
                        ? formatMoneyCompact(row.weightedInflows)
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-amber-accent">
                      {row.weightedOutflows
                        ? formatMoneyCompact(row.weightedOutflows)
                        : "—"}
                    </td>
                    <td className="border-l border-line px-2 py-1 text-right tabular-nums font-bold text-teal-accent">
                      {formatMoneyCompact(row.expectedCash)}
                    </td>
                    <td className="border-l border-line px-2 py-1 text-right tabular-nums text-muted">
                      {row.unweightedInflows
                        ? formatMoneyCompact(row.unweightedInflows)
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted">
                      {row.unweightedOutflows
                        ? formatMoneyCompact(row.unweightedOutflows)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-muted">
          Company opex type: <span className="font-semibold text-green-accent">A</span>{" "}
          = actual (spent) · <span className="font-semibold text-deep">P</span>{" "}
          = projected (planned). Fill future opex applies to current + future
          months.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-deep">
            Contracted projects
          </h2>
          <p className="mb-4 text-[11px] text-muted">
            Under development &amp; commissioned — full amounts in confirmed
            cash.
          </p>
          {contracted.length === 0 ? (
            <p className="text-sm text-muted">No contracted projects yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {contracted.map((k) => (
                <li
                  key={k.project.id}
                  className="rounded-lg border border-line bg-surface px-3 py-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/projects/${k.project.id}`}
                      className="font-semibold text-deep hover:text-teal-accent"
                    >
                      {k.project.name}
                    </Link>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {STAGE_LABELS[k.project.stage]}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-muted">Contract </span>
                      <span className="font-semibold text-deep">
                        {k.contractValue != null
                          ? formatMoneyCompact(k.contractValue)
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Margin </span>
                      <span className="font-semibold text-deep">
                        {k.margin != null
                          ? formatMoneyCompact(k.margin)
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Remaining cost </span>
                      <span className="font-semibold text-deep">
                        {k.remainingCost != null
                          ? formatMoneyCompact(k.remainingCost)
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Cash bal. </span>
                      <span className="font-semibold text-deep">
                        {formatMoneyCompact(k.cashBalance)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {k.nextPaymentDate && (
                      <span className="text-muted">
                        Next payment{" "}
                        <span className="font-semibold text-deep">
                          {formatMoneyCompact(k.nextPayment!.amount)} on{" "}
                          {new Date(
                            k.nextPaymentDate + "T00:00:00",
                          ).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </span>
                    )}
                    {k.overduePayments > 0 && (
                      <span className="rounded-full bg-amber-accent/15 px-2 py-0.5 font-semibold text-amber-accent">
                        {k.overduePayments} overdue payment
                        {k.overduePayments > 1 ? "s" : ""}
                      </span>
                    )}
                    {k.overdueExpenses > 0 && (
                      <span className="rounded-full bg-amber-accent/15 px-2 py-0.5 font-semibold text-amber-accent">
                        {k.overdueExpenses} overdue expense
                        {k.overdueExpenses > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-deep">
            Weighted pipeline
          </h2>
          <p className="mb-4 text-[11px] text-muted">
            Cold &amp; hot leads — never counted as contracted cash.
          </p>
          {pipeline.length === 0 ? (
            <p className="text-sm text-muted">No pipeline projects yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pipeline.map((k) => (
                <li
                  key={k.project.id}
                  className="rounded-lg border border-line bg-surface px-3 py-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/projects/${k.project.id}`}
                      className="font-semibold text-deep hover:text-teal-accent"
                    >
                      {k.project.name}
                    </Link>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-accent">
                      {STAGE_LABELS[k.project.stage]} · {k.probability}%
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted">Unweighted </span>
                      <span className="font-semibold text-deep">
                        {k.unweightedValue != null
                          ? formatMoneyCompact(k.unweightedValue)
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Weighted </span>
                      <span className="font-semibold text-amber-accent">
                        {k.weightedValue != null
                          ? formatMoneyCompact(k.weightedValue)
                          : "—"}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
