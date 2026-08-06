"use client";

import { useMemo, useRef, useState } from "react";
import { STAGE_LABELS, todayDate } from "@/lib/types";
import {
  PRODUCTION_MILESTONE_COLORS,
  PRODUCTION_TASK_COLORS,
  ProductionBar,
  ProductionProjectLane,
  barOverlapsMonth,
  formatMonthLabel,
} from "@/lib/production-gantt";
import { monthKeysBetween } from "@/lib/finance-plan";
import { colorForProjectIndex } from "@/components/ProjectMultiSelect";

const LABEL_W = 200;
const ROW_H = 44;
const PAD = { top: 44, bottom: 16, right: 16 };
const MILESTONE_HIT = 8;

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function monthStartMs(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y!, m! - 1, 1).getTime();
}

function nextMonthMs(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y!, m!, 1).getTime();
}

function darkenHex(hex: string, amount = 0.22): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function barDetail(bar: ProductionBar): string {
  if (bar.kind === "deadline") {
    return `Milestone${bar.phaseName ? ` · ${bar.phaseName}` : ""} · ${formatDate(bar.startDate)}`;
  }
  return `Task${bar.phaseName ? ` · ${bar.phaseName}` : ""} · ${formatDate(bar.startDate)} – ${formatDate(bar.endDate)}`;
}

type HoverState = {
  projectName: string;
  items: ProductionBar[];
  x: number;
  y: number;
};

export default function ProductionCombinedGantt({
  lanes,
  fromMonth,
  toMonth,
  colorById,
}: {
  lanes: ProductionProjectLane[];
  fromMonth: string;
  toMonth: string;
  colorById: Map<string, string>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  const months = useMemo(
    () => monthKeysBetween(fromMonth, toMonth),
    [fromMonth, toMonth],
  );

  const rangeStart = monthStartMs(fromMonth);
  const rangeEnd = nextMonthMs(toMonth);
  const span = Math.max(rangeEnd - rangeStart, 1);
  const today = todayDate();

  const chartW = Math.max(720, LABEL_W + months.length * 72 + PAD.right);
  const trackW = chartW - LABEL_W - PAD.right;
  const chartH = PAD.top + lanes.length * ROW_H + PAD.bottom;

  function xOfDate(iso: string): number {
    const t = new Date(iso + "T00:00:00").getTime();
    return LABEL_W + ((t - rangeStart) / span) * trackW;
  }

  function xOfMonth(monthKey: string): number {
    return LABEL_W + ((monthStartMs(monthKey) - rangeStart) / span) * trackW;
  }

  function barCoversX(bar: ProductionBar, mouseX: number): boolean {
    if (bar.kind === "deadline") {
      const cx = xOfDate(bar.startDate);
      return Math.abs(mouseX - cx) <= MILESTONE_HIT;
    }
    const x1 = Math.max(LABEL_W, xOfDate(bar.startDate));
    const x2 = Math.min(LABEL_W + trackW, xOfDate(bar.endDate) + 2);
    return mouseX >= x1 && mouseX <= Math.max(x1 + 4, x2);
  }

  function setLaneHover(
    e: React.MouseEvent,
    lane: ProductionProjectLane,
    visibleBars: ProductionBar[],
  ) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left + (wrapRef.current?.scrollLeft ?? 0);
    const hits = visibleBars
      .filter((b) => barCoversX(b, mouseX))
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.name.localeCompare(b.name),
      );
    if (hits.length === 0) {
      setHover(null);
      return;
    }
    setHover({
      projectName: lane.projectName,
      items: hits,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  if (lanes.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted">
        No tasks or milestones in the selected projects. Add them on a project
        Gantt to see them here.
      </p>
    );
  }

  if (months.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted">
        Adjust the month range to view the combined schedule.
      </p>
    );
  }

  const todayInRange =
    today >= `${fromMonth}-01` &&
    new Date(today + "T00:00:00").getTime() < rangeEnd;
  const todayX = todayInRange ? xOfDate(today) : null;

  return (
    <div ref={wrapRef} className="relative overflow-x-auto">
      <svg
        width={chartW}
        height={chartH}
        className="block min-w-full"
        role="img"
        aria-label="Combined production Gantt by month"
      >
        {months.map((m, i) => {
          const x = xOfMonth(m);
          const next =
            i + 1 < months.length
              ? xOfMonth(months[i + 1]!)
              : LABEL_W + trackW;
          const w = next - x;
          return (
            <g key={m}>
              <rect
                x={x}
                y={0}
                width={w}
                height={chartH}
                fill={i % 2 === 0 ? "var(--color-surface)" : "transparent"}
                opacity={0.55}
              />
              <text
                x={x + w / 2}
                y={18}
                textAnchor="middle"
                className="fill-muted"
                style={{ fontSize: 10, fontWeight: 700 }}
              >
                {formatMonthLabel(m)}
              </text>
              <line
                x1={x}
                y1={PAD.top - 8}
                x2={x}
                y2={chartH - PAD.bottom}
                stroke="var(--color-line)"
                strokeWidth={1}
                opacity={0.7}
              />
            </g>
          );
        })}

        {todayX != null && (
          <line
            x1={todayX}
            y1={PAD.top - 12}
            x2={todayX}
            y2={chartH - PAD.bottom}
            stroke="var(--color-teal-accent, #009e98)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}

        {lanes.map((lane, laneIndex) => {
          const y = PAD.top + laneIndex * ROW_H;
          const projectColor =
            colorById.get(lane.projectId) ?? colorForProjectIndex(laneIndex);
          const visibleBars = lane.bars.filter((b) =>
            months.some((m) => barOverlapsMonth(b, m)),
          );
          const visibleActs = visibleBars.filter((b) => b.kind === "activity");
          const visibleDeadlines = visibleBars.filter(
            (b) => b.kind === "deadline",
          );

          return (
            <g key={lane.projectId}>
              <line
                x1={0}
                y1={y + ROW_H}
                x2={chartW}
                y2={y + ROW_H}
                stroke="var(--color-line)"
                strokeWidth={1}
                opacity={0.5}
              />
              <rect
                x={0}
                y={y}
                width={LABEL_W}
                height={ROW_H}
                fill="var(--color-panel, #fff)"
              />
              <circle cx={14} cy={y + 18} r={4} fill={projectColor} />
              <a href={`/projects/${lane.projectId}`}>
                <text
                  x={24}
                  y={y + 21}
                  className="fill-deep"
                  style={{ fontSize: 12, fontWeight: 700 }}
                >
                  {lane.projectName.length > 22
                    ? `${lane.projectName.slice(0, 20)}…`
                    : lane.projectName}
                </text>
              </a>
              <text
                x={24}
                y={y + 36}
                className="fill-muted"
                style={{ fontSize: 10 }}
              >
                {STAGE_LABELS[lane.stage]}
                {lane.client ? ` · ${lane.client.slice(0, 18)}` : ""}
              </text>

              {visibleActs.map((bar) => {
                const x1 = Math.max(LABEL_W, xOfDate(bar.startDate));
                const x2 = Math.min(LABEL_W + trackW, xOfDate(bar.endDate) + 2);
                const w = Math.max(4, x2 - x1);
                return (
                  <rect
                    key={bar.id}
                    x={x1}
                    y={y + 12}
                    width={w}
                    height={14}
                    rx={3}
                    fill={bar.color}
                    opacity={0.88}
                    pointerEvents="none"
                  />
                );
              })}

              {visibleDeadlines.map((bar) => {
                const cx = xOfDate(bar.startDate);
                if (cx < LABEL_W || cx > LABEL_W + trackW) return null;
                const cy = y + ROW_H / 2 + 2;
                const s = 6;
                return (
                  <polygon
                    key={bar.id}
                    points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
                    fill={bar.color}
                    stroke={darkenHex(bar.color)}
                    strokeWidth={0.85}
                    pointerEvents="none"
                  />
                );
              })}

              {/* Hit layer — gathers all overlapping items under the cursor */}
              <rect
                x={LABEL_W}
                y={y}
                width={trackW}
                height={ROW_H}
                fill="transparent"
                className="cursor-pointer"
                onMouseMove={(e) => setLaneHover(e, lane, visibleBars)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}

        <line
          x1={LABEL_W}
          y1={0}
          x2={LABEL_W}
          y2={chartH}
          stroke="var(--color-line)"
          strokeWidth={1}
        />
      </svg>

      {hover && hover.items.length > 0 && (
        <div
          className="pointer-events-none absolute z-20 w-72 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-panel p-3 shadow-lg"
          style={{
            left: Math.min(Math.max(hover.x, 140), chartW - 140),
            top: Math.max(hover.y - 12, 8),
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {hover.projectName}
            {hover.items.length > 1
              ? ` · ${hover.items.length} overlapping`
              : ""}
          </p>
          <ul className="mt-1.5 space-y-2">
            {hover.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                {item.kind === "deadline" ? (
                  <span
                    className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rotate-45"
                    style={{ backgroundColor: item.color }}
                    aria-hidden
                  />
                ) : (
                  <span
                    className="mt-1 inline-block h-2.5 w-4 shrink-0 rounded-sm"
                    style={{ backgroundColor: item.color }}
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-deep">{item.name}</p>
                  <p className="text-xs text-muted">{barDetail(item)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-4 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex gap-0.5">
            {PRODUCTION_TASK_COLORS.map((c) => (
              <span
                key={c}
                className="inline-block h-2.5 w-3 rounded-sm"
                style={{ backgroundColor: c }}
              />
            ))}
          </span>
          Task
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex gap-0.5">
            {PRODUCTION_MILESTONE_COLORS.map((c) => (
              <span
                key={c}
                className="inline-block h-2.5 w-2.5 rotate-45"
                style={{ backgroundColor: c }}
              />
            ))}
          </span>
          Milestone
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-0 border-l border-dashed border-teal-accent" />{" "}
          Today
        </span>
      </div>
    </div>
  );
}
