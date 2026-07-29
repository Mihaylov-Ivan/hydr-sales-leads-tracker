"use client";

import { useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import { Market, MARKETS, Stage, STAGE_LABELS, STAGES } from "@/lib/types";
import ProjectCard from "@/components/ProjectCard";
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

export default function Dashboard() {
  const { projects, ready } = useProjects();
  const [countryFilter, setCountryFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState<Market | "all">("all");
  const [sizeFilter, setSizeFilter] = useState<SizeBucket>("any");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

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
        (marketFilter === "all" || p.market === marketFilter) &&
        bucket.match(p.sizeKw) &&
        (!q ||
          [p.name, p.client, p.city, p.country, p.market, p.baseDescription]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [projects, countryFilter, marketFilter, sizeFilter, search]);

  const byStage = useMemo(() => {
    const map: Record<Stage, typeof filtered> = {
      "new-lead": [],
      "under-development": [],
      commissioned: [],
    };
    for (const p of filtered) map[p.stage].push(p);
    return map;
  }, [filtered]);

  if (!ready) {
    return <p className="py-20 text-center text-muted">Loading projects…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-deep">Projects</h1>
          <p className="mt-1 text-sm text-muted">
            {projects.length} projects across {countries.length}{" "}
            {countries.length === 1 ? "country" : "countries"}
          </p>
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
        <select
          className={selectCls}
          value={marketFilter}
          onChange={(e) => setMarketFilter(e.target.value as Market | "all")}
        >
          <option value="all">All markets</option>
          {MARKETS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
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

      {/* Stage board */}
      <div className="grid gap-4 md:grid-cols-3">
        {STAGES.map((stage) => (
          <section
            key={stage}
            className={`flex flex-col rounded-xl border border-line border-t-4 bg-surface-tint/60 ${COLUMN_ACCENT[stage]}`}
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
                <p className="rounded-lg border border-dashed border-line py-8 text-center text-xs text-muted">
                  No projects here.
                </p>
              ) : (
                byStage[stage].map((p) => <ProjectCard key={p.id} project={p} />)
              )}
            </div>
          </section>
        ))}
      </div>

      {showNew && <NewProjectDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}
