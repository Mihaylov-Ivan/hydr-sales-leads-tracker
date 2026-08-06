"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProjects } from "@/lib/store";
import type { ChangeEventDomain } from "@/lib/types";

type ScopeFilter = "all" | "process" | "activity";
type DomainFilter = "all" | ChangeEventDomain;

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
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function HistoryPageInner() {
  const searchParams = useSearchParams();
  const projectFromUrl = searchParams.get("project");
  const { changeEvents, financialHistory, projects, ready } = useProjects();
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [domain, setDomain] = useState<DomainFilter>("all");
  const [projectId, setProjectId] = useState<string>(
    () => projectFromUrl || "all",
  );

  const historyByEventId = useMemo(() => {
    const map = new Map<string, (typeof financialHistory)[number]>();
    for (const h of financialHistory) map.set(h.eventId, h);
    return map;
  }, [financialHistory]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const filtered = useMemo(() => {
    return changeEvents.filter((ev) => {
      if (scope === "process" && !ev.intentional) return false;
      if (domain !== "all" && ev.domain !== domain) return false;
      if (projectId !== "all" && ev.projectId !== projectId) return false;
      return true;
    });
  }, [changeEvents, scope, domain, projectId]);

  const selectCls =
    "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-deep outline-none focus:border-teal-accent";

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 xl:px-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-deep">History</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Activity log of changes in the app. Turn on{" "}
          <span className="font-semibold text-deep">Meaningful change</span> in
          the header before editing when the change is intentional (e.g.
          contract renegotiation). Corrections stay unflagged. History CSV rows
          merge by <span className="font-mono text-xs">event_id</span> on
          import.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Scope
          <select
            className={selectCls}
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeFilter)}
          >
            <option value="all">All</option>
            <option value="process">Process only (intentional)</option>
            <option value="activity">Activity (all edits)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Domain
          <select
            className={selectCls}
            value={domain}
            onChange={(e) => setDomain(e.target.value as DomainFilter)}
          >
            <option value="all">All domains</option>
            <option value="crm">CRM</option>
            <option value="gantt">Gantt</option>
            <option value="finance_meta">Finance</option>
            <option value="warehouse">Warehouse</option>
            <option value="system">System</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Project
          <select
            className={selectCls}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-1.5 text-xs text-muted">
          {ready
            ? `${filtered.length} event${filtered.length === 1 ? "" : "s"}`
            : "Loading…"}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5">When</th>
              <th className="px-3 py-2.5">Who</th>
              <th className="px-3 py-2.5">Domain</th>
              <th className="px-3 py-2.5">Flag</th>
              <th className="px-3 py-2.5">Summary</th>
              <th className="px-3 py-2.5">Amount change</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-muted"
                >
                  No history events yet. Edits you make will appear here.
                </td>
              </tr>
            ) : (
              filtered.map((ev) => {
                const hist = historyByEventId.get(ev.id);
                const projectLabel = ev.projectId
                  ? (projectNameById.get(ev.projectId) ??
                    hist?.projectName ??
                    "")
                  : (hist?.projectName ?? "");
                const amountChange =
                  hist && (hist.oldValue || hist.newValue)
                    ? `${hist.oldValue || "—"} → ${hist.newValue || "—"}`
                    : "";
                return (
                  <tr
                    key={ev.id}
                    className="border-b border-line/70 last:border-0 hover:bg-surface/60"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                      {formatWhen(ev.occurredAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-deep">
                      {ev.actorName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                      {DOMAIN_LABELS[ev.domain]}
                      {projectLabel ? (
                        <span className="mt-0.5 block text-[11px] text-muted/80">
                          {projectLabel}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {ev.intentional ? (
                        <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-accent">
                          Process
                        </span>
                      ) : (
                        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          Correction
                        </span>
                      )}
                    </td>
                    <td className="max-w-md px-3 py-2.5 text-deep">
                      {ev.summary}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted">
                      {amountChange || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 text-sm text-muted sm:px-6">Loading history…</div>
      }
    >
      <HistoryPageInner />
    </Suspense>
  );
}
