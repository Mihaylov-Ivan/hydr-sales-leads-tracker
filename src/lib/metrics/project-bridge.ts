/**
 * Bridge between live Board `Project` records and metrics calculations.
 */

import type { Project, Stage } from "@/lib/types";
import { todayDate } from "@/lib/types";
import type { MetricsProject, StageHistoryEntry } from "./types";

function toDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  return iso.slice(0, 10);
}

function buildHistoryFromTimestamps(p: Project): StageHistoryEntry[] {
  const entries: { stage: Stage; enteredAt: string }[] = [];
  const cold = toDate(p.coldLeadEnteredAt) || toDate(p.createdAt) || todayDate();
  entries.push({ stage: "cold-lead", enteredAt: cold });
  if (p.hotLeadEnteredAt) {
    entries.push({ stage: "hot-lead", enteredAt: toDate(p.hotLeadEnteredAt)! });
  }
  if (p.underDevelopmentAt) {
    entries.push({
      stage: "under-development",
      enteredAt: toDate(p.underDevelopmentAt)!,
    });
  }
  if (p.commissionedAt) {
    entries.push({
      stage: "commissioned",
      enteredAt: toDate(p.commissionedAt)!,
    });
  }
  if (p.cancelledAt) {
    entries.push({ stage: "cancelled", enteredAt: toDate(p.cancelledAt)! });
  }
  return entries.map((e, i) => ({
    stage: e.stage,
    enteredAt: e.enteredAt,
    exitedAt: entries[i + 1]?.enteredAt,
  }));
}

/** Map a live Board project into the metrics domain model. */
export function projectToMetricsProject(p: Project): MetricsProject {
  const created = toDate(p.createdAt) || todayDate();
  const activity =
    toDate(p.lastMeaningfulActivityAt) ||
    toDate(p.lastClientContactAt) ||
    created;

  return {
    id: p.id,
    name: p.name,
    ownerId: p.leadUserId ?? "",
    market: p.market,
    sizeKw: p.sizeKw,
    series: p.series,
    currentStatus: p.stage,
    stageHistory: buildHistoryFromTimestamps(p),
    createdAt: created,
    coldLeadEnteredAt: toDate(p.coldLeadEnteredAt) || created,
    hotLeadEnteredAt: toDate(p.hotLeadEnteredAt),
    underDevelopmentAt: toDate(p.underDevelopmentAt),
    commissionedAt: toDate(p.commissionedAt),
    cancelledAt: toDate(p.cancelledAt),
    lastMeaningfulActivityAt: activity,
    nextActionText: p.nextActionText,
    nextActionDueAt: toDate(p.nextActionDueAt),
    cancellationReason: p.cancellationReason,
  };
}

/**
 * When stage changes, set first-entered timestamps that are still empty.
 * Does not overwrite existing historical entered-at values.
 */
export function stageChangeTimestampPatch(
  current: Project,
  newStage: Stage,
  asOf: string = todayDate(),
): Partial<Project> {
  if (current.stage === newStage) return {};
  const patch: Partial<Project> = { stage: newStage };

  if (newStage === "hot-lead" && !current.hotLeadEnteredAt) {
    patch.hotLeadEnteredAt = asOf;
  }
  if (newStage === "under-development" && !current.underDevelopmentAt) {
    patch.underDevelopmentAt = asOf;
  }
  if (newStage === "commissioned") {
    if (!current.underDevelopmentAt) patch.underDevelopmentAt = asOf;
    if (!current.commissionedAt) patch.commissionedAt = asOf;
  }
  if (newStage === "cancelled" && !current.cancelledAt) {
    patch.cancelledAt = asOf;
  }

  return patch;
}

/** Defaults for metrics fields on newly created projects. */
export function initialMetricsFields(input: {
  stage: Stage;
  createdDate: string;
  lastMeaningfulActivityAt?: string;
  nextActionText?: string;
  nextActionDueAt?: string;
}): Pick<
  Project,
  | "coldLeadEnteredAt"
  | "hotLeadEnteredAt"
  | "underDevelopmentAt"
  | "commissionedAt"
  | "cancelledAt"
  | "lastMeaningfulActivityAt"
  | "nextActionText"
  | "nextActionDueAt"
> {
  const d = input.createdDate;
  const fields: ReturnType<typeof initialMetricsFields> = {
    coldLeadEnteredAt: d,
    lastMeaningfulActivityAt: input.lastMeaningfulActivityAt || d,
    ...(input.nextActionText?.trim()
      ? { nextActionText: input.nextActionText.trim() }
      : {}),
    ...(input.nextActionDueAt
      ? { nextActionDueAt: input.nextActionDueAt }
      : {}),
  };

  if (input.stage === "hot-lead") {
    fields.hotLeadEnteredAt = d;
  } else if (input.stage === "under-development") {
    fields.hotLeadEnteredAt = d;
    fields.underDevelopmentAt = d;
  } else if (input.stage === "commissioned") {
    fields.hotLeadEnteredAt = d;
    fields.underDevelopmentAt = d;
    fields.commissionedAt = d;
  } else if (input.stage === "cancelled") {
    fields.cancelledAt = d;
  }

  return fields;
}

/** Backfill missing metrics fields on older projects (local / pre-migration). */
export function ensureProjectMetricsDefaults(p: Project): Project {
  const created = p.createdAt.slice(0, 10);
  const activity =
    p.lastMeaningfulActivityAt || p.lastClientContactAt || created;
  const base: Project = {
    ...p,
    coldLeadEnteredAt: p.coldLeadEnteredAt || created,
    lastMeaningfulActivityAt: activity,
  };

  if (p.stage === "hot-lead" || p.stage === "under-development" || p.stage === "commissioned") {
    if (!base.hotLeadEnteredAt) base.hotLeadEnteredAt = created;
  }
  if (p.stage === "under-development" || p.stage === "commissioned") {
    if (!base.underDevelopmentAt) base.underDevelopmentAt = created;
  }
  if (p.stage === "commissioned" && !base.commissionedAt) {
    base.commissionedAt = created;
  }
  if (p.stage === "cancelled" && !base.cancelledAt) {
    base.cancelledAt = created;
  }
  return base;
}
