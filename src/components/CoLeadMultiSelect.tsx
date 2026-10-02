"use client";

import { useMemo } from "react";
import FilterMultiSelect from "@/components/FilterMultiSelect";
import { normalizeCoLeadUserIds } from "@/lib/types";

export default function CoLeadMultiSelect({
  members,
  value,
  onChange,
  disabled = false,
  fullWidth = false,
}: {
  members: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const options = useMemo(
    () => members.map((member) => ({ id: member.id, label: member.name })),
    [members],
  );
  const selectedIds = useMemo(() => new Set(value), [value]);

  function commit(next: Set<string>) {
    onChange(
      normalizeCoLeadUserIds(
        members.map((member) => member.id).filter((id) => next.has(id)),
      ),
    );
  }

  function toggle(id: string) {
    if (disabled) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commit(next);
  }

  return (
    <FilterMultiSelect
      title="Co-leads"
      options={options}
      selectedIds={selectedIds}
      onToggle={toggle}
      onSelectAll={() => commit(new Set(members.map((member) => member.id)))}
      onClear={() => onChange([])}
      noneLabel="Unassigned"
      oneLabel={(label) => label}
      manyLabel={(count) => `${count} co-leads`}
      allLabel="Everyone"
      fullWidth={fullWidth}
      disabled={disabled}
    />
  );
}
