"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useProjects } from "@/lib/store";
import type { ChangeEventDomain } from "@/lib/types";

const DOMAIN_LABELS: Record<ChangeEventDomain, string> = {
  crm: "CRM",
  gantt: "Gantt",
  finance_meta: "Finance",
  warehouse: "Warehouse",
  system: "System",
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Compact process/activity history for a single project.
 */
export default function ProjectChangeHistory({
  projectId,
  limit = 12,
}: {
  projectId: string;
  limit?: number;
}) {
  const { changeEvents, financialHistory } = useProjects();
  const [processOnly, setProcessOnly] = useState(true);

  const historyByEventId = useMemo(() => {
    const map = new Map<string, (typeof financialHistory)[number]>();
    for (const h of financialHistory) map.set(h.eventId, h);
    return map;
  }, [financialHistory]);

  const rows = useMemo(() => {
    return changeEvents
      .filter((ev) => ev.projectId === projectId)
      .filter((ev) => (processOnly ? ev.intentional : true))
      .slice(0, limit);
  }, [changeEvents, projectId, processOnly, limit]);

  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
          {processOnly ? "Process history" : "Change history"}
        </h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <input
              type="checkbox"
              checked={processOnly}
              onChange={(e) => setProcessOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-teal-accent"
            />
            Intentional only
          </label>
          <Link
            href={`/history?project=${encodeURIComponent(projectId)}`}
            className="text-[11px] font-semibold uppercase tracking-wide text-teal-accent hover:underline"
          >
            View all
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          {processOnly
            ? "No intentional (process) changes yet. Turn on Meaningful change in the header before editing."
            : "No recorded changes for this project yet."}
        </p>
      ) : (
        <ul className="divide-y divide-line/70">
          {rows.map((ev) => {
            const hist = historyByEventId.get(ev.id);
            const amount =
              hist && (hist.oldValue || hist.newValue)
                ? `${hist.oldValue || "—"} → ${hist.newValue || "—"}`
                : null;
            return (
              <li key={ev.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="w-28 shrink-0 text-xs text-muted">
                  {formatWhen(ev.occurredAt)}
                </span>
                <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted">
                  {DOMAIN_LABELS[ev.domain]}
                </span>
                {ev.intentional ? (
                  <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-accent">
                    Process
                  </span>
                ) : (
                  <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Fix
                  </span>
                )}
                <span className="min-w-0 flex-1 text-deep">
                  <span className="text-muted">{ev.actorName ?? "—"} · </span>
                  {ev.summary}
                  {amount ? (
                    <span className="ml-2 font-mono text-xs text-muted">
                      {amount}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
