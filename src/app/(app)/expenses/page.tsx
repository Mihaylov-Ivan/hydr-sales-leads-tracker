"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  findLinkableDeadline,
  projectLinkableDeadlines,
} from "@/lib/gantt-finance";
import { isFileOwnedFinanceId } from "@/lib/finance-import";
import ProjectMultiSelect from "@/components/ProjectMultiSelect";
import FilterMultiSelect from "@/components/FilterMultiSelect";
import {
  INSTALLATION_SUBCATEGORY_LABELS,
  InstallationSubcategory,
  PROJECT_EXPENSE_CATEGORIES,
  PROJECT_EXPENSE_CATEGORY_LABELS,
  ProjectExpenseCategory,
  amountExFromInc,
  amountIncFromEx,
  categoryHasSubcategories,
  formatExpenseCategoryLabel,
  normalizeProjectExpense,
  subcategoriesForCategory,
  todayDate,
} from "@/lib/types";

const inputCls =
  "w-full rounded border border-line bg-surface px-1.5 py-1 text-[11px] text-ink outline-none focus:border-teal-accent";
const filterCls =
  "w-full rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] text-ink outline-none focus:border-teal-accent";

const LINK_FILTER_OPTIONS = [
  { id: "linked", label: "Linked" },
  { id: "none", label: "Unlinked" },
] as const;

const CATEGORY_FILTER_OPTIONS = PROJECT_EXPENSE_CATEGORIES.map((c) => ({
  id: c,
  label: PROJECT_EXPENSE_CATEGORY_LABELS[c],
}));

type FlatRow = {
  projectId: string;
  projectName: string;
  expenseId: string;
  dueDate: string;
  actualDate?: string;
  category: ProjectExpenseCategory;
  subcategory?: InstallationSubcategory;
  label: string;
  milestoneId?: string;
  amount: number;
  amountExVat: number;
};

function parseNum(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export default function ExpensesPage() {
  const {
    projects,
    ready,
    addExpense,
    updateExpense,
    deleteExpense,
  } = useProjects();

  const [filterProjectIds, setFilterProjectIds] = useState<Set<string> | null>(
    null,
  );
  const [filterCategoryIds, setFilterCategoryIds] = useState<Set<string> | null>(
    null,
  );
  const [filterLinkIds, setFilterLinkIds] = useState<Set<string> | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDesc, setFilterDesc] = useState("");
  const [dateSort, setDateSort] = useState<"asc" | "desc">("desc");

  const [draftProjectId, setDraftProjectId] = useState("");
  const [draftDate, setDraftDate] = useState(todayDate());
  const [draftCategory, setDraftCategory] =
    useState<ProjectExpenseCategory>("materials");
  const [draftSubcategory, setDraftSubcategory] =
    useState<InstallationSubcategory>("fuel");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftLinkId, setDraftLinkId] = useState("");
  const [draftExVat, setDraftExVat] = useState("");
  const [draftIncVat, setDraftIncVat] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(15);

  useEffect(() => {
    setVisibleCount(15);
  }, [
    filterProjectIds,
    filterCategoryIds,
    filterLinkIds,
    filterDateFrom,
    filterDateTo,
    filterDesc,
    dateSort,
  ]);

  const activeProjects = useMemo(
    () =>
      [...projects]
        .filter((p) => p.stage !== "cancelled")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const selectedProjectIds =
    filterProjectIds ?? new Set(activeProjects.map((p) => p.id));
  const selectedCategoryIds =
    filterCategoryIds ??
    new Set(PROJECT_EXPENSE_CATEGORIES.map((c) => c as string));
  const selectedLinkIds =
    filterLinkIds ?? new Set(LINK_FILTER_OPTIONS.map((o) => o.id));

  const rows = useMemo(() => {
    const list: FlatRow[] = [];
    for (const p of projects) {
      for (const raw of p.financials.expenseSchedule ?? []) {
        if (isFileOwnedFinanceId(raw.id)) continue;
        const exp = normalizeProjectExpense(raw);
        list.push({
          projectId: p.id,
          projectName: p.name,
          expenseId: exp.id,
          dueDate: exp.dueDate,
          ...(exp.actualDate ? { actualDate: exp.actualDate } : {}),
          category: exp.category ?? "materials",
          ...(exp.subcategory ? { subcategory: exp.subcategory } : {}),
          label: exp.label ?? "",
          ...(exp.milestoneId ? { milestoneId: exp.milestoneId } : {}),
          amount: exp.amount,
          amountExVat:
            exp.amountExVat != null && exp.amountExVat > 0
              ? exp.amountExVat
              : amountExFromInc(exp.amount),
        });
      }
    }
    return list;
  }, [projects]);

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (!selectedProjectIds.has(r.projectId)) return false;
      if (!selectedCategoryIds.has(r.category)) return false;
      if (filterDateFrom && r.dueDate < filterDateFrom) return false;
      if (filterDateTo && r.dueDate > filterDateTo) return false;
      if (
        filterDesc &&
        !r.label.toLowerCase().includes(filterDesc.trim().toLowerCase())
      ) {
        return false;
      }
      const isLinked = Boolean(r.milestoneId);
      if (isLinked && !selectedLinkIds.has("linked")) return false;
      if (!isLinked && !selectedLinkIds.has("none")) return false;
      return true;
    });

    const effectiveDate = (r: FlatRow) => {
      const project = projects.find((p) => p.id === r.projectId);
      if (project && r.milestoneId) {
        const linked = findLinkableDeadline(
          r.milestoneId,
          projectLinkableDeadlines(project),
        );
        if (linked?.date) return linked.date;
      }
      return r.dueDate;
    };

    return list.sort((a, b) => {
      const cmp = effectiveDate(a).localeCompare(effectiveDate(b));
      const d = dateSort === "asc" ? cmp : -cmp;
      if (d !== 0) return d;
      return a.projectName.localeCompare(b.projectName);
    });
  }, [
    rows,
    projects,
    selectedProjectIds,
    selectedCategoryIds,
    filterDateFrom,
    filterDateTo,
    filterDesc,
    selectedLinkIds,
    dateSort,
  ]);

  function toggleInSet(
    prev: Set<string> | null,
    allIds: string[],
    id: string,
  ): Set<string> {
    const base = prev ?? new Set(allIds);
    const next = new Set(base);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  const draftProject = activeProjects.find((p) => p.id === draftProjectId);
  const draftEvents = draftProject
    ? projectLinkableDeadlines(draftProject)
    : [];

  function saveRow(
    row: FlatRow,
    patch: Partial<{
      projectId: string;
      dueDate: string;
      category: ProjectExpenseCategory;
      subcategory?: InstallationSubcategory | null;
      label: string;
      milestoneId: string;
      amount: number;
      amountExVat: number;
    }>,
  ) {
    const nextProjectId = patch.projectId ?? row.projectId;
    const amount = patch.amount ?? row.amount;
    const amountExVat = patch.amountExVat ?? row.amountExVat;
    const category = patch.category ?? row.category;
    const dueDate = patch.dueDate ?? row.dueDate;
    const label = patch.label ?? row.label;
    const milestoneId =
      patch.milestoneId !== undefined ? patch.milestoneId : row.milestoneId;
    const subcategory = categoryHasSubcategories(category)
      ? patch.subcategory !== undefined
        ? patch.subcategory
        : (row.subcategory ?? null)
      : null;

    const expensePatch = {
      amount,
      amountExVat,
      category,
      dueDate,
      label,
      subcategory,
      ...(milestoneId ? { milestoneId } : {}),
      ...(row.actualDate ? { actualDate: row.actualDate } : {}),
    };

    if (nextProjectId === row.projectId) {
      updateExpense(row.projectId, row.expenseId, expensePatch);
      return;
    }

    // Move to another project: recreate then delete
    addExpense(nextProjectId, expensePatch);
    deleteExpense(row.projectId, row.expenseId);
  }

  function onExVatChange(row: FlatRow, raw: string) {
    const ex = parseNum(raw);
    if (ex == null || ex < 0) return;
    const inc = amountIncFromEx(ex);
    saveRow(row, { amountExVat: ex, amount: inc });
  }

  function onIncVatChange(row: FlatRow, raw: string) {
    const inc = parseNum(raw);
    if (inc == null || inc < 0) return;
    const ex = amountExFromInc(inc);
    saveRow(row, { amount: inc, amountExVat: ex });
  }

  function handleDraftEx(raw: string) {
    setDraftExVat(raw);
    const ex = parseNum(raw);
    if (ex != null && ex >= 0) {
      setDraftIncVat(String(amountIncFromEx(ex)));
    }
  }

  function handleDraftInc(raw: string) {
    setDraftIncVat(raw);
    const inc = parseNum(raw);
    if (inc != null && inc >= 0) {
      setDraftExVat(String(amountExFromInc(inc)));
    }
  }

  function submitDraft() {
    setDraftError(null);
    if (!draftProjectId) {
      setDraftError("Select a project.");
      return;
    }
    const linked = findLinkableDeadline(draftLinkId, draftEvents);
    const dueDate = (linked?.date || draftDate || "").trim();
    let inc = parseNum(draftIncVat);
    let ex = parseNum(draftExVat);
    if (inc == null && ex != null) inc = amountIncFromEx(ex);
    if (ex == null && inc != null) ex = amountExFromInc(inc);
    if (inc == null || inc <= 0) {
      setDraftError("Enter an expense amount (ex VAT or with VAT).");
      return;
    }
    if (!dueDate) {
      setDraftError("Pick a date or link a schedule event.");
      return;
    }
    addExpense(draftProjectId, {
      amount: inc,
      ...(ex != null && ex > 0 ? { amountExVat: ex } : {}),
      category: draftCategory,
      ...(categoryHasSubcategories(draftCategory)
        ? { subcategory: draftSubcategory }
        : {}),
      dueDate,
      label: draftLabel,
      ...(linked ? { milestoneId: linked.id } : {}),
    });
    setDraftLabel("");
    setDraftLinkId("");
    setDraftExVat("");
    setDraftIncVat("");
    setDraftDate(todayDate());
    setDraftError(null);
  }

  if (!ready) {
    return (
      <div className="py-16 text-center text-sm text-muted">Loading…</div>
    );
  }

  const totals = filtered.reduce(
    (acc, r) => {
      acc.ex += r.amountExVat;
      acc.inc += r.amount;
      return acc;
    },
    { ex: 0, inc: 0 },
  );

  const visibleRows = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div>
        <h1 className="text-sm font-bold uppercase tracking-wide text-deep">
          Expenses
        </h1>
        <p className="mt-1 max-w-3xl text-[11px] text-muted">
          Daily project expenses across the portfolio. Edits sync with each
          project&apos;s expense section and cashflow (manufacture materials,
          installation, maintenance &amp; admin use the with-VAT amount). VAT
          auto-calcs at 20%.
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-line bg-surface text-[10px] font-semibold uppercase tracking-wide text-muted">
                <th className="sticky left-0 z-10 bg-surface px-2 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDateSort((s) => (s === "asc" ? "desc" : "asc"))
                    }
                    title={
                      dateSort === "asc"
                        ? "Sorted oldest → newest (click for newest first)"
                        : "Sorted newest → oldest (click for oldest first)"
                    }
                    className="inline-flex items-center gap-1 uppercase tracking-wide text-muted hover:text-ink"
                  >
                    Date
                    <span className="normal-case tracking-normal" aria-hidden>
                      {dateSort === "asc" ? "↑" : "↓"}
                    </span>
                  </button>
                </th>
                <th className="px-2 py-2">Project</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Gantt link</th>
                <th className="px-2 py-2 text-right">Ex VAT</th>
                <th className="px-2 py-2 text-right">With VAT</th>
                <th className="px-2 py-2" />
              </tr>
              <tr className="border-b border-line bg-surface/80">
                <th className="sticky left-0 z-10 bg-surface/80 px-2 py-1.5">
                  <div className="flex gap-1">
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      title="From"
                      className={filterCls}
                    />
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      title="To"
                      className={filterCls}
                    />
                  </div>
                </th>
                <th className="px-2 py-1.5">
                  <ProjectMultiSelect
                    compact
                    projects={activeProjects}
                    selectedIds={selectedProjectIds}
                    onToggle={(id) =>
                      setFilterProjectIds((prev) =>
                        toggleInSet(
                          prev,
                          activeProjects.map((p) => p.id),
                          id,
                        ),
                      )
                    }
                    onSelectAll={() =>
                      setFilterProjectIds(
                        new Set(activeProjects.map((p) => p.id)),
                      )
                    }
                    onClear={() => setFilterProjectIds(new Set())}
                  />
                </th>
                <th className="px-2 py-1.5">
                  <FilterMultiSelect
                    compact
                    title="Types"
                    options={CATEGORY_FILTER_OPTIONS}
                    selectedIds={selectedCategoryIds}
                    allLabel="All types"
                    noneLabel="No types"
                    manyLabel={(n) => `${n} types`}
                    onToggle={(id) =>
                      setFilterCategoryIds((prev) =>
                        toggleInSet(
                          prev,
                          PROJECT_EXPENSE_CATEGORIES.map((c) => c),
                          id,
                        ),
                      )
                    }
                    onSelectAll={() =>
                      setFilterCategoryIds(
                        new Set(PROJECT_EXPENSE_CATEGORIES.map((c) => c)),
                      )
                    }
                    onClear={() => setFilterCategoryIds(new Set())}
                  />
                </th>
                <th className="px-2 py-1.5">
                  <input
                    value={filterDesc}
                    onChange={(e) => setFilterDesc(e.target.value)}
                    placeholder="Contains…"
                    className={filterCls}
                  />
                </th>
                <th className="px-2 py-1.5">
                  <FilterMultiSelect
                    compact
                    title="Gantt link"
                    options={[...LINK_FILTER_OPTIONS]}
                    selectedIds={selectedLinkIds}
                    allLabel="All links"
                    noneLabel="No links"
                    manyLabel={(n) => `${n} selected`}
                    onToggle={(id) =>
                      setFilterLinkIds((prev) =>
                        toggleInSet(
                          prev,
                          LINK_FILTER_OPTIONS.map((o) => o.id),
                          id,
                        ),
                      )
                    }
                    onSelectAll={() =>
                      setFilterLinkIds(
                        new Set(LINK_FILTER_OPTIONS.map((o) => o.id)),
                      )
                    }
                    onClear={() => setFilterLinkIds(new Set())}
                  />
                </th>
                <th className="px-2 py-1.5 text-right tabular-nums text-muted">
                  {formatMoney(totals.ex)}
                </th>
                <th className="px-2 py-1.5 text-right tabular-nums text-muted">
                  {formatMoney(totals.inc)}
                </th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {/* Add row */}
              <tr className="border-b border-line bg-teal-soft/20">
                <td className="sticky left-0 z-10 bg-teal-soft/20 px-2 py-1.5">
                  <input
                    type="date"
                    value={
                      findLinkableDeadline(draftLinkId, draftEvents)?.date ??
                      draftDate
                    }
                    readOnly={Boolean(
                      findLinkableDeadline(draftLinkId, draftEvents),
                    )}
                    onChange={(e) => setDraftDate(e.target.value)}
                    className={inputCls}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={draftProjectId}
                    onChange={(e) => {
                      setDraftProjectId(e.target.value);
                      setDraftLinkId("");
                    }}
                    className={inputCls}
                  >
                    <option value="">Select project…</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-col gap-1">
                    <select
                      value={draftCategory}
                      onChange={(e) => {
                        const next = e.target.value as ProjectExpenseCategory;
                        setDraftCategory(next);
                        if (categoryHasSubcategories(next)) {
                          const allowed = subcategoriesForCategory(next);
                          if (!allowed.includes(draftSubcategory)) {
                            setDraftSubcategory(allowed[0]!);
                          }
                        }
                      }}
                      className={inputCls}
                    >
                      {PROJECT_EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {PROJECT_EXPENSE_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    {categoryHasSubcategories(draftCategory) && (
                      <select
                        value={draftSubcategory}
                        onChange={(e) =>
                          setDraftSubcategory(
                            e.target.value as InstallationSubcategory,
                          )
                        }
                        className={inputCls}
                      >
                        {subcategoriesForCategory(draftCategory).map((s) => (
                          <option key={s} value={s}>
                            {INSTALLATION_SUBCATEGORY_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder="Description"
                    className={inputCls}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    key={`draft-gantt-${draftProjectId}`}
                    value={draftLinkId}
                    onChange={(e) => {
                      setDraftLinkId(e.target.value);
                      const ev = findLinkableDeadline(
                        e.target.value,
                        draftEvents,
                      );
                      if (ev) setDraftDate(ev.date);
                    }}
                    disabled={!draftProjectId}
                    className={inputCls}
                    title={
                      !draftProjectId
                        ? "Select a project first"
                        : draftEvents.length === 0
                          ? "No Gantt events on this project yet"
                          : "Link to this project’s schedule"
                    }
                  >
                    <option value="">—</option>
                    {draftEvents.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.label} · {ev.date}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={draftExVat}
                    onChange={(e) => handleDraftEx(e.target.value)}
                    placeholder="Ex VAT"
                    className={`${inputCls} text-right`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={draftIncVat}
                    onChange={(e) => handleDraftInc(e.target.value)}
                    placeholder="With VAT"
                    className={`${inputCls} text-right`}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={submitDraft}
                    className="rounded bg-olive px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-olive-ink hover:brightness-105"
                  >
                    Add
                  </button>
                </td>
              </tr>

              {visibleRows.map((row) => {
                const project = projects.find((p) => p.id === row.projectId);
                const events = project
                  ? projectLinkableDeadlines(project)
                  : [];
                const linked = findLinkableDeadline(row.milestoneId, events);
                return (
                  <tr
                    key={`${row.projectId}-${row.expenseId}`}
                    className="border-b border-line/60 hover:bg-surface/60"
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-1">
                      <input
                        type="date"
                        value={linked?.date ?? row.dueDate}
                        readOnly={Boolean(linked)}
                        onChange={(e) =>
                          saveRow(row, { dueDate: e.target.value })
                        }
                        className={`${inputCls} ${linked ? "opacity-60" : ""}`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={row.projectId}
                        onChange={(e) =>
                          saveRow(row, {
                            projectId: e.target.value,
                            milestoneId: "",
                          })
                        }
                        className={inputCls}
                      >
                        {activeProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex flex-col gap-1">
                        <select
                          value={row.category}
                          onChange={(e) => {
                            const category = e.target
                              .value as ProjectExpenseCategory;
                            const nextSub = categoryHasSubcategories(category)
                              ? row.subcategory &&
                                subcategoriesForCategory(category).includes(
                                  row.subcategory,
                                )
                                ? row.subcategory
                                : subcategoriesForCategory(category)[0]!
                              : null;
                            saveRow(row, {
                              category,
                              subcategory: nextSub,
                            });
                          }}
                          className={inputCls}
                          title={formatExpenseCategoryLabel(
                            row.category,
                            row.subcategory,
                          )}
                        >
                          {PROJECT_EXPENSE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {PROJECT_EXPENSE_CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                        {categoryHasSubcategories(row.category) && (
                          <select
                            value={row.subcategory ?? ""}
                            onChange={(e) =>
                              saveRow(row, {
                                subcategory: e.target
                                  .value as InstallationSubcategory,
                              })
                            }
                            className={inputCls}
                          >
                            <option value="" disabled>
                              Subcategory…
                            </option>
                            {subcategoriesForCategory(row.category).map((s) => (
                              <option key={s} value={s}>
                                {INSTALLATION_SUBCATEGORY_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        defaultValue={row.label}
                        key={`label-${row.expenseId}-${row.label}`}
                        onBlur={(e) => {
                          if (e.target.value !== row.label) {
                            saveRow(row, { label: e.target.value });
                          }
                        }}
                        placeholder="Description"
                        className={inputCls}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        key={`gantt-link-${row.projectId}-${row.expenseId}`}
                        value={row.milestoneId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          const ev = findLinkableDeadline(id, events);
                          saveRow(row, {
                            milestoneId: id,
                            ...(ev ? { dueDate: ev.date } : {}),
                          });
                        }}
                        className={inputCls}
                        title={
                          events.length === 0
                            ? "No Gantt events on this project yet"
                            : "Link to a phase, activity, or milestone on this project"
                        }
                      >
                        <option value="">—</option>
                        {row.milestoneId &&
                          !events.some((e) => e.id === row.milestoneId) && (
                            <option value={row.milestoneId}>
                              Linked id missing from this project’s schedule
                            </option>
                          )}
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.label} · {ev.date}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={row.amountExVat}
                        key={`ex-${row.expenseId}-${row.amountExVat}`}
                        onBlur={(e) => onExVatChange(row, e.target.value)}
                        className={`${inputCls} text-right`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={row.amount}
                        key={`inc-${row.expenseId}-${row.amount}`}
                        onBlur={(e) => onIncVatChange(row, e.target.value)}
                        className={`${inputCls} text-right`}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        onClick={() =>
                          deleteExpense(row.projectId, row.expenseId)
                        }
                        className="text-[10px] font-semibold text-muted hover:text-red-500"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {draftError && (
          <p className="border-t border-line px-3 py-2 text-[11px] text-amber-accent">
            {draftError}
          </p>
        )}
        {hasMore && (
          <div className="border-t border-line px-3 py-3 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + 15)}
              className="rounded-lg border border-line bg-surface px-4 py-1.5 text-[11px] font-semibold text-ink transition hover:border-teal-accent/40 hover:text-teal-accent"
            >
              Load more ({filtered.length - visibleCount} remaining)
            </button>
          </div>
        )}
        {filtered.length === 0 && rows.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted">
            No expenses yet — add a row above, or enter expenses on a project.
          </p>
        )}
        {filtered.length === 0 && rows.length > 0 && (
          <p className="px-3 py-4 text-center text-sm text-muted">
            {selectedProjectIds.size === 0
              ? "No projects selected — use the Project filter to choose some."
              : "No expenses match the current filters."}
          </p>
        )}
      </section>
    </div>
  );
}
