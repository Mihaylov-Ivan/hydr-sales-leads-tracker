"use client";

import { MARKETS, SERIES, type TeamMember } from "@/lib/types";
import { SIZE_BAND_LABELS } from "@/lib/metrics/config";
import type { MetricsFilters, SizeBand, TargetOutcome } from "@/lib/metrics/types";

const selectCls =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-teal-accent";
const labelCls =
  "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted";

interface MetricsFiltersBarProps {
  filters: MetricsFilters;
  onChange: (next: MetricsFilters) => void;
  teamMembers: TeamMember[];
}

export default function MetricsFiltersBar({
  filters,
  onChange,
  teamMembers,
}: MetricsFiltersBarProps) {
  function patch(partial: Partial<MetricsFilters>) {
    onChange({ ...filters, ...partial });
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-3 shadow-sm sm:p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7">
        <label className="block min-w-0">
          <span className={labelCls}>Cohort from</span>
          <input
            type="date"
            value={filters.cohortFrom ?? ""}
            onChange={(e) =>
              patch({ cohortFrom: e.target.value || undefined })
            }
            className={selectCls + " w-full"}
          />
        </label>
        <label className="block min-w-0">
          <span className={labelCls}>Cohort to</span>
          <input
            type="date"
            value={filters.cohortTo ?? ""}
            onChange={(e) => patch({ cohortTo: e.target.value || undefined })}
            className={selectCls + " w-full"}
          />
        </label>
        <label className="block min-w-0">
          <span className={labelCls}>Market</span>
          <select
            value={filters.market ?? ""}
            onChange={(e) =>
              patch({ market: (e.target.value || "") as MetricsFilters["market"] })
            }
            className={selectCls + " w-full"}
          >
            <option value="">All markets</option>
            {MARKETS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={labelCls}>Owner</span>
          <select
            value={filters.ownerId ?? ""}
            onChange={(e) => patch({ ownerId: e.target.value || "" })}
            className={selectCls + " w-full"}
          >
            <option value="">All owners</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={labelCls}>Project type</span>
          <select
            value={filters.series ?? ""}
            onChange={(e) =>
              patch({ series: (e.target.value || "") as MetricsFilters["series"] })
            }
            className={selectCls + " w-full"}
          >
            <option value="">All types</option>
            {SERIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={labelCls}>System size</span>
          <select
            value={filters.sizeBand ?? ""}
            onChange={(e) =>
              patch({
                sizeBand: (e.target.value || "") as SizeBand | "",
              })
            }
            className={selectCls + " w-full"}
          >
            <option value="">All sizes</option>
            {(Object.keys(SIZE_BAND_LABELS) as SizeBand[]).map((b) => (
              <option key={b} value={b}>
                {SIZE_BAND_LABELS[b]}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={labelCls}>Target outcome</span>
          <select
            value={filters.targetOutcome}
            onChange={(e) =>
              patch({ targetOutcome: e.target.value as TargetOutcome })
            }
            className={selectCls + " w-full"}
          >
            <option value="under-development">Under Development</option>
            <option value="commissioned">Commissioned</option>
          </select>
        </label>
      </div>
    </div>
  );
}
