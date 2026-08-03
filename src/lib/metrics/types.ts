/**
 * Pipeline metrics domain model.
 *
 * Target DB shape (see supabase/migration-014-pipeline-metrics.sql):
 * - projects: stage entered-at timestamps, last_meaningful_activity_at,
 *   stale_*, cancellation_reason
 * - project_stage_history: historical stage transitions
 *
 * Until live wiring lands, MetricsProject is populated from placeholder data.
 */

import type { Market, Series, Stage } from "@/lib/types";

/** Pipeline stages used for coverage / required / bottleneck (excludes terminal). */
export type PipelineStage = "cold-lead" | "hot-lead" | "under-development";

export type TargetOutcome = "under-development" | "commissioned";

export type EstimateSource = "historical" | "management";

export type ConfidenceLabel =
  | "Low confidence"
  | "Developing estimate"
  | "Established estimate";

export type CoverageStatus =
  | "Insufficient"
  | "At Risk"
  | "Sufficient"
  | "Strong";

export type ProjectOutcomeClass =
  | "converted"
  | "cancelled"
  | "stale"
  | "healthy-active";

export type StaleRequiredAction = "Reactivate" | "Cancel";

export type TargetPeriod = "month" | "quarter" | "year";

export type SizeBand = "small" | "medium" | "large";

export interface StageHistoryEntry {
  stage: Stage;
  enteredAt: string; // ISO date yyyy-mm-dd
  exitedAt?: string;
}

/**
 * Enriched project record for conversion / capacity metrics.
 * Denormalized stage timestamps must reflect stage history, not only current status.
 */
export interface MetricsProject {
  id: string;
  name: string;
  ownerId: string;
  market: Market;
  sizeKw: number;
  /** Product line used as project-type stand-in until project_type column exists */
  series: Series;
  currentStatus: Stage;
  stageHistory: StageHistoryEntry[];
  createdAt: string; // ISO date
  coldLeadEnteredAt: string;
  hotLeadEnteredAt?: string;
  underDevelopmentAt?: string;
  commissionedAt?: string;
  cancelledAt?: string;
  lastMeaningfulActivityAt: string;
  staleStatus?: boolean;
  staleSince?: string;
  staleReason?: string;
  cancellationReason?: string;
}

export interface MetricsFilters {
  /** Inclusive lead-creation cohort start (yyyy-mm-dd), optional */
  cohortFrom?: string;
  /** Inclusive lead-creation cohort end (yyyy-mm-dd), optional */
  cohortTo?: string;
  market?: Market | "";
  ownerId?: string | "";
  series?: Series | "";
  sizeBand?: SizeBand | "";
  targetOutcome: TargetOutcome;
}

export interface TargetSettings {
  outcome: TargetOutcome;
  /** Number of target projects per period */
  count: number;
  period: TargetPeriod;
}

export interface ClassifiedProject {
  project: MetricsProject;
  /** Outcome relative to the selected target stage */
  outcomeClass: ProjectOutcomeClass;
  /** Reached under development (incl. via commissioned) */
  reachedUnderDevelopment: boolean;
  /** Reached commissioned */
  reachedCommissioned: boolean;
  isOpen: boolean;
  isStale: boolean;
  daysInactive: number;
  staleReason?: string;
  requiredAction?: StaleRequiredAction;
}

export interface CohortBreakdown {
  converted: number;
  cancelled: number;
  stale: number;
  active: number;
  total: number;
  projects: ClassifiedProject[];
}

export interface ConversionCardResult {
  ratePct: number;
  converted: number;
  eligible: number;
  breakdown: CohortBreakdown;
  confidence: ConfidenceLabel;
  estimateSource: EstimateSource;
  maturityMonths: number;
}

export interface ResolvedSuccessResult {
  ratePct: number;
  successful: number;
  resolved: number;
  converted: number;
  cancelled: number;
  projects: ClassifiedProject[];
  confidence: ConfidenceLabel;
  targetOutcome: TargetOutcome;
}

export interface StalePipelineResult {
  ratePct: number;
  staleCount: number;
  openCount: number;
  oldestStaleDays: number | null;
  projects: ClassifiedProject[];
}

export interface ConversionRangeResult {
  confirmedPct: number;
  expectedPct: number;
  maxPct: number;
  converted: number;
  eligible: number;
  stale: number;
  active: number;
  estimateSource: EstimateSource;
  projects: ClassifiedProject[];
}

export interface CommissioningTargetResult {
  annualTarget: number;
  count: number;
  period: TargetPeriod;
  outcome: TargetOutcome;
  equivalentLabel: string;
}

export interface StageRequirementResult {
  stage: PipelineStage;
  required: number;
  conversionRate: number;
  stageDurationYears: number;
  annualTarget: number;
  estimateSource: EstimateSource;
  sampleSize: number;
  confidence: ConfidenceLabel;
}

export interface StageCoverageRow {
  stage: PipelineStage;
  required: number;
  healthyActive: number;
  stale: number;
  coveragePct: number;
  balance: number;
  status: CoverageStatus;
  estimateSource: EstimateSource;
}

export interface SupportedPaceResult {
  supportedPerPeriod: number;
  period: TargetPeriod;
  monthsPerProject: number | null;
  bottleneckStage: PipelineStage;
  bottleneckCoveragePct: number;
  targetCount: number;
}

export interface BottleneckResult {
  stage: PipelineStage;
  coveragePct: number;
  shortfall: number;
  healthyActive: number;
  required: number;
}

export interface MetricsSnapshot {
  coldToUnderDevelopment: ConversionCardResult;
  coldToCommissioned: ConversionCardResult;
  resolvedSuccess: ResolvedSuccessResult;
  stalePipeline: StalePipelineResult;
  conversionRange: ConversionRangeResult;
  commissioningTarget: CommissioningTargetResult;
  requiredByStage: StageRequirementResult[];
  coverageRows: StageCoverageRow[];
  supportedPace: SupportedPaceResult;
  bottleneck: BottleneckResult;
  classified: ClassifiedProject[];
}

export type DrillDownKind =
  | "cold-to-ud"
  | "cold-to-commissioned"
  | "resolved-success"
  | "stale-pipeline"
  | "conversion-range"
  | "required-cold"
  | "required-hot"
  | "required-ud"
  | "coverage-cold"
  | "coverage-hot"
  | "coverage-ud"
  | "supported-pace"
  | "bottleneck";
