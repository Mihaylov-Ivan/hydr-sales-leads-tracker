"use client";

import { useMemo } from "react";
import FilterMultiSelect from "@/components/FilterMultiSelect";
import {
  MARKETS,
  formatMarketTags,
  isMarketTag,
  parseMarketTags,
  type Market,
} from "@/lib/types";

const MARKET_OPTIONS = MARKETS.map((m) => ({ id: m, label: m }));

/**
 * Multi-select for markets (Cement, Clean H2, Tenders, …).
 * Value is the stored "Tag + Tag" string.
 */
export default function MarketMultiSelect({
  value,
  onChange,
  title = "Market",
  compact,
}: {
  value: Market;
  onChange: (market: Market) => void;
  title?: string;
  compact?: boolean;
}) {
  const selectedIds = useMemo(
    () => new Set<string>(parseMarketTags(value)),
    [value],
  );

  function toggle(id: string) {
    if (!isMarketTag(id)) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(formatMarketTags(next));
  }

  return (
    <FilterMultiSelect
      title={title}
      options={MARKET_OPTIONS}
      selectedIds={selectedIds}
      onToggle={toggle}
      onSelectAll={() => onChange(formatMarketTags(MARKETS))}
      onClear={() => onChange(formatMarketTags([]))}
      allLabel="All markets"
      noneLabel="Select market…"
      oneLabel={(label) => label}
      manyLabel={(n) => `${n} markets`}
      compact={compact}
    />
  );
}
