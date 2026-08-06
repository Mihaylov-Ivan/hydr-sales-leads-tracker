import {
  Project,
  ProjectGanttActivity,
  addDays,
  emptySchedule,
} from "./types";
import { monthKeysBetween } from "./finance-plan";

export type ProductionBarKind = "activity" | "deadline";

/** Alternating task colours — production Gantt only (4) */
export const PRODUCTION_TASK_COLORS = [
  "#2a6f7a",
  "#4a8f6a",
  "#3d7ea6",
  "#5a8f7b",
] as const;

/** Milestone colour — production Gantt only (single yellow) */
export const PRODUCTION_MILESTONE_COLORS = ["#E8B923"] as const;

export type ProductionBar = {
  id: string;
  projectId: string;
  projectName: string;
  client: string;
  stage: Project["stage"];
  kind: ProductionBarKind;
  name: string;
  /** yyyy-mm-dd */
  startDate: string;
  /** Inclusive end yyyy-mm-dd */
  endDate: string;
  color: string;
  phaseName?: string;
};

export type ProductionProjectLane = {
  projectId: string;
  projectName: string;
  client: string;
  stage: Project["stage"];
  bars: ProductionBar[];
};

function activityEndDate(a: ProjectGanttActivity): string {
  return addDays(a.startDate, Math.max(1, a.durationDays) - 1);
}

/** Projects that have tasks or milestones on the Gantt (excluding cancelled). */
export function projectsWithSchedule(projects: Project[]): Project[] {
  return projects
    .filter((p) => p.stage !== "cancelled")
    .filter((p) => {
      const s = p.schedule ?? emptySchedule();
      return (
        (s.activities?.length ?? 0) > 0 || (s.deadlines?.length ?? 0) > 0
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function collectProductionLanes(
  projects: Project[],
): ProductionProjectLane[] {
  const lanes: ProductionProjectLane[] = [];
  let taskColorIndex = 0;
  let milestoneColorIndex = 0;

  for (const p of projects) {
    const s = p.schedule ?? emptySchedule();
    const phases = [...(s.phases ?? [])].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate),
    );
    const phaseById = new Map(phases.map((ph) => [ph.id, ph]));
    const bars: ProductionBar[] = [];

    const activities = [...(s.activities ?? [])].sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name),
    );
    for (const a of activities) {
      const ph = phaseById.get(a.phaseId);
      bars.push({
        id: `act-${p.id}-${a.id}`,
        projectId: p.id,
        projectName: p.name,
        client: p.client,
        stage: p.stage,
        kind: "activity",
        name: a.name.trim() || "Task",
        startDate: a.startDate,
        endDate: activityEndDate(a),
        color:
          PRODUCTION_TASK_COLORS[
            taskColorIndex++ % PRODUCTION_TASK_COLORS.length
          ]!,
        phaseName: ph?.name,
      });
    }

    const deadlines = [...(s.deadlines ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    for (const d of deadlines) {
      const ph = phaseById.get(d.phaseId);
      bars.push({
        id: `dl-${p.id}-${d.id}`,
        projectId: p.id,
        projectName: p.name,
        client: p.client,
        stage: p.stage,
        kind: "deadline",
        name: d.name.trim() || "Milestone",
        startDate: d.date,
        endDate: d.date,
        color:
          PRODUCTION_MILESTONE_COLORS[
            milestoneColorIndex++ % PRODUCTION_MILESTONE_COLORS.length
          ]!,
        phaseName: ph?.name,
      });
    }

    if (bars.length === 0) continue;
    bars.sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        a.name.localeCompare(b.name),
    );
    lanes.push({
      projectId: p.id,
      projectName: p.name,
      client: p.client,
      stage: p.stage,
      bars,
    });
  }
  return lanes;
}

export function barsMonthBounds(
  bars: ProductionBar[],
): { from: string; to: string } | null {
  if (bars.length === 0) return null;
  let min = bars[0]!.startDate;
  let max = bars[0]!.endDate;
  for (const b of bars) {
    if (b.startDate < min) min = b.startDate;
    if (b.endDate > max) max = b.endDate;
  }
  return { from: min.slice(0, 7), to: max.slice(0, 7) };
}

/** Inclusive overlap of [start, end] with calendar month yyyy-mm */
export function barOverlapsMonth(
  bar: ProductionBar,
  monthKey: string,
): boolean {
  const monthStart = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(y!, m!, 0).getDate();
  const monthEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return bar.startDate <= monthEnd && bar.endDate >= monthStart;
}

export type MonthWorkloadSummary = {
  month: string;
  projectIds: string[];
  phaseCount: number;
  activityCount: number;
  deadlineCount: number;
  labels: string[];
};

export function summarizeMonths(
  lanes: ProductionProjectLane[],
  fromMonth: string,
  toMonth: string,
): MonthWorkloadSummary[] {
  const months = monthKeysBetween(fromMonth, toMonth);
  const allBars = lanes.flatMap((l) => l.bars);
  return months.map((month) => {
    const active = allBars.filter((b) => barOverlapsMonth(b, month));
    const projectIds = [...new Set(active.map((b) => b.projectId))];
    const activities = active.filter((b) => b.kind === "activity");
    const deadlines = active.filter((b) => b.kind === "deadline");
    const labels = [
      ...activities.slice(0, 8).map((b) => `${b.projectName}: ${b.name}`),
      ...deadlines.slice(0, 4).map((b) => `${b.projectName}: ${b.name}`),
    ].slice(0, 12);
    return {
      month,
      projectIds,
      phaseCount: 0,
      activityCount: activities.length,
      deadlineCount: deadlines.length,
      labels,
    };
  });
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}
