"use client";

import {
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CHANGE_EVENT_DOMAIN_LABELS,
  extractChangeDiff,
  fetchChangeEvents,
  formatChangeDiffSide,
  labelForChangeEntity,
} from "@/lib/change-history";
import { useProjects } from "@/lib/store";
import {
  ACTIVE_CHANGE_EVENT_DOMAINS,
  type ChangeEvent,
  type ChangeEventDomain,
} from "@/lib/types";

const PAGE_SIZE = 100;

const selectCls =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-deep outline-none focus:border-teal-accent";

const inputCls =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-deep outline-none focus:border-teal-accent";

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

function formatAction(action: string): string {
  return action.replace(/_/g, " ");
}

function payloadPreview(payload: Record<string, unknown> | null | undefined, action?: string): string | null {
  const diff = extractChangeDiff(payload, action);
  if (!diff.hasDiff) return null;
  const before = formatChangeDiffSide(diff.before);
  const after = formatChangeDiffSide(diff.after);
  if (before === "—" && after === "—") return null;
  if (before === "—") return `→ ${after}`;
  if (after === "—") return `${before} →`;
  // Keep row preview compact (single-line).
  const compact = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);
  return `${compact(before)} → ${compact(after)}`;
}

function DiffPanel({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "before" | "after";
}) {
  const toneCls =
    tone === "before"
      ? "border-rose-200/80 bg-rose-50/50"
      : "border-teal-accent/30 bg-teal-soft/40";
  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </div>
      <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-deep">
        {value}
      </pre>
    </div>
  );
}

export default function AdminChangeHistory() {
  const searchParams = useSearchParams();
  const projectFromUrl = searchParams.get("project") ?? "";
  const { projects, teamMembers, ready: projectsReady } = useProjects();

  const [domain, setDomain] = useState<ChangeEventDomain | "all">("all");
  const [projectId, setProjectId] = useState(projectFromUrl || "all");
  const [actorUserId, setActorUserId] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());

  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const visibleProjects = useMemo(
    () =>
      [...projects]
        .filter((p) => !p.isWarehouseHolding)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const actors = useMemo(() => {
    const byId = new Map<string, string>();
    for (const m of teamMembers) {
      if (m.id) byId.set(m.id, m.name);
    }
    for (const ev of events) {
      if (ev.actorUserId && ev.actorName && !byId.has(ev.actorUserId)) {
        byId.set(ev.actorUserId, ev.actorName);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teamMembers, events]);

  const entityTypesInView = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) set.add(ev.entityType);
    return [...set].sort((a, b) =>
      labelForChangeEntity(a).localeCompare(labelForChangeEntity(b)),
    );
  }, [events]);

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        domain,
        projectId,
        actorUserId,
        entityType,
        search: deferredSearch,
        reloadKey,
      }),
    [domain, projectId, actorUserId, entityType, deferredSearch, reloadKey],
  );

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError("");
        setEvents([]);
        setExpandedId(null);
      }
      try {
        const rows = await fetchChangeEvents({
          limit: PAGE_SIZE,
          offset,
          ...(domain !== "all" ? { domain } : { domains: [...ACTIVE_CHANGE_EVENT_DOMAINS] }),
          ...(projectId !== "all" ? { projectId } : {}),
          ...(actorUserId !== "all" ? { actorUserId } : {}),
          ...(entityType !== "all" ? { entityType } : {}),
          ...(deferredSearch ? { search: deferredSearch } : {}),
        });
        setHasMore(rows.length >= PAGE_SIZE);
        setEvents((prev) => (append ? [...prev, ...rows] : rows));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load history");
        if (!append) setEvents([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [domain, projectId, actorUserId, entityType, deferredSearch],
  );

  useEffect(() => {
    void loadPage(0, false);
  }, [filterKey, loadPage]);

  useEffect(() => {
    if (projectFromUrl) setProjectId(projectFromUrl);
  }, [projectFromUrl]);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-1 py-2 sm:px-0">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-deep">Change history</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Append-only log of non-financial edits stored in the database —
            projects, comments/updates, to-dos, contacts, files, Gantt,
            warehouse, and prospecting. Financial Excel changes are not included
            yet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-deep hover:border-teal-accent"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Search summary
          <input
            className={inputCls}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. stage, comment, contact…"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Domain
          <select
            className={selectCls}
            value={domain}
            onChange={(e) =>
              setDomain(e.target.value as ChangeEventDomain | "all")
            }
          >
            <option value="all">All (excl. finance)</option>
            {ACTIVE_CHANGE_EVENT_DOMAINS.map((d) => (
              <option key={d} value={d}>
                {CHANGE_EVENT_DOMAIN_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Project
          <select
            className={selectCls}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!projectsReady}
          >
            <option value="all">All projects</option>
            {visibleProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Who
          <select
            className={selectCls}
            value={actorUserId}
            onChange={(e) => setActorUserId(e.target.value)}
          >
            <option value="all">Anyone</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Entity
          <select
            className={selectCls}
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          >
            <option value="all">All types</option>
            <option value="comment">Comment / update</option>
            <option value="project">Project</option>
            <option value="todo">To-do</option>
            <option value="contact">Contact</option>
            <option value="file">File</option>
            <option value="prospect_company">Prospect company</option>
            <option value="prospect_contact">Prospect contact</option>
            <option value="prospect_activity">Prospect outreach</option>
            {entityTypesInView
              .filter(
                (t) =>
                  ![
                    "comment",
                    "project",
                    "todo",
                    "contact",
                    "file",
                    "prospect_company",
                    "prospect_contact",
                    "prospect_activity",
                  ].includes(t),
              )
              .map((t) => (
                <option key={t} value={t}>
                  {labelForChangeEntity(t)}
                </option>
              ))}
          </select>
        </label>
        <p className="pb-1.5 text-xs text-muted">
          {loading
            ? "Loading…"
            : `${events.length} event${events.length === 1 ? "" : "s"}${
                hasMore ? "+" : ""
              }`}
        </p>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line bg-surface text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5">When</th>
              <th className="px-3 py-2.5">Who</th>
              <th className="px-3 py-2.5">Domain</th>
              <th className="px-3 py-2.5">Entity</th>
              <th className="px-3 py-2.5">Action</th>
              <th className="px-3 py-2.5">Summary</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {!loading && events.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-muted"
                >
                  No matching history yet. Edits (including comment
                  create/edit/delete) will show up here after they are saved.
                </td>
              </tr>
            ) : (
              events.map((ev) => {
                const projectLabel = ev.projectId
                  ? projectNameById.get(ev.projectId)
                  : undefined;
                const detail = payloadPreview(ev.payloadJson, ev.action);
                const diff = extractChangeDiff(ev.payloadJson, ev.action);
                const open = expandedId === ev.id;
                return (
                  <Fragment key={ev.id}>
                    <tr className="border-b border-line/70 last:border-0 hover:bg-surface/60">
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                        {formatWhen(ev.occurredAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-deep">
                        {ev.actorName ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                        {CHANGE_EVENT_DOMAIN_LABELS[ev.domain]}
                        {projectLabel ? (
                          <Link
                            href={`/projects/${ev.projectId}`}
                            className="mt-0.5 block max-w-[10rem] truncate text-[11px] text-teal-accent hover:underline"
                            title={projectLabel}
                          >
                            {projectLabel}
                          </Link>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                        {labelForChangeEntity(ev.entityType)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 capitalize text-muted">
                        {formatAction(ev.action)}
                      </td>
                      <td className="max-w-lg px-3 py-2.5 text-deep">
                        <div>{ev.summary}</div>
                        {detail && !open ? (
                          <div className="mt-0.5 truncate text-[11px] text-muted">
                            {detail}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          className="text-[11px] font-semibold uppercase tracking-wide text-teal-accent hover:underline"
                          onClick={() =>
                            setExpandedId((id) => (id === ev.id ? null : ev.id))
                          }
                        >
                          {open ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-b border-line/70 bg-surface/40">
                        <td colSpan={7} className="px-3 py-3">
                          <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                              <dt className="font-semibold uppercase tracking-wide text-muted">
                                Event id
                              </dt>
                              <dd className="mt-0.5 font-mono text-deep">
                                {ev.id}
                              </dd>
                            </div>
                            {ev.entityId ? (
                              <div>
                                <dt className="font-semibold uppercase tracking-wide text-muted">
                                  Entity id
                                </dt>
                                <dd className="mt-0.5 font-mono text-deep">
                                  {ev.entityId}
                                </dd>
                              </div>
                            ) : null}
                            {ev.field ? (
                              <div>
                                <dt className="font-semibold uppercase tracking-wide text-muted">
                                  Field
                                </dt>
                                <dd className="mt-0.5 text-deep">{ev.field}</dd>
                              </div>
                            ) : null}
                            {ev.projectId ? (
                              <div>
                                <dt className="font-semibold uppercase tracking-wide text-muted">
                                  Project
                                </dt>
                                <dd className="mt-0.5 text-deep">
                                  <Link
                                    href={`/projects/${ev.projectId}`}
                                    className="text-teal-accent hover:underline"
                                  >
                                    {projectLabel ?? ev.projectId}
                                  </Link>
                                </dd>
                              </div>
                            ) : null}
                          </dl>

                          {diff.hasDiff ? (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <DiffPanel
                                label="Before"
                                tone="before"
                                value={formatChangeDiffSide(diff.before)}
                              />
                              <DiffPanel
                                label="After"
                                tone="after"
                                value={formatChangeDiffSide(diff.after)}
                              />
                            </div>
                          ) : (
                            <p className="mt-3 text-xs text-muted">
                              No before/after values stored for this event.
                            </p>
                          )}

                          {ev.payloadJson ? (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-deep">
                                Raw payload
                              </summary>
                              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-line bg-panel p-3 font-mono text-[11px] text-deep">
                                {JSON.stringify(ev.payloadJson, null, 2)}
                              </pre>
                            </details>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-muted"
                >
                  Loading history…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadPage(events.length, true)}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-deep hover:border-teal-accent disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
