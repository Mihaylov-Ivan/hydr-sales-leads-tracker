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
import type { WarehouseGroup, WarehouseItem } from "@/lib/types";

export type CatalogSearchItem = Pick<
  WarehouseItem,
  | "id"
  | "name"
  | "sku"
  | "barcode"
  | "groupId"
  | "preferredSupplier"
  | "legacyGroupName"
  | "nameOriginal"
  | "unit"
  | "defaultMaterialKind"
>;

function normalizeQuery(q: string): string {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function itemSearchBlob(
  item: CatalogSearchItem,
  groupName?: string,
): string {
  return [
    item.name,
    item.nameOriginal,
    item.sku,
    item.barcode,
    item.id,
    item.preferredSupplier,
    item.legacyGroupName,
    groupName,
    item.unit,
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

function itemLabel(item: CatalogSearchItem): string {
  const bits = [item.name];
  if (item.sku) bits.push(`SKU ${item.sku}`);
  return bits.join(" · ");
}

const MAX_RESULTS = 60;
/** Visible menu height — enough rows, always scrollable past this. */
const MENU_MAX_HEIGHT = 240;

type MenuPos = { top: number; left: number; width: number };

export default function CatalogItemSearchSelect({
  items,
  groupById,
  value,
  onChange,
  inputClassName,
  placeholder = "Search name, SKU, barcode, group…",
  disabled,
}: {
  items: CatalogSearchItem[];
  groupById?: Map<string, WarehouseGroup>;
  value: string;
  onChange: (itemId: string, item: CatalogSearchItem | null) => void;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
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
    () => items.find((i) => i.id === value) ?? null,
    [items, value],
  );

  const indexed = useMemo(
    () =>
      items.map((item) => ({
        item,
        blob: itemSearchBlob(
          item,
          item.groupId ? groupById?.get(item.groupId)?.name : undefined,
        ),
      })),
    [items, groupById],
  );

  const results = useMemo(() => {
    const q = normalizeQuery(deferredQuery);
    if (!q) {
      return indexed.slice(0, MAX_RESULTS).map((x) => x.item);
    }
    const tokens = q.split(" ").filter(Boolean);
    const scored: { item: CatalogSearchItem; score: number }[] = [];
    for (const { item, blob } of indexed) {
      if (!tokens.every((t) => blob.includes(t))) continue;
      let score = 0;
      const name = item.name.toLowerCase();
      if (name.startsWith(q)) score += 100;
      else if (name.includes(q)) score += 50;
      if (item.sku && item.sku.toLowerCase().includes(q)) score += 40;
      if (item.barcode && item.barcode.toLowerCase().includes(q)) score += 35;
      if (item.id.toLowerCase().startsWith(q)) score += 20;
      scored.push({ item, score });
    }
    scored.sort(
      (a, b) =>
        b.score - a.score || a.item.name.localeCompare(b.item.name, "bg"),
    );
    return scored.slice(0, MAX_RESULTS).map((s) => s.item);
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
      setPos({
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
      });
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

  function pick(item: CatalogSearchItem) {
    onChange(item.id, item);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("", null);
    setQuery("");
    setOpen(false);
  }

  const displayValue =
    open || query ? query : selected ? itemLabel(selected) : "";

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
              <li className="px-2 py-2 text-[11px] text-muted">No matches</li>
            ) : (
              results.map((item, idx) => {
                const groupName = item.groupId
                  ? groupById?.get(item.groupId)?.name
                  : undefined;
                return (
                  <li
                    key={item.id}
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
                      onClick={() => pick(item)}
                    >
                      <span className="font-medium text-ink">{item.name}</span>
                      <span className="text-[10px] text-muted">
                        {[
                          item.sku ? `SKU ${item.sku}` : null,
                          item.barcode ? `BC ${item.barcode}` : null,
                          groupName,
                          item.preferredSupplier,
                          item.id.slice(0, 8),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
            {indexed.length > MAX_RESULTS &&
            normalizeQuery(deferredQuery) === "" ? (
              <li className="sticky bottom-0 border-t border-line bg-panel px-2 py-1 text-[10px] text-muted">
                Type to search all {indexed.length} catalog items
              </li>
            ) : null}
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
            if (value) onChange("", null);
          }}
          onFocus={() => {
            setOpen(true);
            if (selected && !query) setQuery("");
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
            } else if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        {value ? (
          <button
            type="button"
            className="shrink-0 rounded border border-line px-2 text-[10px] font-semibold uppercase text-muted hover:border-teal-accent hover:text-teal-accent"
            onClick={clear}
            disabled={disabled}
            title="Clear selection"
          >
            Clear
          </button>
        ) : null}
      </div>
      {menu}
    </div>
  );
}
