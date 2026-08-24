import {
  ProjectGanttActivity,
  ProjectGanttDeadline,
  ProjectGanttPhase,
  ProjectSchedule,
  addCalendarMonths,
  addDays,
  todayDate,
} from "./types";

const BAR = "#5B9BD5";

/** Ceramika / image reference phase lengths (inclusive days). */
export const REF_ENGINEERING_DAYS = 31;
export const REF_PROCUREMENT_DAYS = 152;
export const REF_INSTALLATION_DAYS = 62;

/** Default months for an 8-month delivery (1 + 5 + 2). */
export const DEFAULT_ENGINEERING_MONTHS = 1;
export const DEFAULT_PROCUREMENT_MONTHS = 5;
export const DEFAULT_INSTALLATION_MONTHS = 2;

const DAYS_PER_MONTH = 30.4375;

export function monthsToDays(months: number): number {
  return Math.max(1, Math.round(months * DAYS_PER_MONTH));
}

export function daysToMonthsApprox(days: number): number {
  return Math.round((days / DAYS_PER_MONTH) * 10) / 10;
}

type SpanSpec = {
  name: string;
  wbs: string;
  /** Start offset from phase start in reference days */
  startOffset: number;
  /** Inclusive duration in reference days */
  duration: number;
};

type MilestoneSpec = {
  name: string;
  wbs: string;
  /** Offset from phase start in reference days */
  offset: number;
};

/** Design work (Detailed Design + Design Approval) ends this many days before Engineering Complete. */
export const DESIGN_STOP_BEFORE_ENGINEERING_DONE_DAYS = 20;

/** Relative to REF_ENGINEERING_DAYS — Detailed Design is placed with a fixed lead before engineering done. */
const ENG_ACTIVITIES: SpanSpec[] = [
  {
    name: "Detailed Engineering",
    wbs: "2.2",
    startOffset: 14,
    duration: 17,
  },
];

const ENG_MILESTONES: MilestoneSpec[] = [
  { name: "Engineering Complete", wbs: "2.4", offset: 30 },
];

/** Inclusive-day offset of the last day of design (clamped to the engineering phase). */
function designEndOffset(engDays: number): number {
  return Math.max(
    0,
    engDays - 1 - DESIGN_STOP_BEFORE_ENGINEERING_DONE_DAYS,
  );
}

/** Relative to REF_PROCUREMENT_DAYS */
const PROC_ACTIVITIES: SpanSpec[] = [
  {
    name: "Procurement",
    wbs: "3.1",
    startOffset: 0,
    duration: 76,
  },
  {
    name: "Manufacturing",
    wbs: "3.2",
    startOffset: 31,
    duration: 112,
  },
  {
    name: "Factory Acceptance Test (FAT)",
    wbs: "3.3",
    startOffset: 137,
    duration: 15,
  },
];

const PROC_MILESTONES: MilestoneSpec[] = [
  { name: "FAT Complete", wbs: "3.4", offset: 151 },
];

/** Relative to REF_INSTALLATION_DAYS */
const SITE_ACTIVITIES: SpanSpec[] = [
  {
    name: "Packing, Shipping and Site Preparation",
    wbs: "4.1",
    startOffset: 0,
    duration: 20,
  },
  {
    name: "Installation",
    wbs: "4.2",
    startOffset: 14,
    duration: 14,
  },
  {
    name: "Commissioning and Site Acceptance Test (SAT)",
    wbs: "4.3",
    startOffset: 24,
    duration: 8,
  },
  {
    name: "Handover and Punch-list Close-out",
    wbs: "4.4",
    startOffset: 31,
    duration: 31,
  },
];

const SITE_MILESTONES: MilestoneSpec[] = [
  { name: "SAT Complete", wbs: "4.5", offset: 31 },
  { name: "FAC / Contract Complete", wbs: "4.6", offset: 61 },
];

function scaleOffset(refOffset: number, refDays: number, targetDays: number): number {
  if (refDays <= 1) return 0;
  return Math.round((refOffset / (refDays - 1)) * (targetDays - 1));
}

function scaleDuration(
  refDuration: number,
  refDays: number,
  targetDays: number,
): number {
  return Math.max(1, Math.round((refDuration / refDays) * targetDays));
}

function clampSpan(
  startOffset: number,
  duration: number,
  phaseDays: number,
): { startOffset: number; duration: number } {
  const maxStart = Math.max(0, phaseDays - 1);
  const start = Math.min(Math.max(0, startOffset), maxStart);
  const maxDur = phaseDays - start;
  return { startOffset: start, duration: Math.min(Math.max(1, duration), maxDur) };
}

function phaseEnd(startDate: string, durationDays: number): string {
  return addDays(startDate, Math.max(1, durationDays) - 1);
}

/**
 * Build a Ceramika-shaped delivery Gantt scaled to the given major-phase lengths.
 * Engineering starts on `startDate`; procurement / manufacturing starts 1 calendar
 * month after engineering starts; installation starts on procurement end.
 */
export function buildStandardDeliverySchedule(input: {
  startDate: string;
  engineeringDays: number;
  procurementDays: number;
  installationDays: number;
}): ProjectSchedule {
  const startDate = input.startDate || todayDate();
  const engDays = Math.max(1, Math.round(input.engineeringDays) || 1);
  const procDays = Math.max(1, Math.round(input.procurementDays) || 1);
  const siteDays = Math.max(1, Math.round(input.installationDays) || 1);
  const createdAt = new Date().toISOString();

  const pInit = crypto.randomUUID();
  const pEng = crypto.randomUUID();
  const pProc = crypto.randomUUID();
  const pSite = crypto.randomUUID();

  const engStart = startDate;
  const procStart = addCalendarMonths(engStart, 1);
  const procEnd = phaseEnd(procStart, procDays);
  const siteStart = procEnd;

  const phases: ProjectGanttPhase[] = [
    {
      id: pInit,
      name: "PROJECT INITIATION",
      wbs: "1.0",
      startDate,
      durationDays: 1,
      color: BAR,
      sortOrder: 0,
      createdAt,
    },
    {
      id: pEng,
      name: "ENGINEERING AND DESIGN",
      wbs: "2.0",
      startDate: engStart,
      durationDays: engDays,
      color: BAR,
      sortOrder: 1,
      createdAt,
    },
    {
      id: pProc,
      name: "PROCUREMENT, MANUFACTURING AND FAT",
      wbs: "3.0",
      startDate: procStart,
      durationDays: procDays,
      color: BAR,
      sortOrder: 2,
      createdAt,
    },
    {
      id: pSite,
      name: "INSTALLATION, SAT AND HANDOVER",
      wbs: "4.0",
      startDate: siteStart,
      durationDays: siteDays,
      color: BAR,
      sortOrder: 3,
      createdAt,
    },
  ];

  function buildActivities(
    phaseId: string,
    phaseStart: string,
    phaseDays: number,
    refDays: number,
    specs: SpanSpec[],
  ): ProjectGanttActivity[] {
    return specs.map((spec, i) => {
      const rawStart = scaleOffset(spec.startOffset, refDays, phaseDays);
      const rawDur = scaleDuration(spec.duration, refDays, phaseDays);
      const { startOffset, duration } = clampSpan(rawStart, rawDur, phaseDays);
      return {
        id: crypto.randomUUID(),
        phaseId,
        name: spec.name,
        wbs: spec.wbs,
        startDate: addDays(phaseStart, startOffset),
        durationDays: duration,
        color: BAR,
        status: "Planned",
        sortOrder: i,
        createdAt,
      };
    });
  }

  function buildMilestones(
    phaseId: string,
    phaseStart: string,
    phaseDays: number,
    refDays: number,
    specs: MilestoneSpec[],
  ): ProjectGanttDeadline[] {
    return specs.map((spec) => {
      const offset = Math.min(
        Math.max(0, scaleOffset(spec.offset, refDays, phaseDays)),
        Math.max(0, phaseDays - 1),
      );
      return {
        id: crypto.randomUUID(),
        phaseId,
        name: spec.name,
        wbs: spec.wbs,
        date: addDays(phaseStart, offset),
        createdAt,
      };
    });
  }

  const designEnd = designEndOffset(engDays);
  const designDuration = designEnd + 1;

  const activities: ProjectGanttActivity[] = [
    {
      id: crypto.randomUUID(),
      phaseId: pEng,
      name: "Detailed Design",
      wbs: "2.1",
      startDate: engStart,
      durationDays: designDuration,
      color: BAR,
      status: "Planned",
      sortOrder: 0,
      createdAt,
    },
    ...buildActivities(pEng, engStart, engDays, REF_ENGINEERING_DAYS, ENG_ACTIVITIES).map(
      (a, i) => ({ ...a, sortOrder: i + 1 }),
    ),
    ...buildActivities(
      pProc,
      procStart,
      procDays,
      REF_PROCUREMENT_DAYS,
      PROC_ACTIVITIES,
    ),
    ...buildActivities(
      pSite,
      siteStart,
      siteDays,
      REF_INSTALLATION_DAYS,
      SITE_ACTIVITIES,
    ),
  ];

  const deadlines: ProjectGanttDeadline[] = [
    {
      id: crypto.randomUUID(),
      phaseId: pInit,
      name: "Contract Signed / Prepayment",
      wbs: "1.1",
      date: startDate,
      createdAt,
    },
    {
      id: crypto.randomUUID(),
      phaseId: pEng,
      name: "Design Approval",
      wbs: "2.3",
      date: addDays(engStart, designEnd),
      createdAt,
    },
    ...buildMilestones(pEng, engStart, engDays, REF_ENGINEERING_DAYS, ENG_MILESTONES),
    ...buildMilestones(
      pProc,
      procStart,
      procDays,
      REF_PROCUREMENT_DAYS,
      PROC_MILESTONES,
    ),
    ...buildMilestones(
      pSite,
      siteStart,
      siteDays,
      REF_INSTALLATION_DAYS,
      SITE_MILESTONES,
    ),
  ];

  return { phases, activities, deadlines };
}
