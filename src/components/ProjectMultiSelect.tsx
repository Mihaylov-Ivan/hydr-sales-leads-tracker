"use client";

import { useEffect, useRef, useState } from "react";
import { Project } from "@/lib/types";

export const PROJECT_FILTER_COLORS = [
  "#009e98",
  "#b4be35",
  "#d99a06",
  "#2f8f4e",
  "#14545c",
  "#c45c26",
  "#3d7ea6",
  "#8a6d3b",
  "#5a8f7b",
  "#a35d6a",
];

export function colorForProjectIndex(index: number): string {
  return PROJECT_FILTER_COLORS[index % PROJECT_FILTER_COLORS.length];
}

export default function ProjectMultiSelect({
  projects,
  selectedIds,
  colorById,
  onToggle,
  onSelectAll,
  onClear,
}: {
  projects: Project[];
  selectedIds: Set<string>;
  colorById?: Map<string, string>;
  onToggle: (id: string) => void;
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

  const count = selectedIds.size;
  const label =
    count === 0
      ? "No projects"
      : count === projects.length
        ? "All projects"
        : count === 1
          ? (projects.find((p) => selectedIds.has(p.id))?.name ?? "1 project")
          : `${count} projects`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[16rem] items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm outline-none transition hover:border-teal-accent/40 focus:border-teal-accent"
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
          className="absolute left-0 z-30 mt-1 w-72 max-w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-panel shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Projects
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
          <ul className="max-h-64 overflow-y-auto py-1">
            {projects.map((p, i) => {
              const on = selectedIds.has(p.id);
              const color =
                colorById?.get(p.id) ?? colorForProjectIndex(i);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => onToggle(p.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-surface"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                        on
                          ? "border-transparent text-white"
                          : "border-line bg-panel text-transparent"
                      }`}
                      style={on ? { backgroundColor: color } : undefined}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">
                      {p.name}
                    </span>
                    {p.client && (
                      <span className="max-w-[40%] truncate text-xs text-muted">
                        {p.client}
                      </span>
                    )}
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
