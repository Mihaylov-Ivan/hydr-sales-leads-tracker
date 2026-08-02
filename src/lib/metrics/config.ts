import type {
  CoverageStatus,
  ConfidenceLabel,
  PipelineStage,
  TargetOutcome,
  TargetPeriod,
  TargetSettings,
} from "./types";
import type { CompanyMetricsSettings } from "@/lib/types";
import { defaultMetricsSettings } from "@/lib/types";

/** @deprecated Prefer CompanyMetricsSettings from store; kept as static defaults. */
export const MATURITY_MONTHS_UNDER_DEVELOPMENT = 12;
export const MATURITY_MONTHS_COMMISSIONED = 30;

/** @deprecated Prefer settings.stale*Days from store. */
export const STALE_THRESHOLD_DAYS: Record<PipelineStage, number> = {
  "cold-lead": 180,
  "hot-lead": 120,
  "under-development": 90,
};

export const DEFAULT_HEALTHY_CONVERSION_PROBABILITY = 0.35;
export const DEFAULT_STALE_RECOVERY_PROBABILITY = 0.1;

export const FALLBACK_STAGE_CONVERSION: Record<
  PipelineStage,
  Record<TargetOutcome, number>
> = {
  "cold-lead": {
    "under-development": 0.18,
    commissioned: 0.05,
  },
  "hot-lead": {
    "under-development": 0.45,
    commissioned: 0.2,
  },
  "under-development": {
    "under-development": 1,
    commissioned: 0.8,
  },
};

export const FALLBACK_STAGE_DURATION_YEARS: Record<PipelineStage, number> = {
  "cold-lead": 1.0,
  "hot-lead": 0.8,
  "under-development": 1,
};

export const HISTORICAL_CONVERSION_MIN_SAMPLE = 10;
export const HISTORICAL_DURATION_MIN_SAMPLE = 5;

export const PIPELINE_STAGES: PipelineStage[] = [
  "cold-lead",
  "hot-lead",
  "under-development",
];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  "cold-lead": "Cold Leads",
  "hot-lead": "Hot Leads",
  "under-development": "Under Development",
};

export const TARGET_STORAGE_KEY = "hydrogenera-metrics-target-v1";
export const METRICS_SETTINGS_STORAGE_KEY = "hydrogenera-metrics-settings-v1";

export function defaultTargetSettings(): TargetSettings {
  return {
    outcome: "commissioned",
    count: 1,
    period: "quarter",
  };
}

export function staleThresholdsFromSettings(
  settings: CompanyMetricsSettings,
): Record<PipelineStage, number> {
  return {
    "cold-lead": settings.staleColdDays,
    "hot-lead": settings.staleHotDays,
    "under-development": settings.staleUnderDevelopmentDays,
  };
}

export function periodsPerYear(period: TargetPeriod): number {
  switch (period) {
    case "month":
      return 12;
    case "quarter":
      return 4;
    case "year":
      return 1;
  }
}

export function annualizeTarget(count: number, period: TargetPeriod): number {
  return count * periodsPerYear(period);
}

export function confidenceLabel(sampleSize: number): ConfidenceLabel {
  if (sampleSize < 10) return "Low confidence";
  if (sampleSize < 30) return "Developing estimate";
  return "Established estimate";
}

export function coverageStatus(coveragePct: number): CoverageStatus {
  if (coveragePct < 80) return "Insufficient";
  if (coveragePct < 100) return "At Risk";
  if (coveragePct <= 120) return "Sufficient";
  return "Strong";
}

export function sizeBandForKw(sizeKw: number): "small" | "medium" | "large" {
  if (sizeKw < 1000) return "small";
  if (sizeKw < 5000) return "medium";
  return "large";
}

export const SIZE_BAND_LABELS = {
  small: "Small (<1 MW)",
  medium: "Medium (1–5 MW)",
  large: "Large (≥5 MW)",
} as const;

export { defaultMetricsSettings };
