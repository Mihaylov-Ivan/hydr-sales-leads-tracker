"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import { addCalendarMonths, todayDate } from "@/lib/types";
import {
  barsMonthBounds,
  collectProductionLanes,
  formatMonthLabel,
  projectsWithSchedule,
  summarizeMonths,
} from "@/lib/production-gantt";
import ProductionCombinedGantt from "@/components/ProductionCombinedGantt";
import ProjectMultiSelect, {
  colorForProjectIndex,
} from "@/components/ProjectMultiSelect";

const labelCls =
  "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted";
const inputCls =
  "rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-teal-accent";

export default function ProductionPage() {
  const { projects, ready } = useProjects();
  const [projectIds, setProjectIds] = useState<Set<string> | null>(null);
  const prevFilterIdsRef = useRef<Set<string>>(new Set());
  const [viewFrom, setViewFrom] = useState("");
  const [viewTo, setViewTo] = useState("");
  const [rangeTouched, setRangeTouched] = useState(false);

  const scheduleProjects = useMemo(
    () => projectsWithSchedule(projects),
    [projects],
  );

  useEffect(() => {
    const valid = new Set(scheduleProjects.map((p) => p.id));
    const prev = prevFilterIdsRef.current;
    setProjectIds((curr) => {
      if (curr === null) return new Set(valid);
      const next = new Set([...curr].filter((id) => valid.has(id)));
      for (const id of valid) {
        if (!prev.has(id)) next.add(id);
      }
      return next;
    });
    prevFilterIdsRef.current = valid;
  }, [scheduleProjects]);

  const selectedIds =
    projectIds ?? new Set(scheduleProjects.map((p) => p.id));

  const selectedProjects = useMemo(
    () => scheduleProjects.filter((p) => selectedIds.has(p.id)),
    [scheduleProjects, selectedIds],
  );

  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    scheduleProjects.forEach((p, i) => {
      map.set(p.id, colorForProjectIndex(i));
    });
    return map;
  }, [scheduleProjects]);

  const lanes = useMemo(
    () => collectProductionLanes(selectedProjects),
    [selectedProjects],
  );

  const allBars = useMemo(() => lanes.flatMap((l) => l.bars), [lanes]);
  const autoBounds = useMemo(() => barsMonthBounds(allBars), [allBars]);

  useEffect(() => {
    if (rangeTouched) return;
    if (!autoBounds) {
      const now = todayDate().slice(0, 7);
      setViewFrom(now);
      setViewTo(addCalendarMonths(`${now}-01`, 5).slice(0, 7));
      return;
    }
    setViewFrom(autoBounds.from);
    setViewTo(autoBounds.to);
  }, [autoBounds, rangeTouched]);

  const fromMonth = viewFrom || todayDate().slice(0, 7);
  const toMonth =
    viewTo && viewTo >= fromMonth
      ? viewTo
      : addCalendarMonths(`${fromMonth}-01`, 5).slice(0, 7);

  const monthSummaries = useMemo(
    () => summarizeMonths(lanes, fromMonth, toMonth),
    [lanes, fromMonth, toMonth],
  );

  if (!ready) {
    return <p className="py-20 text-center text-muted">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-deep">
            Production
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Combined Gantt across projects — what is scheduled each month.
            Edit schedules on each project&apos;s Gantt.
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
              Combined schedule
            </h2>
            <p className="mt-1 text-[11px] text-muted">
              One row per project · tasks and milestones by month
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {scheduleProjects.length > 0 && (
              <div>
                <label className={labelCls}>Projects</label>
                <ProjectMultiSelect
                  projects={scheduleProjects}
                  selectedIds={selectedIds}
                  colorById={colorById}
                  onToggle={(id) => {
                    setProjectIds((prev) => {
                      const base =
                        prev ?? new Set(scheduleProjects.map((p) => p.id));
                      const next = new Set(base);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  onSelectAll={() =>
                    setProjectIds(new Set(scheduleProjects.map((p) => p.id)))
                  }
                  onClear={() => setProjectIds(new Set())}
                />
              </div>
            )}
            <div>
              <label className={labelCls}>From</label>
              <input
                className={`${inputCls} w-[9.5rem]`}
                type="month"
                value={fromMonth}
                onChange={(e) => {
                  setRangeTouched(true);
                  setViewFrom(e.target.value);
                }}
              />
            </div>
            <div>
              <label className={labelCls}>To</label>
              <input
                className={`${inputCls} w-[9.5rem]`}
                type="month"
                value={toMonth}
                onChange={(e) => {
                  setRangeTouched(true);
                  setViewTo(e.target.value);
                }}
              />
            </div>
          </div>
        </div>

        {scheduleProjects.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No projects have Gantt tasks or milestones yet. Open a project and
            add them to populate this view.
          </p>
        ) : selectedIds.size === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No projects selected — use the Projects filter to choose some.
          </p>
        ) : (
          <ProductionCombinedGantt
            lanes={lanes}
            fromMonth={fromMonth}
            toMonth={toMonth}
            colorById={colorById}
          />
        )}
      </section>

      {/* Man-hrs / capacity — WIP placeholder */}
      <section
        aria-disabled="true"
        className="relative rounded-xl border border-dashed border-line bg-panel/80 p-5 shadow-sm"
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
                Manpower &amp; capacity
              </h2>
              <span className="rounded-full bg-amber-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-accent">
                Work in progress
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-[11px] text-muted">
              When man-hrs are stored on schedule work, this will estimate hours
              needed per month and compare them to company capacity (including
              month-by-month thresholds). Inputs stay disabled until that data
              exists.
            </p>
          </div>
        </div>

        <div className="pointer-events-none select-none opacity-60">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls}>Default monthly capacity (hrs)</label>
              <input
                className={`${inputCls} w-36`}
                type="number"
                disabled
                placeholder="e.g. 1600"
                value=""
                readOnly
              />
            </div>
            <p className="pb-2 text-[11px] font-semibold text-muted">
              Per-month overrides — coming later
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-1.5">Month</th>
                  <th className="px-2 py-1.5">Active projects</th>
                  <th className="px-2 py-1.5">Work items</th>
                  <th className="px-2 py-1.5 text-right">Est. man-hrs</th>
                  <th className="px-2 py-1.5 text-right">Capacity</th>
                  <th className="px-2 py-1.5">Load</th>
                </tr>
              </thead>
              <tbody>
                {monthSummaries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-2 py-6 text-center text-muted"
                    >
                      No months in range
                    </td>
                  </tr>
                ) : (
                  monthSummaries.map((row) => {
                    const workItems =
                      row.phaseCount + row.activityCount + row.deadlineCount;
                    return (
                      <tr
                        key={row.month}
                        className="border-b border-line/60"
                      >
                        <td className="px-2 py-1.5 font-semibold text-deep">
                          {formatMonthLabel(row.month)}
                        </td>
                        <td className="px-2 py-1.5 text-ink">
                          {row.projectIds.length}
                        </td>
                        <td className="px-2 py-1.5 text-muted">
                          {workItems === 0
                            ? "—"
                            : `${row.activityCount} task${row.activityCount === 1 ? "" : "s"} · ${row.deadlineCount} milestone${row.deadlineCount === 1 ? "" : "s"}`}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted">
                          —
                          <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-amber-accent">
                            WIP
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            className="w-20 rounded border border-line bg-surface px-1.5 py-0.5 text-right text-[11px] tabular-nums text-muted"
                            type="number"
                            disabled
                            placeholder="—"
                            value=""
                            readOnly
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-semibold text-muted">
                            Unavailable
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
