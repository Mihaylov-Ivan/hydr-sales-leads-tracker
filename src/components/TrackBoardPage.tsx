"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  Stage,
  STAGE_LABELS,
  ProjectTrack,
  PROJECT_TRACK_LABELS,
  boardStagesForTrack,
  stagesForTrack,
  trackOfProject,
} from "@/lib/types";
import ProjectCard, { PROJECT_DRAG_TYPE } from "@/components/ProjectCard";
import NewProjectDialog from "@/components/NewProjectDialog";
import { useAuth } from "@/lib/auth-context";
import { readUiPref, writeUiPref } from "@/lib/ui-prefs";
import { usePersistedScroll } from "@/lib/scroll-restore";

const COLUMN_ACCENT: Partial<Record<Stage, string>> = {
  "eu-application-prep": "border-t-teal-accent",
  "eu-application-submitted": "border-t-amber-accent",
  "eu-project-started": "border-t-green-accent",
  "rnd-execution": "border-t-olive",
  cancelled: "border-t-muted",
};

const COLUMN_MIN_PX = 270;

function StageColumn({
  stage,
  projects,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  accentClass,
  headerExtra,
  allowDrag = true,
  scrollKey,
}: {
  stage: Stage;
  projects: ReturnType<typeof useProjects>["projects"];
  isOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  accentClass: string;
  headerExtra?: React.ReactNode;
  allowDrag?: boolean;
  scrollKey: string;
}) {
  const listRef = usePersistedScroll(scrollKey, [projects.length]);

  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-t-4 transition ${accentClass} ${
        isOver
          ? "border-teal-accent bg-teal-soft/40 ring-2 ring-teal-accent/30"
          : stage === "cancelled"
            ? "border-line/80 bg-muted/5"
            : "border-line bg-surface-tint/60"
      }`}
    >
      <header
        className={`sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-line/70 px-4 py-3 backdrop-blur-sm ${
          isOver
            ? "bg-teal-soft/40"
            : stage === "cancelled"
              ? "bg-muted/5"
              : "bg-surface-tint/60"
        }`}
      >
        <h2
          className={`text-sm font-bold uppercase tracking-wide ${
            stage === "cancelled" ? "text-muted" : "text-deep"
          }`}
        >
          {STAGE_LABELS[stage]}
        </h2>
        <div className="flex items-center gap-2">
          {headerExtra}
          <span className="rounded-full bg-panel px-2 py-0.5 text-xs font-bold text-muted shadow-sm">
            {projects.length}
          </span>
        </div>
      </header>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {projects.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted">No projects</p>
        ) : (
          projects.map((p) => (
            <ProjectCard key={p.id} project={p} allowDrag={allowDrag} />
          ))
        )}
      </div>
    </section>
  );
}

const TRACK_COPY: Record<
  "eu" | "rnd",
  { title: string; subtitle: string; blurb: string; newLabel: string }
> = {
  eu: {
    title: "EU Projects",
    subtitle: "Separate from Sales · financials and warehouse linked company-wide",
    blurb:
      "Pipeline: Application Preparation → Submitted → Project Started. Funding income and expenses both feed company financials.",
    newLabel: "EU Project",
  },
  rnd: {
    title: "RnD",
    subtitle: "Separate from Sales · expenses only · linked to company cashflow",
    blurb:
      "RnD tracks project execution with expenses only (no income). Spend still rolls into company cashflow and can link to warehouse lots.",
    newLabel: "RnD Project",
  },
};

export default function TrackBoardPage({ track }: { track: "eu" | "rnd" }) {
  const { projects, ready, updateProject } = useProjects();
  const { canWrite } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const boardHScrollRef = usePersistedScroll(`board:${track}:h`, [
    ready,
    showCancelled,
  ]);

  const prefsKey = `hydrogenera-${track}-board-prefs-v1`;
  const copy = TRACK_COPY[track];
  const boardStages = boardStagesForTrack(track);
  const allStages = stagesForTrack(track);

  useEffect(() => {
    try {
      const saved = readUiPref<{ showCancelled?: boolean }>(prefsKey, {});
      if (typeof saved.showCancelled === "boolean") {
        setShowCancelled(saved.showCancelled);
      }
    } catch {
      /* ignore */
    }
    setPrefsReady(true);
  }, [prefsKey]);

  useEffect(() => {
    if (!prefsReady) return;
    writeUiPref(prefsKey, { showCancelled });
  }, [prefsReady, prefsKey, showCancelled]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (p.isWarehouseHolding) return false;
      if (trackOfProject(p) !== track) return false;
      if (!q) return true;
      return [p.name, p.client, p.city, p.country, p.market, p.baseDescription]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [projects, track, search]);

  const byStage = useMemo(() => {
    const map: Partial<Record<Stage, typeof filtered>> = {};
    for (const s of allStages) map[s] = [];
    for (const p of filtered) {
      const list = map[p.stage];
      if (list) list.push(p);
      else if (map["rnd-execution"] && track === "rnd") {
        map["rnd-execution"]!.push(p);
      } else if (map["eu-application-prep"] && track === "eu") {
        map["eu-application-prep"]!.push(p);
      }
    }
    return map;
  }, [filtered, allStages, track]);

  function moveProjectToStage(projectId: string, stage: Stage) {
    if (!canWrite) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.stage === stage) return;
    if (trackOfProject(project) !== track) return;
    updateProject(projectId, { stage });
    if (stage === "cancelled") setShowCancelled(true);
  }

  function columnDragHandlers(stage: Stage) {
    if (!canWrite) {
      return {
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDragLeave: () => {},
        onDrop: (e: React.DragEvent) => e.preventDefault(),
      };
    }
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverStage !== stage) setDragOverStage(stage);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOverStage((cur) => (cur === stage ? null : cur));
        }
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

  const cancelledCount = byStage.cancelled?.length ?? 0;

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col gap-3 overflow-hidden sm:gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-deep">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted">{copy.subtitle}</p>
        </div>
        {canWrite ? (
          <button
            onClick={() => setShowNew(true)}
            className="rounded-lg bg-olive px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-olive-ink shadow-sm transition hover:brightness-105"
          >
            + New {copy.newLabel}
          </button>
        ) : (
          <span className="rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            View only
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${PROJECT_TRACK_LABELS[track as ProjectTrack].toLowerCase()}…`}
          className="min-w-56 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted/60 outline-none focus:border-teal-accent"
        />
      </div>

      <p className="shrink-0 text-xs text-muted">{copy.blurb}</p>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {!showCancelled && (
          <button
            type="button"
            {...columnDragHandlers("cancelled")}
            onClick={() => setShowCancelled(true)}
            className={`group flex h-full w-11 shrink-0 flex-col items-center justify-between rounded-xl border border-t-4 border-t-muted border-line bg-muted/5 py-3 transition hover:border-muted hover:bg-muted/10 ${
              dragOverStage === "cancelled"
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
          </button>
        )}

        {showCancelled && (
          <div
            className="min-h-0 shrink-0 overflow-hidden"
            style={{ minWidth: COLUMN_MIN_PX, width: COLUMN_MIN_PX }}
          >
            <StageColumn
              stage="cancelled"
              projects={byStage.cancelled ?? []}
              isOver={dragOverStage === "cancelled"}
              accentClass={COLUMN_ACCENT.cancelled ?? "border-t-muted"}
              allowDrag={canWrite}
              scrollKey={`board:${track}:col:cancelled`}
              {...columnDragHandlers("cancelled")}
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
        )}

        <div
          ref={boardHScrollRef}
          className="flex min-h-0 min-w-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain"
        >
          {boardStages.map((stage) => (
            <div
              key={stage}
              className="flex h-full min-h-0 min-w-[270px] flex-1 basis-[270px]"
            >
              <StageColumn
                stage={stage}
                projects={byStage[stage] ?? []}
                isOver={dragOverStage === stage}
                accentClass={COLUMN_ACCENT[stage] ?? "border-t-muted"}
                allowDrag={canWrite}
                scrollKey={`board:${track}:col:${stage}`}
                {...columnDragHandlers(stage)}
              />
            </div>
          ))}
        </div>
      </div>

      {canWrite && showNew && (
        <NewProjectDialog onClose={() => setShowNew(false)} track={track} />
      )}
    </div>
  );
}
