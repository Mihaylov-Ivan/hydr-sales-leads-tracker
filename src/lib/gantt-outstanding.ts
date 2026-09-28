/**
 * Helpers for Outstanding Gantt reminders (technical_sales users).
 */

import type { Project, ProjectGanttOutstanding, ProjectSchedule } from "./types";
import { todayDate, trackOfProject } from "./types";

/** Delivery stages where a Gantt chart is expected. */
export function isGanttDeliveryProject(p: Project): boolean {
  if (trackOfProject(p) !== "sales") return false;
  return p.stage === "under-development" || p.stage === "commissioned";
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
