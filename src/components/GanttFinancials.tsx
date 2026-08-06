"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  type LinkableDeadline,
  findLinkableDeadline,
  projectLinkableDeadlines,
} from "@/lib/gantt-finance";
import {
  INSTALLATION_SUBCATEGORY_LABELS,
  InstallationSubcategory,
  PROJECT_EXPENSE_CATEGORIES,
  PROJECT_EXPENSE_CATEGORY_LABELS,
  ProjectExpenseCategory,
  ProjectExpenseItem,
  ProjectFinancials,
  ProjectPayment,
  amountExFromInc,
  amountIncFromEx,
  categoryHasSubcategories,
  expensePercentBase,
  formatExpenseCategoryLabel,
  inferExpenseCategory,
  normalizeProjectExpense,
  subcategoriesForCategory,
  todayDate,
} from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent";
const labelTiny =
  "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function amountFromPercent(base: number, percent: number): number {
  return Math.round(((base * percent) / 100) * 100) / 100;
}

function resolvePercentOfBase(
  amount: number,
  base: number | null | undefined,
  stored?: number,
): number | undefined {
  if (stored != null && Number.isFinite(stored)) return stored;
  if (base == null || !(base > 0) || !(amount > 0)) {
    return undefined;
  }
  return Math.round((amount / base) * 1000) / 10;
}

function expensePercentPlaceholder(category: ProjectExpenseCategory): string {
  if (category === "materials") return "% of max manufacture materials";
  if (category === "man-hr") return "% of max man-hrs";
  return "% of contract";
}

function expensePercentMissingMessage(category: ProjectExpenseCategory): string {
  if (category === "materials") {
    return "Set max Manufacture materials expense above, or enter an amount in €.";
  }
  if (category === "man-hr") {
    return "Set max Man-hrs expense above, or enter an amount in €.";
  }
  return "Set a contract value above, or enter an amount in €.";
}

function formatPercentLabel(pct: number): string {
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`;
}

function isImportedId(id: string): boolean {
  return id.startsWith("import-");
}

function CashItemRow({
  kind,
  projectId,
  item,
  percentBase,
  financials,
  events,
}: {
  kind: "payment" | "expense";
  projectId: string;
  item: ProjectPayment | ProjectExpenseItem;
  /** Base for % → amount (contract value for income) */
  percentBase: number | null | undefined;
  financials?: ProjectFinancials;
  events: LinkableDeadline[];
}) {
  const {
    updatePayment,
    deletePayment,
    updateExpense,
    deleteExpense,
  } = useProjects();
  const expenseItem =
    kind === "expense"
      ? normalizeProjectExpense(item as ProjectExpenseItem)
      : null;
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(item.amount));
  const [amountExVat, setAmountExVat] = useState(() => {
    if (kind !== "expense") return "";
    const exp = normalizeProjectExpense(item as ProjectExpenseItem);
    return String(
      exp.amountExVat != null && exp.amountExVat > 0
        ? exp.amountExVat
        : amountExFromInc(exp.amount),
    );
  });
  const [percent, setPercent] = useState(
    item.percent != null ? String(item.percent) : "",
  );
  const [dueDate, setDueDate] = useState(item.dueDate);
  const [actualDate, setActualDate] = useState(item.actualDate ?? "");
  const [label, setLabel] = useState(item.label ?? "");
  const [linkId, setLinkId] = useState(item.milestoneId ?? "");
  const [isMaintenance, setIsMaintenance] = useState(
    kind === "payment" && Boolean((item as ProjectPayment).isMaintenance),
  );
  const [category, setCategory] = useState<ProjectExpenseCategory>(
    expenseItem?.category ?? "materials",
  );
  const [subcategory, setSubcategory] = useState<InstallationSubcategory>(
    expenseItem?.subcategory ?? "fuel",
  );

  const linked = isMaintenance
    ? undefined
    : findLinkableDeadline(linkId, events);
  const accent =
    kind === "payment" ? "border-teal-accent/40" : "border-amber-accent/40";
  const actualLabel = kind === "payment" ? "Received on" : "Paid on";
  const paymentItem =
    kind === "payment" ? (item as ProjectPayment) : null;

  const activePercentBase =
    kind === "expense" && financials
      ? expensePercentBase(category, financials)
      : percentBase;

  function startEdit() {
    setAmount(String(item.amount));
    if (kind === "expense") {
      const exp = normalizeProjectExpense(item as ProjectExpenseItem);
      setAmountExVat(
        String(
          exp.amountExVat != null && exp.amountExVat > 0
            ? exp.amountExVat
            : amountExFromInc(exp.amount),
        ),
      );
      setCategory(exp.category ?? "materials");
      setSubcategory(exp.subcategory ?? "fuel");
    }
    setPercent(item.percent != null ? String(item.percent) : "");
    setDueDate(item.dueDate);
    setActualDate(item.actualDate ?? "");
    setLabel(item.label ?? "");
    setLinkId(item.milestoneId ?? "");
    setIsMaintenance(
      kind === "payment" && Boolean((item as ProjectPayment).isMaintenance),
    );
    setEditing(true);
  }

  function setIncAndDeriveEx(incRaw: string) {
    setAmount(incRaw);
    const inc = parseOptionalNumber(incRaw);
    if (inc != null && inc >= 0) {
      setAmountExVat(String(amountExFromInc(inc)));
    }
  }

  function setExAndDeriveInc(exRaw: string) {
    setAmountExVat(exRaw);
    const ex = parseOptionalNumber(exRaw);
    if (ex != null && ex >= 0) {
      setAmount(String(amountIncFromEx(ex)));
    }
  }

  function handlePercentChange(raw: string) {
    setPercent(raw);
    const pct = parseOptionalNumber(raw);
    if (pct != null && activePercentBase != null && activePercentBase > 0) {
      const inc = amountFromPercent(activePercentBase, pct);
      setAmount(String(inc));
      if (kind === "expense") {
        setAmountExVat(String(amountExFromInc(inc)));
      }
    }
  }

  function handleCategoryChange(next: ProjectExpenseCategory) {
    setCategory(next);
    if (categoryHasSubcategories(next)) {
      const allowed = subcategoriesForCategory(next);
      if (!allowed.includes(subcategory)) setSubcategory(allowed[0]!);
    }
    const pct = parseOptionalNumber(percent);
    if (pct != null && financials) {
      const base = expensePercentBase(next, financials);
      if (base != null && base > 0) {
        const inc = amountFromPercent(base, pct);
        setAmount(String(inc));
        setAmountExVat(String(amountExFromInc(inc)));
      }
    }
  }

  function handleLink(id: string) {
    if (isMaintenance) return;
    setLinkId(id);
    if (id) {
      const ev = findLinkableDeadline(id, events);
      if (ev) setDueDate(ev.date);
    }
  }

  function handleMaintenanceToggle(next: boolean) {
    setIsMaintenance(next);
    if (next) setLinkId("");
  }

  function save() {
    const pct = parseOptionalNumber(percent);
    let amt = parseOptionalNumber(amount);
    if (
      amt == null &&
      pct != null &&
      activePercentBase != null &&
      activePercentBase > 0
    ) {
      amt = amountFromPercent(activePercentBase, pct);
    }
    const date = linked?.date ?? dueDate;
    if (amt == null || amt <= 0 || !date) return;
    if (kind === "payment") {
      updatePayment(projectId, item.id, {
        amount: amt,
        ...(pct != null ? { percent: pct } : {}),
        dueDate: date,
        label,
        isMaintenance,
        ...(linked && !isMaintenance ? { milestoneId: linked.id } : {}),
        actualDate: actualDate.trim() ? actualDate.trim() : null,
      });
    } else {
      let ex = parseOptionalNumber(amountExVat);
      if (ex == null) ex = amountExFromInc(amt);
      updateExpense(projectId, item.id, {
        amount: amt,
        amountExVat: ex,
        ...(pct != null ? { percent: pct } : {}),
        dueDate: date,
        label,
        category,
        subcategory: categoryHasSubcategories(category) ? subcategory : null,
        ...(linked ? { milestoneId: linked.id } : {}),
        actualDate: actualDate.trim() ? actualDate.trim() : null,
      });
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <li className={`rounded-lg border ${accent} bg-surface p-3`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            value={percent}
            onChange={(e) => handlePercentChange(e.target.value)}
            placeholder={
              kind === "expense"
                ? expensePercentPlaceholder(category)
                : "% of contract"
            }
            className={inputCls}
          />
          {kind === "expense" ? (
            <>
              <input
                value={amountExVat}
                onChange={(e) => setExAndDeriveInc(e.target.value)}
                placeholder="Ex VAT €"
                className={inputCls}
              />
              <input
                value={amount}
                onChange={(e) => setIncAndDeriveEx(e.target.value)}
                placeholder="With VAT €"
                className={inputCls}
              />
            </>
          ) : (
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount €"
              className={inputCls}
            />
          )}
          <div>
            <span className={labelTiny}>Expected</span>
            <input
              type="date"
              value={linked?.date ?? dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              readOnly={Boolean(linked)}
              className={`${inputCls} ${linked ? "cursor-not-allowed opacity-60" : ""}`}
            />
          </div>
          <div>
            <span className={labelTiny}>{actualLabel}</span>
            <input
              type="date"
              value={actualDate}
              onChange={(e) => setActualDate(e.target.value)}
              className={inputCls}
            />
          </div>
          {kind === "payment" && (
            <label className="col-span-2 flex items-center gap-2 text-sm text-ink sm:col-span-1">
              <input
                type="checkbox"
                checked={isMaintenance}
                onChange={(e) => handleMaintenanceToggle(e.target.checked)}
                className="rounded border-line"
              />
              <span>Maintenance</span>
            </label>
          )}
          {kind === "payment" && !isMaintenance && (
            <select
              value={linkId}
              onChange={(e) => handleLink(e.target.value)}
              className={`${inputCls} col-span-2`}
            >
              <option value="">Standalone date</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label} · {formatDate(ev.date)}
                </option>
              ))}
            </select>
          )}
          {kind === "expense" && (
            <select
              value={linkId}
              onChange={(e) => handleLink(e.target.value)}
              className={`${inputCls} col-span-2`}
            >
              <option value="">Standalone date</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label} · {formatDate(ev.date)}
                </option>
              ))}
            </select>
          )}
          {kind === "expense" && (
            <>
              <div>
                <span className={labelTiny}>Type</span>
                <select
                  value={category}
                  onChange={(e) =>
                    handleCategoryChange(
                      e.target.value as ProjectExpenseCategory,
                    )
                  }
                  className={inputCls}
                >
                  {PROJECT_EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {PROJECT_EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              {categoryHasSubcategories(category) && (
                <div>
                  <span className={labelTiny}>Subcategory</span>
                  <select
                    value={subcategory}
                    onChange={(e) =>
                      setSubcategory(e.target.value as InstallationSubcategory)
                    }
                    className={inputCls}
                  >
                    {subcategoriesForCategory(category).map((s) => (
                      <option key={s} value={s}>
                        {INSTALLATION_SUBCATEGORY_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className={`${inputCls} col-span-2 sm:col-span-1`}
          />
          <div className="flex gap-1 sm:col-span-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-lg px-2 py-2 text-xs text-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="flex-1 rounded-lg bg-olive px-2 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink hover:brightness-105"
            >
              Save
            </button>
          </div>
        </div>
      </li>
    );
  }

  const displayLinked = paymentItem?.isMaintenance
    ? undefined
    : findLinkableDeadline(item.milestoneId, events);
  const expectedDate = displayLinked?.date ?? item.dueDate;
  const isActual = Boolean(item.actualDate);
  const isDelayed = !isActual && expectedDate < todayDate();
  const fromImport = isImportedId(item.id);
  const displayCategory =
    kind === "expense"
      ? (expenseItem?.category ?? inferExpenseCategory(item.label))
      : null;
  const displayBase =
    kind === "expense" && financials
      ? expensePercentBase(displayCategory ?? "materials", financials)
      : percentBase;
  const pct = resolvePercentOfBase(item.amount, displayBase, item.percent);

  function markDone() {
    if (fromImport) return;
    if (kind === "payment") {
      updatePayment(projectId, item.id, {
        amount: item.amount,
        ...(item.percent != null ? { percent: item.percent } : {}),
        dueDate: item.dueDate,
        label: item.label ?? "",
        ...(paymentItem?.isMaintenance
          ? { isMaintenance: true }
          : item.milestoneId
            ? { milestoneId: item.milestoneId }
            : {}),
        actualDate: todayDate(),
      });
      return;
    }
    const exp = normalizeProjectExpense(item as ProjectExpenseItem);
    updateExpense(projectId, item.id, {
      amount: exp.amount,
      ...(exp.amountExVat != null ? { amountExVat: exp.amountExVat } : {}),
      ...(exp.percent != null ? { percent: exp.percent } : {}),
      dueDate: exp.dueDate,
      label: exp.label ?? "",
      category: exp.category ?? "materials",
      subcategory: categoryHasSubcategories(exp.category)
        ? (exp.subcategory ?? null)
        : null,
      ...(exp.milestoneId ? { milestoneId: exp.milestoneId } : {}),
      actualDate: todayDate(),
    });
  }

  function clearActual() {
    if (fromImport) return;
    if (kind === "payment") {
      updatePayment(projectId, item.id, {
        amount: item.amount,
        ...(item.percent != null ? { percent: item.percent } : {}),
        dueDate: item.dueDate,
        label: item.label ?? "",
        ...(paymentItem?.isMaintenance
          ? { isMaintenance: true }
          : item.milestoneId
            ? { milestoneId: item.milestoneId }
            : {}),
        actualDate: null,
      });
      return;
    }
    const exp = normalizeProjectExpense(item as ProjectExpenseItem);
    updateExpense(projectId, item.id, {
      amount: exp.amount,
      ...(exp.amountExVat != null ? { amountExVat: exp.amountExVat } : {}),
      ...(exp.percent != null ? { percent: exp.percent } : {}),
      dueDate: exp.dueDate,
      label: exp.label ?? "",
      category: exp.category ?? "materials",
      subcategory: categoryHasSubcategories(exp.category)
        ? (exp.subcategory ?? null)
        : null,
      ...(exp.milestoneId ? { milestoneId: exp.milestoneId } : {}),
      actualDate: null,
    });
  }

  return (
    <li className="group flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <span className="font-semibold text-deep">
        {formatMoney(item.amount)}
        {kind === "expense" && expenseItem && (
          <span className="ml-1 text-[10px] font-medium text-muted">
            ex{" "}
            {formatMoney(
              expenseItem.amountExVat != null && expenseItem.amountExVat > 0
                ? expenseItem.amountExVat
                : amountExFromInc(item.amount),
            )}
          </span>
        )}
        {pct != null && (
          <span
            className={`ml-1 font-medium ${
              kind === "payment" ? "text-teal-accent" : "text-amber-accent"
            }`}
          >
            ({formatPercentLabel(pct)})
          </span>
        )}
      </span>
      {displayCategory && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            displayCategory === "man-hr"
              ? "bg-muted/20 text-muted"
              : displayCategory === "installation" ||
                  displayCategory === "maintenance" ||
                  displayCategory === "admin"
                ? "bg-amber-accent/15 text-amber-accent"
                : "bg-deep/10 text-deep"
          }`}
          title={
            displayCategory === "man-hr"
              ? "Allocated labour — not added to company cash (covered by salary)"
              : "Hits company cashflow"
          }
        >
          {formatExpenseCategoryLabel(
            displayCategory,
            expenseItem?.subcategory,
          )}
        </span>
      )}
      {paymentItem?.isMaintenance && (
        <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-semibold text-teal-accent">
          Maintenance
        </span>
      )}
      <span className="text-muted">expected {formatDate(expectedDate)}</span>
      {isActual && (
        <span className="rounded-full bg-green-accent/15 px-2 py-0.5 text-[11px] font-semibold text-green-accent">
          {kind === "payment" ? "Received" : "Paid"}{" "}
          {formatDate(item.actualDate!)}
        </span>
      )}
      {!isActual && (
        <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[11px] font-semibold text-muted">
          Pending
        </span>
      )}
      {fromImport && (
        <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted">
          From import
        </span>
      )}
      {isDelayed && (
        <span className="rounded-full bg-amber-accent/15 px-2 py-0.5 text-[11px] font-semibold text-amber-accent">
          Delayed
        </span>
      )}
      {paymentItem?.isMaintenance ? (
        <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[11px] font-semibold text-muted">
          Standalone
        </span>
      ) : displayLinked ? (
        <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-semibold text-teal-accent">
          ↔ {displayLinked.label}
        </span>
      ) : (
        <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[11px] font-semibold text-muted">
          Standalone
        </span>
      )}
      {item.label && (
        <span className="truncate text-xs text-muted">· {item.label}</span>
      )}
      {!fromImport && (
        <span className="ml-auto flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
          {!isActual ? (
            <button
              type="button"
              onClick={markDone}
              className="text-xs font-semibold text-green-accent hover:underline"
            >
              {kind === "payment" ? "Mark received" : "Mark paid"}
            </button>
          ) : (
            <button
              type="button"
              onClick={clearActual}
              className="text-xs font-semibold text-muted hover:underline"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={startEdit}
            className="text-xs font-semibold text-teal-accent hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() =>
              kind === "payment"
                ? deletePayment(projectId, item.id)
                : deleteExpense(projectId, item.id)
            }
            className="text-xs text-muted hover:text-red-500"
          >
            Remove
          </button>
        </span>
      )}
    </li>
  );
}

function AddCashForm({
  kind,
  projectId,
  percentBase,
  financials,
  events,
}: {
  kind: "payment" | "expense";
  projectId: string;
  /** Contract value for income % */
  percentBase: number | null | undefined;
  financials?: ProjectFinancials;
  events: LinkableDeadline[];
}) {
  const { addPayment, addExpense } = useProjects();
  const [amount, setAmount] = useState("");
  const [amountExVat, setAmountExVat] = useState("");
  const [percent, setPercent] = useState("");
  const [date, setDate] = useState("");
  const [actualDate, setActualDate] = useState("");
  const [label, setLabel] = useState("");
  const [linkId, setLinkId] = useState("");
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [category, setCategory] =
    useState<ProjectExpenseCategory>("materials");
  const [subcategory, setSubcategory] =
    useState<InstallationSubcategory>("fuel");
  const [error, setError] = useState<string | null>(null);

  const linked = isMaintenance
    ? undefined
    : findLinkableDeadline(linkId, events);
  const actualLabel = kind === "payment" ? "Received on" : "Paid on";

  const activePercentBase =
    kind === "expense" && financials
      ? expensePercentBase(category, financials)
      : percentBase;

  useEffect(() => {
    if (linked) setDate(linked.date);
  }, [linked?.date, linked]);

  useEffect(() => {
    const pct = parseOptionalNumber(percent);
    if (pct != null && activePercentBase != null && activePercentBase > 0) {
      const inc = amountFromPercent(activePercentBase, pct);
      setAmount(String(inc));
      if (kind === "expense") {
        setAmountExVat(String(amountExFromInc(inc)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePercentBase]);

  function handlePercentChange(raw: string) {
    setPercent(raw);
    setError(null);
    const pct = parseOptionalNumber(raw);
    if (pct != null && activePercentBase != null && activePercentBase > 0) {
      const inc = amountFromPercent(activePercentBase, pct);
      setAmount(String(inc));
      if (kind === "expense") {
        setAmountExVat(String(amountExFromInc(inc)));
      }
    }
  }

  function handleCategoryChange(next: ProjectExpenseCategory) {
    setCategory(next);
    if (categoryHasSubcategories(next)) {
      const allowed = subcategoriesForCategory(next);
      if (!allowed.includes(subcategory)) setSubcategory(allowed[0]!);
    }
    setError(null);
    const pct = parseOptionalNumber(percent);
    if (pct != null && financials) {
      const base = expensePercentBase(next, financials);
      if (base != null && base > 0) {
        const inc = amountFromPercent(base, pct);
        setAmount(String(inc));
        setAmountExVat(String(amountExFromInc(inc)));
      }
    }
  }

  function setIncAndDeriveEx(incRaw: string) {
    setAmount(incRaw);
    setError(null);
    const inc = parseOptionalNumber(incRaw);
    if (inc != null && inc >= 0) {
      setAmountExVat(String(amountExFromInc(inc)));
    }
  }

  function setExAndDeriveInc(exRaw: string) {
    setAmountExVat(exRaw);
    setError(null);
    const ex = parseOptionalNumber(exRaw);
    if (ex != null && ex >= 0) {
      setAmount(String(amountIncFromEx(ex)));
    }
  }

  function handleLink(id: string) {
    if (isMaintenance) return;
    setLinkId(id);
    setError(null);
    if (id) {
      const ev = findLinkableDeadline(id, events);
      if (ev) setDate(ev.date);
    }
  }

  function handleMaintenanceToggle(next: boolean) {
    setIsMaintenance(next);
    setError(null);
    if (next) setLinkId("");
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const dueDate = (linked?.date || date || "").trim();
    const pct = parseOptionalNumber(percent);
    let amt = parseOptionalNumber(amount);
    if (
      amt == null &&
      pct != null &&
      activePercentBase != null &&
      activePercentBase > 0
    ) {
      amt = amountFromPercent(activePercentBase, pct);
    }
    if (amt == null || amt <= 0) {
      setError(
        pct != null && (activePercentBase == null || !(activePercentBase > 0))
          ? kind === "expense"
            ? expensePercentMissingMessage(category)
            : "Set a contract value above, or enter an amount in €."
          : kind === "expense"
            ? "Enter an amount (or % of the category max)."
            : "Enter an amount (or % of contract).",
      );
      return;
    }
    if (!dueDate) {
      setError(
        isMaintenance
          ? "Pick an expected date."
          : "Pick an expected date, or link to a schedule event.",
      );
      return;
    }
    if (kind === "payment") {
      addPayment(projectId, {
        amount: amt,
        ...(pct != null ? { percent: pct } : {}),
        dueDate,
        label,
        ...(isMaintenance ? { isMaintenance: true } : {}),
        ...(linked && !isMaintenance ? { milestoneId: linked.id } : {}),
        ...(actualDate.trim() ? { actualDate: actualDate.trim() } : {}),
      });
    } else {
      let ex = parseOptionalNumber(amountExVat);
      if (ex == null) ex = amountExFromInc(amt);
      addExpense(projectId, {
        amount: amt,
        amountExVat: ex,
        ...(pct != null ? { percent: pct } : {}),
        dueDate,
        label,
        category,
        ...(categoryHasSubcategories(category) ? { subcategory } : {}),
        ...(linked ? { milestoneId: linked.id } : {}),
        ...(actualDate.trim() ? { actualDate: actualDate.trim() } : {}),
      });
    }
    setAmount("");
    setAmountExVat("");
    setPercent("");
    setDate("");
    setActualDate("");
    setLabel("");
    setLinkId("");
    setIsMaintenance(false);
    setCategory("materials");
    setSubcategory("fuel");
    setError(null);
  }

  const dueReady = Boolean(linked?.date || date);
  const amountReady =
    Boolean(amount.trim()) ||
    Boolean(amountExVat.trim()) ||
    (Boolean(percent.trim()) &&
      activePercentBase != null &&
      activePercentBase > 0);
  const canAdd = dueReady && amountReady;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      <input
        value={percent}
        onChange={(e) => handlePercentChange(e.target.value)}
        placeholder={
          kind === "expense"
            ? expensePercentPlaceholder(category)
            : "% of contract"
        }
        className={inputCls}
      />
      {kind === "expense" ? (
        <>
          <input
            value={amountExVat}
            onChange={(e) => setExAndDeriveInc(e.target.value)}
            placeholder="Ex VAT €"
            className={inputCls}
          />
          <input
            value={amount}
            onChange={(e) => setIncAndDeriveEx(e.target.value)}
            placeholder="With VAT €"
            className={inputCls}
          />
        </>
      ) : (
        <input
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
          }}
          placeholder="Amount €"
          className={inputCls}
        />
      )}
      <div>
        <span className={labelTiny}>Expected</span>
        <input
          type="date"
          value={linked?.date ?? date}
          onChange={(e) => {
            setDate(e.target.value);
            setError(null);
          }}
          readOnly={Boolean(linked)}
          title={
            linked
              ? "Date follows the linked schedule event"
              : "Expected / scheduled date"
          }
          className={`${inputCls} ${linked ? "cursor-not-allowed opacity-60" : ""}`}
        />
      </div>
      <div>
        <span className={labelTiny}>{actualLabel} (optional)</span>
        <input
          type="date"
          value={actualDate}
          onChange={(e) => setActualDate(e.target.value)}
          title="Leave empty if not yet received/paid — still shows on the board chart"
          className={inputCls}
        />
      </div>
      {kind === "payment" && (
        <label className="col-span-2 flex items-center gap-2 text-sm text-ink sm:col-span-1">
          <input
            type="checkbox"
            checked={isMaintenance}
            onChange={(e) => handleMaintenanceToggle(e.target.checked)}
            className="rounded border-line"
          />
          <span>Maintenance</span>
        </label>
      )}
      {kind === "payment" && !isMaintenance && (
        <select
          value={linkId}
          onChange={(e) => handleLink(e.target.value)}
          className={`${inputCls} col-span-2`}
          title="Link to a Gantt event, or leave as standalone"
        >
          <option value="">Standalone date</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.label} · {formatDate(ev.date)}
            </option>
          ))}
        </select>
      )}
      {kind === "expense" && (
        <select
          value={linkId}
          onChange={(e) => handleLink(e.target.value)}
          className={`${inputCls} col-span-2`}
          title="Link to a Gantt event, or leave as standalone"
        >
          <option value="">Standalone date</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.label} · {formatDate(ev.date)}
            </option>
          ))}
        </select>
      )}
      {kind === "expense" && (
        <>
          <div>
            <span className={labelTiny}>Type</span>
            <select
              value={category}
              onChange={(e) =>
                handleCategoryChange(e.target.value as ProjectExpenseCategory)
              }
              className={inputCls}
              title="Man-hrs is for project analysis only; manufacture materials, installation, maintenance & admin hit cashflow"
            >
              {PROJECT_EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PROJECT_EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          {categoryHasSubcategories(category) && (
            <div>
              <span className={labelTiny}>Subcategory</span>
              <select
                value={subcategory}
                onChange={(e) =>
                  setSubcategory(e.target.value as InstallationSubcategory)
                }
                className={inputCls}
              >
                {subcategoriesForCategory(category).map((s) => (
                  <option key={s} value={s}>
                    {INSTALLATION_SUBCATEGORY_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={
          kind === "payment"
            ? isMaintenance
              ? "Label (optional) e.g. Annual service"
              : "Label (optional) e.g. Down payment"
            : "Label (optional) e.g. Supplier deposit"
        }
        className={`${inputCls} col-span-2 sm:col-span-1`}
      />
      <button
        type="button"
        onClick={() => submit()}
        disabled={!canAdd}
        className="rounded-lg bg-olive px-3 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-1"
      >
        Add
      </button>
      {error && (
        <p className="col-span-2 text-[11px] text-amber-accent sm:col-span-4">
          {error}
        </p>
      )}
    </form>
  );
}

export default function GanttFinancials({
  projectId,
  financials: storedFinancials,
}: {
  projectId: string;
  financials: ProjectFinancials;
}) {
  const { financeImport, projects, updateFinancials } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  // Edit against live project financials so new lines show immediately.
  const financials = project?.financials ?? storedFinancials;

  const events = useMemo(() => {
    if (!project) return [];
    return projectLinkableDeadlines(project);
  }, [project]);

  const payments = [...(financials.payments ?? [])]
    .filter((p) => !isImportedId(p.id))
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
  const expenses = [...(financials.expenseSchedule ?? [])]
    .filter((e) => !isImportedId(e.id))
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );

  function saveMaxExpense(
    field: "maxMaterialsExpense" | "maxManHrExpense",
    raw: string,
  ) {
    const t = raw.trim().replace(/,/g, "");
    if (!t) {
      updateFinancials(projectId, { [field]: null });
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n) && n >= 0) {
      updateFinancials(projectId, { [field]: n });
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-deep">
        Income &amp; expenses
      </h3>
      <p className="mb-4 text-[11px] text-muted">
        Expected dates feed the board cash chart whether or not cash has been
        received. Set a received/paid date when it happens — or leave it empty.
      </p>
      {financeImport && (
        <p className="mb-3 text-[11px] text-muted">
          A Finance Excel import is loaded for portfolio charts. Lines you add
          here also appear on those charts.
        </p>
      )}
      {events.length === 0 && (
        <p className="mb-3 text-[11px] text-muted">
          Add schedule events above to link cash to them, or use a standalone
          date.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-olive">
            Income
          </h4>
          <AddCashForm
            kind="payment"
            projectId={projectId}
            percentBase={financials.contractValue}
            events={events}
          />
          {payments.length === 0 ? (
            <p className="text-sm text-muted/80">No income entries yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {payments.map((p) => (
                <CashItemRow
                  key={p.id}
                  kind="payment"
                  projectId={projectId}
                  item={p}
                  percentBase={financials.contractValue}
                  events={events}
                />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-accent">
            Expenses
          </h4>
          <p className="mb-2 text-[10px] text-muted">
            Manufacture materials, installation, maintenance &amp; admin hit
            company cash (with VAT). Man-hrs is for project analysis only.
            Expense % uses max Manufacture materials / Man-hrs caps
            (installation, maintenance &amp; admin % use contract value). VAT
            auto-calcs at 20%.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className={labelTiny}>Max Manufacture materials €</span>
              <input
                type="number"
                min={0}
                step="any"
                defaultValue={
                  financials.maxMaterialsExpense != null
                    ? String(financials.maxMaterialsExpense)
                    : ""
                }
                key={`max-mat-${financials.maxMaterialsExpense ?? "empty"}`}
                onBlur={(e) =>
                  saveMaxExpense("maxMaterialsExpense", e.target.value)
                }
                placeholder="e.g. 400000"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelTiny}>Max Man-hrs €</span>
              <input
                type="number"
                min={0}
                step="any"
                defaultValue={
                  financials.maxManHrExpense != null
                    ? String(financials.maxManHrExpense)
                    : ""
                }
                key={`max-man-${financials.maxManHrExpense ?? "empty"}`}
                onBlur={(e) =>
                  saveMaxExpense("maxManHrExpense", e.target.value)
                }
                placeholder="e.g. 120000"
                className={inputCls}
              />
            </label>
          </div>
          <AddCashForm
            kind="expense"
            projectId={projectId}
            percentBase={financials.contractValue}
            financials={financials}
            events={events}
          />
          {expenses.length === 0 ? (
            <p className="text-sm text-muted/80">No expense entries yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {expenses.map((e) => (
                <CashItemRow
                  key={e.id}
                  kind="expense"
                  projectId={projectId}
                  item={e}
                  percentBase={financials.contractValue}
                  financials={financials}
                  events={events}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
