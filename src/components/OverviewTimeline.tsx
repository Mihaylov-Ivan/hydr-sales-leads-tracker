"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MILESTONE_LABELS, Project } from "@/lib/types";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    const m = n / 1_000_000;
    return `€${m.toFixed(m >= 10 || m % 1 === 0 ? 0 : 1)}M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `€${Math.round(n / 1_000)}k`;
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

function colorForIndex(index: number): string {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

type CashInflow = {
  id: string;
  projectId: string;
  projectName: string;
  client: string;
  amount: number;
  percent?: number;
  date: string;
  label?: string;
  milestoneLabel?: string;
  color: string;
};

function collectInflows(
  projects: Project[],
  colorById: Map<string, string>,
): CashInflow[] {
  const list: CashInflow[] = [];
  for (const p of projects) {
    const f = p.financials;
    const color = colorById.get(p.id) ?? PROJECT_COLORS[0];
    for (const pay of f.payments) {
      const linked = pay.milestoneId
        ? f.milestones.find((m) => m.id === pay.milestoneId)
        : undefined;
      list.push({
        id: `${p.id}-${pay.id}`,
        projectId: p.id,
        projectName: p.name,
        client: p.client,
        amount: pay.amount,
        ...(pay.percent != null ? { percent: pay.percent } : {}),
        date: linked?.date ?? pay.dueDate,
        ...(pay.label ? { label: pay.label } : {}),
        ...(linked
          ? { milestoneLabel: MILESTONE_LABELS[linked.kind] }
          : {}),
        color,
      });
    }
  }
  return list.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function projectHasPayments(p: Project): boolean {
  return p.financials.payments.length > 0;
}

const CHART_H = 220;
const PAD = { top: 16, right: 16, bottom: 36, left: 52 };

function CashChart({ inflows }: { inflows: CashInflow[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<{
    item: CashInflow;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      // Ignore 0-width flashes when the SVG unmounts during an empty selection
      if (next > 0) setWidth(next);
    });
    ro.observe(el);
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (inflows.length === 0) setHover(null);
  }, [inflows.length]);

  // Always keep this wrapper mounted so width measurements stay valid across
  // clear / re-select of projects.
  if (inflows.length === 0) {
    return (
      <div ref={wrapRef} className="w-full">
        <p className="rounded-lg border border-dashed border-line px-3 py-10 text-center text-sm text-muted">
          Select projects that have scheduled payments to see incoming cash over
          time.
        </p>
      </div>
    );
  }

  const times = inflows.map((i) => new Date(i.date + "T00:00:00").getTime());
  const rangeStart = startOfQuarter(Math.min(...times));
  const rangeEnd = nextQuarter(startOfQuarter(Math.max(...times)));
  const span = Math.max(rangeEnd - rangeStart, 1);
  const ticks = quarterTicks(rangeStart, rangeEnd);

  const chartW = Math.max(width, 320);
  const innerW = Math.max(chartW - PAD.left - PAD.right, 200);
  const innerH = CHART_H - PAD.top - PAD.bottom;

  const totalAll = inflows.reduce((s, i) => s + i.amount, 0);
  const maxAmount = Math.max(...inflows.map((i) => i.amount), 1);
  const scaleMax = Math.max(maxAmount, totalAll) * 1.12;
  const ySteps = 4;
  const scaleTicks = Array.from(
    { length: ySteps + 1 },
    (_, i) => (scaleMax * i) / ySteps,
  );

  function xOf(date: string): number {
    const t = new Date(date + "T00:00:00").getTime();
    return PAD.left + ((t - rangeStart) / span) * innerW;
  }

  function yScale(amount: number): number {
    return PAD.top + innerH - (amount / scaleMax) * innerH;
  }

  const byDate = new Map<string, CashInflow[]>();
  for (const item of inflows) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const barW = Math.min(28, Math.max(10, innerW / Math.max(inflows.length * 2, 8)));

  let running = 0;
  const cumPoints = inflows.map((item) => {
    running += item.amount;
    return { x: xOf(item.date), y: yScale(running), total: running };
  });
  const cumPath = cumPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        width="100%"
        height={CHART_H}
        viewBox={`0 0 ${chartW} ${CHART_H}`}
        className="overflow-visible"
        role="img"
        aria-label="Incoming payments over time"
      >
        {/* Grid + Y axis */}
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
                strokeDasharray={v === 0 ? undefined : "3 4"}
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

        {/* Cumulative line */}
        {cumPoints.length > 1 && (
          <path
            d={cumPath}
            fill="none"
            stroke="var(--deep)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.45}
          />
        )}
        {cumPoints.map((p, i) => (
          <circle
            key={`c-${i}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="var(--deep)"
            opacity={0.45}
          />
        ))}

        {/* Payment bars */}
        {[...byDate.entries()].flatMap(([date, items]) =>
          items.map((item, idx) => {
            const baseX = xOf(date);
            const offset = (idx - (items.length - 1) / 2) * (barW + 3);
            const x = baseX + offset - barW / 2;
            const y = yScale(item.amount);
            const h = PAD.top + innerH - y;
            return (
              <g key={item.id}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, 2)}
                  rx={3}
                  fill={item.color}
                  className="cursor-pointer transition-opacity hover:opacity-90"
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

        {/* X axis */}
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke="var(--line)"
          strokeWidth={1.5}
        />
        {ticks.map((t) => {
          const x =
            PAD.left + ((t - rangeStart) / span) * innerW;
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

      {/* Hover popup */}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-panel p-3 shadow-lg"
          style={{
            left: Math.min(Math.max(hover.x, 130), width - 130),
            top: Math.max(hover.y - 12, 8),
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Incoming payment
          </p>
          <p className="mt-1 text-lg font-bold text-deep">
            {formatMoney(hover.item.amount)}
            {hover.item.percent != null && (
              <span className="ml-1.5 text-sm font-semibold text-teal-accent">
                ({hover.item.percent}%)
              </span>
            )}
          </p>
          <div className="mt-2 space-y-1 text-sm">
            <p>
              <span className="text-muted">From </span>
              <span className="font-semibold text-ink">
                {hover.item.projectName}
              </span>
            </p>
            <p className="text-xs text-muted">{hover.item.client}</p>
            <p className="text-xs text-muted">
              Due {formatDate(hover.item.date)}
            </p>
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

export default function OverviewTimeline({ projects }: { projects: Project[] }) {
  const withPayments = useMemo(
    () =>
      [...projects]
        .filter(projectHasPayments)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const [selected, setSelected] = useState<Set<string> | null>(null);

  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(withPayments.map((p) => p.id));
      if (prev === null) return new Set(valid);
      return new Set([...prev].filter((id) => valid.has(id)));
    });
  }, [withPayments]);

  const selectedIds = selected ?? new Set(withPayments.map((p) => p.id));

  const selectedProjects = useMemo(
    () => withPayments.filter((p) => selectedIds.has(p.id)),
    [withPayments, selectedIds],
  );

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    selectedProjects.forEach((p, i) => map.set(p.id, colorForIndex(i)));
    return map;
  }, [selectedProjects]);

  const inflows = useMemo(
    () => collectInflows(selectedProjects, colorById),
    [selectedProjects, colorById],
  );

  const total = inflows.reduce((s, i) => s + i.amount, 0);
  const upcoming = inflows.find(
    (i) => new Date(i.date + "T00:00:00") >= new Date(new Date().toDateString()),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const base = prev ?? new Set(withPayments.map((p) => p.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (withPayments.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
          Cash in
        </h2>
        <p className="mt-3 text-sm text-muted">
          No scheduled payments yet. Add payment milestones on a project to see
          incoming cash over time here.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
            Cash in
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Scheduled payments across selected projects
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-right">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Total scheduled
            </p>
            <p className="text-lg font-bold text-deep">{formatMoney(total)}</p>
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

      <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
        {withPayments.map((p, i) => {
          const on = selectedIds.has(p.id);
          const activeIndex = selectedProjects.findIndex((s) => s.id === p.id);
          const chipColor =
            activeIndex >= 0 ? colorForIndex(activeIndex) : colorForIndex(i);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                on
                  ? "border-transparent text-white shadow-sm"
                  : "border-line bg-surface text-muted hover:border-teal-accent/40"
              }`}
              style={on ? { backgroundColor: chipColor } : undefined}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: on ? "#fff" : chipColor }}
              />
              <span className="truncate">{p.name}</span>
            </button>
          );
        })}
        <div className="ml-auto flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setSelected(new Set(withPayments.map((p) => p.id)))}
            className="font-semibold text-teal-accent hover:underline"
          >
            All
          </button>
          <span className="text-line">|</span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="font-semibold text-muted hover:text-ink hover:underline"
          >
            Clear
          </button>
        </div>
      </div>

      <CashChart inflows={inflows} />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span>Bars = individual payments · Line = cumulative cash in</span>
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
