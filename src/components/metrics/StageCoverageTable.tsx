"use client";

import { PIPELINE_STAGE_LABELS } from "@/lib/metrics/config";
import type { PipelineStage, StageCoverageRow } from "@/lib/metrics/types";

interface StageCoverageTableProps {
  rows: StageCoverageRow[];
  onStageClick?: (stage: PipelineStage) => void;
}

function statusClass(status: StageCoverageRow["status"]): string {
  switch (status) {
    case "Insufficient":
      return "text-amber-accent";
    case "At Risk":
      return "text-amber-accent";
    case "Sufficient":
      return "text-green-accent";
    case "Strong":
      return "text-teal-accent";
  }
}

function formatBalance(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

export default function StageCoverageTable({
  rows,
  onStageClick,
}: StageCoverageTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-sm">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-tint/60 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <th className="px-4 py-3">Stage</th>
            <th className="px-4 py-3">Required</th>
            <th className="px-4 py-3">Healthy active</th>
            <th className="px-4 py-3">Stale</th>
            <th className="px-4 py-3">Coverage</th>
            <th className="px-4 py-3">Balance</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.stage}
              className={`border-b border-line last:border-0 ${
                onStageClick
                  ? "cursor-pointer hover:bg-teal-soft/30"
                  : ""
              }`}
              onClick={() => onStageClick?.(row.stage)}
            >
              <td className="px-4 py-3 font-medium text-deep">
                {PIPELINE_STAGE_LABELS[row.stage]}
              </td>
              <td className="px-4 py-3 text-ink">{row.required}</td>
              <td className="px-4 py-3 text-ink">{row.healthyActive}</td>
              <td className="px-4 py-3 text-ink">{row.stale}</td>
              <td className="px-4 py-3 font-semibold text-deep">
                {row.coveragePct}%
              </td>
              <td className="px-4 py-3 text-ink">
                {formatBalance(row.balance)}
              </td>
              <td
                className={`px-4 py-3 font-semibold ${statusClass(row.status)}`}
              >
                {row.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
