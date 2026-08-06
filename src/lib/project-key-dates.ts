import type { MilestoneKind, Project, ProjectSchedule } from "./types";
import { addDays, emptySchedule, phaseEndDate } from "./types";

/** Columns shown on the board key-dates table (order matters). */
export const KEY_DATE_COLUMNS = [
  "contract-signed",
  "design-approval",
  "engineering-done",
  "manufacturing-done",
  "fat",
  "sat",
  "completion",
] as const;

export type KeyDateColumnId = (typeof KEY_DATE_COLUMNS)[number];

export const KEY_DATE_COLUMN_LABELS: Record<KeyDateColumnId, string> = {
  "contract-signed": "Contract signed",
  "design-approval": "Design approval",
  "engineering-done": "Engineering done",
  "manufacturing-done": "Manufacturing done",
  fat: "FAT",
  sat: "SAT",
  completion: "Completion deadline",
};

export type ProjectKeyDates = {
  projectId: string;
  projectName: string;
  dates: Record<KeyDateColumnId, string | null>;
  /** Sort key: contract signed date, else far future (unsigned last) */
  sortDate: string;
};

function activityEndDate(startDate: string, durationDays: number): string {
  return addDays(startDate, Math.max(1, durationDays) - 1);
}

function normalizeLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Latest planned date across phases, activities, and milestones on the Gantt. */
export function latestGanttDate(
  schedule: ProjectSchedule | undefined,
): string | null {
  const s = schedule ?? emptySchedule();
  let latest: string | null = null;
  function consider(iso: string | undefined | null) {
    if (!iso) return;
    if (!latest || iso > latest) latest = iso;
  }
  for (const p of s.phases ?? []) {
    consider(p.startDate);
    consider(phaseEndDate(p));
  }
  for (const a of s.activities ?? []) {
    consider(a.startDate);
    consider(activityEndDate(a.startDate, a.durationDays));
  }
  for (const d of s.deadlines ?? []) {
    consider(d.date);
  }
  return latest;
}

function scoreNameMatch(name: string, needles: string[]): number {
  const n = normalizeLabel(name);
  if (!n) return 0;
  for (const needle of needles) {
    if (n === needle) return 3;
    // Short tags (FAT/SAT) only match as whole words to avoid false positives
    if (needle.length <= 3) {
      const re = new RegExp(`(?:^|\\b)${needle}(?:\\b|$)`);
      if (re.test(n)) return 3;
      continue;
    }
    if (n.includes(needle)) return 2;
  }
  return 0;
}

/**
 * Find the best matching date for a named milestone on the Gantt
 * (deadlines first, then activities/phases by end date).
 */
function findNamedGanttDate(
  schedule: ProjectSchedule | undefined,
  needles: string[],
): string | null {
  const s = schedule ?? emptySchedule();
  let bestDate: string | null = null;
  let bestScore = 0;
  function consider(name: string, date: string) {
    const score = scoreNameMatch(name, needles);
    if (score <= 0) return;
    if (
      score > bestScore ||
      (score === bestScore && bestDate != null && date < bestDate) ||
      (score === bestScore && bestDate == null)
    ) {
      bestScore = score;
      bestDate = date;
    }
  }
  for (const d of s.deadlines ?? []) {
    consider(d.name, d.date);
  }
  for (const a of s.activities ?? []) {
    consider(a.name, activityEndDate(a.startDate, a.durationDays));
  }
  for (const p of s.phases ?? []) {
    consider(p.name, phaseEndDate(p));
  }
  return bestDate;
}

function financeMilestoneDate(
  project: Project,
  kind: MilestoneKind,
): string | null {
  const hits = (project.financials.milestones ?? [])
    .filter((m) => m.kind === kind)
    .map((m) => m.date)
    .filter(Boolean)
    .sort();
  return hits[0] ?? null;
}

const NAME_NEEDLES: Record<Exclude<KeyDateColumnId, "completion">, string[]> = {
  "contract-signed": ["contract signed", "contract"],
  "design-approval": [
    "design approval",
    "design approv",
    "design freeze",
    "design approved",
  ],
  "engineering-done": ["engineering done", "engineering"],
  "manufacturing-done": ["manufacturing done", "manufacturing", "manufacture"],
  fat: ["fat"],
  sat: ["sat"],
};

const KIND_FOR_COLUMN: Partial<
  Record<Exclude<KeyDateColumnId, "completion">, MilestoneKind>
> = {
  "contract-signed": "contract-signed",
  "engineering-done": "engineering-done",
  "manufacturing-done": "manufacturing-done",
  fat: "fat",
  sat: "sat",
};

function resolveColumnDate(
  project: Project,
  column: Exclude<KeyDateColumnId, "completion">,
): string | null {
  if (column === "contract-signed") {
    const signed = project.financials.contractSignedDate?.trim();
    if (signed) return signed;
  }
  const kind = KIND_FOR_COLUMN[column];
  if (kind) {
    const fromFinance = financeMilestoneDate(project, kind);
    if (fromFinance) return fromFinance;
  }
  return findNamedGanttDate(project.schedule, NAME_NEEDLES[column]);
}

export function projectKeyDates(project: Project): ProjectKeyDates {
  const dates: Record<KeyDateColumnId, string | null> = {
    "contract-signed": resolveColumnDate(project, "contract-signed"),
    "design-approval": resolveColumnDate(project, "design-approval"),
    "engineering-done": resolveColumnDate(project, "engineering-done"),
    "manufacturing-done": resolveColumnDate(project, "manufacturing-done"),
    fat: resolveColumnDate(project, "fat"),
    sat: resolveColumnDate(project, "sat"),
    completion: latestGanttDate(project.schedule),
  };

  const sortDate = dates["contract-signed"] ?? "9999-12-31";

  return {
    projectId: project.id,
    projectName: project.name,
    dates,
    sortDate,
  };
}

export function projectsKeyDatesSorted(projects: Project[]): ProjectKeyDates[] {
  return projects
    .map(projectKeyDates)
    .sort((a, b) => {
      const byDate = a.sortDate.localeCompare(b.sortDate);
      if (byDate !== 0) return byDate;
      return a.projectName.localeCompare(b.projectName);
    });
}
