"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import { TEAM_MEMBERS, todayDate } from "@/lib/types";
import {
  buildMetricsSnapshot,
  outcomeLabel,
  periodLabel,
} from "@/lib/metrics/calculations";
import {
  PIPELINE_STAGE_LABELS,
  TARGET_STORAGE_KEY,
  defaultTargetSettings,
} from "@/lib/metrics/config";
import { PLACEHOLDER_METRICS_PROJECTS } from "@/lib/metrics/placeholder-data";
import { projectToMetricsProject } from "@/lib/metrics/project-bridge";
import type {
  ClassifiedProject,
  DrillDownKind,
  MetricsFilters,
  PipelineStage,
  TargetPeriod,
  TargetSettings,
} from "@/lib/metrics/types";
import MetricCard from "@/components/metrics/MetricCard";
import MetricsFiltersBar from "@/components/metrics/MetricsFiltersBar";
import MetricsSettingsPanel from "@/components/metrics/MetricsSettingsPanel";
import MetricInfoTip from "@/components/metrics/MetricInfoTip";
import StageCoverageTable from "@/components/metrics/StageCoverageTable";
import DrillDownPanel from "@/components/metrics/DrillDownPanel";
import { METRIC_EXPLANATIONS } from "@/lib/metrics/explanations";

const selectCls =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-teal-accent";

function loadTargetSettings(): TargetSettings {
  const fallback = defaultTargetSettings();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(TARGET_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<TargetSettings>;
    const count =
      typeof parsed.count === "number" && parsed.count > 0
        ? parsed.count
        : fallback.count;
    const period =
      parsed.period === "month" ||
      parsed.period === "quarter" ||
      parsed.period === "year"
        ? parsed.period
        : fallback.period;
    const outcome =
      parsed.outcome === "under-development" ||
      parsed.outcome === "commissioned"
        ? parsed.outcome
        : fallback.outcome;
    return { count, period, outcome };
  } catch {
    return fallback;
  }
}

function formatDurationMonths(years: number): string {
  const months = Math.round(years * 12);
  if (months === 1) return "1-month";
  if (months < 12) return `${months}-month`;
  if (months % 12 === 0) {
    const y = months / 12;
    return y === 1 ? "1-year" : `${y}-year`;
  }
  return `${months}-month`;
}

export default function MetricsPage() {
  const {
    projects,
    teamMembers,
    metricsSettings,
    updateMetricsSettings,
  } = useProjects();
  const asOf = todayDate();

  const [filters, setFilters] = useState<MetricsFilters>({
    targetOutcome: "under-development",
  });
  const [target, setTarget] = useState<TargetSettings>(defaultTargetSettings);
  const [useDemoData, setUseDemoData] = useState(false);
  const [drill, setDrill] = useState<{
    kind: DrillDownKind;
    title: string;
    subtitle?: string;
    projects: ClassifiedProject[];
    showStaleActions?: boolean;
  } | null>(null);

  useEffect(() => {
    setTarget(loadTargetSettings());
  }, []);

  const owners = teamMembers.length > 0 ? teamMembers : TEAM_MEMBERS;

  const liveProjectIds = useMemo(
    () => new Set(projects.map((p) => p.id)),
    [projects],
  );

  const ownerName = useMemo(() => {
    const map = new Map(owners.map((m) => [m.id, m.name]));
    return (id: string) => map.get(id) ?? id;
  }, [owners]);

  const metricsProjects = useMemo(() => {
    if (useDemoData) return PLACEHOLDER_METRICS_PROJECTS;
    return projects.map(projectToMetricsProject);
  }, [projects, useDemoData]);

  const snapshot = useMemo(
    () =>
      buildMetricsSnapshot(
        metricsProjects,
        filters,
        target,
        asOf,
        metricsSettings,
      ),
    [metricsProjects, filters, target, asOf, metricsSettings],
  );

  function updateTarget(next: TargetSettings) {
    setTarget(next);
    try {
      window.localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function openDrill(
    kind: DrillDownKind,
    title: string,
    list: ClassifiedProject[],
    subtitle?: string,
    showStaleActions?: boolean,
  ) {
    setDrill({ kind, title, subtitle, projects: list, showStaleActions });
  }

  function openStageCoverage(stage: PipelineStage) {
    const row = snapshot.coverageRows.find((r) => r.stage === stage);
    const list = snapshot.classified.filter(
      (c) => c.isOpen && c.project.currentStatus === stage,
    );
    openDrill(
      stage === "cold-lead"
        ? "coverage-cold"
        : stage === "hot-lead"
          ? "coverage-hot"
          : "coverage-ud",
      `${PIPELINE_STAGE_LABELS[stage]} coverage`,
      list,
      row
        ? `${row.healthyActive} healthy / ${row.required} required · ${row.status}`
        : undefined,
    );
  }

  const {
    coldToUnderDevelopment: coldUd,
    coldToCommissioned: coldCom,
    resolvedSuccess,
    stalePipeline,
    conversionRange,
    commissioningTarget,
    requiredByStage,
    coverageRows,
    supportedPace,
    bottleneck,
  } = snapshot;

  const requiredCold = requiredByStage.find((r) => r.stage === "cold-lead")!;
  const requiredHot = requiredByStage.find((r) => r.stage === "hot-lead")!;
  const requiredUd = requiredByStage.find(
    (r) => r.stage === "under-development",
  )!;

  return (
    <div className="space-y-6 pb-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-deep">
          Pipeline Metrics
        </h1>
        <p className="max-w-3xl text-sm text-muted">
          Conversion, stale pipeline health, and capacity coverage against your
          commissioning target. Stage history is used so Commissioned projects
          also count as having reached Under Development.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-medium text-ink">
            <input
              type="checkbox"
              checked={useDemoData}
              onChange={(e) => setUseDemoData(e.target.checked)}
              className="rounded border-line"
            />
            Use demo cohort (100 placeholder projects)
          </label>
          {!useDemoData && (
            <span className="text-xs text-muted">
              Using {projects.length} live Board project
              {projects.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </header>

      <MetricsSettingsPanel
        settings={metricsSettings}
        onChange={updateMetricsSettings}
      />

      <MetricsFiltersBar
        filters={filters}
        onChange={setFilters}
        teamMembers={owners}
      />

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
          Primary conversion
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Cold → Under Development"
            info={METRIC_EXPLANATIONS.coldToUd}
            primary={`${coldUd.ratePct}%`}
            secondary={`${coldUd.converted} of ${coldUd.eligible} eligible leads converted`}
            detail={`${coldUd.breakdown.cancelled} cancelled · ${coldUd.breakdown.stale} stale · ${coldUd.breakdown.active} active`}
            footer={`${coldUd.maturityMonths}-month maturity window`}
            estimateSource={coldUd.estimateSource}
            confidence={coldUd.confidence}
            onClick={() =>
              openDrill(
                "cold-to-ud",
                "Cold → Under Development",
                coldUd.breakdown.projects,
                `${coldUd.converted} of ${coldUd.eligible} converted`,
              )
            }
          />
          <MetricCard
            title="Cold → Commissioned"
            info={METRIC_EXPLANATIONS.coldToCommissioned}
            primary={`${coldCom.ratePct}%`}
            secondary={`${coldCom.converted} of ${coldCom.eligible} mature leads commissioned`}
            detail={`${coldCom.breakdown.cancelled} cancelled · ${coldCom.breakdown.stale} stale · ${coldCom.breakdown.active} active`}
            footer={`${coldCom.maturityMonths}-month maturity window`}
            estimateSource={coldCom.estimateSource}
            confidence={coldCom.confidence}
            onClick={() =>
              openDrill(
                "cold-to-commissioned",
                "Cold → Commissioned",
                coldCom.breakdown.projects,
                `${coldCom.converted} of ${coldCom.eligible} commissioned`,
              )
            }
          />
          <MetricCard
            title="Resolved Project Success"
            info={METRIC_EXPLANATIONS.resolvedSuccess}
            primary={`${resolvedSuccess.ratePct}%`}
            secondary={`${resolvedSuccess.successful} successful out of ${resolvedSuccess.resolved} resolved projects`}
            detail={`${resolvedSuccess.converted} converted · ${resolvedSuccess.cancelled} cancelled`}
            footer={`Target: ${outcomeLabel(resolvedSuccess.targetOutcome)}`}
            confidence={resolvedSuccess.confidence}
            estimateSource="historical"
            onClick={() =>
              openDrill(
                "resolved-success",
                "Resolved Project Success",
                resolvedSuccess.projects,
                `Excludes active and stale projects`,
              )
            }
          />
          <MetricCard
            title="Stale Pipeline"
            info={METRIC_EXPLANATIONS.stalePipeline}
            primary={`${stalePipeline.ratePct}%`}
            secondary={`${stalePipeline.staleCount} of ${stalePipeline.openCount} open projects are stale`}
            detail={
              stalePipeline.oldestStaleDays != null
                ? `Oldest stale project: ${stalePipeline.oldestStaleDays} days`
                : "No stale projects"
            }
            accent={stalePipeline.ratePct >= 20 ? "warn" : "default"}
            onClick={() =>
              openDrill(
                "stale-pipeline",
                "Stale Pipeline",
                stalePipeline.projects,
                "Open projects past stage activity thresholds",
                true,
              )
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
          Target and capacity
        </h2>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
            <div className="mb-2 flex items-start gap-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
                {target.outcome === "commissioned"
                  ? "Commissioning Target"
                  : "Development Target"}
              </h3>
              <MetricInfoTip
                title={
                  target.outcome === "commissioned"
                    ? "Commissioning Target"
                    : "Development Target"
                }
                text={METRIC_EXPLANATIONS.commissioningTarget}
              />
            </div>
            <p className="text-3xl font-semibold tracking-tight text-deep">
              {commissioningTarget.annualTarget} per year
            </p>
            <p className="mt-1 text-sm text-ink">
              Equivalent to {commissioningTarget.equivalentLabel}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <label className="block min-w-0">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Outcome
                </span>
                <select
                  value={target.outcome}
                  onChange={(e) =>
                    updateTarget({
                      ...target,
                      outcome: e.target.value as TargetSettings["outcome"],
                    })
                  }
                  className={selectCls + " w-full"}
                >
                  <option value="commissioned">Commissioned</option>
                  <option value="under-development">Under Development</option>
                </select>
              </label>
              <label className="block min-w-0">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Count
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={target.count}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n) || n < 1) return;
                    updateTarget({ ...target, count: Math.round(n) });
                  }}
                  className={selectCls + " w-full"}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Period
                </span>
                <select
                  value={target.period}
                  onChange={(e) =>
                    updateTarget({
                      ...target,
                      period: e.target.value as TargetPeriod,
                    })
                  }
                  className={selectCls + " w-full"}
                >
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                  <option value="year">Year</option>
                </select>
              </label>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Management target — not a historical calculation.
            </p>
          </div>

          <MetricCard
            title="Supported Commissioning Pace"
            info={METRIC_EXPLANATIONS.supportedPace}
            primary={`${supportedPace.supportedPerPeriod} per ${periodLabel(supportedPace.period)}`}
            secondary={
              supportedPace.monthsPerProject != null
                ? `Approximately 1 ${outcomeLabel(target.outcome)} project every ${supportedPace.monthsPerProject} months`
                : "Insufficient coverage to estimate interval"
            }
            detail={`Bottleneck: ${PIPELINE_STAGE_LABELS[supportedPace.bottleneckStage]}`}
            footer="Indication based on healthy coverage — not a guaranteed forecast"
            estimateSource="management"
            onClick={() =>
              openDrill(
                "supported-pace",
                "Supported Commissioning Pace",
                snapshot.classified.filter(
                  (c) =>
                    c.isOpen &&
                    c.project.currentStatus === supportedPace.bottleneckStage,
                ),
                `Bottleneck stage: ${PIPELINE_STAGE_LABELS[supportedPace.bottleneckStage]}`,
              )
            }
          />

          <MetricCard
            title="Pipeline Bottleneck"
            info={METRIC_EXPLANATIONS.bottleneck}
            primary={PIPELINE_STAGE_LABELS[bottleneck.stage]}
            statusText={`${bottleneck.coveragePct}% coverage`}
            secondary={
              bottleneck.shortfall > 0
                ? `${bottleneck.shortfall} additional healthy ${PIPELINE_STAGE_LABELS[bottleneck.stage].toLowerCase()} required`
                : "No shortfall at bottleneck stage"
            }
            detail={`${bottleneck.healthyActive} healthy against ${bottleneck.required} required`}
            accent={bottleneck.coveragePct < 100 ? "warn" : "good"}
            onClick={() =>
              openDrill(
                "bottleneck",
                "Pipeline Bottleneck",
                snapshot.classified.filter(
                  (c) =>
                    c.isOpen && c.project.currentStatus === bottleneck.stage,
                ),
                `${PIPELINE_STAGE_LABELS[bottleneck.stage]} · ${bottleneck.coveragePct}% coverage`,
              )
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
            Stage coverage
          </h2>
          <MetricInfoTip
            title="Stage coverage"
            text={METRIC_EXPLANATIONS.stageCoverage}
          />
        </div>
        <StageCoverageTable
          rows={coverageRows}
          onStageClick={openStageCoverage}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
          Conversion range and required pipeline
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Conversion Range"
            info={METRIC_EXPLANATIONS.conversionRange}
            primary={`${conversionRange.confirmedPct}% confirmed`}
            secondary={`${conversionRange.expectedPct}% expected`}
            detail={`${conversionRange.maxPct}% theoretical maximum — not a forecast`}
            footer={`${conversionRange.converted} of ${conversionRange.eligible} mature projects converted`}
            estimateSource={conversionRange.estimateSource}
            onClick={() =>
              openDrill(
                "conversion-range",
                "Conversion Range",
                conversionRange.projects,
                "Mature cohort for selected target outcome",
              )
            }
          />
          <MetricCard
            title="Required Cold Leads"
            info={METRIC_EXPLANATIONS.requiredCold}
            primary={String(requiredCold.required)}
            secondary={`Needed to support ${requiredCold.annualTarget} ${outcomeLabel(target.outcome).toLowerCase()} per year`}
            detail={`Based on ${requiredCold.conversionRate}% conversion and ${formatDurationMonths(requiredCold.stageDurationYears)} stage duration`}
            estimateSource={requiredCold.estimateSource}
            confidence={requiredCold.confidence}
            onClick={() =>
              openDrill(
                "required-cold",
                "Required Cold Leads",
                snapshot.classified.filter(
                  (c) => c.isOpen && c.project.currentStatus === "cold-lead",
                ),
              )
            }
          />
          <MetricCard
            title="Required Hot Leads"
            info={METRIC_EXPLANATIONS.requiredHot}
            primary={String(requiredHot.required)}
            secondary={`Needed to support ${requiredHot.annualTarget} ${outcomeLabel(target.outcome).toLowerCase()} per year`}
            detail={`Based on ${requiredHot.conversionRate}% conversion and ${formatDurationMonths(requiredHot.stageDurationYears)} stage duration`}
            estimateSource={requiredHot.estimateSource}
            confidence={requiredHot.confidence}
            onClick={() =>
              openDrill(
                "required-hot",
                "Required Hot Leads",
                snapshot.classified.filter(
                  (c) => c.isOpen && c.project.currentStatus === "hot-lead",
                ),
              )
            }
          />
          <MetricCard
            title="Required Under Development Projects"
            info={METRIC_EXPLANATIONS.requiredUd}
            primary={String(requiredUd.required)}
            secondary={`Needed to support ${requiredUd.annualTarget} ${outcomeLabel(target.outcome).toLowerCase()} per year`}
            detail={`Based on ${requiredUd.conversionRate}% conversion and ${formatDurationMonths(requiredUd.stageDurationYears)} stage duration`}
            estimateSource={requiredUd.estimateSource}
            confidence={requiredUd.confidence}
            onClick={() =>
              openDrill(
                "required-ud",
                "Required Under Development Projects",
                snapshot.classified.filter(
                  (c) =>
                    c.isOpen &&
                    c.project.currentStatus === "under-development",
                ),
              )
            }
          />
        </div>
      </section>

      {drill && (
        <DrillDownPanel
          title={drill.title}
          subtitle={drill.subtitle}
          projects={drill.projects}
          ownerName={ownerName}
          liveProjectIds={liveProjectIds}
          showStaleActions={drill.showStaleActions}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
