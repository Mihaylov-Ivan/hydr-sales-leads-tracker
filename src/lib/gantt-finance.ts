import type {
  Project,
  ProjectGanttActivity,
  ProjectGanttDeadline,
  ProjectGanttPhase,
  ProjectMilestone,
  ProjectSchedule,
} from "./types";
import {
  MILESTONE_LABELS,
  addDays,
  emptySchedule,
  phaseEndDate,
} from "./types";

/** Schedule event (or legacy finance milestone) a payment/expense can link to. */
export type LinkableDeadline = {
  id: string;
  date: string;
  label: string;
  kind: "phase" | "activity" | "deadline" | "finance";
};

function activityEndDate(a: ProjectGanttActivity): string {
  return addDays(a.startDate, Math.max(1, a.durationDays) - 1);
}

function phaseLabel(p: ProjectGanttPhase): string {
  const name = p.name.trim() || "Phase";
  return p.wbs ? `${p.wbs} ${name}` : name;
}

function activityLabel(a: ProjectGanttActivity): string {
  const name = a.name.trim() || "Activity";
  return a.wbs ? `${a.wbs} ${name}` : name;
}

function deadlineLabel(d: ProjectGanttDeadline): string {
  const name = d.name.trim() || "Deadline";
  return d.wbs ? `${d.wbs} ${name}` : name;
}

function financeMilestoneLabel(m: ProjectMilestone): string {
  const base = MILESTONE_LABELS[m.kind] ?? m.kind;
  return m.note?.trim() ? `${base} · ${m.note.trim()}` : base;
}

/** Gantt schedule events for linking income/expenses (phases, activities, milestones). */
export function ganttLinkableDeadlines(
  schedule: ProjectSchedule | undefined,
): LinkableDeadline[] {
  const s = schedule ?? emptySchedule();
  const phases = [...(s.phases ?? [])]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.startDate.localeCompare(b.startDate),
    )
    .map((p) => ({
      id: p.id,
      date: phaseEndDate(p),
      label: `Phase · ${phaseLabel(p)}`,
      kind: "phase" as const,
    }));
  const activities = [...(s.activities ?? [])]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((a) => ({
      id: a.id,
      date: activityEndDate(a),
      label: `Activity · ${activityLabel(a)}`,
      kind: "activity" as const,
    }));
  const deadlines = [...(s.deadlines ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      id: d.id,
      date: d.date,
      label: `Milestone · ${deadlineLabel(d)}`,
      kind: "deadline" as const,
    }));
  return [...phases, ...activities, ...deadlines].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

/**
 * All linkable events for a project: Gantt first, then any leftover
 * finance-only milestones (e.g. Excel import) not already represented.
 */
export function projectLinkableDeadlines(project: Project): LinkableDeadline[] {
  const fromGantt = ganttLinkableDeadlines(project.schedule);
  const ganttIds = new Set(fromGantt.map((d) => d.id));
  const fromFinance = (project.financials.milestones ?? [])
    .filter((m) => !ganttIds.has(m.id))
    .map((m) => ({
      id: m.id,
      date: m.date,
      label: financeMilestoneLabel(m),
      kind: "finance" as const,
    }));
  return [...fromGantt, ...fromFinance].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

/** Resolve the date for a payment/expense linked to a schedule event id. */
export function resolveLinkedDeadlineDate(
  milestoneId: string | undefined,
  project: Project | undefined,
): string | undefined {
  if (!milestoneId || !project) return undefined;
  const schedule = project.schedule ?? emptySchedule();
  const deadline = schedule.deadlines.find((d) => d.id === milestoneId);
  if (deadline) return deadline.date;
  const activity = (schedule.activities ?? []).find((a) => a.id === milestoneId);
  if (activity) return activityEndDate(activity);
  const phase = schedule.phases.find((p) => p.id === milestoneId);
  if (phase) return phaseEndDate(phase);
  const finance = project.financials.milestones.find((m) => m.id === milestoneId);
  return finance?.date;
}

export function findLinkableDeadline(
  milestoneId: string | undefined,
  deadlines: LinkableDeadline[],
): LinkableDeadline | undefined {
  if (!milestoneId) return undefined;
  return deadlines.find((d) => d.id === milestoneId);
}
