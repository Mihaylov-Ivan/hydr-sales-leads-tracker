"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { findLinkableDeadline, projectLinkableDeadlines } from "@/lib/gantt-finance";
import { Project } from "@/lib/types";

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

const INCOME_COLOR = "#009e98";
const EXPENSE_COLOR = "#c45c26";
const PROFIT_COLOR = "#14545c";

function colorForIndex(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
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

function collectFlows(
  projects: Project[],
  colorById: Map<string, string>,
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
    for (const exp of f.expenseSchedule ?? []) {
      const linked = findLinkableDeadline(exp.milestoneId, deadlines);
      const percent = resolveContractPercent(exp.amount, cv, exp.percent);
      const expectedDate = linked?.date ?? exp.dueDate;
      const received = Boolean(exp.actualDate);
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
        ...(exp.label ? { label: exp.label } : {}),
        ...(linked ? { milestoneLabel: linked.label } : {}),
        color,
      });
    }
  }
  return list.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function projectHasCashFlows(p: Project): boolean {
  return (
    p.financials.payments.length > 0 ||
    (p.financials.expenseSchedule?.length ?? 0) > 0
  );
}

const CHART_H = 260;
const PAD = { top: 20, right: 16, bottom: 36, left: 52 };

function CashChart({
  flows,
  showIncome,
  showExpenses,
  showProfit,
}: {
  flows: CashFlow[];
  showIncome: boolean;
  showExpenses: boolean;
  showProfit: boolean;
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

  if (!showIncome && !showExpenses && !showProfit) {
    return (
      <div ref={wrapRef} className="w-full">
        <p className="rounded-lg border border-dashed border-line px-3 py-10 text-center text-sm text-muted">
          Enable Income, Expenses, or Profit above to display the chart.
        </p>
      </div>
    );
  }

  if (flows.length === 0) {
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

  const times = flows.map((i) => new Date(i.date + "T00:00:00").getTime());
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
  // Cumulative line when a single series is selected (or profit alongside bars)
  const showCumLine = onlyIncome || onlyExpenses || showProfit;

  type CumPt = { date: string; total: number; x: number; y: number };
  let runIncome = 0;
  let runExpense = 0;
  const cumIncome: CumPt[] = [];
  const cumExpense: CumPt[] = [];
  const cumProfit: CumPt[] = [];
  for (const f of flows) {
    if (f.kind === "income") {
      runIncome += f.amount;
      cumIncome.push({ date: f.date, total: runIncome, x: 0, y: 0 });
    } else {
      runExpense += f.amount;
      // Negative so the line tracks below the axis with expense bars
      cumExpense.push({ date: f.date, total: -runExpense, x: 0, y: 0 });
    }
    cumProfit.push({
      date: f.date,
      total: runIncome - runExpense,
      x: 0,
      y: 0,
    });
  }

  const activeCum: CumPt[] = onlyIncome
    ? cumIncome
    : onlyExpenses
      ? cumExpense
      : showProfit
        ? cumProfit
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
    1,
  );
  const scaleMax = maxAbs * 1.15;
  const ySteps = 4;
  // Symmetric scale around 0 so expenses can go below the axis
  const scaleTicks = Array.from({ length: ySteps * 2 + 1 }, (_, i) => {
    return -scaleMax + (scaleMax * 2 * i) / (ySteps * 2);
  });

  function xOf(date: string): number {
    const t = new Date(date + "T00:00:00").getTime();
    return PAD.left + ((t - rangeStart) / span) * innerW;
  }

  const zeroY = PAD.top + innerH / 2;

  function yScale(amount: number): number {
    // positive up from center, negative down
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
            return (
              <g key={item.id}>
                <rect
                  x={x}
                  y={top}
                  width={barW}
                  height={h}
                  rx={3}
                  fill={fill}
                  opacity={item.received ? 0.95 : 0.45}
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
                {item.percent != null && (
                  <text
                    x={x + barW / 2}
                    y={item.kind === "income" ? top - 4 : top + h + 11}
                    textAnchor="middle"
                    className="fill-muted"
                    style={{ fontSize: 9, fontWeight: 700 }}
                  >
                    {item.percent % 1 === 0
                      ? `${item.percent}%`
                      : `${item.percent.toFixed(1)}%`}
                  </text>
                )}
              </g>
            );
          }),
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
          </p>
          <p className="mt-1 text-lg font-bold text-deep">
            {formatMoney(hover.item.amount)}
            {hover.item.percent != null && (
              <span className="ml-1.5 text-sm font-semibold text-teal-accent">
                (
                {hover.item.percent % 1 === 0
                  ? hover.item.percent
                  : hover.item.percent.toFixed(1)}
                % of contract)
              </span>
            )}
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

function ProjectMultiSelect({
  projects,
  selectedIds,
  colorById,
  onToggle,
  onSelectAll,
  onClear,
}: {
  projects: Project[];
  selectedIds: Set<string>;
  colorById: Map<string, string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = selectedIds.size;
  const label =
    count === 0
      ? "No projects"
      : count === projects.length
        ? "All projects"
        : count === 1
          ? (projects.find((p) => selectedIds.has(p.id))?.name ?? "1 project")
          : `${count} projects`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[16rem] items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm outline-none transition hover:border-teal-accent/40 focus:border-teal-accent"
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-muted" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 z-30 mt-1 w-72 max-w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-panel shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Projects
            </span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={onSelectAll}
                className="font-semibold text-teal-accent hover:underline"
              >
                All
              </button>
              <span className="text-line">|</span>
              <button
                type="button"
                onClick={onClear}
                className="font-semibold text-muted hover:text-ink hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {projects.map((p, i) => {
              const on = selectedIds.has(p.id);
              const color = colorById.get(p.id) ?? colorForIndex(i);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => onToggle(p.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-surface"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                        on
                          ? "border-transparent text-white"
                          : "border-line bg-panel text-transparent"
                      }`}
                      style={on ? { backgroundColor: color } : undefined}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">
                      {p.name}
                    </span>
                    {p.client && (
                      <span className="max-w-[40%] truncate text-xs text-muted">
                        {p.client}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function OverviewTimeline({ projects }: { projects: Project[] }) {
  const withFlows = useMemo(
    () =>
      [...projects]
        .filter(projectHasCashFlows)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

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

  const flows = useMemo(
    () => collectFlows(selectedProjects, colorById),
    [selectedProjects, colorById],
  );

  const totalIncome = flows
    .filter((f) => f.kind === "income")
    .reduce((s, i) => s + i.amount, 0);
  const totalExpense = flows
    .filter((f) => f.kind === "expense")
    .reduce((s, i) => s + i.amount, 0);
  const totalProfit = totalIncome - totalExpense;

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

  if (withFlows.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
          Cash flow
        </h2>
        <p className="mt-3 text-sm text-muted">
          No cash flows yet. Upload actuals on Finance, or add future payments
          and expenses on a project page.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
            Cash flow
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Scheduled and actual income/expenses across selected projects
            (Excel actuals + in-app forecasts)
          </p>
        </div>
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
              Profit
            </p>
            <p className="text-lg font-bold text-deep">
              {formatMoney(totalProfit)}
            </p>
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
            label="Profit"
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
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span>
          Up = income · Down = expenses · Solid = received/paid · Outline =
          expected · Line = cumulative
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
    </section>
  );
}
