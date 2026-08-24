"use client";

import { useMemo } from "react";
import FilterMultiSelect from "@/components/FilterMultiSelect";
import {
  SERIES,
  formatSeriesTags,
  parseSeriesTags,
  type Series,
} from "@/lib/types";

const SERIES_OPTIONS = SERIES.map((s) => ({ id: s, label: s }));

/**
 * Multi-select for system categories (Z Series, MH, w/ Stargate, …).
 * Value is the stored "Tag + Tag" string.
 */
export default function SeriesMultiSelect({
  value,
  onChange,
  title = "System",
  compact,
}: {
  value: Series;
  onChange: (series: Series) => void;
  title?: string;
  compact?: boolean;
}) {
  const selectedIds = useMemo(
    () => new Set(parseSeriesTags(value)),
    [value],
  );

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(formatSeriesTags(next));
  }

  return (
    <FilterMultiSelect
      title={title}
      options={SERIES_OPTIONS}
      selectedIds={selectedIds}
      onToggle={toggle}
      onSelectAll={() => onChange(formatSeriesTags(SERIES))}
      onClear={() => onChange(formatSeriesTags([]))}
      allLabel="All systems"
      noneLabel="Select system…"
      oneLabel={(label) => label}
      manyLabel={(n) => `${n} systems`}
      compact={compact}
    />
  );
}
