"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface SearchableOption {
  value: string;
  label: string;
  detail?: string;
}

const MAX_RESULTS = 60;
const MENU_MAX_HEIGHT = 240;

type MenuPos = { top: number; left: number; width: number };

/**
 * Generic searchable dropdown that filters options by label/detail.
 * Also supports free-text entry when `allowFreeText` is true (for suppliers).
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  inputClassName,
  placeholder = "Search…",
  disabled,
  allowFreeText,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  allowFreeText?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const deferredQuery = useDeferredValue(query);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const indexed = useMemo(
    () =>
      options.map((o) => ({
        option: o,
        blob: [o.label, o.detail, o.value]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [options],
  );

  const results = useMemo(() => {
    const q = deferredQuery.toLowerCase().trim();
    if (!q) return indexed.slice(0, MAX_RESULTS).map((x) => x.option);
    const tokens = q.split(/\s+/);
    const scored: { option: SearchableOption; score: number }[] = [];
    for (const { option, blob } of indexed) {
      if (!tokens.every((t) => blob.includes(t))) continue;
      let score = 0;
      const name = option.label.toLowerCase();
      if (name.startsWith(q)) score += 100;
      else if (name.includes(q)) score += 50;
      scored.push({ option, score });
    }
    scored.sort(
      (a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label),
    );
    return scored.slice(0, MAX_RESULTS).map((s) => s.option);
  }, [indexed, deferredQuery]);

  useEffect(() => {
    setHighlight(0);
  }, [deferredQuery, open]);

  useLayoutEffect(() => {
    if (!open || !inputWrapRef.current) {
      setPos(null);
      return;
    }
    function update() {
      const el = inputWrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, results.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${highlight}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function pick(opt: SearchableOption) {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(false);
  }

  function commit() {
    if (allowFreeText && query.trim()) {
      onChange(query.trim());
    }
    setOpen(false);
  }

  const displayValue =
    open || query ? query : selected ? selected.label : allowFreeText ? value : "";

  const menu =
    open && !disabled && pos
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="z-[80] overflow-y-auto overscroll-contain rounded-md border border-line bg-panel shadow-lg"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: MENU_MAX_HEIGHT,
            }}
          >
            {results.length === 0 ? (
              <li className="px-2 py-2 text-[11px] text-muted">
                {allowFreeText && query.trim()
                  ? "No matches — press Enter to use as-is"
                  : "No matches"}
              </li>
            ) : (
              results.map((opt, idx) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={idx === highlight}
                  data-idx={idx}
                >
                  <button
                    type="button"
                    className={`flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left text-[11px] ${
                      idx === highlight
                        ? "bg-teal-soft text-deep"
                        : "hover:bg-surface"
                    }`}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pick(opt)}
                  >
                    <span className="font-medium text-ink">{opt.label}</span>
                    {opt.detail && (
                      <span className="text-[10px] text-muted">{opt.detail}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative">
      <div ref={inputWrapRef} className="flex gap-1">
        <input
          className={inputClassName}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!allowFreeText && value) onChange("");
          }}
          onFocus={() => {
            setOpen(true);
            if (selected && !query) setQuery("");
          }}
          onBlur={() => {
            if (allowFreeText) commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) =>
                Math.min(h + 1, Math.max(0, results.length - 1)),
              );
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && open && results[highlight]) {
              e.preventDefault();
              pick(results[highlight]);
            } else if (e.key === "Enter" && allowFreeText) {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        {(value || (allowFreeText && query)) ? (
          <button
            type="button"
            className="shrink-0 rounded border border-line px-2 text-[10px] font-semibold uppercase text-muted hover:border-teal-accent hover:text-teal-accent"
            onClick={clear}
            disabled={disabled}
            title="Clear"
          >
            ✕
          </button>
        ) : null}
      </div>
      {menu}
    </div>
  );
}
