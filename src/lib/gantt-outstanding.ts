/**
 * Helpers for Outstanding Gantt reminders (technical_sales users).
 */

import type { Project, ProjectGanttOutstanding, ProjectSchedule } from "./types";
import { todayDate, trackOfProject } from "./types";

/** Delivery stages where Outstanding Gantt reminders apply.
 * Cancelled and commissioned projects are excluded. */
export function isGanttDeliveryProject(p: Project): boolean {
  if (trackOfProject(p) !== "sales") return false;
  return p.stage === "under-development";
}

export function projectHasGanttSchedule(
  schedule: ProjectSchedule | undefined,
): boolean {
  if (!schedule) return false;
  return (
    (schedule.phases?.length ?? 0) > 0 ||
    (schedule.deadlines?.length ?? 0) > 0 ||
    (schedule.activities?.length ?? 0) > 0
  );
}

/** Earliest planned start across phases and activities (yyyy-mm-dd). */
export function scheduleEarliestStart(
  schedule: ProjectSchedule | undefined,
): string | null {
  if (!schedule) return null;
  let min: string | null = null;
  for (const phase of schedule.phases ?? []) {
    const d = phase.startDate?.slice(0, 10);
    if (d && (!min || d < min)) min = d;
  }
  for (const activity of schedule.activities ?? []) {
    const d = activity.startDate?.slice(0, 10);
    if (d && (!min || d < min)) min = d;
  }
  return min;
}

export function isGanttScheduleStarted(
  schedule: ProjectSchedule | undefined,
  asOf: string = todayDate(),
): boolean {
  const start = scheduleEarliestStart(schedule);
  return Boolean(start && start <= asOf);
}

export function isGanttMissingSnoozed(
  prefs: ProjectGanttOutstanding | undefined,
  asOf: string = todayDate(),
): boolean {
  const until = prefs?.missingSnoozedUntil?.slice(0, 10);
  return Boolean(until && until > asOf);
}

export function isGanttStartApproved(
  prefs: ProjectGanttOutstanding | undefined,
  scheduleStart: string | null,
): boolean {
  if (!prefs?.startApprovedScheduleStart || !scheduleStart) return false;
  return prefs.startApprovedScheduleStart.slice(0, 10) === scheduleStart;
}

/**
 * One shared Outstanding state per project. A snooze or approval from any
 * user applies to everyone; the latest write of each field wins.
 */
export function mergeProjectGanttOutstanding(
  projectId: string,
  rows: ProjectGanttOutstanding[],
): ProjectGanttOutstanding {
  let missingSnoozedUntil: string | undefined;
  let missingAt = "";
  let startApprovedScheduleStart: string | undefined;
  let approvedAt = "";

  for (const row of rows) {
    if (row.projectId !== projectId) continue;
    const at = row.updatedAt ?? "";
    if (row.missingSnoozedUntil && at >= missingAt) {
      missingAt = at;
      missingSnoozedUntil = row.missingSnoozedUntil.slice(0, 10);
    }
    if (row.startApprovedScheduleStart && at >= approvedAt) {
      approvedAt = at;
      startApprovedScheduleStart = row.startApprovedScheduleStart.slice(0, 10);
    }
  }

  return {
    projectId,
    userId: "",
    ...(missingSnoozedUntil ? { missingSnoozedUntil } : {}),
    ...(startApprovedScheduleStart ? { startApprovedScheduleStart } : {}),
  };
}

export type GanttOutstandingKind = "missing" | "started";

export function resolveGanttOutstandingKind(
  project: Project,
  prefs: ProjectGanttOutstanding | undefined,
  asOf: string = todayDate(),
): GanttOutstandingKind | null {
  if (!isGanttDeliveryProject(project)) return null;

  const has = projectHasGanttSchedule(project.schedule);
  if (!has) {
    if (isGanttMissingSnoozed(prefs, asOf)) return null;
    return "missing";
  }

  if (!isGanttScheduleStarted(project.schedule, asOf)) return null;
  const start = scheduleEarliestStart(project.schedule);
  if (isGanttStartApproved(prefs, start)) return null;
  return "started";
}
