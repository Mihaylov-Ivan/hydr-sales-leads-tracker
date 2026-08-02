import {
  ProjectSchedule,
  emptySchedule,
  daysBetween,
} from "./types";

const CREATED = "2026-02-01T09:00:00.000Z";

function duration(start: string, end: string): number {
  return daysBetween(start, end) + 1;
}

/**
 * Munich Bus Fleet Refuelling demo schedule matching the project Gantt
 * (Project Initiation → Engineering → Procurement).
 */
export function munichBusFleetSchedule(): ProjectSchedule {
  const p1 = "gantt-munich-p1";
  const p2 = "gantt-munich-p2";
  const p3 = "gantt-munich-p3";

  const bar = "#5B9BD5";
  const review = "#70AD47";

  return {
    phases: [
      {
        id: p1,
        name: "PROJECT INITIATION",
        wbs: "1.0",
        owner: "Hydrogenera / FBK",
        startDate: "2026-02-01",
        durationDays: duration("2026-02-01", "2026-03-06"),
        color: bar,
        sortOrder: 0,
        createdAt: CREATED,
      },
      {
        id: p2,
        name: "ENGINEERING AND DESIGN",
        wbs: "2.0",
        owner: "Hydrogenera",
        startDate: "2026-03-02",
        durationDays: duration("2026-03-02", "2027-01-29"),
        color: bar,
        sortOrder: 1,
        createdAt: CREATED,
      },
      {
        id: p3,
        name: "PROCUREMENT",
        wbs: "3.0",
        owner: "Hydrogenera",
        startDate: "2026-07-01",
        durationDays: duration("2026-07-01", "2027-06-30"),
        color: bar,
        sortOrder: 2,
        createdAt: CREATED,
      },
    ],
    activities: [
      {
        id: "gantt-munich-a13",
        phaseId: p1,
        wbs: "1.3",
        name: "Confirmation of Technical Requirements and Interfaces",
        owner: "Hydrogenera / FBK",
        startDate: "2026-02-09",
        durationDays: duration("2026-02-09", "2026-03-06"),
        color: bar,
        status: "Planned",
        sortOrder: 0,
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-a21",
        phaseId: p2,
        wbs: "2.1",
        name: "Basic Engineering",
        owner: "Hydrogenera",
        startDate: "2026-03-02",
        durationDays: duration("2026-03-02", "2026-05-29"),
        color: bar,
        status: "Planned",
        sortOrder: 0,
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-a22",
        phaseId: p2,
        wbs: "2.2",
        name: "Detailed Mechanical Engineering",
        owner: "Hydrogenera",
        startDate: "2026-05-04",
        durationDays: duration("2026-05-04", "2026-11-27"),
        color: bar,
        status: "Planned",
        sortOrder: 1,
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-a23",
        phaseId: p2,
        wbs: "2.3",
        name: "Electrical and Automation Engineering",
        owner: "Hydrogenera",
        startDate: "2026-06-01",
        durationDays: duration("2026-06-01", "2026-12-18"),
        color: bar,
        status: "Planned",
        sortOrder: 2,
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-a24",
        phaseId: p2,
        wbs: "2.4",
        name: "Safety Review / Risk Assessment",
        owner: "Hydrogenera / FBK",
        startDate: "2026-09-01",
        durationDays: duration("2026-09-01", "2026-11-30"),
        color: bar,
        status: "Planned",
        sortOrder: 3,
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-a26",
        phaseId: p2,
        wbs: "2.6",
        name: "FBK Design Review and Approval",
        owner: "FBK",
        startDate: "2026-12-01",
        durationDays: duration("2026-12-01", "2027-01-29"),
        color: review,
        status: "Planned",
        sortOrder: 4,
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-a31",
        phaseId: p3,
        wbs: "3.1",
        name: "Long-lead Item Procurement",
        owner: "Hydrogenera",
        startDate: "2026-07-01",
        durationDays: duration("2026-07-01", "2027-06-30"),
        color: bar,
        status: "Planned",
        sortOrder: 0,
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-a32",
        phaseId: p3,
        wbs: "3.2",
        name: "General Procurement",
        owner: "Hydrogenera",
        startDate: "2027-01-04",
        durationDays: duration("2027-01-04", "2027-06-30"),
        color: bar,
        status: "Planned",
        sortOrder: 1,
        createdAt: CREATED,
      },
    ],
    deadlines: [
      {
        id: "gantt-munich-d11",
        phaseId: p1,
        wbs: "1.1",
        name: "Contract Award and Down Payment Received",
        owner: "FBK",
        date: "2026-02-02",
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-d12",
        phaseId: p1,
        wbs: "1.2",
        name: "Project Kick-off Meeting",
        owner: "Hydrogenera / FBK",
        date: "2026-02-09",
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-d25",
        phaseId: p2,
        wbs: "2.5",
        name: "Design Documentation Submission",
        owner: "Hydrogenera",
        date: "2026-11-30",
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-d27",
        phaseId: p2,
        wbs: "2.7",
        name: "Design Freeze",
        owner: "Hydrogenera / FBK",
        date: "2027-01-29",
        createdAt: CREATED,
      },
      {
        id: "gantt-munich-d33",
        phaseId: p3,
        wbs: "3.3",
        name: "Procurement Complete",
        owner: "Hydrogenera",
        date: "2027-06-30",
        createdAt: CREATED,
      },
    ],
  };
}

/** True when a schedule has no phases/activities/deadlines yet. */
export function isScheduleEmpty(s: ProjectSchedule | undefined): boolean {
  if (!s) return true;
  return (
    (s.phases?.length ?? 0) === 0 &&
    (s.activities?.length ?? 0) === 0 &&
    (s.deadlines?.length ?? 0) === 0
  );
}

export function ensureScheduleShape(
  s: ProjectSchedule | undefined,
): ProjectSchedule {
  if (!s) return emptySchedule();
  return {
    phases: s.phases ?? [],
    activities: s.activities ?? [],
    deadlines: s.deadlines ?? [],
  };
}

/** Project names / ids used for the Munich demo fill. */
export function isMunichBusFleetProject(p: {
  id: string;
  name: string;
}): boolean {
  if (p.id === "p-munich-fleet") return true;
  if (p.id === "33333333-3333-4333-8333-333333333333") return true;
  return /munich bus fleet/i.test(p.name);
}
