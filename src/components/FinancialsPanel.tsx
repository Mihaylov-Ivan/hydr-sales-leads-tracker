"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjects } from "@/lib/store";
import {
  MILESTONE_KINDS,
  MILESTONE_LABELS,
  MilestoneKind,
  ProjectFinancials,
  ProjectMilestone,
  ProjectPayment,
} from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal-accent";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

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

function startOfQuarter(ms: number): number {
  const d = new Date(ms);
  const month = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), month, 1).getTime();
}

function nextQuarter(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + 3, 1).getTime();
}

function quarterTicks(rangeStart: number, rangeEnd: number): number[] {
  const ticks: number[] = [];
  let t = rangeStart;
  while (t <= rangeEnd) {
    ticks.push(t);
    t = nextQuarter(t);
  }
  return ticks;
}

function formatQuarter(ms: number): string {
  const d = new Date(ms);
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${month} ${d.getFullYear()}`;
}

type TimelineEvent = {
  id: string;
  date: string;
  label: string;
  sub?: string;
  kind: "payment" | "milestone" | "contract";
};

function buildEvents(financials: ProjectFinancials): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (financials.contractSignedDate) {
    events.push({
      id: "contract-signed",
      date: financials.contractSignedDate,
      label: "Contract signed",
      kind: "contract",
    });
  }
  for (const m of financials.milestones) {
    events.push({
      id: `ms-${m.id}`,
      date: m.date,
      label: MILESTONE_LABELS[m.kind],
      sub: m.note,
      kind: "milestone",
    });
  }
  for (const p of financials.payments) {
    const linked = p.milestoneId
      ? financials.milestones.find((m) => m.id === p.milestoneId)
      : undefined;
    const pct = p.percent != null ? ` (${p.percent}%)` : "";
    events.push({
      id: `pay-${p.id}`,
      // Linked payments sit on the milestone date so both markers share the day
      date: linked?.date ?? p.dueDate,
      label: p.label?.trim() || "Payment received",
      sub: `${formatMoney(p.amount)}${pct}`,
      kind: "payment",
    });
  }
  return events.sort((a, b) => {
    const dt = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dt !== 0) return dt;
    // Same day: contract → milestone → payment so linked pairs stack above/below
    const order = { contract: 0, milestone: 1, payment: 2 } as const;
    return order[a.kind] - order[b.kind];
  });
}

const KIND_COLOR: Record<TimelineEvent["kind"], string> = {
  contract: "bg-deep border-deep",
  payment: "bg-olive border-olive",
  milestone: "bg-teal-accent border-teal-accent",
};

/** Half the event label width — keeps edge labels inside the chart. */
const LABEL_HALF_PX = 72;
/** Minimum spacing between neighbouring event markers before we scroll. */
const MIN_EVENT_GAP_PX = 112;

function ProjectTimeline({ events }: { events: TimelineEvent[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setViewportW(w);
    });
    ro.observe(el);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
        Add a contract date, payments, or milestones to see the timeline.
      </p>
    );
  }

  const times = events.map((e) => new Date(e.date + "T00:00:00").getTime());
  const rangeStart = startOfQuarter(Math.min(...times));
  // Include the quarter after the last event so the axis has room on the right
  const rangeEnd = nextQuarter(startOfQuarter(Math.max(...times)));
  const span = Math.max(rangeEnd - rangeStart, 1);
  const ticks = quarterTicks(rangeStart, rangeEnd);

  const crowdedW =
    LABEL_HALF_PX * 2 + Math.max(0, events.length - 1) * MIN_EVENT_GAP_PX;
  const chartW = Math.max(viewportW || crowdedW, crowdedW);
  const trackW = chartW - LABEL_HALF_PX * 2;

  function xOf(ms: number): number {
    return LABEL_HALF_PX + ((ms - rangeStart) / span) * trackW;
  }

  function xOfDate(date: string): number {
    return xOf(new Date(date + "T00:00:00").getTime());
  }

  return (
    <div>
      <div ref={viewportRef} className="w-full overflow-x-auto pb-1">
        <div className="relative" style={{ width: chartW, minHeight: 168 }}>
          {/* Event markers / labels */}
          <div className="relative h-36">
            <div
              className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-line"
              style={{ left: LABEL_HALF_PX, width: trackW }}
            />
            {events.map((e, i) => {
              const above = i % 2 === 0;
              const left = xOfDate(e.date);
              return (
                <div
                  key={e.id}
                  className="absolute flex w-36 -translate-x-1/2 flex-col items-center"
                  style={{
                    left,
                    ...(above
                      ? { bottom: "50%", paddingBottom: "0.875rem" }
                      : { top: "50%", paddingTop: "0.875rem" }),
                  }}
                >
                  {above && (
                    <div className="mb-1 px-0.5 text-center">
                      <p className="text-[11px] font-bold leading-tight text-deep">
                        {e.label}
                      </p>
                      {e.sub && (
                        <p className="text-[11px] font-semibold leading-tight text-teal-accent">
                          {e.sub}
                        </p>
                      )}
                      <p className="text-[10px] text-muted">{formatDate(e.date)}</p>
                    </div>
                  )}
                  <span
                    className={`absolute left-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-surface shadow-sm ${KIND_COLOR[e.kind]}`}
                    style={above ? { bottom: "-0.4rem" } : { top: "-0.4rem" }}
                  />
                  {!above && (
                    <div className="mt-1 px-0.5 text-center">
                      <p className="text-[11px] font-bold leading-tight text-deep">
                        {e.label}
                      </p>
                      {e.sub && (
                        <p className="text-[11px] font-semibold leading-tight text-teal-accent">
                          {e.sub}
                        </p>
                      )}
                      <p className="text-[10px] text-muted">{formatDate(e.date)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quarterly axis */}
          <div className="relative mt-1 h-8 border-t border-line">
            {ticks.map((t) => {
              const left = xOf(t);
              return (
                <div
                  key={t}
                  className="absolute top-0"
                  style={{ left }}
                >
                  <span className="block h-2 w-px bg-line" />
                  <p
                    className="mt-0.5 whitespace-nowrap text-[10px] font-semibold text-muted"
                    style={
                      t === rangeStart
                        ? undefined
                        : t === rangeEnd
                          ? { transform: "translateX(-100%)" }
                          : { transform: "translateX(-50%)" }
                    }
                  >
                    {formatQuarter(t)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-4 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-deep" /> Contract
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-olive" /> Payment
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-teal-accent" /> Milestone
        </span>
      </div>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onSave,
  hint,
}: {
  label: string;
  value: number | undefined;
  onSave: (n: number | null) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [focused, setFocused] = useState(false);

  const shown = focused ? draft : value != null ? String(value) : draft;

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        onFocus={() => {
          setFocused(true);
          setDraft(value != null ? String(value) : "");
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          const n = parseOptionalNumber(draft);
          onSave(n);
          setDraft(n != null ? String(n) : "");
        }}
        placeholder="Optional"
        className={inputCls}
      />
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function amountFromPercent(contractValue: number, percent: number): number {
  const raw = (contractValue * percent) / 100;
  return Math.round(raw * 100) / 100;
}

function PaymentRow({
  projectId,
  payment,
  financials,
  milestones,
}: {
  projectId: string;
  payment: ProjectPayment;
  financials: ProjectFinancials;
  milestones: ProjectMilestone[];
}) {
  const { updatePayment, deletePayment } = useProjects();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [percent, setPercent] = useState(
    payment.percent != null ? String(payment.percent) : "",
  );
  const [dueDate, setDueDate] = useState(payment.dueDate);
  const [label, setLabel] = useState(payment.label ?? "");
  const [milestoneId, setMilestoneId] = useState(payment.milestoneId ?? "");

  const linked = milestoneId
    ? milestones.find((m) => m.id === milestoneId)
    : undefined;

  function startEdit() {
    setAmount(String(payment.amount));
    setPercent(payment.percent != null ? String(payment.percent) : "");
    setDueDate(payment.dueDate);
    setLabel(payment.label ?? "");
    setMilestoneId(payment.milestoneId ?? "");
    setEditing(true);
  }

  function handlePercentChange(raw: string) {
    setPercent(raw);
    const pct = parseOptionalNumber(raw);
    if (pct != null && financials.contractValue != null) {
      setAmount(String(amountFromPercent(financials.contractValue, pct)));
    }
  }

  function handleMilestoneLink(id: string) {
    setMilestoneId(id);
    if (id) {
      const m = milestones.find((x) => x.id === id);
      if (m) setDueDate(m.date);
    }
  }

  function save() {
    const pct = parseOptionalNumber(percent);
    let amt = parseOptionalNumber(amount);
    if (amt == null && pct != null && financials.contractValue != null) {
      amt = amountFromPercent(financials.contractValue, pct);
    }
    const date = linked?.date ?? dueDate;
    if (amt == null || amt <= 0 || !date) return;
    updatePayment(projectId, payment.id, {
      amount: amt,
      ...(pct != null ? { percent: pct } : {}),
      dueDate: date,
      label,
      ...(linked ? { milestoneId: linked.id } : {}),
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-teal-accent/40 bg-surface p-3">
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
          <input
            type="date"
            value={linked?.date ?? dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={Boolean(linked)}
            className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`}
          />
          <div className="flex gap-1">
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
          <select
            value={milestoneId}
            onChange={(e) => handleMilestoneLink(e.target.value)}
            className={`${inputCls} col-span-2`}
          >
            <option value="">No linked deadline</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {MILESTONE_LABELS[m.kind]} · {formatDate(m.date)}
              </option>
            ))}
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className={`${inputCls} col-span-2`}
          />
        </div>
      </li>
    );
  }

  const displayLinked = payment.milestoneId
    ? milestones.find((m) => m.id === payment.milestoneId)
    : undefined;
  const linkedName = displayLinked
    ? MILESTONE_LABELS[displayLinked.kind]
    : null;

  return (
    <li className="group flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <span className="font-semibold text-deep">
        {formatMoney(payment.amount)}
        {payment.percent != null && (
          <span className="ml-1 font-medium text-teal-accent">
            ({payment.percent}%)
          </span>
        )}
      </span>
      <span className="text-muted">
        on {formatDate(displayLinked?.date ?? payment.dueDate)}
      </span>
      {linkedName && (
        <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-semibold text-teal-accent">
          ↔ {linkedName}
        </span>
      )}
      {payment.label && (
        <span className="truncate text-xs text-muted">· {payment.label}</span>
      )}
      <span className="ml-auto flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={startEdit}
          className="text-xs font-semibold text-teal-accent hover:underline"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => deletePayment(projectId, payment.id)}
          className="text-xs text-muted hover:text-red-500"
        >
          Remove
        </button>
      </span>
    </li>
  );
}

function MilestoneRow({
  projectId,
  milestone,
}: {
  projectId: string;
  milestone: ProjectMilestone;
}) {
  const { updateMilestone, deleteMilestone } = useProjects();
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<MilestoneKind>(milestone.kind);
  const [date, setDate] = useState(milestone.date);
  const [note, setNote] = useState(milestone.note ?? "");

  function startEdit() {
    setKind(milestone.kind);
    setDate(milestone.date);
    setNote(milestone.note ?? "");
    setEditing(true);
  }

  function save() {
    if (!date) return;
    updateMilestone(projectId, milestone.id, {
      kind,
      date,
      note,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-teal-accent/40 bg-surface p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MilestoneKind)}
            className={inputCls}
          >
            {MILESTONE_KINDS.filter((k) => k !== "contract-signed").map((k) => (
              <option key={k} value={k}>
                {MILESTONE_LABELS[k]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
          <div className="flex gap-1">
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
              disabled={!date}
              className="flex-1 rounded-lg bg-olive px-2 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink hover:brightness-105 disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className={`${inputCls} col-span-2 sm:col-span-3`}
          />
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <span className="font-semibold text-deep">
        {MILESTONE_LABELS[milestone.kind]}
      </span>
      <span className="text-muted">{formatDate(milestone.date)}</span>
      {milestone.note && (
        <span className="truncate text-xs text-muted">· {milestone.note}</span>
      )}
      <span className="ml-auto flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={startEdit}
          className="text-xs font-semibold text-teal-accent hover:underline"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => deleteMilestone(projectId, milestone.id)}
          className="text-xs text-muted hover:text-red-500"
        >
          Remove
        </button>
      </span>
    </li>
  );
}

export default function FinancialsPanel({
  projectId,
  financials,
}: {
  projectId: string;
  financials: ProjectFinancials;
}) {
  const {
    updateFinancials,
    addPayment,
    addMilestone,
  } = useProjects();

  const events = useMemo(() => buildEvents(financials), [financials]);

  const [payAmount, setPayAmount] = useState("");
  const [payPercent, setPayPercent] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payLabel, setPayLabel] = useState("");
  const [payMilestoneId, setPayMilestoneId] = useState("");

  const [msKind, setMsKind] = useState<MilestoneKind>("fat");
  const [msDate, setMsDate] = useState("");
  const [msNote, setMsNote] = useState("");

  const impliedProfit =
    financials.contractValue != null && financials.expenses != null
      ? financials.contractValue - financials.expenses
      : null;

  const linkedMilestone = payMilestoneId
    ? financials.milestones.find((m) => m.id === payMilestoneId)
    : undefined;

  function handlePercentChange(raw: string) {
    setPayPercent(raw);
    const pct = parseOptionalNumber(raw);
    if (pct != null && financials.contractValue != null) {
      setPayAmount(String(amountFromPercent(financials.contractValue, pct)));
    }
  }

  function handleMilestoneLink(id: string) {
    setPayMilestoneId(id);
    if (id) {
      const m = financials.milestones.find((x) => x.id === id);
      if (m) setPayDate(m.date);
    }
  }

  // If contract value arrives/changes while a % is typed, refresh the amount.
  useEffect(() => {
    const pct = parseOptionalNumber(payPercent);
    if (pct != null && financials.contractValue != null) {
      setPayAmount(String(amountFromPercent(financials.contractValue, pct)));
    }
    // intentionally only react to contract value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financials.contractValue]);

  // Keep linked payment date in sync if the chosen milestone's date changes
  useEffect(() => {
    if (linkedMilestone) setPayDate(linkedMilestone.date);
  }, [linkedMilestone?.date, linkedMilestone]);

  function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    const dueDate = linkedMilestone?.date ?? payDate;
    if (!dueDate) return;
    const percent = parseOptionalNumber(payPercent);
    let amount = parseOptionalNumber(payAmount);
    if (
      amount == null &&
      percent != null &&
      financials.contractValue != null
    ) {
      amount = amountFromPercent(financials.contractValue, percent);
    }
    if (amount == null || amount <= 0) return;
    addPayment(projectId, {
      amount,
      ...(percent != null ? { percent } : {}),
      dueDate,
      label: payLabel,
      ...(linkedMilestone ? { milestoneId: linkedMilestone.id } : {}),
    });
    setPayAmount("");
    setPayPercent("");
    setPayDate("");
    setPayLabel("");
    setPayMilestoneId("");
  }

  function submitMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!msDate) return;
    addMilestone(projectId, {
      kind: msKind,
      date: msDate,
      note: msNote,
    });
    setMsDate("");
    setMsNote("");
  }

  const canAddPayment =
    Boolean(linkedMilestone?.date || payDate) &&
    (Boolean(payAmount.trim()) ||
      (Boolean(payPercent.trim()) && financials.contractValue != null));

  const sortedPayments = [...financials.payments].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );
  const sortedMilestones = [...financials.milestones].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-deep">
        Financials &amp; Timeline
      </h2>

      {/* Summary fields */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyField
          label="Contract value (€)"
          value={financials.contractValue}
          onSave={(n) => updateFinancials(projectId, { contractValue: n })}
        />
        <div>
          <label className={labelCls}>Contract expected / signed</label>
          <input
            type="date"
            value={financials.contractSignedDate ?? ""}
            onChange={(e) =>
              updateFinancials(projectId, {
                contractSignedDate: e.target.value || null,
              })
            }
            className={inputCls}
          />
        </div>
        <MoneyField
          label="Expenses (€)"
          value={financials.expenses}
          onSave={(n) => updateFinancials(projectId, { expenses: n })}
          hint="Construction + development costs"
        />
        <MoneyField
          label="Expected profit (€)"
          value={financials.expectedProfit}
          onSave={(n) => updateFinancials(projectId, { expectedProfit: n })}
          hint={
            impliedProfit != null
              ? `Value − expenses = ${formatMoney(impliedProfit)}`
              : undefined
          }
        />
      </div>

      {/* Timeline chart */}
      <div className="mb-5 rounded-xl border border-line bg-surface p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Project timeline
        </p>
        <ProjectTimeline events={events} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Payments */}
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-deep">
            Payment schedule
          </h3>
          <form
            onSubmit={submitPayment}
            className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            <input
              value={payPercent}
              onChange={(e) => handlePercentChange(e.target.value)}
              placeholder="% of contract"
              className={inputCls}
              title={
                financials.contractValue == null
                  ? "Set a contract value first to auto-calculate the amount"
                  : "Amount is calculated from contract value × %"
              }
            />
            <input
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="Amount €"
              className={inputCls}
            />
            <input
              type="date"
              value={linkedMilestone?.date ?? payDate}
              onChange={(e) => setPayDate(e.target.value)}
              disabled={Boolean(linkedMilestone)}
              title={
                linkedMilestone
                  ? "Date follows the linked deadline"
                  : undefined
              }
              className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`}
              required={!linkedMilestone}
            />
            <button
              type="submit"
              disabled={!canAddPayment}
              className="rounded-lg bg-olive px-3 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
            <select
              value={payMilestoneId}
              onChange={(e) => handleMilestoneLink(e.target.value)}
              className={`${inputCls} col-span-2`}
              title="Optionally tie this payment to a project deadline"
            >
              <option value="">No linked deadline</option>
              {sortedMilestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {MILESTONE_LABELS[m.kind]} · {formatDate(m.date)}
                </option>
              ))}
            </select>
            <input
              value={payLabel}
              onChange={(e) => setPayLabel(e.target.value)}
              placeholder="Label (optional) e.g. Down payment"
              className={`${inputCls} col-span-2`}
            />
          </form>
          {financials.milestones.length === 0 && (
            <p className="mb-2 text-[11px] text-muted">
              Add a project deadline first to tie a payment to it (same date on
              the timeline).
            </p>
          )}
          {financials.contractValue == null && (
            <p className="mb-2 text-[11px] text-muted">
              Set a contract value above to auto-fill amount from %.
            </p>
          )}
          {sortedPayments.length === 0 ? (
            <p className="text-sm text-muted/80">
              No payments yet. e.g. 75% tied to Engineering done.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sortedPayments.map((p) => (
                <PaymentRow
                  key={p.id}
                  projectId={projectId}
                  payment={p}
                  financials={financials}
                  milestones={sortedMilestones}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Milestones */}
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-deep">
            Project deadlines
          </h3>
          <form
            onSubmit={submitMilestone}
            className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            <select
              value={msKind}
              onChange={(e) => setMsKind(e.target.value as MilestoneKind)}
              className={inputCls}
            >
              {MILESTONE_KINDS.filter((k) => k !== "contract-signed").map((k) => (
                <option key={k} value={k}>
                  {MILESTONE_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={msDate}
              onChange={(e) => setMsDate(e.target.value)}
              className={inputCls}
              required
            />
            <button
              type="submit"
              disabled={!msDate}
              className="rounded-lg bg-olive px-3 py-2 text-xs font-bold uppercase tracking-wide text-olive-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
            <input
              value={msNote}
              onChange={(e) => setMsNote(e.target.value)}
              placeholder="Note (optional)"
              className={`${inputCls} col-span-2 sm:col-span-3`}
            />
          </form>
          {sortedMilestones.length === 0 ? (
            <p className="text-sm text-muted/80">
              No deadlines yet. Add FAT, SAT, engineering, manufacturing, etc.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sortedMilestones.map((m) => (
                <MilestoneRow
                  key={m.id}
                  projectId={projectId}
                  milestone={m}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
