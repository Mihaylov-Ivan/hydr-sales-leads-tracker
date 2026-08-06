"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type MenuPos = {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
};

function computeMenuPos(
  btn: HTMLElement,
  itemCount: number,
): MenuPos {
  const r = btn.getBoundingClientRect();
  const estimatedH = Math.min(320, 56 + itemCount * 40);
  const spaceBelow = window.innerHeight - r.bottom - 8;
  const spaceAbove = r.top - 8;
  const openUp = spaceBelow < estimatedH && spaceAbove > spaceBelow;
  const maxHeight = Math.max(160, openUp ? spaceAbove : spaceBelow);
  const menuW = Math.min(288, window.innerWidth - 16);
  const left = Math.min(Math.max(8, r.left), window.innerWidth - 8 - menuW);
  if (openUp) {
    return {
      bottom: window.innerHeight - r.top + 4,
      left,
      maxHeight,
    };
  }
  return { top: r.bottom + 4, left, maxHeight };
}

export default function ProjectMultiSelect({
  projects,
  selectedIds,
  colorById,
  onToggle,
  onSelectAll,
  onClear,
  compact,
}: {
  projects: Project[];
  selectedIds: Set<string>;
  colorById?: Map<string, string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    function update() {
      const btn = btnRef.current;
      if (!btn) return;
      setPos(computeMenuPos(btn, projects.length));
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, projects.length]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
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

  const menu =
    open &&
    pos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-multiselectable="true"
        className="fixed z-[80] flex w-72 max-w-[min(18rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-lg"
        style={{
          top: pos.top,
          bottom: pos.bottom,
          left: pos.left,
          maxHeight: pos.maxHeight,
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
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
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {projects.map((p, i) => {
            const on = selectedIds.has(p.id);
            const color = colorById?.get(p.id) ?? colorForProjectIndex(i);
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
      </div>,
      document.body,
    );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          compact
            ? "inline-flex w-full max-w-[14rem] items-center justify-between gap-1 rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] font-semibold text-ink outline-none transition hover:border-teal-accent/40 focus:border-teal-accent"
            : "inline-flex max-w-[16rem] items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-sm outline-none transition hover:border-teal-accent/40 focus:border-teal-accent"
        }
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-muted" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {menu}
    </div>
  );
}
