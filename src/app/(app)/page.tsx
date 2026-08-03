"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import { Market, MARKETS, Stage, STAGE_LABELS, BOARD_STAGES } from "@/lib/types";
import ProjectCard, { PROJECT_DRAG_TYPE } from "@/components/ProjectCard";
import NewProjectDialog from "@/components/NewProjectDialog";
import OverviewTimeline from "@/components/OverviewTimeline";
import { projectsWithMergedFinancials } from "@/lib/finance-merge";
import TeamMembersPanel from "@/components/TeamMembersPanel";

type SizeBucket = "any" | "small" | "medium" | "large";

const SIZE_BUCKETS: { id: SizeBucket; label: string; match: (kw: number) => boolean }[] = [
  { id: "any", label: "Any size", match: () => true },
  { id: "small", label: "< 250 kW", match: (kw) => kw < 250 },
  { id: "medium", label: "250 – 1000 kW", match: (kw) => kw >= 250 && kw <= 1000 },
  { id: "large", label: "> 1000 kW", match: (kw) => kw > 1000 },
];

const COLUMN_ACCENT: Record<Stage, string> = {
  "cold-lead": "border-t-teal-accent",
  "hot-lead": "border-t-amber-accent",
  "under-development": "border-t-olive",
  commissioned: "border-t-green-accent",
  cancelled: "border-t-muted",
};

const CANCELLED_STORAGE_KEY = "hydrogenera-show-cancelled-v1";

const selectCls =
  "rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-teal-accent";

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
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-t-4 transition ${accentClass} ${
        isOver
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
          className={`text-sm font-bold uppercase tracking-wide ${
            stage === "cancelled" ? "text-muted" : "text-deep"
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
        className={`flex min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain px-3 py-3 ${
          expanded
            ? "grid grid-cols-1 content-start sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
            : "flex-col"
        }`}
      >
        {projects.length === 0 ? (
          <p
            className={`rounded-lg border border-dashed py-8 text-center text-xs ${
              isOver
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
    showFinancials,
    setShowFinancials,
    financeImport,
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
  const [expandedStage, setExpandedStage] = useState<Stage | null>(null);

  const displayProjects = useMemo(
    () => projectsWithMergedFinancials(projects, financeImport),
    [projects, financeImport],
  );

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CANCELLED_STORAGE_KEY) === "1") {
        setShowCancelled(true);
      }
    } catch {
      // ignore
    }
    setCancelledPrefReady(true);
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
    if (!expandedStage) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpandedStage(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expandedStage]);

  const countries = useMemo(
    () => [...new Set(displayProjects.map((p) => p.country))].sort(),
    [displayProjects],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bucket = SIZE_BUCKETS.find((b) => b.id === sizeFilter)!;
    return displayProjects.filter(
      (p) =>
        (countryFilter === "all" || p.country === countryFilter) &&
        marketFilter.has(p.market) &&
        bucket.match(p.sizeKw) &&
        (!q ||
          [p.name, p.client, p.city, p.country, p.market, p.baseDescription]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [displayProjects, countryFilter, marketFilter, sizeFilter, search]);

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
      "cold-lead": [],
      "hot-lead": [],
      "under-development": [],
      commissioned: [],
      cancelled: [],
    };
    for (const p of filtered) map[p.stage].push(p);
    return map;
  }, [filtered]);

  function moveProjectToStage(projectId: string, stage: Stage) {
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.stage === stage) return;
    updateProject(projectId, { stage });
    if (stage === "cancelled") setShowCancelled(true);
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

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col gap-3 overflow-hidden sm:gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-deep">Projects</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={showFinancials}
            onClick={() => setShowFinancials(!showFinancials)}
            className={`rounded-lg border px-4 py-2.5 text-sm font-bold uppercase tracking-wide shadow-sm transition ${
              showFinancials
                ? "border-teal-accent/40 bg-teal-soft text-teal-accent"
                : "border-line bg-panel text-deep hover:border-teal-accent/40 hover:text-teal-accent"
            }`}
          >
            Financials {showFinancials ? "On" : "Off"}
          </button>
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

      {/* Cash chart — capped so columns keep the remaining viewport */}
      {showFinancials && (
        <div className="max-h-[min(32vh,18rem)] shrink-0 overflow-y-auto overscroll-contain">
          <OverviewTimeline projects={filtered} />
        </div>
      )}

      {/* Stage board fills leftover height; only columns scroll */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {/* Collapsed rail: click or drop to reveal */}
        {!showCancelled && (
          <button
            type="button"
            aria-expanded={false}
            aria-controls="cancelled-column"
            onClick={() => setShowCancelled(true)}
            {...columnDragHandlers("cancelled")}
            className={`group flex h-full w-11 shrink-0 flex-col items-center justify-between rounded-xl border border-t-4 border-t-muted border-line bg-muted/5 py-3 transition hover:border-muted hover:bg-muted/10 ${
              cancelledOver
                ? "border-teal-accent bg-teal-soft/40 ring-2 ring-teal-accent/30"
                : ""
            }`}
            title="Show cancelled projects"
          >
            <span className="rounded-full bg-panel px-1.5 py-0.5 text-[10px] font-bold text-muted shadow-sm">
              {cancelledCount}
            </span>
            <span
              className="flex flex-1 items-center justify-center px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              Cancelled
            </span>
            <span
              className="text-sm text-muted/70 transition group-hover:translate-x-0.5 group-hover:text-muted"
              aria-hidden
            >
              ›
            </span>
          </button>
        )}

        {/* Expanded cancelled column slides in from the left */}
        <div
          id="cancelled-column"
          aria-hidden={!showCancelled}
          className={`min-h-0 min-w-0 overflow-hidden transition-[max-width,opacity,flex-basis] duration-300 ease-out ${
            showCancelled
              ? "max-w-[20rem] flex-1 basis-[20rem] opacity-100"
              : "pointer-events-none max-w-0 flex-none basis-0 opacity-0"
          }`}
        >
          <div
            className={`h-full min-h-0 w-[min(100%,20rem)] transition-transform duration-300 ease-out ${
              showCancelled ? "translate-x-0" : "-translate-x-3"
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

        {/* Active stage columns */}
        <div className="grid min-h-0 min-w-0 flex-1 gap-4 md:grid-cols-2 md:grid-rows-2 xl:grid-cols-4 xl:grid-rows-1">
          {BOARD_STAGES.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              projects={byStage[stage]}
              isOver={dragOverStage === stage}
              accentClass={COLUMN_ACCENT[stage]}
              {...columnDragHandlers(stage)}
              onExpand={() => setExpandedStage(stage)}
            />
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
