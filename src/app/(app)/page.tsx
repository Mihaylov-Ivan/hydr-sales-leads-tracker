"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useProjects } from "@/lib/store";
import { Market, MARKETS, Stage, STAGE_LABELS, BOARD_STAGES } from "@/lib/types";
import {
  KEY_DATE_COLUMNS,
  KEY_DATE_COLUMN_LABELS,
  projectsKeyDatesSorted,
} from "@/lib/project-key-dates";
import ProjectCard, { PROJECT_DRAG_TYPE } from "@/components/ProjectCard";
import ProjectMultiSelect from "@/components/ProjectMultiSelect";
import NewProjectDialog from "@/components/NewProjectDialog";
import TeamMembersPanel from "@/components/TeamMembersPanel";

type SizeBucket = "any" | "small" | "medium" | "large";

const SIZE_BUCKETS: { id: SizeBucket; label: string; match: (kw: number) => boolean }[] = [
  { id: "any", label: "Any size", match: () => true },
  { id: "small", label: "< 250 kW", match: (kw) => kw < 250 },
  { id: "medium", label: "250 – 1000 kW", match: (kw) => kw >= 250 && kw <= 1000 },
  { id: "large", label: "> 1000 kW", match: (kw) => kw > 1000 },
];

const COLUMN_ACCENT: Record<Stage, string> = {
  "to-contact": "border-t-deep",
  "cold-lead": "border-t-teal-accent",
  "hot-lead": "border-t-amber-accent",
  "under-development": "border-t-olive",
  commissioned: "border-t-green-accent",
  cancelled: "border-t-muted",
};

const CANCELLED_STORAGE_KEY = "hydrogenera-show-cancelled-v1";
const TO_CONTACT_STORAGE_KEY = "hydrogenera-show-to-contact-v1";
const COLUMN_MIN_PX = 270;

const selectCls =
  "rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-teal-accent";

function formatKeyDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type ColumnDragHandlers = {
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
};

function CollapsedStageRail({
  stage,
  count,
  isOver,
  onExpand,
  dragHandlers,
}: {
  stage: "to-contact" | "cancelled";
  count: number;
  isOver: boolean;
  onExpand: () => void;
  dragHandlers: ColumnDragHandlers;
}) {
  const label = STAGE_LABELS[stage];
  const muted = stage === "cancelled";
  return (
    <button
      type="button"
      aria-expanded={false}
      aria-controls={`${stage}-column`}
      onClick={onExpand}
      {...dragHandlers}
      className={`group flex h-full w-11 shrink-0 flex-col items-center justify-between rounded-xl border border-t-4 py-3 transition ${muted
        ? "border-t-muted border-line bg-muted/5 hover:border-muted hover:bg-muted/10"
        : "border-t-deep border-line bg-surface-tint/60 hover:border-deep/40 hover:bg-surface-tint"
        } ${isOver
          ? "border-teal-accent bg-teal-soft/40 ring-2 ring-teal-accent/30"
          : ""
        }`}
      title={`Show ${label.toLowerCase()} projects`}
    >
      <span
        className={`rounded-full bg-panel px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${muted ? "text-muted" : "text-deep"
          }`}
      >
        {count}
      </span>
      <span
        className={`flex flex-1 items-center justify-center px-1 text-[11px] font-bold uppercase tracking-[0.18em] ${muted ? "text-muted" : "text-deep"
          }`}
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {label}
      </span>
      <span
        className={`text-sm transition group-hover:translate-x-0.5 ${muted
          ? "text-muted/70 group-hover:text-muted"
          : "text-deep/50 group-hover:text-deep"
          }`}
        aria-hidden
      >
        ›
      </span>
    </button>
  );
}

function StageColumn({
  stage,
  projects,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  accentClass,
  headerExtra,
  onExpand,
  expanded,
}: {
  stage: Stage;
  projects: ReturnType<typeof useProjects>["projects"];
  isOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  accentClass: string;
  headerExtra?: React.ReactNode;
  onExpand?: () => void;
  /** When true, column fills a fullscreen overlay (wider card grid). */
  expanded?: boolean;
}) {
  const headerBg =
    isOver
      ? "bg-teal-soft/40"
      : stage === "cancelled"
        ? "bg-muted/5"
        : "bg-surface-tint/60";

  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-t-4 transition ${accentClass} ${isOver
        ? "border-teal-accent bg-teal-soft/40 ring-2 ring-teal-accent/30"
        : stage === "cancelled"
          ? "border-line/80 bg-muted/5"
          : "border-line bg-surface-tint/60"
        }`}
    >
      <header
        className={`sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-line/70 px-4 py-3 backdrop-blur-sm ${headerBg}`}
      >
        <h2
          className={`text-sm font-bold uppercase tracking-wide ${stage === "cancelled" ? "text-muted" : "text-deep"
            }`}
        >
          {STAGE_LABELS[stage]}
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-panel px-2.5 py-0.5 text-xs font-semibold text-muted shadow-sm">
            {projects.length}
          </span>
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              title={
                expanded
                  ? "Exit full screen"
                  : `Expand ${STAGE_LABELS[stage]}`
              }
              aria-label={
                expanded
                  ? "Exit full screen"
                  : `Expand ${STAGE_LABELS[stage]} to full screen`
              }
              className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted transition hover:bg-panel hover:text-deep"
            >
              {expanded ? "Exit" : "Expand"}
            </button>
          )}
          {headerExtra}
        </div>
      </header>
      <div
        className={`flex min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain px-3 py-3 ${expanded
          ? "grid grid-cols-1 content-start sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          : "flex-col"
          }`}
      >
        {projects.length === 0 ? (
          <p
            className={`rounded-lg border border-dashed py-8 text-center text-xs ${isOver
              ? "border-teal-accent text-teal-accent"
              : "border-line text-muted"
              } ${expanded ? "col-span-full" : ""}`}
          >
            {isOver ? "Drop to move here" : "No projects here."}
          </p>
        ) : (
          projects.map((p) => <ProjectCard key={p.id} project={p} />)
        )}
      </div>
    </section>
  );
}

function MarketMultiSelect({
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  selected: Set<Market>;
  onToggle: (m: Market) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = selected.size;
  const label =
    count === 0
      ? "No markets"
      : count === MARKETS.length
        ? "All markets"
        : count === 1
          ? ([...selected][0] ?? "1 market")
          : `${count} markets`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${selectCls} inline-flex min-w-[10rem] max-w-[16rem] items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-muted" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 z-30 mt-1 w-64 max-w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-panel shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Markets
            </span>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={onSelectAll}
                className="font-semibold text-teal-accent hover:underline"
              >
                All
              </button>
              <span className="text-line">|</span>
              <button
                type="button"
                onClick={onClear}
                className="font-semibold text-muted hover:text-ink hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <ul className="py-1">
            {MARKETS.map((m) => {
              const on = selected.has(m);
              return (
                <li key={m}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => onToggle(m)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-surface"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${on
                        ? "border-teal-accent bg-teal-accent text-white"
                        : "border-line bg-panel text-transparent"
                        }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1 font-medium text-ink">
                      {m}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const {
    projects,
    ready,
    updateProject,
  } = useProjects();
  const [countryFilter, setCountryFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState<Set<Market>>(
    () => new Set(MARKETS),
  );
  const [sizeFilter, setSizeFilter] = useState<SizeBucket>("any");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showTeamMembers, setShowTeamMembers] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [cancelledPrefReady, setCancelledPrefReady] = useState(false);
  const [showToContact, setShowToContact] = useState(false);
  const [toContactPrefReady, setToContactPrefReady] = useState(false);
  const [expandedStage, setExpandedStage] = useState<Stage | null>(null);
  const [keyDatesOpen, setKeyDatesOpen] = useState(false);
  const [keyDateProjectIds, setKeyDateProjectIds] = useState<Set<string> | null>(
    null,
  );
  const prevKeyDateFilterIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CANCELLED_STORAGE_KEY) === "1") {
        setShowCancelled(true);
      }
      if (window.localStorage.getItem(TO_CONTACT_STORAGE_KEY) === "1") {
        setShowToContact(true);
      }
    } catch {
      // ignore
    }
    setCancelledPrefReady(true);
    setToContactPrefReady(true);
  }, []);

  useEffect(() => {
    if (!cancelledPrefReady) return;
    try {
      window.localStorage.setItem(
        CANCELLED_STORAGE_KEY,
        showCancelled ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [showCancelled, cancelledPrefReady]);

  useEffect(() => {
    if (!toContactPrefReady) return;
    try {
      window.localStorage.setItem(
        TO_CONTACT_STORAGE_KEY,
        showToContact ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [showToContact, toContactPrefReady]);

  useEffect(() => {
    if (!expandedStage) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpandedStage(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expandedStage]);

  const countries = useMemo(
    () => [...new Set(projects.map((p) => p.country))].sort(),
    [projects],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bucket = SIZE_BUCKETS.find((b) => b.id === sizeFilter)!;
    return projects.filter(
      (p) =>
        !p.isWarehouseHolding &&
        (countryFilter === "all" || p.country === countryFilter) &&
        marketFilter.has(p.market) &&
        bucket.match(p.sizeKw) &&
        (!q ||
          [p.name, p.client, p.city, p.country, p.market, p.baseDescription]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [projects, countryFilter, marketFilter, sizeFilter, search]);

  function toggleMarket(m: Market) {
    setMarketFilter((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  const byStage = useMemo(() => {
    const map: Record<Stage, typeof filtered> = {
      "to-contact": [],
      "cold-lead": [],
      "hot-lead": [],
      "under-development": [],
      commissioned: [],
      cancelled: [],
    };
    for (const p of filtered) map[p.stage].push(p);
    return map;
  }, [filtered]);

  const keyDateFilterProjects = useMemo(
    () => [...filtered].sort((a, b) => a.name.localeCompare(b.name)),
    [filtered],
  );

  useEffect(() => {
    const valid = new Set(keyDateFilterProjects.map((p) => p.id));
    const prev = prevKeyDateFilterIdsRef.current;
    setKeyDateProjectIds((curr) => {
      if (curr === null) return new Set(valid);
      const next = new Set([...curr].filter((id) => valid.has(id)));
      for (const id of valid) {
        if (!prev.has(id)) next.add(id);
      }
      return next;
    });
    prevKeyDateFilterIdsRef.current = valid;
  }, [keyDateFilterProjects]);

  const selectedKeyDateIds =
    keyDateProjectIds ?? new Set(keyDateFilterProjects.map((p) => p.id));

  const keyDateRows = useMemo(() => {
    const projects = keyDateFilterProjects.filter((p) =>
      selectedKeyDateIds.has(p.id),
    );
    return projectsKeyDatesSorted(projects);
  }, [keyDateFilterProjects, selectedKeyDateIds]);

  function moveProjectToStage(projectId: string, stage: Stage) {
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.stage === stage) return;
    updateProject(projectId, { stage });
    if (stage === "cancelled") setShowCancelled(true);
    if (stage === "to-contact") setShowToContact(true);
  }

  function columnDragHandlers(stage: Stage) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverStage !== stage) setDragOverStage(stage);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOverStage((cur) => (cur === stage ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOverStage(null);
        const id =
          e.dataTransfer.getData(PROJECT_DRAG_TYPE) ||
          e.dataTransfer.getData("text/plain");
        if (id) moveProjectToStage(id, stage);
      },
    };
  }

  if (!ready) {
    return <p className="py-20 text-center text-muted">Loading projects…</p>;
  }

  const cancelledCount = byStage.cancelled.length;
  const cancelledOver = dragOverStage === "cancelled";
  const toContactCount = byStage["to-contact"].length;
  const toContactOver = dragOverStage === "to-contact";

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col gap-3 overflow-hidden sm:gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-deep">Projects</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowTeamMembers(true)}
            className="rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-deep shadow-sm transition hover:border-teal-accent/40 hover:text-teal-accent"
          >
            Team Members
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="rounded-lg bg-olive px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-olive-ink shadow-sm transition hover:brightness-105"
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects, clients, cities…"
          className="min-w-56 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted/60 outline-none focus:border-teal-accent"
        />
        <select
          className={selectCls}
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
        >
          <option value="all">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <MarketMultiSelect
          selected={marketFilter}
          onToggle={toggleMarket}
          onSelectAll={() => setMarketFilter(new Set(MARKETS))}
          onClear={() => setMarketFilter(new Set())}
        />
        <select
          className={selectCls}
          value={sizeFilter}
          onChange={(e) => setSizeFilter(e.target.value as SizeBucket)}
        >
          {SIZE_BUCKETS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      {/* Key project dates — collapsed by default */}
      <section className="shrink-0 overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
        <button
          type="button"
          aria-expanded={keyDatesOpen}
          onClick={() => setKeyDatesOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-tint/40 sm:px-5"
        >
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
              Key project dates
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Read-only from Gantt · {keyDateRows.length} project
              {keyDateRows.length === 1 ? "" : "s"} · sorted by contract signed
            </p>
          </div>
          <span
            className={`shrink-0 text-sm font-semibold text-muted transition ${
              keyDatesOpen ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            ›
          </span>
        </button>
        {keyDatesOpen && (
          <div className="border-t border-line">
            {keyDateFilterProjects.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-4 py-2.5 sm:px-5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Projects
                </span>
                <ProjectMultiSelect
                  projects={keyDateFilterProjects}
                  selectedIds={selectedKeyDateIds}
                  onToggle={(id) => {
                    setKeyDateProjectIds((prev) => {
                      const base =
                        prev ??
                        new Set(keyDateFilterProjects.map((p) => p.id));
                      const next = new Set(base);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  onSelectAll={() =>
                    setKeyDateProjectIds(
                      new Set(keyDateFilterProjects.map((p) => p.id)),
                    )
                  }
                  onClear={() => setKeyDateProjectIds(new Set())}
                  compact
                />
              </div>
            )}
            <div className="max-h-[min(40vh,22rem)] overflow-auto">
              {keyDateRows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  {selectedKeyDateIds.size === 0
                    ? "No projects selected — use the Projects filter above to choose some."
                    : "No projects match the current filters."}
                </p>
              ) : (
                <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-20">
                    <tr className="border-b border-line bg-panel text-[10px] font-semibold uppercase tracking-wide text-muted">
                      <th className="sticky left-0 z-30 bg-panel px-3 py-2 shadow-[2px_0_0_0_var(--color-line,rgba(0,0,0,0.08))]">
                        Project
                      </th>
                      {KEY_DATE_COLUMNS.map((col) => (
                        <th
                          key={col}
                          className="whitespace-nowrap bg-panel px-3 py-2"
                        >
                          {KEY_DATE_COLUMN_LABELS[col]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {keyDateRows.map((row) => (
                      <tr
                        key={row.projectId}
                        className="group border-b border-line/60 hover:bg-surface"
                      >
                        <td className="sticky left-0 z-10 bg-panel px-3 py-2 font-semibold text-deep group-hover:bg-surface">
                          <Link
                            href={`/projects/${row.projectId}`}
                            className="hover:text-teal-accent"
                            title="Open project to edit Gantt dates"
                          >
                            {row.projectName}
                          </Link>
                        </td>
                        {KEY_DATE_COLUMNS.map((col) => (
                          <td
                            key={col}
                            className={`whitespace-nowrap px-3 py-2 tabular-nums ${
                              row.dates[col] ? "text-ink" : "text-muted"
                            }`}
                          >
                            {formatKeyDate(row.dates[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Stage board fills leftover height; only columns scroll */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {!showCancelled && (
          <CollapsedStageRail
            stage="cancelled"
            count={cancelledCount}
            isOver={cancelledOver}
            onExpand={() => setShowCancelled(true)}
            dragHandlers={columnDragHandlers("cancelled")}
          />
        )}

        <div
          id="cancelled-column"
          aria-hidden={!showCancelled}
          className={`min-h-0 overflow-hidden transition-[max-width,opacity,flex-basis] duration-300 ease-out ${showCancelled
            ? "max-w-[20rem] shrink-0 basis-[270px] opacity-100"
            : "pointer-events-none max-w-0 flex-none basis-0 opacity-0"
            }`}
          style={showCancelled ? { minWidth: COLUMN_MIN_PX } : undefined}
        >
          <div
            className={`h-full min-h-0 w-full min-w-[270px] transition-transform duration-300 ease-out ${showCancelled ? "translate-x-0" : "-translate-x-3"
              }`}
          >
            <StageColumn
              stage="cancelled"
              projects={byStage.cancelled}
              isOver={cancelledOver}
              accentClass={COLUMN_ACCENT.cancelled}
              {...columnDragHandlers("cancelled")}
              onExpand={() => setExpandedStage("cancelled")}
              headerExtra={
                <button
                  type="button"
                  onClick={() => setShowCancelled(false)}
                  title="Hide cancelled"
                  className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted transition hover:bg-panel hover:text-deep"
                >
                  Hide
                </button>
              }
            />
          </div>
        </div>

        {!showToContact && (
          <CollapsedStageRail
            stage="to-contact"
            count={toContactCount}
            isOver={toContactOver}
            onExpand={() => setShowToContact(true)}
            dragHandlers={columnDragHandlers("to-contact")}
          />
        )}

        <div
          id="to-contact-column"
          aria-hidden={!showToContact}
          className={`min-h-0 overflow-hidden transition-[max-width,opacity,flex-basis] duration-300 ease-out ${showToContact
            ? "max-w-[20rem] shrink-0 basis-[270px] opacity-100"
            : "pointer-events-none max-w-0 flex-none basis-0 opacity-0"
            }`}
          style={showToContact ? { minWidth: COLUMN_MIN_PX } : undefined}
        >
          <div
            className={`h-full min-h-0 w-full min-w-[270px] transition-transform duration-300 ease-out ${showToContact ? "translate-x-0" : "-translate-x-3"
              }`}
          >
            <StageColumn
              stage="to-contact"
              projects={byStage["to-contact"]}
              isOver={toContactOver}
              accentClass={COLUMN_ACCENT["to-contact"]}
              {...columnDragHandlers("to-contact")}
              onExpand={() => setExpandedStage("to-contact")}
              headerExtra={
                <button
                  type="button"
                  onClick={() => setShowToContact(false)}
                  title="Hide to contact"
                  className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted transition hover:bg-panel hover:text-deep"
                >
                  Hide
                </button>
              }
            />
          </div>
        </div>

        {/* Active stage columns — min 270px, scroll horizontally when they won't fit */}
        <div className="flex min-h-0 min-w-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain">
          {BOARD_STAGES.map((stage) => (
            <div
              key={stage}
              className="flex h-full min-h-0 min-w-[270px] flex-1 basis-[270px]"
            >
              <StageColumn
                stage={stage}
                projects={byStage[stage]}
                isOver={dragOverStage === stage}
                accentClass={COLUMN_ACCENT[stage]}
                {...columnDragHandlers(stage)}
                onExpand={() => setExpandedStage(stage)}
              />
            </div>
          ))}
        </div>
      </div>

      {expandedStage && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-deep/40 p-3 backdrop-blur-sm sm:p-4"
          onClick={() => setExpandedStage(null)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-[1800px] min-h-0 flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <StageColumn
              stage={expandedStage}
              projects={byStage[expandedStage]}
              isOver={dragOverStage === expandedStage}
              accentClass={COLUMN_ACCENT[expandedStage]}
              {...columnDragHandlers(expandedStage)}
              expanded
              onExpand={() => setExpandedStage(null)}
            />
          </div>
        </div>
      )}

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}
      {showTeamMembers && (
        <TeamMembersPanel onClose={() => setShowTeamMembers(false)} />
      )}
    </div>
  );
}
