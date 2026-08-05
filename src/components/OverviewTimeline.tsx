"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { findLinkableDeadline, projectLinkableDeadlines } from "@/lib/gantt-finance";
import ProjectMultiSelect, {
  colorForProjectIndex,
} from "@/components/ProjectMultiSelect";
import {
  CASH_EXPENSE_CATEGORIES,
  CompanyFinanceSettings,
  Project,
  companyMonthlyCashTotal,
  normalizeCompanyMonthlyExpense,
  normalizeProjectExpense,
} from "@/lib/types";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}€${m.toFixed(m >= 10 || m % 1 === 0 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}k`;
  return formatMoney(n);
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function startOfQuarter(ms: number): number {
  const d = new Date(ms);
  const month = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), month, 1).getTime();
}

function nextQuarter(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 3, 1).getTime();
}

function quarterTicks(rangeStart: number, rangeEnd: number): number[] {
  const ticks: number[] = [];
  let t = rangeStart;
  while (t <= rangeEnd) {
    ticks.push(t);
    t = nextQuarter(t);
  }
  return ticks;
}

function formatQuarter(ms: number): string {
  const d = new Date(ms);
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${month} ${d.getFullYear()}`;
}

const INCOME_COLOR = "#009e98";
const EXPENSE_COLOR = "#c45c26";
const PROFIT_COLOR = "#14545c";

const PROJECT_COLORS = [
  "#009e98",
  "#b4be35",
  "#d99a06",
  "#2f8f4e",
  "#14545c",
  "#c45c26",
  "#3d7ea6",
  "#8a6d3b",
  "#5a8f7b",
  "#a35d6a",
];

function colorForIndex(index: number): string {
  return colorForProjectIndex(index);
}

type FlowKind = "income" | "expense";

type CashFlow = {
  id: string;
  kind: FlowKind;
  projectId: string;
  projectName: string;
  client: string;
  amount: number;
  percent?: number;
  date: string;
  /** Expected/scheduled date (linked deadline or due date) */
  expectedDate: string;
  received: boolean;
  label?: string;
  milestoneLabel?: string;
  color: string;
};

/** Stored % if present; else amount ÷ contract value when contract value is set. */
function resolveContractPercent(
  amount: number,
  contractValue: number | null | undefined,
  stored?: number,
): number | undefined {
  if (stored != null && Number.isFinite(stored)) return stored;
  if (contractValue == null || !(contractValue > 0) || !(amount > 0)) {
    return undefined;
  }
  const raw = (amount / contractValue) * 100;
  return Math.round(raw * 10) / 10;
}

function asOfMonthStart(asOf?: string | null): string | null {
  if (!asOf) return null;
  const key = asOf.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? `${key}-01` : null;
}

function collectFlows(
  projects: Project[],
  colorById: Map<string, string>,
  financeSettings?: CompanyFinanceSettings | null,
): CashFlow[] {
  const list: CashFlow[] = [];
  for (const p of projects) {
    const f = p.financials;
    const color = colorById.get(p.id) ?? PROJECT_COLORS[0];
    const cv = f.contractValue;
    const deadlines = projectLinkableDeadlines(p);
    for (const pay of f.payments) {
      const linked = findLinkableDeadline(pay.milestoneId, deadlines);
      const percent = resolveContractPercent(pay.amount, cv, pay.percent);
      const expectedDate = linked?.date ?? pay.dueDate;
      const received = Boolean(pay.actualDate);
      list.push({
        id: `in-${p.id}-${pay.id}`,
        kind: "income",
        projectId: p.id,
        projectName: p.name,
        client: p.client,
        amount: pay.amount,
        ...(percent != null ? { percent } : {}),
        date: pay.actualDate ?? expectedDate,
        expectedDate,
        received,
        ...(pay.label ? { label: pay.label } : {}),
        ...(linked ? { milestoneLabel: linked.label } : {}),
        color,
      });
    }
    for (const raw of f.expenseSchedule ?? []) {
      const exp = normalizeProjectExpense(raw);
      const category = exp.category ?? "materials";
      if (!CASH_EXPENSE_CATEGORIES.has(category)) continue;

      const linked = findLinkableDeadline(exp.milestoneId, deadlines);
      const percent = resolveContractPercent(exp.amount, cv, exp.percent);
      const expectedDate = linked?.date ?? exp.dueDate;
      const received = Boolean(exp.actualDate);
      const typeLabel =
        category === "installation" ? "Installation" : "Materials";
      list.push({
        id: `out-${p.id}-${exp.id}`,
        kind: "expense",
        projectId: p.id,
        projectName: p.name,
        client: p.client,
        amount: exp.amount,
        ...(percent != null ? { percent } : {}),
        date: exp.actualDate ?? expectedDate,
        expectedDate,
        received,
        label: exp.label
          ? `${typeLabel} · ${exp.label}`
          : typeLabel,
        ...(linked ? { milestoneLabel: linked.label } : {}),
        color,
      });
    }
  }

  if (financeSettings) {
    for (const raw of financeSettings.monthlyExpenses ?? []) {
      const opex = normalizeCompanyMonthlyExpense(raw);
      if (!opex) continue;
      const total = companyMonthlyCashTotal(opex);
      if (total <= 0) continue;
      const parts: string[] = [];
      if (opex.fixedMonthly > 0) {
        parts.push(`Fixed monthly ${formatMoney(opex.fixedMonthly)}`);
      }
      // Mid-month so company costs sit visibly in the month on the chart
      const date = `${opex.month}-15`;
      list.push({
        id: `company-opex-${opex.month}`,
        kind: "expense",
        projectId: "__company__",
        projectName: "Company",
        client: "",
        amount: total,
        date,
        expectedDate: date,
        received: opex.status === "actual",
        label: parts.join(" · ") || "Company",
        color: EXPENSE_COLOR,
      });
    }
  }

  return list.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function projectHasCashFlows(p: Project): boolean {
  const hasPayments = p.financials.payments.length > 0;
  const hasCashExpenses = (p.financials.expenseSchedule ?? []).some((e) =>
    CASH_EXPENSE_CATEGORIES.has(
      normalizeProjectExpense(e).category ?? "materials",
    ),
  );
  return hasPayments || hasCashExpenses;
}

const CHART_H = 260;
const PAD = { top: 20, right: 16, bottom: 36, left: 52 };

function CashChart({
  flows,
  showIncome,
  showExpenses,
  showProfit,
  openingCash = 0,
  asOfDate = null,
  cashLineStartDate = null,
}: {
  flows: CashFlow[];
  showIncome: boolean;
  showExpenses: boolean;
  showProfit: boolean;
  /** Bank balance at `cashLineStartDate` (already rolled forward if the view starts after as-of). */
  openingCash?: number;
  /** yyyy-mm-dd — flows before this are shown as bars but excluded from the cash line. */
  asOfDate?: string | null;
  /** yyyy-mm-dd — where the cash line begins on the chart. */
  cashLineStartDate?: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<{
    item: CashFlow;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (next > 0) setWidth(next);
    });
    ro.observe(el);
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (flows.length === 0) setHover(null);
  }, [flows.length]);

  const visible = flows.filter(
    (f) =>
      (f.kind === "income" && showIncome) ||
      (f.kind === "expense" && showExpenses),
  );

  const cashStart = cashLineStartDate ?? asOfDate;
  const hasBaseline = Boolean(cashStart);
  const baselineCash = hasBaseline ? openingCash : 0;

  if (!showIncome && !showExpenses && !showProfit) {
    return (
      <div ref={wrapRef} className="w-full">
        <p className="rounded-lg border border-dashed border-line px-3 py-10 text-center text-sm text-muted">
          Enable Income, Expenses, or Cash above to display the chart.
        </p>
      </div>
    );
  }

  if (flows.length === 0 && !hasBaseline) {
    return (
      <div ref={wrapRef} className="w-full">
        <p className="rounded-lg border border-dashed border-line px-3 py-10 text-center text-sm text-muted">
          Select projects that have scheduled payments or expenses to see cash
          flow over time.
        </p>
      </div>
    );
  }

  if (visible.length === 0 && !showProfit) {
    return (
      <div ref={wrapRef} className="w-full">
        <p className="rounded-lg border border-dashed border-line px-3 py-10 text-center text-sm text-muted">
          No flows match the enabled series. Turn on Income or Expenses, or add
          schedule items on a project.
        </p>
      </div>
    );
  }

  const times = [
    ...flows.map((i) => new Date(i.date + "T00:00:00").getTime()),
    ...(cashStart ? [new Date(cashStart + "T00:00:00").getTime()] : []),
    ...(asOfDate ? [new Date(asOfDate + "T00:00:00").getTime()] : []),
  ];
  const rangeStart = startOfQuarter(Math.min(...times));
  const rangeEnd = nextQuarter(startOfQuarter(Math.max(...times)));
  const span = Math.max(rangeEnd - rangeStart, 1);
  const ticks = quarterTicks(rangeStart, rangeEnd);

  const chartW = Math.max(width, 320);
  const innerW = Math.max(chartW - PAD.left - PAD.right, 200);
  const innerH = CHART_H - PAD.top - PAD.bottom;

  const seriesOn =
    (showIncome ? 1 : 0) + (showExpenses ? 1 : 0) + (showProfit ? 1 : 0);
  const onlyIncome = seriesOn === 1 && showIncome;
  const onlyExpenses = seriesOn === 1 && showExpenses;
  const showCumLine = onlyIncome || onlyExpenses || showProfit;

  type CumPt = { date: string; total: number; x: number; y: number };
  let runIncome = 0;
  let runExpense = 0;
  let cashIncome = 0;
  let cashExpense = 0;
  const cumIncome: CumPt[] = [];
  const cumExpense: CumPt[] = [];
  const cumCash: CumPt[] = [];
  if (hasBaseline && cashStart) {
    cumCash.push({ date: cashStart, total: baselineCash, x: 0, y: 0 });
  }
  for (const f of flows) {
    if (f.kind === "income") {
      runIncome += f.amount;
      cumIncome.push({ date: f.date, total: runIncome, x: 0, y: 0 });
    } else {
      runExpense += f.amount;
      cumExpense.push({ date: f.date, total: -runExpense, x: 0, y: 0 });
    }
    // Cash line only from as-of onward (pre-as-of bars stay disconnected)
    const countsForCash = !asOfDate || f.date >= asOfDate;
    if (countsForCash && hasBaseline) {
      if (f.kind === "income") cashIncome += f.amount;
      else cashExpense += f.amount;
      cumCash.push({
        date: f.date,
        total: baselineCash + cashIncome - cashExpense,
        x: 0,
        y: 0,
      });
    } else if (!hasBaseline) {
      cumCash.push({
        date: f.date,
        total: runIncome - runExpense,
        x: 0,
        y: 0,
      });
    }
  }

  const activeCum: CumPt[] = onlyIncome
    ? cumIncome
    : onlyExpenses
      ? cumExpense
      : showProfit
        ? cumCash
        : [];
  const cumColor = onlyIncome
    ? INCOME_COLOR
    : onlyExpenses
      ? EXPENSE_COLOR
      : PROFIT_COLOR;

  const barAmounts = visible.map((v) => v.amount);
  const cumExtents = showCumLine ? activeCum.map((p) => p.total) : [];
  const maxAbs = Math.max(
    ...barAmounts,
    ...cumExtents.map(Math.abs),
    hasBaseline ? Math.abs(baselineCash) : 0,
    1,
  );
  const scaleMax = maxAbs * 1.15;
  const ySteps = 4;
  const scaleTicks = Array.from({ length: ySteps * 2 + 1 }, (_, i) => {
    return -scaleMax + (scaleMax * 2 * i) / (ySteps * 2);
  });

  function xOf(date: string): number {
    const t = new Date(date + "T00:00:00").getTime();
    return PAD.left + ((t - rangeStart) / span) * innerW;
  }

  const zeroY = PAD.top + innerH / 2;

  function yScale(amount: number): number {
    return zeroY - (amount / scaleMax) * (innerH / 2);
  }

  for (const p of activeCum) {
    p.x = xOf(p.date);
    p.y = yScale(p.total);
  }
  const cumPath = activeCum
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const byDate = new Map<string, CashFlow[]>();
  for (const item of visible) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const barW = Math.min(
    22,
    Math.max(8, innerW / Math.max(visible.length * 2.2, 8)),
  );

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        width="100%"
        height={CHART_H}
        viewBox={`0 0 ${chartW} ${CHART_H}`}
        className="overflow-visible"
        role="img"
        aria-label="Cash flow over time"
      >
        {scaleTicks.map((v) => {
          const y = yScale(v);
          return (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={PAD.left + innerW}
                y1={y}
                y2={y}
                stroke="var(--line)"
                strokeWidth={1}
                strokeDasharray={Math.abs(v) < 1e-9 ? undefined : "3 4"}
                opacity={Math.abs(v) < 1e-9 ? 1 : 0.7}
              />
              <text
                x={PAD.left - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-muted"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {formatCompact(v)}
              </text>
            </g>
          );
        })}

        {/* Zero axis emphasis */}
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--deep)"
          strokeWidth={1.25}
          opacity={0.35}
        />

        {/* Cumulative line (single series, or profit whenever enabled) */}
        {showCumLine && activeCum.length > 0 && (
          <>
            <path
              d={cumPath}
              fill="none"
              stroke={cumColor}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {activeCum.map((p, i) => (
              <circle
                key={`cum-${i}`}
                cx={p.x}
                cy={p.y}
                r={3.5}
                fill={cumColor}
              />
            ))}
          </>
        )}

        {/* Income / expense bars */}
        {[...byDate.entries()].flatMap(([date, items]) =>
          items.map((item, idx) => {
            const baseX = xOf(date);
            const offset = (idx - (items.length - 1) / 2) * (barW + 3);
            const x = baseX + offset - barW / 2;
            const signed = item.kind === "income" ? item.amount : -item.amount;
            const y1 = yScale(signed);
            const y2 = zeroY;
            const top = Math.min(y1, y2);
            const h = Math.max(Math.abs(y1 - y2), 2);
            const fill = item.kind === "income" ? INCOME_COLOR : EXPENSE_COLOR;
            const beforeAsOf = Boolean(asOfDate && item.date < asOfDate);
            return (
              <g key={item.id}>
                <rect
                  x={x}
                  y={top}
                  width={barW}
                  height={h}
                  rx={3}
                  fill={fill}
                  opacity={
                    beforeAsOf
                      ? item.received
                        ? 0.35
                        : 0.2
                      : item.received
                        ? 0.95
                        : 0.45
                  }
                  stroke={item.received ? "none" : fill}
                  strokeWidth={item.received ? 0 : 1.25}
                  strokeDasharray={item.received ? undefined : "3 2"}
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    const rect = wrapRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setHover({
                      item,
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    });
                  }}
                  onMouseMove={(e) => {
                    const rect = wrapRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setHover({
                      item,
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }),
        )}

        {asOfDate && showProfit && (
          <g>
            <line
              x1={xOf(asOfDate)}
              x2={xOf(asOfDate)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke={PROFIT_COLOR}
              strokeWidth={1.25}
              strokeDasharray="4 3"
              opacity={0.55}
            />
            <text
              x={xOf(asOfDate) + 4}
              y={PAD.top + 10}
              className="fill-muted"
              style={{ fontSize: 9, fontWeight: 700 }}
            >
              As of
            </text>
          </g>
        )}

        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke="var(--line)"
          strokeWidth={1.5}
        />
        {ticks.map((t) => {
          const x = PAD.left + ((t - rangeStart) / span) * innerW;
          return (
            <g key={t}>
              <line
                x1={x}
                x2={x}
                y1={PAD.top + innerH}
                y2={PAD.top + innerH + 5}
                stroke="var(--line)"
              />
              <text
                x={x}
                y={PAD.top + innerH + 18}
                textAnchor={
                  t === rangeStart ? "start" : t === rangeEnd ? "end" : "middle"
                }
                className="fill-muted"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {formatQuarter(t)}
              </text>
            </g>
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-panel p-3 shadow-lg"
          style={{
            left: Math.min(Math.max(hover.x, 130), chartW - 130),
            top: Math.max(hover.y - 12, 8),
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {hover.item.kind === "income" ? "Incoming payment" : "Expense"}
            {asOfDate && hover.item.date < asOfDate ? " · before as of" : ""}
          </p>
          <p className="mt-1 text-lg font-bold text-deep">
            {formatMoney(hover.item.amount)}
          </p>
          <div className="mt-2 space-y-1 text-sm">
            <p>
              <span className="text-muted">
                {hover.item.kind === "income" ? "From " : "On "}
              </span>
              <span className="font-semibold text-ink">
                {hover.item.projectName}
              </span>
            </p>
            <p className="text-xs text-muted">{hover.item.client}</p>
            <p className="text-xs text-muted">
              {hover.item.received
                ? hover.item.kind === "income"
                  ? `Received ${formatDate(hover.item.date)}`
                  : `Paid ${formatDate(hover.item.date)}`
                : `Expected ${formatDate(hover.item.date)}`}
            </p>
            {!hover.item.received && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-accent">
                Not yet {hover.item.kind === "income" ? "received" : "paid"}
              </p>
            )}
            {hover.item.received &&
              hover.item.expectedDate !== hover.item.date && (
                <p className="text-xs text-muted">
                  Scheduled {formatDate(hover.item.expectedDate)}
                </p>
              )}
            {hover.item.label && (
              <p className="text-xs text-ink">{hover.item.label}</p>
            )}
            {hover.item.milestoneLabel && (
              <p className="text-xs font-semibold text-teal-accent">
                Tied to {hover.item.milestoneLabel}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SeriesToggle({
  label,
  color,
  on,
  onToggle,
}: {
  label: string;
  color: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        on
          ? "border-transparent text-white shadow-sm"
          : "border-line bg-surface text-muted hover:border-teal-accent/40"
      }`}
      style={on ? { backgroundColor: color } : undefined}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: on ? "#fff" : color }}
      />
      {label}
    </button>
  );
}

export default function OverviewTimeline({
  projects,
  embedded = false,
  financeSettings = null,
}: {
  projects: Project[];
  /** Skip outer card chrome when nested in a parent panel. */
  embedded?: boolean;
  /** When set, company fixed monthly costs are included as cash outflows. */
  financeSettings?: CompanyFinanceSettings | null;
}) {
  const withFlows = useMemo(
    () =>
      [...projects]
        .filter(projectHasCashFlows)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const hasCompanyOpex = useMemo(() => {
    if (!financeSettings) return false;
    return (financeSettings.monthlyExpenses ?? []).some((raw) => {
      const opex = normalizeCompanyMonthlyExpense(raw);
      return opex != null && companyMonthlyCashTotal(opex) > 0;
    });
  }, [financeSettings]);

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [showIncome, setShowIncome] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const prevFlowIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const valid = new Set(withFlows.map((p) => p.id));
    const prevFlowIds = prevFlowIdsRef.current;
    setSelected((prev) => {
      if (prev === null) return new Set(valid);
      const next = new Set([...prev].filter((id) => valid.has(id)));
      // Auto-include projects that newly gained cash lines
      for (const id of valid) {
        if (!prevFlowIds.has(id)) next.add(id);
      }
      return next;
    });
    prevFlowIdsRef.current = valid;
  }, [withFlows]);

  const selectedIds = selected ?? new Set(withFlows.map((p) => p.id));

  const selectedProjects = useMemo(
    () => withFlows.filter((p) => selectedIds.has(p.id)),
    [withFlows, selectedIds],
  );

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    selectedProjects.forEach((p, i) => map.set(p.id, colorForIndex(i)));
    return map;
  }, [selectedProjects]);

  const asOfDate = asOfMonthStart(financeSettings?.openingCashAsOf);
  const openingCash = financeSettings?.openingCash ?? 0;

  const allFlows = useMemo(
    () =>
      collectFlows(
        selectedProjects,
        colorById,
        // Company opex always included when settings provided (independent of project selection)
        financeSettings,
      ),
    [selectedProjects, colorById, financeSettings],
  );

  const dataMonthBounds = useMemo(() => {
    const months = allFlows.map((f) => f.date.slice(0, 7));
    if (asOfDate) months.push(asOfDate.slice(0, 7));
    if (months.length === 0) {
      const today = new Date();
      const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      return { from: cur, to: cur };
    }
    months.sort();
    return { from: months[0], to: months[months.length - 1] };
  }, [allFlows, asOfDate]);

  const [chartFrom, setChartFrom] = useState<string | null>(null);
  const [chartTo, setChartTo] = useState<string | null>(null);

  const viewFrom = chartFrom ?? dataMonthBounds.from;
  const viewTo = chartTo ?? dataMonthBounds.to;
  const orderedFrom = viewFrom <= viewTo ? viewFrom : viewTo;
  const orderedTo = viewFrom <= viewTo ? viewTo : viewFrom;
  const rangeStartDay = `${orderedFrom}-01`;

  const flows = useMemo(
    () =>
      allFlows.filter((f) => {
        const m = f.date.slice(0, 7);
        return m >= orderedFrom && m <= orderedTo;
      }),
    [allFlows, orderedFrom, orderedTo],
  );

  /** Opening cash at the chart cash-line start (rolled forward if view begins after as-of). */
  const chartOpeningCash = useMemo(() => {
    if (!asOfDate) return 0;
    let cash = openingCash;
    if (rangeStartDay > asOfDate) {
      for (const f of allFlows) {
        if (f.date >= asOfDate && f.date < rangeStartDay) {
          cash += f.kind === "income" ? f.amount : -f.amount;
        }
      }
    }
    return cash;
  }, [asOfDate, openingCash, rangeStartDay, allFlows]);

  const cashLineStartDate = useMemo(() => {
    if (!asOfDate) return null;
    return asOfDate < rangeStartDay ? rangeStartDay : asOfDate;
  }, [asOfDate, rangeStartDay]);

  const cashFlowsInView = useMemo(
    () =>
      asOfDate ? flows.filter((f) => f.date >= asOfDate) : flows,
    [flows, asOfDate],
  );

  const totalIncome = flows
    .filter((f) => f.kind === "income")
    .reduce((s, i) => s + i.amount, 0);
  const totalExpense = flows
    .filter((f) => f.kind === "expense")
    .reduce((s, i) => s + i.amount, 0);
  const totalCash = asOfDate
    ? chartOpeningCash +
      cashFlowsInView
        .filter((f) => f.kind === "income")
        .reduce((s, i) => s + i.amount, 0) -
      cashFlowsInView
        .filter((f) => f.kind === "expense")
        .reduce((s, i) => s + i.amount, 0)
    : totalIncome - totalExpense;

  const upcoming = flows
    .filter((f) => f.kind === "income")
    .find(
      (i) =>
        new Date(i.date + "T00:00:00") >= new Date(new Date().toDateString()),
    );

  function toggle(id: string) {
    setSelected((prev) => {
      const base = prev ?? new Set(withFlows.map((p) => p.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (withFlows.length === 0 && !hasCompanyOpex && !asOfDate) {
    const emptyBody = (
      <>
        {!embedded && (
          <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
            Cash flow
          </h2>
        )}
        <p className={embedded ? "text-sm text-muted" : "mt-3 text-sm text-muted"}>
          No cash flows yet. Upload actuals on Finance, or add future payments
          and expenses on a project page.
        </p>
      </>
    );
    if (embedded) return <div>{emptyBody}</div>;
    return (
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        {emptyBody}
      </section>
    );
  }

  const body = (
    <>
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        {!embedded ? (
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
              Cash flow
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Scheduled and actual income/expenses across selected projects
              (Excel actuals + in-app forecasts)
            </p>
          </div>
        ) : (
          <div />
        )}
        <div className="flex flex-wrap gap-4 text-right">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Income
            </p>
            <p className="text-lg font-bold text-teal-accent">
              {formatMoney(totalIncome)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Expenses
            </p>
            <p className="text-lg font-bold" style={{ color: EXPENSE_COLOR }}>
              {formatMoney(totalExpense)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {asOfDate ? "Cash" : "Profit"}
            </p>
            <p className="text-lg font-bold text-deep">
              {formatMoney(totalCash)}
            </p>
            {asOfDate && (
              <p className="text-[10px] text-muted">
                opening {formatMoney(openingCash)} · as of{" "}
                {formatDate(asOfDate)}
              </p>
            )}
          </div>
          {upcoming && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Next inflow
              </p>
              <p className="text-lg font-bold text-teal-accent">
                {formatMoney(upcoming.amount)}
              </p>
              <p className="text-[10px] text-muted">
                {formatDate(upcoming.date)} · {upcoming.projectName}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mb-3 mt-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Projects
          </span>
          <ProjectMultiSelect
            projects={withFlows}
            selectedIds={selectedIds}
            colorById={colorById}
            onToggle={toggle}
            onSelectAll={() =>
              setSelected(new Set(withFlows.map((p) => p.id)))
            }
            onClear={() => setSelected(new Set())}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            From
          </span>
          <input
            type="month"
            value={orderedFrom}
            onChange={(e) => setChartFrom(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink outline-none focus:border-teal-accent"
          />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            To
          </span>
          <input
            type="month"
            value={orderedTo}
            onChange={(e) => setChartTo(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink outline-none focus:border-teal-accent"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Show
          </span>
          <SeriesToggle
            label="Income"
            color={INCOME_COLOR}
            on={showIncome}
            onToggle={() => setShowIncome((v) => !v)}
          />
          <SeriesToggle
            label="Expenses"
            color={EXPENSE_COLOR}
            on={showExpenses}
            onToggle={() => setShowExpenses((v) => !v)}
          />
          <SeriesToggle
            label={asOfDate ? "Cash" : "Profit"}
            color={PROFIT_COLOR}
            on={showProfit}
            onToggle={() => setShowProfit((v) => !v)}
          />
        </div>
      </div>

      <CashChart
        flows={flows}
        showIncome={showIncome}
        showExpenses={showExpenses}
        showProfit={showProfit}
        openingCash={chartOpeningCash}
        asOfDate={asOfDate}
        cashLineStartDate={cashLineStartDate}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span>
          Up = income · Down = expenses · Solid = received/paid · Outline =
          expected
          {asOfDate
            ? " · Bars before As of are history only · Line = cash from opening"
            : " · Line = cumulative"}
        </span>
        {selectedProjects.length === 1 && (
          <Link
            href={`/projects/${selectedProjects[0].id}`}
            className="normal-case tracking-normal text-teal-accent hover:underline"
          >
            Open {selectedProjects[0].name} →
          </Link>
        )}
      </div>
    </>
  );

  if (embedded) return <div>{body}</div>;
  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      {body}
    </section>
  );
}
