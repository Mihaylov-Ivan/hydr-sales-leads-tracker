"use client";

import Link from "next/link";
import { STAGE_LABELS } from "@/lib/types";
import type { ClassifiedProject } from "@/lib/metrics/types";

interface DrillDownPanelProps {
  title: string;
  subtitle?: string;
  projects: ClassifiedProject[];
  ownerName: (ownerId: string) => string;
  liveProjectIds: Set<string>;
  showStaleActions?: boolean;
  onClose: () => void;
}

function outcomeLabel(c: ClassifiedProject): string {
  switch (c.outcomeClass) {
    case "converted":
      return "Converted";
    case "cancelled":
      return "Cancelled";
    case "stale":
      return "Stale";
    case "healthy-active":
      return "Healthy active";
  }
}

export default function DrillDownPanel({
  title,
  subtitle,
  projects,
  ownerName,
  liveProjectIds,
  showStaleActions = false,
  onClose,
}: DrillDownPanelProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-deep/30 backdrop-blur-[1px]">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close drill-down"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-line bg-panel shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-deep">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
            )}
            <p className="mt-1 text-xs text-muted">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted hover:bg-surface hover:text-deep"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {projects.length === 0 ? (
            <p className="p-6 text-sm text-muted">No projects in this set.</p>
          ) : (
            <ul className="divide-y divide-line">
              {projects.map((c) => {
                const p = c.project;
                const live = liveProjectIds.has(p.id);
                return (
                  <li key={p.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {live ? (
                          <Link
                            href={`/projects/${p.id}`}
                            className="font-medium text-deep hover:text-teal-accent"
                          >
                            {p.name}
                          </Link>
                        ) : (
                          <p className="font-medium text-deep">{p.name}</p>
                        )}
                        <p className="mt-0.5 text-xs text-muted">
                          {STAGE_LABELS[p.currentStatus]} · {ownerName(p.ownerId)} ·{" "}
                          {p.market}
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-surface-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {outcomeLabel(c)}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                      <div>
                        <dt className="inline font-semibold text-ink/70">
                          Last activity:{" "}
                        </dt>
                        <dd className="inline">{p.lastMeaningfulActivityAt}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-ink/70">
                          Days inactive:{" "}
                        </dt>
                        <dd className="inline">{c.daysInactive}</dd>
                      </div>
                      {c.staleReason && (
                        <div className="col-span-2">
                          <dt className="inline font-semibold text-ink/70">
                            Stale reason:{" "}
                          </dt>
                          <dd className="inline">{c.staleReason}</dd>
                        </div>
                      )}
                      {showStaleActions && c.requiredAction && (
                        <div className="col-span-2">
                          <dt className="inline font-semibold text-ink/70">
                            Required action:{" "}
                          </dt>
                          <dd className="inline font-medium text-deep">
                            {c.requiredAction}
                          </dd>
                        </div>
                      )}
                      {p.cancellationReason && (
                        <div className="col-span-2">
                          <dt className="inline font-semibold text-ink/70">
                            Cancellation:{" "}
                          </dt>
                          <dd className="inline">{p.cancellationReason}</dd>
                        </div>
                      )}
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
