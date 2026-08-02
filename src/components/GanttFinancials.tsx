"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  type LinkableDeadline,
  findLinkableDeadline,
  projectLinkableDeadlines,
} from "@/lib/gantt-finance";
import {
  ProjectExpenseItem,
  ProjectFinancials,
  ProjectPayment,
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

function amountFromPercent(contractValue: number, percent: number): number {
  return Math.round(((contractValue * percent) / 100) * 100) / 100;
}

function resolveContractPercent(
  amount: number,
  contractValue: number | null | undefined,
  stored?: number,
): number | undefined {
  if (stored != null && Number.isFinite(stored)) return stored;
  if (contractValue == null || !(contractValue > 0) || !(amount > 0)) {
    return undefined;
  }
  return Math.round((amount / contractValue) * 1000) / 10;
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
  contractValue,
  events,
}: {
  kind: "payment" | "expense";
  projectId: string;
  item: ProjectPayment | ProjectExpenseItem;
  contractValue: number | null | undefined;
  events: LinkableDeadline[];
}) {
  const {
    updatePayment,
    deletePayment,
    updateExpense,
    deleteExpense,
  } = useProjects();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(item.amount));
  const [percent, setPercent] = useState(
    item.percent != null ? String(item.percent) : "",
  );
  const [dueDate, setDueDate] = useState(item.dueDate);
  const [actualDate, setActualDate] = useState(item.actualDate ?? "");
  const [label, setLabel] = useState(item.label ?? "");
  const [linkId, setLinkId] = useState(item.milestoneId ?? "");

  const linked = findLinkableDeadline(linkId, events);
  const accent =
    kind === "payment" ? "border-teal-accent/40" : "border-amber-accent/40";
  const actualLabel = kind === "payment" ? "Received on" : "Paid on";

  function startEdit() {
    setAmount(String(item.amount));
    setPercent(item.percent != null ? String(item.percent) : "");
    setDueDate(item.dueDate);
    setActualDate(item.actualDate ?? "");
    setLabel(item.label ?? "");
    setLinkId(item.milestoneId ?? "");
    setEditing(true);
  }

  function handlePercentChange(raw: string) {
    setPercent(raw);
    const pct = parseOptionalNumber(raw);
    if (pct != null && contractValue != null) {
      setAmount(String(amountFromPercent(contractValue, pct)));
    }
  }

  function handleLink(id: string) {
    setLinkId(id);
    if (id) {
      const ev = findLinkableDeadline(id, events);
      if (ev) setDueDate(ev.date);
    }
  }

  function save() {
    const pct = parseOptionalNumber(percent);
    let amt = parseOptionalNumber(amount);
    if (amt == null && pct != null && contractValue != null) {
      amt = amountFromPercent(contractValue, pct);
    }
    const date = linked?.date ?? dueDate;
    if (amt == null || amt <= 0 || !date) return;
    const patch = {
      amount: amt,
      ...(pct != null ? { percent: pct } : {}),
      dueDate: date,
      label,
      ...(linked ? { milestoneId: linked.id } : {}),
      actualDate: actualDate.trim() ? actualDate.trim() : null,
    };
    if (kind === "payment") updatePayment(projectId, item.id, patch);
    else updateExpense(projectId, item.id, patch);
    setEditing(false);
  }

  if (editing) {
    return (
      <li className={`rounded-lg border ${accent} bg-surface p-3`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            value={percent}
            onChange={(e) => handlePercentChange(e.target.value)}
            placeholder="% of contract"
            className={inputCls}
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount €"
            className={inputCls}
          />
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

  const displayLinked = findLinkableDeadline(item.milestoneId, events);
  const expectedDate = displayLinked?.date ?? item.dueDate;
  const isActual = Boolean(item.actualDate);
  const isDelayed = !isActual && expectedDate < todayDate();
  const fromImport = isImportedId(item.id);
  const pct = resolveContractPercent(item.amount, contractValue, item.percent);

  function markDone() {
    if (fromImport) return;
    const patch = {
      amount: item.amount,
      ...(item.percent != null ? { percent: item.percent } : {}),
      dueDate: item.dueDate,
      label: item.label ?? "",
      ...(item.milestoneId ? { milestoneId: item.milestoneId } : {}),
      actualDate: todayDate(),
    };
    if (kind === "payment") updatePayment(projectId, item.id, patch);
    else updateExpense(projectId, item.id, patch);
  }

  function clearActual() {
    if (fromImport) return;
    const patch = {
      amount: item.amount,
      ...(item.percent != null ? { percent: item.percent } : {}),
      dueDate: item.dueDate,
      label: item.label ?? "",
      ...(item.milestoneId ? { milestoneId: item.milestoneId } : {}),
      actualDate: null as string | null,
    };
    if (kind === "payment") updatePayment(projectId, item.id, patch);
    else updateExpense(projectId, item.id, patch);
  }

  return (
    <li className="group flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <span className="font-semibold text-deep">
        {formatMoney(item.amount)}
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
      {displayLinked ? (
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
  contractValue,
  events,
}: {
  kind: "payment" | "expense";
  projectId: string;
  contractValue: number | null | undefined;
  events: LinkableDeadline[];
}) {
  const { addPayment, addExpense } = useProjects();
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [date, setDate] = useState("");
  const [actualDate, setActualDate] = useState("");
  const [label, setLabel] = useState("");
  const [linkId, setLinkId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const linked = findLinkableDeadline(linkId, events);
  const actualLabel = kind === "payment" ? "Received on" : "Paid on";

  useEffect(() => {
    if (linked) setDate(linked.date);
  }, [linked?.date, linked]);

  useEffect(() => {
    const pct = parseOptionalNumber(percent);
    if (pct != null && contractValue != null) {
      setAmount(String(amountFromPercent(contractValue, pct)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractValue]);

  function handlePercentChange(raw: string) {
    setPercent(raw);
    setError(null);
    const pct = parseOptionalNumber(raw);
    if (pct != null && contractValue != null) {
      setAmount(String(amountFromPercent(contractValue, pct)));
    }
  }

  function handleLink(id: string) {
    setLinkId(id);
    setError(null);
    if (id) {
      const ev = findLinkableDeadline(id, events);
      if (ev) setDate(ev.date);
    }
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const dueDate = (linked?.date || date || "").trim();
    const pct = parseOptionalNumber(percent);
    let amt = parseOptionalNumber(amount);
    if (amt == null && pct != null && contractValue != null) {
      amt = amountFromPercent(contractValue, pct);
    }
    if (amt == null || amt <= 0) {
      setError(
        pct != null && contractValue == null
          ? "Set a contract value above, or enter an amount in €."
          : "Enter an amount (or % of contract).",
      );
      return;
    }
    if (!dueDate) {
      setError("Pick an expected date, or link to a schedule event.");
      return;
    }
    const input = {
      amount: amt,
      ...(pct != null ? { percent: pct } : {}),
      dueDate,
      label,
      ...(linked ? { milestoneId: linked.id } : {}),
      ...(actualDate.trim() ? { actualDate: actualDate.trim() } : {}),
    };
    if (kind === "payment") addPayment(projectId, input);
    else addExpense(projectId, input);
    setAmount("");
    setPercent("");
    setDate("");
    setActualDate("");
    setLabel("");
    setLinkId("");
    setError(null);
  }

  const dueReady = Boolean(linked?.date || date);
  const amountReady =
    Boolean(amount.trim()) ||
    (Boolean(percent.trim()) && contractValue != null);
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
        placeholder="% of contract"
        className={inputCls}
      />
      <input
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setError(null);
        }}
        placeholder="Amount €"
        className={inputCls}
      />
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
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={
          kind === "payment"
            ? "Label (optional) e.g. Down payment"
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
  const { financeImport, projects } = useProjects();
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
            contractValue={financials.contractValue}
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
                  contractValue={financials.contractValue}
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
          <AddCashForm
            kind="expense"
            projectId={projectId}
            contractValue={financials.contractValue}
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
                  contractValue={financials.contractValue}
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
