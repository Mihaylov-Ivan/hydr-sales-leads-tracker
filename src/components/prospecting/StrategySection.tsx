"use client";

import { useMemo, useState } from "react";
import MarketMultiSelect from "@/components/MarketMultiSelect";
import { useAuth } from "@/lib/auth-context";
import { useProspecting } from "@/lib/prospecting-store";
import {
  isIsoInRange,
  normalizeStrategyMarkets,
  PROSPECT_MARKET_LABELS,
  ProspectingStrategy,
  startOfWeekMonday,
} from "@/lib/prospecting-types";
import {
  formatMarketTags,
  marketIncludesTag,
  type Market,
} from "@/lib/types";

function ProgressBar({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full bg-teal-accent"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StrategyForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ProspectingStrategy;
  onSave: (input: {
    name: string;
    markets: Market;
    industries: string;
    weeklyContactTarget: number;
    notes: string;
    isActive: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [markets, setMarkets] = useState<Market>(
    formatMarketTags(initial?.markets ?? ["Clean H2"]),
  );
  const [industries, setIndustries] = useState(initial?.industries ?? "");
  const [weekly, setWeekly] = useState(
    String(initial?.weeklyContactTarget ?? 5),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  return (
    <div className="rounded-xl border border-teal-accent/30 bg-surface p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="font-semibold text-muted">Strategy name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-deep"
            placeholder="e.g. Cement Plants"
          />
        </label>
        <label className="block text-xs">
          <span className="font-semibold text-muted">Contacts / week</span>
          <input
            type="number"
            min={0}
            step={1}
            value={weekly}
            onChange={(e) => setWeekly(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-deep"
          />
        </label>
        <div className="block text-xs sm:col-span-2">
          <span className="font-semibold text-muted">Markets</span>
          <div className="mt-1">
            <MarketMultiSelect value={markets} onChange={setMarkets} />
          </div>
        </div>
        <label className="block text-xs sm:col-span-2">
          <span className="font-semibold text-muted">Industries</span>
          <input
            value={industries}
            onChange={(e) => setIndustries(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-deep"
            placeholder="Segments this strategy targets"
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="font-semibold text-muted">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-deep"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-deep">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active (counts toward weekly target)
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              markets,
              industries: industries.trim(),
              weeklyContactTarget: Math.max(0, Math.round(Number(weekly)) || 0),
              notes: notes.trim(),
              isActive,
            })
          }
          className="rounded-lg bg-teal-accent px-3 py-2 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {initial ? "Save" : "Add strategy"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function StrategySection() {
  const { can, canWrite } = useAuth();
  const {
    strategies,
    companies,
    activities,
    targets,
    addStrategy,
    updateStrategy,
    deleteStrategy,
  } = useProspecting();
  const canManage = can("sales_manager") && canWrite;
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const companyById = useMemo(() => {
    const map = new Map(companies.map((c) => [c.id, c]));
    return map;
  }, [companies]);

  const weekProgress = useMemo(() => {
    const weekStart = startOfWeekMonday();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const counts = new Map<string, number>();
    for (const s of strategies) counts.set(s.id, 0);

    for (const a of activities) {
      if (!a.countsAsNewContact) continue;
      if (!isIsoInRange(a.createdAt, weekStart, weekEnd)) continue;
      const company = companyById.get(a.companyId);
      if (!company) continue;
      for (const s of strategies) {
        if (!s.isActive) continue;
        const hit = s.markets.some((m) =>
          marketIncludesTag(company.market, m),
        );
        if (hit) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [activities, companyById, strategies]);

  const ordered = useMemo(
    () =>
      [...strategies].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [strategies],
  );

  return (
    <section className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={expanded}
        >
          <span
            className={`mt-1.5 shrink-0 text-muted transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            ▸
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-teal-accent">
              Strategy
            </div>
            <h2 className="mt-0.5 text-base font-bold text-deep">
              Market & industry focus
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted">
              {targets.weeklyContactTarget} contacts / week ·{" "}
              {targets.monthlyContactTarget} / month
              {!expanded && ordered.length > 0
                ? ` · ${ordered.filter((s) => s.isActive).length} strategies`
                : ""}
            </p>
          </div>
        </button>
        {canManage && expanded && !adding && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold uppercase tracking-wide text-deep"
          >
            + Strategy
          </button>
        )}
      </div>

      {expanded && (
        <>
          {canManage && adding && (
            <div className="mt-3">
              <StrategyForm
                onCancel={() => setAdding(false)}
                onSave={(input) => {
                  addStrategy({
                    name: input.name,
                    markets: normalizeStrategyMarkets(input.markets),
                    industries: input.industries,
                    weeklyContactTarget: input.weeklyContactTarget,
                    notes: input.notes,
                    isActive: input.isActive,
                  });
                  setAdding(false);
                }}
              />
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {ordered.map((strategy) => {
              const done = weekProgress.get(strategy.id) ?? 0;
              const target = strategy.weeklyContactTarget;
              const editing = canManage && editingId === strategy.id;
              const marketLabel = strategy.markets
                .map((m) => PROSPECT_MARKET_LABELS[m] ?? m)
                .join(" · ");

              if (editing) {
                return (
                  <div
                    key={strategy.id}
                    className="sm:col-span-2 xl:col-span-4"
                  >
                    <StrategyForm
                      initial={strategy}
                      onCancel={() => setEditingId(null)}
                      onSave={(input) => {
                        updateStrategy(strategy.id, {
                          name: input.name,
                          markets: normalizeStrategyMarkets(input.markets),
                          industries: input.industries,
                          weeklyContactTarget: input.weeklyContactTarget,
                          notes: input.notes,
                          isActive: input.isActive,
                        });
                        setEditingId(null);
                      }}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={strategy.id}
                  className={`rounded-xl border bg-surface px-3 py-2.5 ${
                    strategy.isActive
                      ? "border-line"
                      : "border-line/60 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-deep">
                        {strategy.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {marketLabel || "No markets"}
                        {strategy.industries
                          ? ` · ${strategy.industries}`
                          : ""}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAdding(false);
                            setEditingId(strategy.id);
                          }}
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted hover:bg-panel hover:text-deep"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete strategy “${strategy.name}”?`,
                              )
                            ) {
                              deleteStrategy(strategy.id);
                            }
                          }}
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted hover:bg-panel hover:text-deep"
                        >
                          Del
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        This week
                      </div>
                      <div className="text-lg font-bold text-deep">
                        {done}{" "}
                        <span className="text-sm font-semibold text-muted">
                          / {target}
                        </span>
                      </div>
                    </div>
                    {canManage ? (
                      <label className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Target
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={target}
                          onChange={(e) => {
                            const n = Math.max(
                              0,
                              Math.round(Number(e.target.value)) || 0,
                            );
                            updateStrategy(strategy.id, {
                              weeklyContactTarget: n,
                            });
                          }}
                          className="mt-0.5 w-16 rounded-md border border-line bg-panel px-2 py-1 text-right text-sm font-bold text-deep"
                        />
                      </label>
                    ) : (
                      <div className="text-right text-[11px] text-muted">
                        {target}/wk
                      </div>
                    )}
                  </div>
                  <ProgressBar value={done} max={target} />
                  {!strategy.isActive && (
                    <div className="mt-1 text-[10px] font-semibold uppercase text-muted">
                      Inactive
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!canManage && (
            <p className="mt-2 text-[11px] text-muted">
              Sales Managers can adjust strategy targets and add new strategies.
            </p>
          )}
        </>
      )}
    </section>
  );
}
