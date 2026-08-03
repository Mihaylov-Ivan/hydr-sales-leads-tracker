import {
  daysBetween,
  defaultMetricsSettings,
  todayDate,
  type CompanyMetricsSettings,
  type Stage,
} from "@/lib/types";
import {
  classifyAll,
  reachedCommissioned,
  reachedTarget,
  reachedUnderDevelopment,
} from "./classify";
import {
  FALLBACK_STAGE_CONVERSION,
  FALLBACK_STAGE_DURATION_YEARS,
  HISTORICAL_CONVERSION_MIN_SAMPLE,
  HISTORICAL_DURATION_MIN_SAMPLE,
  PIPELINE_STAGES,
  annualizeTarget,
  confidenceLabel,
  coverageStatus,
  periodsPerYear,
  sizeBandForKw,
} from "./config";
import type {
  BottleneckResult,
  ClassifiedProject,
  CohortBreakdown,
  CommissioningTargetResult,
  ConversionCardResult,
  ConversionRangeResult,
  MetricsFilters,
  MetricsProject,
  MetricsSnapshot,
  PipelineStage,
  ResolvedSuccessResult,
  StageCoverageRow,
  StageRequirementResult,
  StalePipelineResult,
  SupportedPaceResult,
  TargetOutcome,
  TargetPeriod,
  TargetSettings,
} from "./types";

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

export function applyMetricsFilters(
  projects: MetricsProject[],
  filters: MetricsFilters,
): MetricsProject[] {
  return projects.filter((p) => {
    if (filters.cohortFrom && p.createdAt < filters.cohortFrom) return false;
    if (filters.cohortTo && p.createdAt > filters.cohortTo) return false;
    if (filters.market && p.market !== filters.market) return false;
    if (filters.ownerId && p.ownerId !== filters.ownerId) return false;
    if (filters.series && p.series !== filters.series) return false;
    if (filters.sizeBand && sizeBandForKw(p.sizeKw) !== filters.sizeBand) {
      return false;
    }
    return true;
  });
}

function matureCohort(
  projects: MetricsProject[],
  maturityMonths: number,
  asOf: string,
): MetricsProject[] {
  const cutoff = addMonths(asOf, -maturityMonths);
  return projects.filter((p) => p.createdAt <= cutoff);
}

function breakdownForCohort(
  cohort: MetricsProject[],
  targetOutcome: TargetOutcome,
  asOf: string,
  convertedPredicate: (p: MetricsProject) => boolean,
  metricsSettings?: CompanyMetricsSettings,
): CohortBreakdown {
  const classified = classifyAll(
    cohort,
    targetOutcome,
    asOf,
    metricsSettings,
  );
  let converted = 0;
  let cancelled = 0;
  let stale = 0;
  let active = 0;

  for (const c of classified) {
    if (convertedPredicate(c.project)) {
      converted += 1;
    } else if (c.project.currentStatus === "cancelled") {
      cancelled += 1;
    } else if (c.isStale) {
      stale += 1;
    } else {
      active += 1;
    }
  }

  return {
    converted,
    cancelled,
    stale,
    active,
    total: classified.length,
    projects: classified,
  };
}

export function calcColdToUnderDevelopment(
  projects: MetricsProject[],
  asOf: string,
  metricsSettings: CompanyMetricsSettings = defaultMetricsSettings(),
): ConversionCardResult {
  const maturityMonths = metricsSettings.maturityUnderDevelopmentMonths;
  const cohort = matureCohort(projects, maturityMonths, asOf);
  const breakdown = breakdownForCohort(
    cohort,
    "under-development",
    asOf,
    reachedUnderDevelopment,
    metricsSettings,
  );
  return {
    ratePct: pct(breakdown.converted, breakdown.total),
    converted: breakdown.converted,
    eligible: breakdown.total,
    breakdown,
    confidence: confidenceLabel(breakdown.total),
    estimateSource: "historical",
    maturityMonths,
  };
}

export function calcColdToCommissioned(
  projects: MetricsProject[],
  asOf: string,
  metricsSettings: CompanyMetricsSettings = defaultMetricsSettings(),
): ConversionCardResult {
  const maturityMonths = metricsSettings.maturityCommissionedMonths;
  const cohort = matureCohort(projects, maturityMonths, asOf);
  const breakdown = breakdownForCohort(
    cohort,
    "commissioned",
    asOf,
    reachedCommissioned,
    metricsSettings,
  );
  return {
    ratePct: pct(breakdown.converted, breakdown.total),
    converted: breakdown.converted,
    eligible: breakdown.total,
    breakdown,
    confidence: confidenceLabel(breakdown.total),
    estimateSource: "historical",
    maturityMonths,
  };
}

export function calcResolvedSuccess(
  projects: MetricsProject[],
  targetOutcome: TargetOutcome,
  asOf: string,
  metricsSettings?: CompanyMetricsSettings,
): ResolvedSuccessResult {
  const classified = classifyAll(
    projects,
    targetOutcome,
    asOf,
    metricsSettings,
  );
  const resolved = classified.filter(
    (c) =>
      reachedTarget(c.project, targetOutcome) ||
      c.project.currentStatus === "cancelled",
  );
  const converted = resolved.filter((c) =>
    reachedTarget(c.project, targetOutcome),
  );
  const cancelled = resolved.filter(
    (c) =>
      c.project.currentStatus === "cancelled" &&
      !reachedTarget(c.project, targetOutcome),
  );
  // Note: cancelled-after-UD still counts as successful for UD target
  const successful = converted.length;
  const resolvedCount = successful + cancelled.length;

  return {
    ratePct: pct(successful, resolvedCount),
    successful,
    resolved: resolvedCount,
    converted: successful,
    cancelled: cancelled.length,
    projects: resolved,
    confidence: confidenceLabel(resolvedCount),
    targetOutcome,
  };
}

export function calcStalePipeline(
  projects: MetricsProject[],
  targetOutcome: TargetOutcome,
  asOf: string,
  metricsSettings?: CompanyMetricsSettings,
): StalePipelineResult {
  const classified = classifyAll(
    projects,
    targetOutcome,
    asOf,
    metricsSettings,
  );
  const open = classified.filter((c) => c.isOpen);
  const stale = open.filter((c) => c.isStale);
  let oldest: number | null = null;
  for (const s of stale) {
    if (oldest === null || s.daysInactive > oldest) oldest = s.daysInactive;
  }
  return {
    ratePct: pct(stale.length, open.length),
    staleCount: stale.length,
    openCount: open.length,
    oldestStaleDays: oldest,
    projects: stale,
  };
}

export function calcConversionRange(
  projects: MetricsProject[],
  targetOutcome: TargetOutcome,
  asOf: string,
  maturityMonths: number,
  metricsSettings: CompanyMetricsSettings = defaultMetricsSettings(),
): ConversionRangeResult {
  const cohort = matureCohort(projects, maturityMonths, asOf);
  const classified = classifyAll(
    cohort,
    targetOutcome,
    asOf,
    metricsSettings,
  );
  const converted = classified.filter((c) =>
    reachedTarget(c.project, targetOutcome),
  ).length;
  const stale = classified.filter(
    (c) => c.isStale && !reachedTarget(c.project, targetOutcome),
  ).length;
  const active = classified.filter(
    (c) =>
      c.outcomeClass === "healthy-active" &&
      !reachedTarget(c.project, targetOutcome),
  ).length;
  const eligible = classified.length;
  const unresolved = stale + active;

  const confirmedPct = pct(converted, eligible);
  const maxPct = pct(converted + unresolved, eligible);
  const expectedNum =
    converted +
    active * metricsSettings.healthyConversionProbability +
    stale * metricsSettings.staleRecoveryProbability;
  const expectedPct = pct(expectedNum, eligible);

  return {
    confirmedPct,
    expectedPct,
    maxPct,
    converted,
    eligible,
    stale,
    active,
    estimateSource: "management",
    projects: classified,
  };
}

export function calcCommissioningTarget(
  settings: TargetSettings,
): CommissioningTargetResult {
  const annualTarget = annualizeTarget(settings.count, settings.period);
  const periodLabel =
    settings.period === "month"
      ? "month"
      : settings.period === "quarter"
        ? "quarter"
        : "year";
  return {
    annualTarget,
    count: settings.count,
    period: settings.period,
    outcome: settings.outcome,
    equivalentLabel: `${settings.count} project${settings.count === 1 ? "" : "s"} per ${periodLabel}`,
  };
}

function stageEntryAt(
  p: MetricsProject,
  stage: PipelineStage,
): string | undefined {
  if (stage === "cold-lead") return p.coldLeadEnteredAt || p.createdAt;
  if (stage === "hot-lead") return p.hotLeadEnteredAt;
  return p.underDevelopmentAt;
}

function stageExitAt(
  p: MetricsProject,
  stage: PipelineStage,
): string | undefined {
  if (stage === "cold-lead") {
    return p.hotLeadEnteredAt || p.underDevelopmentAt || p.commissionedAt || p.cancelledAt;
  }
  if (stage === "hot-lead") {
    return p.underDevelopmentAt || p.commissionedAt || p.cancelledAt;
  }
  return p.commissionedAt || p.cancelledAt;
}

function historicalStageDurationYears(
  projects: MetricsProject[],
  stage: PipelineStage,
): { years: number; sampleSize: number; historical: boolean } {
  const durations: number[] = [];
  for (const p of projects) {
    const enter = stageEntryAt(p, stage);
    const exit = stageExitAt(p, stage);
    if (!enter || !exit || exit < enter) continue;
    const days = daysBetween(enter, exit);
    if (days > 0) durations.push(days / 365.25);
  }
  const med = median(durations);
  if (med != null && durations.length >= HISTORICAL_DURATION_MIN_SAMPLE) {
    return { years: med, sampleSize: durations.length, historical: true };
  }
  return {
    years: FALLBACK_STAGE_DURATION_YEARS[stage],
    sampleSize: durations.length,
    historical: false,
  };
}

function historicalStageConversion(
  projects: MetricsProject[],
  stage: PipelineStage,
  targetOutcome: TargetOutcome,
  asOf: string,
  metricsSettings: CompanyMetricsSettings,
): { rate: number; sampleSize: number; historical: boolean } {
  const maturity =
    targetOutcome === "commissioned"
      ? metricsSettings.maturityCommissionedMonths
      : metricsSettings.maturityUnderDevelopmentMonths;
  const mature = matureCohort(projects, maturity, asOf);

  const entered = mature.filter((p) => Boolean(stageEntryAt(p, stage)));
  if (entered.length < HISTORICAL_CONVERSION_MIN_SAMPLE) {
    return {
      rate: FALLBACK_STAGE_CONVERSION[stage][targetOutcome],
      sampleSize: entered.length,
      historical: false,
    };
  }

  const converted = entered.filter((p) => reachedTarget(p, targetOutcome));
  return {
    rate: converted.length / entered.length,
    sampleSize: entered.length,
    historical: true,
  };
}

export function calcRequiredByStage(
  projects: MetricsProject[],
  annualTarget: number,
  targetOutcome: TargetOutcome,
  asOf: string,
  metricsSettings: CompanyMetricsSettings = defaultMetricsSettings(),
): StageRequirementResult[] {
  return PIPELINE_STAGES.map((stage) => {
    const duration = historicalStageDurationYears(projects, stage);
    const conversion = historicalStageConversion(
      projects,
      stage,
      targetOutcome,
      asOf,
      metricsSettings,
    );
    const rate = Math.max(conversion.rate, 0.01);
    const required = annualTarget * duration.years / rate;
    const historical = duration.historical && conversion.historical;
    return {
      stage,
      required: Math.round(required * 10) / 10,
      conversionRate: Math.round(rate * 1000) / 10,
      stageDurationYears: Math.round(duration.years * 100) / 100,
      annualTarget,
      estimateSource: historical ? "historical" : "management",
      sampleSize: Math.min(duration.sampleSize, conversion.sampleSize),
      confidence: confidenceLabel(
        Math.min(duration.sampleSize, conversion.sampleSize),
      ),
    };
  });
}

function openInStage(
  classified: ClassifiedProject[],
  stage: PipelineStage,
): ClassifiedProject[] {
  return classified.filter(
    (c) => c.isOpen && c.project.currentStatus === (stage as Stage),
  );
}

export function calcCoverageRows(
  classified: ClassifiedProject[],
  required: StageRequirementResult[],
): StageCoverageRow[] {
  return PIPELINE_STAGES.map((stage) => {
    const req = required.find((r) => r.stage === stage)!;
    const inStage = openInStage(classified, stage);
    const healthyActive = inStage.filter((c) => !c.isStale).length;
    const stale = inStage.filter((c) => c.isStale).length;
    const coveragePct =
      req.required > 0 ? pct(healthyActive, req.required) : 0;
    const balance = Math.round((healthyActive - req.required) * 10) / 10;
    return {
      stage,
      required: req.required,
      healthyActive,
      stale,
      coveragePct,
      balance,
      status: coverageStatus(coveragePct),
      estimateSource: req.estimateSource,
    };
  });
}

export function calcSupportedPace(
  coverageRows: StageCoverageRow[],
  settings: TargetSettings,
): SupportedPaceResult {
  let bottleneck = coverageRows[0]!;
  for (const row of coverageRows) {
    if (row.coveragePct < bottleneck.coveragePct) bottleneck = row;
  }
  const coverageFraction = bottleneck.coveragePct / 100;
  const supportedPerPeriod =
    Math.round(settings.count * coverageFraction * 100) / 100;

  const monthsInPeriod =
    settings.period === "month" ? 1 : settings.period === "quarter" ? 3 : 12;
  const monthsPerProject =
    supportedPerPeriod > 0
      ? Math.round((monthsInPeriod / supportedPerPeriod) * 10) / 10
      : null;

  return {
    supportedPerPeriod,
    period: settings.period,
    monthsPerProject,
    bottleneckStage: bottleneck.stage,
    bottleneckCoveragePct: bottleneck.coveragePct,
    targetCount: settings.count,
  };
}

export function calcBottleneck(
  coverageRows: StageCoverageRow[],
): BottleneckResult {
  let bottleneck = coverageRows[0]!;
  for (const row of coverageRows) {
    if (row.coveragePct < bottleneck.coveragePct) bottleneck = row;
  }
  const shortfall = Math.max(
    0,
    Math.round((bottleneck.required - bottleneck.healthyActive) * 10) / 10,
  );
  return {
    stage: bottleneck.stage,
    coveragePct: bottleneck.coveragePct,
    shortfall,
    healthyActive: bottleneck.healthyActive,
    required: bottleneck.required,
  };
}

export function buildMetricsSnapshot(
  projects: MetricsProject[],
  filters: MetricsFilters,
  target: TargetSettings,
  asOf: string = todayDate(),
  metricsSettings: CompanyMetricsSettings = defaultMetricsSettings(),
): MetricsSnapshot {
  // To Contact is tracking-only — never included in conversion / capacity metrics.
  const metricsEligible = projects.filter(
    (p) => p.currentStatus !== "to-contact",
  );
  const filtered = applyMetricsFilters(metricsEligible, filters);
  const classified = classifyAll(
    filtered,
    filters.targetOutcome,
    asOf,
    metricsSettings,
  );

  const coldToUnderDevelopment = calcColdToUnderDevelopment(
    filtered,
    asOf,
    metricsSettings,
  );
  const coldToCommissioned = calcColdToCommissioned(
    filtered,
    asOf,
    metricsSettings,
  );
  const resolvedSuccess = calcResolvedSuccess(
    filtered,
    filters.targetOutcome,
    asOf,
    metricsSettings,
  );
  const stalePipeline = calcStalePipeline(
    filtered,
    filters.targetOutcome,
    asOf,
    metricsSettings,
  );

  const rangeMaturity =
    filters.targetOutcome === "commissioned"
      ? metricsSettings.maturityCommissionedMonths
      : metricsSettings.maturityUnderDevelopmentMonths;
  const conversionRange = calcConversionRange(
    filtered,
    filters.targetOutcome,
    asOf,
    rangeMaturity,
    metricsSettings,
  );

  const commissioningTarget = calcCommissioningTarget(target);
  const requiredByStage = calcRequiredByStage(
    filtered,
    commissioningTarget.annualTarget,
    target.outcome,
    asOf,
    metricsSettings,
  );
  const capacityClassified = classifyAll(
    filtered,
    target.outcome,
    asOf,
    metricsSettings,
  );
  const coverageRows = calcCoverageRows(capacityClassified, requiredByStage);
  const supportedPace = calcSupportedPace(coverageRows, target);
  const bottleneck = calcBottleneck(coverageRows);

  return {
    coldToUnderDevelopment,
    coldToCommissioned,
    resolvedSuccess,
    stalePipeline,
    conversionRange,
    commissioningTarget,
    requiredByStage,
    coverageRows,
    supportedPace,
    bottleneck,
    classified,
  };
}

export function periodLabel(period: TargetPeriod): string {
  switch (period) {
    case "month":
      return "month";
    case "quarter":
      return "quarter";
    case "year":
      return "year";
  }
}

export function outcomeLabel(outcome: TargetOutcome): string {
  return outcome === "commissioned" ? "Commissioned" : "Under Development";
}

export { periodsPerYear };
