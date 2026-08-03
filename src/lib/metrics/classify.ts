import { daysBetween, todayDate } from "@/lib/types";
import type { Stage } from "@/lib/types";
import {
  STALE_THRESHOLD_DAYS,
  staleThresholdsFromSettings,
} from "./config";
import type { CompanyMetricsSettings } from "@/lib/types";
import type {
  ClassifiedProject,
  MetricsProject,
  PipelineStage,
  StaleRequiredAction,
  TargetOutcome,
} from "./types";

function isPipelineStage(stage: Stage): stage is PipelineStage {
  return (
    stage === "cold-lead" ||
    stage === "hot-lead" ||
    stage === "under-development"
  );
}

export function reachedUnderDevelopment(p: MetricsProject): boolean {
  return Boolean(p.underDevelopmentAt || p.commissionedAt);
}

export function reachedCommissioned(p: MetricsProject): boolean {
  return Boolean(p.commissionedAt);
}

export function reachedTarget(
  p: MetricsProject,
  outcome: TargetOutcome,
): boolean {
  return outcome === "commissioned"
    ? reachedCommissioned(p)
    : reachedUnderDevelopment(p);
}

export function isOpenProject(p: MetricsProject): boolean {
  return (
    p.currentStatus === "cold-lead" ||
    p.currentStatus === "hot-lead" ||
    p.currentStatus === "under-development"
  );
}

export function daysInactive(p: MetricsProject, asOf: string): number {
  return Math.max(0, daysBetween(p.lastMeaningfulActivityAt, asOf));
}

export function staleThresholdDays(
  p: MetricsProject,
  thresholds: Record<PipelineStage, number> = STALE_THRESHOLD_DAYS,
): number {
  if (isPipelineStage(p.currentStatus)) {
    return thresholds[p.currentStatus];
  }
  return thresholds["cold-lead"];
}

export function computeIsStale(
  p: MetricsProject,
  asOf: string,
  thresholds: Record<PipelineStage, number> = STALE_THRESHOLD_DAYS,
): boolean {
  // Only Cold / Hot leads can be stale; Under Development is never stale.
  if (p.currentStatus !== "cold-lead" && p.currentStatus !== "hot-lead") {
    return false;
  }
  return daysInactive(p, asOf) > staleThresholdDays(p, thresholds);
}

export function buildStaleReason(
  p: MetricsProject,
  asOf: string,
  thresholds: Record<PipelineStage, number> = STALE_THRESHOLD_DAYS,
): string {
  if (p.staleReason) return p.staleReason;
  const inactive = daysInactive(p, asOf);
  const threshold = staleThresholdDays(p, thresholds);
  return `No meaningful activity for ${inactive} days (threshold ${threshold} days)`;
}

export function staleRequiredAction(p: MetricsProject): StaleRequiredAction {
  if (p.cancellationReason) return "Cancel";
  return "Reactivate";
}

export function classifyProject(
  project: MetricsProject,
  targetOutcome: TargetOutcome,
  asOf: string = todayDate(),
  settings?: CompanyMetricsSettings,
): ClassifiedProject {
  const thresholds = settings
    ? staleThresholdsFromSettings(settings)
    : STALE_THRESHOLD_DAYS;
  const converted = reachedTarget(project, targetOutcome);
  const cancelled = project.currentStatus === "cancelled";
  const open = isOpenProject(project);
  const stale = computeIsStale(project, asOf, thresholds);
  const inactive = daysInactive(project, asOf);

  let outcomeClass: ClassifiedProject["outcomeClass"];
  if (converted) {
    outcomeClass = "converted";
  } else if (cancelled) {
    outcomeClass = "cancelled";
  } else if (stale) {
    outcomeClass = "stale";
  } else {
    outcomeClass = "healthy-active";
  }

  return {
    project,
    outcomeClass,
    reachedUnderDevelopment: reachedUnderDevelopment(project),
    reachedCommissioned: reachedCommissioned(project),
    isOpen: open,
    isStale: stale,
    daysInactive: inactive,
    staleReason: stale ? buildStaleReason(project, asOf, thresholds) : undefined,
    requiredAction: stale ? staleRequiredAction(project) : undefined,
  };
}

export function classifyAll(
  projects: MetricsProject[],
  targetOutcome: TargetOutcome,
  asOf: string = todayDate(),
  settings?: CompanyMetricsSettings,
): ClassifiedProject[] {
  return projects.map((p) =>
    classifyProject(p, targetOutcome, asOf, settings),
  );
}
