"use client";

import { useMemo, useState } from "react";
import type { WarehouseGroup } from "@/lib/types";

type GroupOption = { id: string; label: string };

function buildGroupOptions(groups: WarehouseGroup[]): GroupOption[] {
  const roots = groups
    .filter((g) => !g.parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "bg"));
  const byParent = new Map<string, WarehouseGroup[]>();
  for (const g of groups) {
    if (!g.parentId) continue;
    if (!byParent.has(g.parentId)) byParent.set(g.parentId, []);
    byParent.get(g.parentId)!.push(g);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "bg"));
  }
  const out: GroupOption[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    out.push({ id: root.id, label: root.name });
    seen.add(root.id);
    for (const ch of byParent.get(root.id) ?? []) {
      out.push({ id: ch.id, label: `↳ ${ch.name}` });
      seen.add(ch.id);
    }
  }
  for (const g of groups) {
    if (seen.has(g.id)) continue;
    out.push({ id: g.id, label: g.name });
  }
  return out;
}

type UpsertResult = { ok: true; id: string } | { ok: false; error: string };
type DeleteResult = { ok: true } | { ok: false; error: string };

type Props = {
  groups: WarehouseGroup[];
  value: string;
  onChange: (groupId: string) => void;
  onUpsert: (input: {
    id?: string;
    name: string;
    parentId?: string | null;
  }) => UpsertResult;
  onDelete: (groupId: string) => DeleteResult;
  inputClassName: string;
  labelClassName: string;
  disabled?: boolean;
  emptyLabel?: string;
};

type PanelMode = "create" | "edit";

export default function WarehouseGroupSelect({
  groups,
  value,
  onChange,
  onUpsert,
  onDelete,
  inputClassName,
  labelClassName,
  disabled = false,
  emptyLabel = "No group…",
}: Props) {
  const [panel, setPanel] = useState<PanelMode | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => buildGroupOptions(groups), [groups]);
  const selected = useMemo(
    () => groups.find((g) => g.id === value) ?? null,
    [groups, value],
  );
  const selectedHasChildren = useMemo(
    () => (selected ? groups.some((g) => g.parentId === selected.id) : false),
    [groups, selected],
  );
  const rootOptions = useMemo(
    () =>
      groups
        .filter((g) => !g.parentId && g.id !== selected?.id)
        .sort((a, b) => a.name.localeCompare(b.name, "bg")),
    [groups, selected?.id],
  );

  function resetPanel() {
    setPanel(null);
    setName("");
    setParentId("");
    setError(null);
  }

  function openCreate() {
    setPanel("create");
    setName("");
    setParentId("");
    setError(null);
  }

  function openEdit() {
    if (!selected) return;
    setPanel("edit");
    setName(selected.name);
    setParentId(selected.parentId ?? "");
    setError(null);
  }

  function submit() {
    setError(null);
    const res = onUpsert({
      ...(panel === "edit" && selected ? { id: selected.id } : {}),
      name,
      parentId: parentId || null,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChange(res.id);
    resetPanel();
  }

  function removeSelected() {
    if (!selected) return;
    const label = selected.name;
    if (
      !window.confirm(
        `Remove group “${label}”? Items in this group will be ungrouped. Subgroups become top-level.`,
      )
    ) {
      return;
    }
    setError(null);
    const res = onDelete(selected.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChange("");
    resetPanel();
  }

  const showParentField = panel === "create" || !selectedHasChildren;

  return (
    <div className="space-y-1.5">
      <select
        className={inputClassName}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          resetPanel();
        }}
      >
        <option value="">{emptyLabel}</option>
        {options.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
          </option>
        ))}
      </select>

      {!panel ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <button
            type="button"
            disabled={disabled}
            className="text-[9px] font-semibold uppercase tracking-wide text-teal-accent hover:underline disabled:opacity-40"
            onClick={openCreate}
          >
            + New group
          </button>
          {selected && (
            <>
              <button
                type="button"
                disabled={disabled}
                className="text-[9px] font-semibold uppercase tracking-wide text-teal-accent hover:underline disabled:opacity-40"
                onClick={openEdit}
              >
                Edit group
              </button>
              <button
                type="button"
                disabled={disabled}
                className="text-[9px] font-semibold uppercase tracking-wide text-red-600 hover:underline disabled:opacity-40"
                onClick={removeSelected}
              >
                Remove group
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1.5 rounded border border-line bg-surface p-2">
          <div>
            <label className={labelClassName}>
              {panel === "edit" ? "Group name" : "New group name"}
            </label>
            <input
              className={inputClassName}
              value={name}
              autoFocus
              placeholder="e.g. Tools / Hand"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") resetPanel();
              }}
            />
          </div>
          {showParentField && (
            <div>
              <label className={labelClassName}>Parent (optional)</label>
              <select
                className={inputClassName}
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">Top-level group</option>
                {rootOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-[10px] text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              className="rounded bg-teal-accent px-2 py-1 text-[9px] font-bold uppercase text-white"
            >
              {panel === "edit" ? "Save" : "Create"}
            </button>
            <button
              type="button"
              onClick={resetPanel}
              className="rounded border border-line px-2 py-1 text-[9px] font-bold uppercase text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
