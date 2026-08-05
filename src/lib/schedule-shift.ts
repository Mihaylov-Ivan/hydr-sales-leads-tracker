import type {
  ProjectExpenseItem,
  ProjectFinancials,
  ProjectGanttActivity,
  ProjectGanttDeadline,
  ProjectGanttPhase,
  ProjectMilestone,
  ProjectPayment,
  ProjectSchedule,
  ScheduleShiftUnit,
} from "./types";
import {
  addCalendarMonths,
  addDays,
  emptySchedule,
  phaseEndDate,
} from "./types";

export type ScheduleShiftOpts = {
  amount: number;
  unit: ScheduleShiftUnit;
  includeActuals?: boolean;
};

export function shiftIsoDate(
  iso: string,
  amount: number,
  unit: ScheduleShiftUnit,
): string {
  if (!iso || amount === 0) return iso;
  if (unit === "months") return addCalendarMonths(iso, amount);
  const days = unit === "weeks" ? amount * 7 : amount;
  return addDays(iso, days);
}

function activityEndDate(a: ProjectGanttActivity): string {
  return addDays(a.startDate, Math.max(1, a.durationDays) - 1);
}

function shiftPhase(
  p: ProjectGanttPhase,
  opts: ScheduleShiftOpts,
): ProjectGanttPhase {
  const next: ProjectGanttPhase = {
    ...p,
    startDate: shiftIsoDate(p.startDate, opts.amount, opts.unit),
  };
  if (opts.includeActuals && p.actualStartDate) {
    next.actualStartDate = shiftIsoDate(
      p.actualStartDate,
      opts.amount,
      opts.unit,
    );
  }
  return next;
}

function shiftActivity(
  a: ProjectGanttActivity,
  opts: ScheduleShiftOpts,
): ProjectGanttActivity {
  const next: ProjectGanttActivity = {
    ...a,
    startDate: shiftIsoDate(a.startDate, opts.amount, opts.unit),
  };
  if (opts.includeActuals && a.actualStartDate) {
    next.actualStartDate = shiftIsoDate(
      a.actualStartDate,
      opts.amount,
      opts.unit,
    );
  }
  return next;
}

function shiftDeadline(
  d: ProjectGanttDeadline,
  opts: ScheduleShiftOpts,
): ProjectGanttDeadline {
  const next: ProjectGanttDeadline = {
    ...d,
    date: shiftIsoDate(d.date, opts.amount, opts.unit),
  };
  if (opts.includeActuals && d.actualDate) {
    next.actualDate = shiftIsoDate(d.actualDate, opts.amount, opts.unit);
  }
  return next;
}

export function shiftProjectSchedule(
  schedule: ProjectSchedule | undefined,
  opts: ScheduleShiftOpts,
): ProjectSchedule {
  const s = schedule ?? emptySchedule();
  if (opts.amount === 0) return s;
  return {
    phases: (s.phases ?? []).map((p) => shiftPhase(p, opts)),
    activities: (s.activities ?? []).map((a) => shiftActivity(a, opts)),
    deadlines: (s.deadlines ?? []).map((d) => shiftDeadline(d, opts)),
  };
}

/** Resolve due date from a shifted schedule + finance milestones. */
function resolveDueFromSchedule(
  milestoneId: string,
  schedule: ProjectSchedule,
  milestones: ProjectMilestone[],
): string | undefined {
  const deadline = schedule.deadlines.find((d) => d.id === milestoneId);
  if (deadline) return deadline.date;
  const activity = (schedule.activities ?? []).find((a) => a.id === milestoneId);
  if (activity) return activityEndDate(activity);
  const phase = schedule.phases.find((p) => p.id === milestoneId);
  if (phase) return phaseEndDate(phase);
  const finance = milestones.find((m) => m.id === milestoneId);
  return finance?.date;
}

function shiftPayment(
  p: ProjectPayment,
  scheduleAfter: ProjectSchedule,
  milestonesAfter: ProjectMilestone[],
  opts: ScheduleShiftOpts,
): ProjectPayment {
  const next: ProjectPayment = { ...p };
  if (p.milestoneId) {
    const linked = resolveDueFromSchedule(
      p.milestoneId,
      scheduleAfter,
      milestonesAfter,
    );
    if (linked) next.dueDate = linked;
    else next.dueDate = shiftIsoDate(p.dueDate, opts.amount, opts.unit);
  } else {
    next.dueDate = shiftIsoDate(p.dueDate, opts.amount, opts.unit);
  }
  if (opts.includeActuals && p.actualDate) {
    next.actualDate = shiftIsoDate(p.actualDate, opts.amount, opts.unit);
  }
  return next;
}

function shiftExpense(
  e: ProjectExpenseItem,
  scheduleAfter: ProjectSchedule,
  milestonesAfter: ProjectMilestone[],
  opts: ScheduleShiftOpts,
): ProjectExpenseItem {
  const next: ProjectExpenseItem = { ...e };
  if (e.milestoneId) {
    const linked = resolveDueFromSchedule(
      e.milestoneId,
      scheduleAfter,
      milestonesAfter,
    );
    if (linked) next.dueDate = linked;
    else next.dueDate = shiftIsoDate(e.dueDate, opts.amount, opts.unit);
  } else {
    next.dueDate = shiftIsoDate(e.dueDate, opts.amount, opts.unit);
  }
  if (opts.includeActuals && e.actualDate) {
    next.actualDate = shiftIsoDate(e.actualDate, opts.amount, opts.unit);
  }
  return next;
}

export function shiftProjectFinancials(
  financials: ProjectFinancials,
  scheduleAfter: ProjectSchedule,
  opts: ScheduleShiftOpts,
): ProjectFinancials {
  if (opts.amount === 0) return financials;

  const milestones = (financials.milestones ?? []).map((m) => ({
    ...m,
    date: shiftIsoDate(m.date, opts.amount, opts.unit),
  }));

  return {
    ...financials,
    ...(financials.contractSignedDate
      ? {
          contractSignedDate: shiftIsoDate(
            financials.contractSignedDate,
            opts.amount,
            opts.unit,
          ),
        }
      : {}),
    milestones,
    payments: (financials.payments ?? []).map((p) =>
      shiftPayment(p, scheduleAfter, milestones, opts),
    ),
    expenseSchedule: (financials.expenseSchedule ?? []).map((e) =>
      shiftExpense(e, scheduleAfter, milestones, opts),
    ),
  };
}
