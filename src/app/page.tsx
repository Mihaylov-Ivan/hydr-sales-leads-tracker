"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import { Market, MARKETS, Stage, STAGE_LABELS, STAGES } from "@/lib/types";
import ProjectCard, { PROJECT_DRAG_TYPE } from "@/components/ProjectCard";
import NewProjectDialog from "@/components/NewProjectDialog";
import OverviewTimeline from "@/components/OverviewTimeline";

type SizeBucket = "any" | "small" | "medium" | "large";

const SIZE_BUCKETS: { id: SizeBucket; label: string; match: (kw: number) => boolean }[] = [
  { id: "any", label: "Any size", match: () => true },
  { id: "small", label: "< 250 kW", match: (kw) => kw < 250 },
  { id: "medium", label: "250 – 1000 kW", match: (kw) => kw >= 250 && kw <= 1000 },
  { id: "large", label: "> 1000 kW", match: (kw) => kw > 1000 },
];

const COLUMN_ACCENT: Record<Stage, string> = {
  "new-lead": "border-t-teal-accent",
  "under-development": "border-t-amber-accent",
  commissioned: "border-t-green-accent",
};

const selectCls =
  "rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm outline-none focus:border-teal-accent";

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
  const { projects, ready, updateProject } = useProjects();
  const [countryFilter, setCountryFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState<Set<Market>>(
    () => new Set(MARKETS),
  );
  const [sizeFilter, setSizeFilter] = useState<SizeBucket>("any");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);

  const countries = useMemo(
    () => [...new Set(projects.map((p) => p.country))].sort(),
    [projects],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bucket = SIZE_BUCKETS.find((b) => b.id === sizeFilter)!;
    return projects.filter(
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
      "new-lead": [],
      "under-development": [],
      commissioned: [],
    };
    for (const p of filtered) map[p.stage].push(p);
    return map;
  }, [filtered]);

  function moveProjectToStage(projectId: string, stage: Stage) {
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.stage === stage) return;
    updateProject(projectId, { stage });
  }

  if (!ready) {
    return <p className="py-20 text-center text-muted">Loading projects…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-deep">Projects</h1>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-olive px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-olive-ink shadow-sm transition hover:brightness-105"
        >
          + New Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
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

      {/* Cash-in timeline */}
      <OverviewTimeline projects={filtered} />

      {/* Stage board — drag cards between columns to change stage */}
      <div className="grid gap-4 md:grid-cols-3">
        {STAGES.map((stage) => {
          const isOver = dragOverStage === stage;
          return (
            <section
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverStage !== stage) setDragOverStage(stage);
              }}
              onDragLeave={(e) => {
                // Ignore leave events that stay within this column
                if (
                  e.currentTarget.contains(e.relatedTarget as Node | null)
                ) {
                  return;
                }
                setDragOverStage((cur) => (cur === stage ? null : cur));
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const id =
                  e.dataTransfer.getData(PROJECT_DRAG_TYPE) ||
                  e.dataTransfer.getData("text/plain");
                if (id) moveProjectToStage(id, stage);
              }}
              className={`flex min-h-48 flex-col rounded-xl border border-t-4 bg-surface-tint/60 transition ${COLUMN_ACCENT[stage]} ${
                isOver
                  ? "border-teal-accent bg-teal-soft/40 ring-2 ring-teal-accent/30"
                  : "border-line"
              }`}
            >
              <header className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-deep">
                  {STAGE_LABELS[stage]}
                </h2>
                <span className="rounded-full bg-panel px-2.5 py-0.5 text-xs font-semibold text-muted shadow-sm">
                  {byStage[stage].length}
                </span>
              </header>
              <div className="flex flex-1 flex-col gap-3 px-3 pb-3">
                {byStage[stage].length === 0 ? (
                  <p
                    className={`rounded-lg border border-dashed py-8 text-center text-xs ${
                      isOver
                        ? "border-teal-accent text-teal-accent"
                        : "border-line text-muted"
                    }`}
                  >
                    {isOver ? "Drop to move here" : "No projects here."}
                  </p>
                ) : (
                  byStage[stage].map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}
