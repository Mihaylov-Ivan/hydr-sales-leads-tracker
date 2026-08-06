"use client";

import { useEffect, useRef, useState } from "react";

export type FilterMultiSelectOption = {
  id: string;
  label: string;
};

/** Same All / Clear checkbox list pattern as ProjectMultiSelect. */
export default function FilterMultiSelect({
  title,
  options,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  allLabel,
  noneLabel,
  oneLabel,
  manyLabel,
  compact,
}: {
  title: string;
  options: FilterMultiSelectOption[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  allLabel?: string;
  noneLabel?: string;
  oneLabel?: (label: string) => string;
  manyLabel?: (count: number) => string;
  compact?: boolean;
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
      ? (noneLabel ?? `No ${title.toLowerCase()}`)
      : count === options.length
        ? (allLabel ?? `All ${title.toLowerCase()}`)
        : count === 1
          ? (oneLabel?.(
              options.find((o) => selectedIds.has(o.id))?.label ?? "1",
            ) ??
            (options.find((o) => selectedIds.has(o.id))?.label ?? "1"))
          : (manyLabel?.(count) ?? `${count} selected`);

  return (
    <div ref={rootRef} className="relative">
      <button
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

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 z-40 mt-1 w-64 max-w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-panel shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {title}
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
            {options.map((o) => {
              const on = selectedIds.has(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => onToggle(o.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-surface"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                        on
                          ? "border-teal-accent bg-teal-accent text-white"
                          : "border-line bg-panel text-transparent"
                      }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">
                      {o.label}
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
