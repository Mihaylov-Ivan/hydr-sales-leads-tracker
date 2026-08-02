"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  GANTT_PHASE_COLORS,
  ProjectGanttActivity,
  ProjectGanttDeadline,
  ProjectGanttPhase,
  ProjectSchedule,
  addDays,
  daysBetween,
  phaseEndDate,
  todayDate,
} from "@/lib/types";

const BAR_BLUE = "#5B9BD5";
const MILESTONE_YELLOW = "#E8B923";

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function formatMonth(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { month: "short" });
}

function formatYear(ms: number): string {
  return String(new Date(ms).getFullYear());
}

function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function nextMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

function monthTicks(rangeStart: number, rangeEnd: number): number[] {
  const ticks: number[] = [];
  let t = rangeStart;
  while (t <= rangeEnd) {
    ticks.push(t);
    t = nextMonth(t);
  }
  return ticks;
}

function phaseColor(phase: ProjectGanttPhase, index: number): string {
  return phase.color ?? GANTT_PHASE_COLORS[index % GANTT_PHASE_COLORS.length];
}

function activityEndDate(a: ProjectGanttActivity): string {
  return addDays(a.startDate, Math.max(1, a.durationDays) - 1);
}

type ChartRow =
  | { kind: "phase"; phase: ProjectGanttPhase; phaseIndex: number }
  | {
      kind: "activity";
      activity: ProjectGanttActivity;
      phase: ProjectGanttPhase;
      phaseIndex: number;
    }
  | {
      kind: "deadline";
      deadline: ProjectGanttDeadline;
      phase: ProjectGanttPhase;
      phaseIndex: number;
    };

function buildRows(
  phases: ProjectGanttPhase[],
  activities: ProjectGanttActivity[],
  deadlines: ProjectGanttDeadline[],
): ChartRow[] {
  const rows: ChartRow[] = [];
  phases.forEach((phase, phaseIndex) => {
    rows.push({ kind: "phase", phase, phaseIndex });

    type Child =
      | { t: "a"; sort: number; date: string; activity: ProjectGanttActivity }
      | { t: "d"; sort: number; date: string; deadline: ProjectGanttDeadline };

    const children: Child[] = [
      ...activities
        .filter((a) => a.phaseId === phase.id)
        .map((activity) => ({
          t: "a" as const,
          sort: activity.sortOrder,
          date: activity.startDate,
          activity,
        })),
      ...deadlines
        .filter((d) => d.phaseId === phase.id)
        .map((deadline) => ({
          t: "d" as const,
          sort: 50 + deadline.date.localeCompare("0"),
          date: deadline.date,
          deadline,
        })),
    ];

    children.sort((a, b) => {
      const wa = a.t === "a" ? a.activity.wbs : a.deadline.wbs;
      const wb = b.t === "a" ? b.activity.wbs : b.deadline.wbs;
      if (wa && wb && wa !== wb) return wa.localeCompare(wb, undefined, { numeric: true });
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.sort - b.sort;
    });

    for (const c of children) {
      if (c.t === "a") {
        rows.push({ kind: "activity", activity: c.activity, phase, phaseIndex });
      } else {
        rows.push({ kind: "deadline", deadline: c.deadline, phase, phaseIndex });
      }
    }
  });
  return rows;
}

const LABEL_W = 280;
const META_W = 0; // dates live in the left label column
const ROW_H = 28;
const PAD = { top: 36, right: 12, bottom: 20 };

type HoverState = {
  title: string;
  subtitle: string;
  detail?: string;
  x: number;
  y: number;
};

function GanttChart({
  phases,
  activities,
  deadlines,
}: {
  phases: ProjectGanttPhase[];
  activities: ProjectGanttActivity[];
  deadlines: ProjectGanttDeadline[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<HoverState | null>(null);

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

  const rows = useMemo(
    () => buildRows(phases, activities, deadlines),
    [phases, activities, deadlines],
  );

  if (phases.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-10 text-center text-sm text-muted">
        Add a phase below to start the schedule.
      </p>
    );
  }

  const today = todayDate();
  const dates: string[] = [];
  for (const p of phases) {
    dates.push(p.startDate, phaseEndDate(p));
  }
  for (const a of activities) {
    dates.push(a.startDate, activityEndDate(a));
  }
  for (const d of deadlines) dates.push(d.date);
  dates.push(today);

  const minT = Math.min(...dates.map((d) => new Date(d + "T00:00:00").getTime()));
  const maxT = Math.max(...dates.map((d) => new Date(d + "T00:00:00").getTime()));
  const rangeStart = startOfMonth(minT);
  const rangeEnd = nextMonth(startOfMonth(maxT));
  const span = Math.max(rangeEnd - rangeStart, 1);
  const ticks = monthTicks(rangeStart, rangeEnd);

  const chartW = Math.max(width, 640);
  const trackW = Math.max(chartW - LABEL_W - META_W - PAD.right, 200);
  const chartH = PAD.top + rows.length * ROW_H + PAD.bottom;

  function xOf(date: string): number {
    const t = new Date(date + "T00:00:00").getTime();
    return LABEL_W + ((t - rangeStart) / span) * trackW;
  }

  const todayX = xOf(today);

  // Year bands for header
  const yearBands: { year: string; x: number; w: number }[] = [];
  for (let i = 0; i < ticks.length; i++) {
    const y = formatYear(ticks[i]);
    const x = LABEL_W + ((ticks[i] - rangeStart) / span) * trackW;
    const nextX =
      i + 1 < ticks.length
        ? LABEL_W + ((ticks[i + 1] - rangeStart) / span) * trackW
        : LABEL_W + trackW;
    const last = yearBands[yearBands.length - 1];
    if (last && last.year === y) {
      last.w = nextX - (last.x);
    } else {
      yearBands.push({ year: y, x, w: nextX - x });
    }
  }

  function setHoverFromEvent(
    e: React.MouseEvent,
    title: string,
    subtitle: string,
    detail?: string,
  ) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({
      title,
      subtitle,
      ...(detail ? { detail } : {}),
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  return (
    <div ref={wrapRef} className="relative w-full overflow-x-auto">
      <svg
        width="100%"
        height={chartH}
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="min-w-[48rem]"
        role="img"
        aria-label="Project Gantt schedule"
      >
        {/* Year headers */}
        {yearBands.map((b) => (
          <text
            key={`y-${b.year}-${b.x}`}
            x={b.x + b.w / 2}
            y={12}
            textAnchor="middle"
            className="fill-deep"
            style={{ fontSize: 11, fontWeight: 700 }}
          >
            {b.year}
          </text>
        ))}

        {/* Month ticks */}
        {ticks.map((t) => {
          const x = LABEL_W + ((t - rangeStart) / span) * trackW;
          return (
            <g key={t}>
              <line
                x1={x}
                x2={x}
                y1={PAD.top - 4}
                y2={chartH - PAD.bottom}
                stroke="var(--line)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={x + 3}
                y={26}
                className="fill-muted"
                style={{ fontSize: 9, fontWeight: 600 }}
              >
                {formatMonth(t)}
              </text>
            </g>
          );
        })}

        {/* Label column header */}
        <text
          x={8}
          y={26}
          className="fill-muted"
          style={{ fontSize: 9, fontWeight: 700 }}
        >
          WBS / Activity
        </text>

        {/* Today */}
        <line
          x1={todayX}
          x2={todayX}
          y1={PAD.top - 4}
          y2={chartH - PAD.bottom}
          stroke="var(--teal)"
          strokeWidth={1.25}
          opacity={0.5}
        />

        {rows.map((row, i) => {
          const y = PAD.top + i * ROW_H;
          const midY = y + ROW_H / 2;

          if (row.kind === "phase") {
            const color = phaseColor(row.phase, row.phaseIndex);
            const x1 = xOf(row.phase.startDate);
            const x2 = xOf(phaseEndDate(row.phase));
            const barW = Math.max(x2 - x1, 4);
            const label = `${row.phase.wbs ? `${row.phase.wbs} ` : ""}${row.phase.name}`;
            return (
              <g key={`phase-${row.phase.id}`}>
                <rect
                  x={0}
                  y={y}
                  width={chartW}
                  height={ROW_H}
                  fill="var(--teal-soft)"
                  opacity={0.35}
                />
                <text
                  x={8}
                  y={midY + 4}
                  className="fill-deep"
                  style={{ fontSize: 11, fontWeight: 700 }}
                >
                  {label.length > 36 ? `${label.slice(0, 35)}…` : label}
                </text>
                <rect
                  x={x1}
                  y={midY - 7}
                  width={barW}
                  height={14}
                  rx={2}
                  fill={color}
                  opacity={0.95}
                  className="cursor-pointer"
                  onMouseEnter={(e) =>
                    setHoverFromEvent(
                      e,
                      label,
                      `${formatDate(row.phase.startDate)} → ${formatDate(phaseEndDate(row.phase))}`,
                      `${row.phase.durationDays} days${row.phase.owner ? ` · ${row.phase.owner}` : ""}`,
                    )
                  }
                  onMouseMove={(e) =>
                    setHoverFromEvent(
                      e,
                      label,
                      `${formatDate(row.phase.startDate)} → ${formatDate(phaseEndDate(row.phase))}`,
                      `${row.phase.durationDays} days${row.phase.owner ? ` · ${row.phase.owner}` : ""}`,
                    )
                  }
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }

          if (row.kind === "activity") {
            const a = row.activity;
            const color = a.color ?? BAR_BLUE;
            const x1 = xOf(a.startDate);
            const x2 = xOf(activityEndDate(a));
            const barW = Math.max(x2 - x1, 4);
            const label = `${a.wbs ? `${a.wbs} ` : ""}${a.name}`;
            return (
              <g key={`act-${a.id}`}>
                <text
                  x={16}
                  y={midY + 4}
                  className="fill-ink"
                  style={{ fontSize: 10, fontWeight: 500 }}
                >
                  {label.length > 38 ? `${label.slice(0, 37)}…` : label}
                </text>
                <rect
                  x={x1}
                  y={midY - 6}
                  width={barW}
                  height={12}
                  rx={2}
                  fill={color}
                  opacity={0.92}
                  className="cursor-pointer"
                  onMouseEnter={(e) =>
                    setHoverFromEvent(
                      e,
                      label,
                      `${formatDate(a.startDate)} → ${formatDate(activityEndDate(a))}`,
                      `${a.durationDays} days${a.owner ? ` · ${a.owner}` : ""}${a.status ? ` · ${a.status}` : ""}`,
                    )
                  }
                  onMouseMove={(e) =>
                    setHoverFromEvent(
                      e,
                      label,
                      `${formatDate(a.startDate)} → ${formatDate(activityEndDate(a))}`,
                      `${a.durationDays} days${a.owner ? ` · ${a.owner}` : ""}${a.status ? ` · ${a.status}` : ""}`,
                    )
                  }
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          }

          // deadline / milestone
          const d = row.deadline;
          const dx = xOf(d.date);
          const label = `${d.wbs ? `${d.wbs} ` : ""}${d.name}`;
          const size = 7;
          return (
            <g key={`dl-${d.id}`}>
              <text
                x={16}
                y={midY + 4}
                className="fill-ink"
                style={{ fontSize: 10, fontWeight: 500 }}
              >
                {label.length > 38 ? `${label.slice(0, 37)}…` : label}
              </text>
              <polygon
                points={`${dx},${midY - size} ${dx + size},${midY} ${dx},${midY + size} ${dx - size},${midY}`}
                fill={MILESTONE_YELLOW}
                stroke="#b8860b"
                strokeWidth={0.75}
                className="cursor-pointer"
                onMouseEnter={(e) =>
                  setHoverFromEvent(
                    e,
                    label,
                    formatDate(d.date),
                    d.owner ? `Milestone · ${d.owner}` : "Milestone",
                  )
                }
                onMouseMove={(e) =>
                  setHoverFromEvent(
                    e,
                    label,
                    formatDate(d.date),
                    d.owner ? `Milestone · ${d.owner}` : "Milestone",
                  )
                }
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}

        {/* Divider between labels and chart */}
        <line
          x1={LABEL_W}
          x2={LABEL_W}
          y1={PAD.top - 14}
          y2={chartH - PAD.bottom}
          stroke="var(--line)"
          strokeWidth={1.5}
        />
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-panel p-3 shadow-lg"
          style={{
            left: Math.min(Math.max(hover.x, 130), chartW - 130),
            top: Math.max(hover.y - 12, 8),
          }}
        >
          <p className="text-sm font-bold text-deep">{hover.title}</p>
          <p className="mt-1 text-xs text-muted">{hover.subtitle}</p>
          {hover.detail && (
            <p className="mt-0.5 text-xs text-ink">{hover.detail}</p>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseForm({
  projectId,
  initial,
  onDone,
}: {
  projectId: string;
  initial?: ProjectGanttPhase;
  onDone: () => void;
}) {
  const { addGanttPhase, updateGanttPhase } = useProjects();
  const [name, setName] = useState(initial?.name ?? "");
  const [wbs, setWbs] = useState(initial?.wbs ?? "");
  const [owner, setOwner] = useState(initial?.owner ?? "");
  const [startDate, setStartDate] = useState(
    initial?.startDate ?? todayDate(),
  );
  const [durationDays, setDurationDays] = useState(
    String(initial?.durationDays ?? 30),
  );
  const [endDate, setEndDate] = useState(
    initial ? phaseEndDate(initial) : addDays(todayDate(), 29),
  );

  function syncDurationFromEnd(nextEnd: string) {
    setEndDate(nextEnd);
    if (startDate && nextEnd >= startDate) {
      setDurationDays(String(daysBetween(startDate, nextEnd) + 1));
    }
  }

  function syncEndFromDuration(nextDuration: string) {
    setDurationDays(nextDuration);
    const n = Math.max(1, Math.round(Number(nextDuration)) || 1);
    if (startDate) setEndDate(addDays(startDate, n - 1));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const days = Math.max(1, Math.round(Number(durationDays)) || 1);
    if (!name.trim() || !startDate) return;
    const payload = {
      name: name.trim(),
      startDate,
      durationDays: days,
      wbs,
      owner,
      color: initial?.color,
      sortOrder: initial?.sortOrder,
    };
    if (initial) updateGanttPhase(projectId, initial.id, payload);
    else addGanttPhase(projectId, payload);
    onDone();
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          WBS
        </span>
        <input
          value={wbs}
          onChange={(e) => setWbs(e.target.value)}
          placeholder="1.0"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Phase name
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ENGINEERING AND DESIGN"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Owner
        </span>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Hydrogenera"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Start
        </span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            const days = Math.max(1, Math.round(Number(durationDays)) || 1);
            if (e.target.value) setEndDate(addDays(e.target.value, days - 1));
          }}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Duration (days)
        </span>
        <input
          type="number"
          min={1}
          value={durationDays}
          onChange={(e) => syncEndFromDuration(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          End
        </span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => syncDurationFromEnd(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={!name.trim() || !startDate}
          className="rounded-lg bg-olive px-4 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink disabled:opacity-40"
        >
          {initial ? "Save" : "Add phase"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-2 text-xs font-semibold text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ActivityForm({
  projectId,
  phases,
  initial,
  onDone,
}: {
  projectId: string;
  phases: ProjectGanttPhase[];
  initial?: ProjectGanttActivity;
  onDone: () => void;
}) {
  const { addGanttActivity, updateGanttActivity } = useProjects();
  const [phaseId, setPhaseId] = useState(
    initial?.phaseId ?? phases[0]?.id ?? "",
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [wbs, setWbs] = useState(initial?.wbs ?? "");
  const [owner, setOwner] = useState(initial?.owner ?? "");
  const [startDate, setStartDate] = useState(
    initial?.startDate ?? todayDate(),
  );
  const [durationDays, setDurationDays] = useState(
    String(initial?.durationDays ?? 30),
  );
  const [endDate, setEndDate] = useState(
    initial
      ? activityEndDate(initial)
      : addDays(todayDate(), 29),
  );
  const [color, setColor] = useState(initial?.color ?? BAR_BLUE);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const days = Math.max(1, Math.round(Number(durationDays)) || 1);
    if (!name.trim() || !phaseId || !startDate) return;
    const payload = {
      phaseId,
      name: name.trim(),
      startDate,
      durationDays: days,
      wbs,
      owner,
      color,
      status: initial?.status ?? "Planned",
      sortOrder: initial?.sortOrder,
    };
    if (initial) updateGanttActivity(projectId, initial.id, payload);
    else addGanttActivity(projectId, payload);
    onDone();
  }

  if (phases.length === 0) {
    return <p className="text-sm text-muted">Add a phase first.</p>;
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Phase
        </span>
        <select
          value={phaseId}
          onChange={(e) => setPhaseId(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        >
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.wbs ? `${p.wbs} ` : ""}
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          WBS
        </span>
        <input
          value={wbs}
          onChange={(e) => setWbs(e.target.value)}
          placeholder="2.1"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block sm:col-span-2 lg:col-span-1">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Activity
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Basic Engineering"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Owner
        </span>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Start
        </span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            const days = Math.max(1, Math.round(Number(durationDays)) || 1);
            if (e.target.value) setEndDate(addDays(e.target.value, days - 1));
          }}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Duration (days)
        </span>
        <input
          type="number"
          min={1}
          value={durationDays}
          onChange={(e) => {
            setDurationDays(e.target.value);
            const n = Math.max(1, Math.round(Number(e.target.value)) || 1);
            if (startDate) setEndDate(addDays(startDate, n - 1));
          }}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          End
        </span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            if (startDate && e.target.value >= startDate) {
              setDurationDays(
                String(daysBetween(startDate, e.target.value) + 1),
              );
            }
          }}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Bar colour
        </span>
        <select
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        >
          <option value={BAR_BLUE}>Blue (task)</option>
          <option value="#70AD47">Green (review)</option>
          <option value="#009e98">Teal</option>
          <option value="#d99a06">Amber</option>
        </select>
      </label>
      <div className="flex items-end gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={!name.trim() || !phaseId || !startDate}
          className="rounded-lg bg-olive px-4 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink disabled:opacity-40"
        >
          {initial ? "Save" : "Add activity"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-2 text-xs font-semibold text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeadlineForm({
  projectId,
  phases,
  initial,
  onDone,
}: {
  projectId: string;
  phases: ProjectGanttPhase[];
  initial?: ProjectGanttDeadline;
  onDone: () => void;
}) {
  const { addGanttDeadline, updateGanttDeadline } = useProjects();
  const [phaseId, setPhaseId] = useState(
    initial?.phaseId ?? phases[0]?.id ?? "",
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [wbs, setWbs] = useState(initial?.wbs ?? "");
  const [owner, setOwner] = useState(initial?.owner ?? "");
  const [date, setDate] = useState(initial?.date ?? todayDate());
  const [note, setNote] = useState(initial?.note ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phaseId || !date) return;
    const payload = { phaseId, name: name.trim(), date, wbs, owner, note };
    if (initial) updateGanttDeadline(projectId, initial.id, payload);
    else addGanttDeadline(projectId, payload);
    onDone();
  }

  if (phases.length === 0) {
    return <p className="text-sm text-muted">Add a phase first.</p>;
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-lg border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Phase
        </span>
        <select
          value={phaseId}
          onChange={(e) => setPhaseId(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        >
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.wbs ? `${p.wbs} ` : ""}
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          WBS
        </span>
        <input
          value={wbs}
          onChange={(e) => setWbs(e.target.value)}
          placeholder="2.5"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Milestone
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Design Freeze"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Date
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Owner
        </span>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Note
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
        />
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={!name.trim() || !phaseId || !date}
          className="rounded-lg bg-olive px-4 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink disabled:opacity-40"
        >
          {initial ? "Save" : "Add milestone"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-2 text-xs font-semibold text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ProjectGantt({
  projectId,
  schedule,
}: {
  projectId: string;
  schedule: ProjectSchedule;
}) {
  const {
    deleteGanttPhase,
    deleteGanttActivity,
    deleteGanttDeadline,
  } = useProjects();
  const [form, setForm] = useState<
    null | "phase" | "activity" | "deadline"
  >(null);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(
    null,
  );
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(
    null,
  );

  const phases = useMemo(
    () =>
      [...(schedule.phases ?? [])].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.startDate.localeCompare(b.startDate),
      ),
    [schedule.phases],
  );
  const activities = schedule.activities ?? [];
  const deadlines = schedule.deadlines ?? [];

  function closeForms() {
    setForm(null);
    setEditingPhaseId(null);
    setEditingActivityId(null);
    setEditingDeadlineId(null);
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
            Project schedule
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Phases, timed activities, and milestones on one Gantt timeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              closeForms();
              setForm("phase");
            }}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-deep shadow-sm hover:border-teal-accent/40"
          >
            + Phase
          </button>
          <button
            type="button"
            onClick={() => {
              closeForms();
              setForm("activity");
            }}
            disabled={phases.length === 0}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-deep shadow-sm hover:border-teal-accent/40 disabled:opacity-40"
          >
            + Activity
          </button>
          <button
            type="button"
            onClick={() => {
              closeForms();
              setForm("deadline");
            }}
            disabled={phases.length === 0}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-deep shadow-sm hover:border-teal-accent/40 disabled:opacity-40"
          >
            + Milestone
          </button>
        </div>
      </div>

      <GanttChart
        phases={phases}
        activities={activities}
        deadlines={deadlines}
      />

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm" style={{ background: BAR_BLUE }} />
          Activity
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm" style={{ background: "#70AD47" }} />
          Review
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rotate-45"
            style={{ background: MILESTONE_YELLOW }}
          />
          Milestone
        </span>
      </div>

      {(form === "phase" || editingPhaseId) && (
        <div className="mt-4">
          <PhaseForm
            projectId={projectId}
            initial={
              editingPhaseId
                ? phases.find((p) => p.id === editingPhaseId)
                : undefined
            }
            onDone={closeForms}
          />
        </div>
      )}
      {(form === "activity" || editingActivityId) && (
        <div className="mt-4">
          <ActivityForm
            projectId={projectId}
            phases={phases}
            initial={
              editingActivityId
                ? activities.find((a) => a.id === editingActivityId)
                : undefined
            }
            onDone={closeForms}
          />
        </div>
      )}
      {(form === "deadline" || editingDeadlineId) && (
        <div className="mt-4">
          <DeadlineForm
            projectId={projectId}
            phases={phases}
            initial={
              editingDeadlineId
                ? deadlines.find((d) => d.id === editingDeadlineId)
                : undefined
            }
            onDone={closeForms}
          />
        </div>
      )}

      {phases.length > 0 && (
        <div className="mt-5 space-y-3">
          {phases.map((phase, i) => {
            const color = phaseColor(phase, i);
            const phaseActs = activities
              .filter((a) => a.phaseId === phase.id)
              .sort(
                (a, b) =>
                  (a.wbs ?? "").localeCompare(b.wbs ?? "", undefined, {
                    numeric: true,
                  }) || a.startDate.localeCompare(b.startDate),
              );
            const phaseDls = deadlines
              .filter((d) => d.phaseId === phase.id)
              .sort((a, b) => a.date.localeCompare(b.date));
            return (
              <div
                key={phase.id}
                className="rounded-lg border border-line bg-surface/60 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <p className="text-sm font-semibold text-ink">
                    {phase.wbs ? `${phase.wbs} ` : ""}
                    {phase.name}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDate(phase.startDate)} –{" "}
                    {formatDate(phaseEndDate(phase))} · {phase.durationDays}d
                    {phase.owner ? ` · ${phase.owner}` : ""}
                  </p>
                  <div className="ml-auto flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        closeForms();
                        setEditingPhaseId(phase.id);
                      }}
                      className="font-semibold text-teal-accent hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGanttPhase(projectId, phase.id)}
                      className="text-muted hover:text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <ul className="mt-2 space-y-1.5 pl-5">
                  {[
                    ...phaseActs.map((a) => ({
                      key: a.id,
                      wbs: a.wbs,
                      date: a.startDate,
                      sort: a.wbs ?? a.startDate,
                      node: (
                        <>
                          <span className="text-xs text-muted">
                            {formatDate(a.startDate)} –{" "}
                            {formatDate(activityEndDate(a))}
                          </span>
                          <span className="font-medium text-ink">
                            {a.wbs ? `${a.wbs} ` : ""}
                            {a.name}
                          </span>
                          <span className="ml-auto flex gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                closeForms();
                                setEditingActivityId(a.id);
                              }}
                              className="font-semibold text-teal-accent hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                deleteGanttActivity(projectId, a.id)
                              }
                              className="text-muted hover:text-red-500"
                            >
                              Delete
                            </button>
                          </span>
                        </>
                      ),
                    })),
                    ...phaseDls.map((d) => ({
                      key: d.id,
                      wbs: d.wbs,
                      date: d.date,
                      sort: d.wbs ?? d.date,
                      node: (
                        <>
                          <span className="text-xs font-semibold text-amber-accent">
                            ◆ {formatDate(d.date)}
                          </span>
                          <span className="font-medium text-ink">
                            {d.wbs ? `${d.wbs} ` : ""}
                            {d.name}
                          </span>
                          <span className="ml-auto flex gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                closeForms();
                                setEditingDeadlineId(d.id);
                              }}
                              className="font-semibold text-teal-accent hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                deleteGanttDeadline(projectId, d.id)
                              }
                              className="text-muted hover:text-red-500"
                            >
                              Delete
                            </button>
                          </span>
                        </>
                      ),
                    })),
                  ]
                    .sort((a, b) =>
                      (a.wbs ?? a.date).localeCompare(b.wbs ?? b.date, undefined, {
                        numeric: true,
                      }),
                    )
                    .map((item) => (
                      <li
                        key={item.key}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        {item.node}
                      </li>
                    ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
