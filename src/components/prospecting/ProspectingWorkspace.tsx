"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useProjects } from "@/lib/store";
import { formatShortDate, useProspecting } from "@/lib/prospecting-store";
import {
  PROSPECT_MARKET_LABELS,
  PROSPECT_MARKETS,
  PROSPECT_PRIORITY_LABELS,
  PROSPECT_PRODUCT_PURITY,
  PROSPECT_SOURCE_LABELS,
  PROSPECT_SOURCES,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUSES,
  PROSPECT_VIEW_LABELS,
  ProspectCompany,
  ProspectContact,
  ProspectMarket,
  ProspectSource,
  ProspectStatus,
  ProspectView,
  ProspectWorkRow,
  todayDateOnly,
  weekdayFocus,
  WEEKDAY_FOCUS_COPY,
} from "@/lib/prospecting-types";
import { STAGE_LABELS, Stage } from "@/lib/types";
import { assignableTeamMembers } from "@/lib/permissions";
import {
  AddCompanyDialog,
  AddContactDialog,
  LogOutreachDialog,
  PrepareContactDialog,
  PromoteDialog,
  QualifyDialog,
} from "./ProspectingDialogs";
import { useLinkProspectToColdLead } from "./ProspectSalesSync";

type DialogState =
  | { type: "add-company" }
  | { type: "add-contact"; company: ProspectCompany }
  | { type: "prepare"; company: ProspectCompany; contact: ProspectContact }
  | { type: "log"; company: ProspectCompany; contact: ProspectContact }
  | { type: "qualify"; company: ProspectCompany }
  | {
      type: "promote";
      company: ProspectCompany;
      contacts: ProspectContact[];
    }
  | null;

const STATUS_TONE: Record<ProspectStatus, string> = {
  "target-identified": "bg-surface-tint text-muted",
  "contact-prepared": "bg-teal-soft text-teal-accent",
  contacted: "bg-deep/10 text-deep",
  "follow-up-due": "bg-amber-accent/15 text-amber-accent",
  engaged: "bg-olive/25 text-olive-ink",
  qualified: "bg-green-accent/15 text-green-accent",
  promoted: "bg-green-accent/20 text-green-accent",
  "not-interested": "bg-muted/15 text-muted",
  dormant: "bg-muted/10 text-muted",
  disqualified: "bg-muted/15 text-muted",
};

function ProgressBar({
  value,
  max,
  tone = "teal",
}: {
  value: number;
  max: number;
  tone?: "teal" | "amber" | "olive";
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const bar =
    tone === "amber"
      ? "bg-amber-accent"
      : tone === "olive"
        ? "bg-olive"
        : "bg-teal-accent";
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function KpiChip({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`min-w-[7.5rem] flex-1 rounded-xl border px-3 py-2.5 ${
        warn
          ? "border-amber-accent/40 bg-amber-accent/10"
          : "border-line bg-panel"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-bold ${warn ? "text-amber-accent" : "text-deep"}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: ProspectStatus }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE[status]}`}
    >
      {PROSPECT_STATUS_LABELS[status]}
    </span>
  );
}

function ownerName(
  id: string,
  team: { id: string; name: string }[],
): string {
  return team.find((m) => m.id === id)?.name ?? "—";
}

export default function ProspectingWorkspace() {
  const {
    ready,
    companies,
    contacts,
    activities,
    targets,
    kpis,
    markPrepared,
    markEngaged,
    scheduleFollowUp,
    deleteContact,
    deleteCompany,
  } = useProspecting();
  const { teamMembers, currentUserId, projects } = useProjects();
  const assignableMembers = assignableTeamMembers(teamMembers);
  const linkToColdLead = useLinkProspectToColdLead();

  const [view, setView] = useState<ProspectView>("my-work");
  const [search, setSearch] = useState("");
  const [filterMarket, setFilterMarket] = useState<ProspectMarket | "">("");
  const [filterSource, setFilterSource] = useState<ProspectSource | "">("");
  const [filterStatus, setFilterStatus] = useState<ProspectStatus | "">("");
  const [filterOwner, setFilterOwner] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [dialog, setDialog] = useState<DialogState>(null);

  function handleDeleteContact(
    contact: ProspectContact,
    company: ProspectCompany,
  ) {
    const siblings = contacts.filter((c) => c.companyId === company.id);
    const isLast = siblings.length <= 1;
    const msg = isLast
      ? `Delete “${contact.name}” and company “${company.name}”? This cannot be undone. (Linked Sales Projects are kept.)`
      : `Delete contact “${contact.name}”? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    if (selectedContactId === contact.id) setSelectedContactId(null);
    if (isLast) {
      deleteCompany(company.id);
    } else {
      deleteContact(contact.id);
    }
  }

  function handleDeleteCompany(company: ProspectCompany) {
    const count = contacts.filter((c) => c.companyId === company.id).length;
    const msg = `Delete company “${company.name}” and its ${count} contact${count === 1 ? "" : "s"}? This cannot be undone. (Linked Sales Projects are kept.)`;
    if (!window.confirm(msg)) return;
    if (
      selectedContactId &&
      contacts.some(
        (c) => c.id === selectedContactId && c.companyId === company.id,
      )
    ) {
      setSelectedContactId(null);
    }
    deleteCompany(company.id);
  }

  const today = todayDateOnly();
  const focus = weekdayFocus();
  const focusCopy = WEEKDAY_FOCUS_COPY[focus];
  const me =
    currentUserId && teamMembers.some((m) => m.id === currentUserId)
      ? currentUserId
      : "";

  const companyById = useMemo(() => {
    const map = new Map<string, ProspectCompany>();
    for (const c of companies) map.set(c.id, c);
    return map;
  }, [companies]);

  const rows: ProspectWorkRow[] = useMemo(() => {
    return contacts
      .map((contact) => {
        const company = companyById.get(contact.companyId);
        if (!company) return null;
        return { contact, company };
      })
      .filter((r): r is ProspectWorkRow => r != null)
      .sort((a, b) => {
        const af = a.contact.nextFollowUpAt ?? "9999";
        const bf = b.contact.nextFollowUpAt ?? "9999";
        if (af !== bf) return af.localeCompare(bf);
        return (b.company.lastActivityAt ?? "").localeCompare(
          a.company.lastActivityAt ?? "",
        );
      });
  }, [contacts, companyById]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(({ contact, company }) => {
      if (view === "my-work" && me && contact.ownerId !== me) return false;
      if (view === "prepare") {
        if (
          contact.status !== "target-identified" &&
          contact.status !== "contact-prepared"
        ) {
          return false;
        }
      }
      if (view === "contact") {
        if (
          contact.status !== "contact-prepared" &&
          contact.status !== "contacted" &&
          contact.status !== "follow-up-due"
        ) {
          return false;
        }
      }
      if (view === "engaged") {
        if (contact.status !== "engaged" && contact.status !== "qualified") {
          return false;
        }
      }
      if (filterMarket && company.market !== filterMarket) return false;
      if (filterSource && company.source !== filterSource) return false;
      if (filterStatus && contact.status !== filterStatus) return false;
      if (filterOwner && contact.ownerId !== filterOwner) return false;

      if (!q) return true;
      const hay = [
        company.name,
        company.country,
        company.city,
        company.siteName,
        contact.name,
        contact.title,
        contact.email,
        PROSPECT_MARKET_LABELS[company.market],
        PROSPECT_SOURCE_LABELS[company.source],
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    rows,
    view,
    me,
    filterMarket,
    filterSource,
    filterStatus,
    filterOwner,
    search,
  ]);

  const selected = useMemo(() => {
    if (!selectedContactId) return null;
    const contact = contacts.find((c) => c.id === selectedContactId);
    if (!contact) return null;
    const company = companyById.get(contact.companyId);
    if (!company) return null;
    return { contact, company };
  }, [selectedContactId, contacts, companyById]);

  const selectedActivities = useMemo(() => {
    if (!selected) return [];
    return activities
      .filter(
        (a) =>
          a.companyId === selected.company.id &&
          (!a.contactId || a.contactId === selected.contact.id),
      )
      .slice(0, 30);
  }, [activities, selected]);

  const companyContacts = useMemo(() => {
    if (!selected) return [];
    return contacts.filter((c) => c.companyId === selected.company.id);
  }, [contacts, selected]);

  const insights = useMemo(() => {
    const bySource = PROSPECT_SOURCES.map((source) => {
      const srcContacts = contacts.filter((c) => {
        const co = companyById.get(c.companyId);
        return co?.source === source;
      });
      const engaged = srcContacts.filter(
        (c) =>
          c.status === "engaged" ||
          c.status === "qualified" ||
          c.status === "promoted",
      ).length;
      const qualified = srcContacts.filter(
        (c) => c.status === "qualified" || c.status === "promoted",
      ).length;
      const promoted = srcContacts.filter((c) => c.status === "promoted").length;
      return {
        key: source,
        label: PROSPECT_SOURCE_LABELS[source],
        contacts: srcContacts.length,
        engaged,
        qualified,
        promoted,
      };
    }).filter((r) => r.contacts > 0);

    const byMarket = PROSPECT_MARKETS.map((market) => {
      const mContacts = contacts.filter((c) => {
        const co = companyById.get(c.companyId);
        return co?.market === market;
      });
      const engaged = mContacts.filter(
        (c) =>
          c.status === "engaged" ||
          c.status === "qualified" ||
          c.status === "promoted",
      ).length;
      const qualified = mContacts.filter(
        (c) => c.status === "qualified" || c.status === "promoted",
      ).length;
      const promoted = mContacts.filter((c) => c.status === "promoted").length;
      const planned = targets.marketAllocation[market] ?? 0;
      const actualShare =
        contacts.length === 0
          ? 0
          : Math.round((mContacts.length / contacts.length) * 100);
      return {
        key: market,
        label: PROSPECT_MARKET_LABELS[market],
        contacts: mContacts.length,
        engaged,
        qualified,
        promoted,
        planned,
        actualShare,
      };
    });

    return { bySource, byMarket };
  }, [contacts, companyById, targets.marketAllocation]);

  const viewCounts = useMemo(() => {
    const mine = me
      ? rows.filter((r) => r.contact.ownerId === me).length
      : rows.length;
    return {
      "my-work": mine,
      prepare: rows.filter(
        (r) =>
          r.contact.status === "target-identified" ||
          r.contact.status === "contact-prepared",
      ).length,
      contact: rows.filter(
        (r) =>
          r.contact.status === "contact-prepared" ||
          r.contact.status === "contacted" ||
          r.contact.status === "follow-up-due",
      ).length,
      engaged: rows.filter(
        (r) =>
          r.contact.status === "engaged" || r.contact.status === "qualified",
      ).length,
      all: rows.length,
      insights: 0,
    } satisfies Record<ProspectView, number>;
  }, [rows, me]);

  if (!ready) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted">
        Loading prospecting…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-deep">Prospecting</h1>
          <p className="mt-0.5 text-sm text-muted">
            Build pipeline, prepare outreach, log outcomes — before Sales
            Projects.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDialog({ type: "add-company" })}
            className="rounded-lg bg-teal-accent px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm"
          >
            + Target company
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[10rem] flex-1 rounded-xl border border-line bg-panel px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            New contacts this week
          </div>
          <div className="mt-0.5 text-lg font-bold text-deep">
            {kpis.newContactsWeek}{" "}
            <span className="text-sm font-semibold text-muted">
              / {kpis.weeklyTarget}
            </span>
          </div>
          <ProgressBar value={kpis.newContactsWeek} max={kpis.weeklyTarget} />
        </div>
        <div className="min-w-[10rem] flex-1 rounded-xl border border-line bg-panel px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            New contacts this month
          </div>
          <div className="mt-0.5 text-lg font-bold text-deep">
            {kpis.newContactsMonth}{" "}
            <span className="text-sm font-semibold text-muted">
              / {kpis.monthlyTarget}
            </span>
          </div>
          <ProgressBar
            value={kpis.newContactsMonth}
            max={kpis.monthlyTarget}
            tone="olive"
          />
        </div>
        <KpiChip label="Prepared" value={String(kpis.prepared)} />
        <KpiChip
          label="Follow-ups due"
          value={String(kpis.followUpsDue)}
          warn={kpis.overdueFollowUps > 0}
          sub={
            kpis.overdueFollowUps > 0
              ? `${kpis.overdueFollowUps} overdue`
              : undefined
          }
        />
        <KpiChip label="Engaged" value={String(kpis.engaged)} />
        <KpiChip label="Qualified" value={String(kpis.qualified)} />
        <KpiChip
          label="Promoted (mo)"
          value={String(kpis.promotedThisMonth)}
        />
      </div>

      {/* Today focus */}
      <div className="rounded-xl border border-line bg-panel px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-teal-accent">
              Today ·{" "}
              {new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </div>
            <h2 className="mt-0.5 text-base font-bold text-deep">
              {focusCopy.title}
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted">
              {focusCopy.hint}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {focusCopy.prepareTarget > 0 && (
              <div className="rounded-lg border border-line bg-surface px-3 py-2">
                <span className="text-muted">Prepared this week</span>
                <div className="font-bold text-deep">
                  {kpis.preparedThisWeek} / {focusCopy.prepareTarget * 2}
                </div>
              </div>
            )}
            {focusCopy.contactTarget > 0 && (
              <div className="rounded-lg border border-line bg-surface px-3 py-2">
                <span className="text-muted">New contacts today goal</span>
                <div className="font-bold text-deep">
                  {focusCopy.contactTarget}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setView(
                  focus === "prepare" || focus === "research"
                    ? "prepare"
                    : focus === "contact"
                      ? "contact"
                      : "my-work",
                );
              }}
              className="rounded-lg border border-teal-accent/30 bg-teal-soft px-3 py-2 font-bold text-teal-accent"
            >
              Open today&apos;s queue
            </button>
          </div>
        </div>
      </div>

      {/* Views */}
      <div className="flex flex-wrap items-center gap-1 border-b border-line pb-0">
        {(Object.keys(PROSPECT_VIEW_LABELS) as ProspectView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
              view === v
                ? "border-teal-accent text-teal-accent"
                : "border-transparent text-muted hover:text-deep"
            }`}
          >
            {PROSPECT_VIEW_LABELS[v]}
            {v !== "insights" && (
              <span className="ml-1.5 rounded-full bg-surface-tint px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                {viewCounts[v]}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === "insights" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="border-b border-line px-4 py-3 text-sm font-bold text-deep">
              Source performance
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-tint/60 text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Source</th>
                    <th className="px-3 py-2 font-semibold">Contacts</th>
                    <th className="px-3 py-2 font-semibold">Engaged</th>
                    <th className="px-3 py-2 font-semibold">Qualified</th>
                    <th className="px-3 py-2 font-semibold">Promoted</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.bySource.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-muted"
                      >
                        No source data yet
                      </td>
                    </tr>
                  ) : (
                    insights.bySource.map((r) => (
                      <tr key={r.key} className="border-t border-line">
                        <td className="px-3 py-2 font-medium text-deep">
                          {r.label}
                        </td>
                        <td className="px-3 py-2">{r.contacts}</td>
                        <td className="px-3 py-2">{r.engaged}</td>
                        <td className="px-3 py-2">{r.qualified}</td>
                        <td className="px-3 py-2">{r.promoted}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="border-b border-line px-4 py-3 text-sm font-bold text-deep">
              Market performance vs allocation
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-tint/60 text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Market</th>
                    <th className="px-3 py-2 font-semibold">Contacts</th>
                    <th className="px-3 py-2 font-semibold">Plan %</th>
                    <th className="px-3 py-2 font-semibold">Actual %</th>
                    <th className="px-3 py-2 font-semibold">Qualified</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.byMarket.map((r) => (
                    <tr key={r.key} className="border-t border-line">
                      <td className="px-3 py-2 font-medium text-deep">
                        {r.label}
                      </td>
                      <td className="px-3 py-2">{r.contacts}</td>
                      <td className="px-3 py-2">{r.planned}%</td>
                      <td className="px-3 py-2">{r.actualShare}%</td>
                      <td className="px-3 py-2">{r.qualified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, contact, country…"
              className="min-w-[14rem] flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-teal-accent"
            />
            <select
              value={filterMarket}
              onChange={(e) =>
                setFilterMarket(e.target.value as ProspectMarket | "")
              }
              className="rounded-lg border border-line bg-panel px-2.5 py-2 text-sm"
            >
              <option value="">All markets</option>
              {PROSPECT_MARKETS.map((m) => (
                <option key={m} value={m}>
                  {PROSPECT_MARKET_LABELS[m]}
                </option>
              ))}
            </select>
            <select
              value={filterSource}
              onChange={(e) =>
                setFilterSource(e.target.value as ProspectSource | "")
              }
              className="rounded-lg border border-line bg-panel px-2.5 py-2 text-sm"
            >
              <option value="">All sources</option>
              {PROSPECT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {PROSPECT_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as ProspectStatus | "")
              }
              className="rounded-lg border border-line bg-panel px-2.5 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {PROSPECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROSPECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={filterOwner}
              onChange={(e) => setFilterOwner(e.target.value)}
              className="rounded-lg border border-line bg-panel px-2.5 py-2 text-sm"
            >
              <option value="">All owners</option>
              {assignableMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-h-[28rem] gap-4">
            {/* Table */}
            <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-panel">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="sticky top-0 bg-surface-tint/90 text-[10px] uppercase tracking-wide text-muted backdrop-blur">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Company</th>
                      <th className="px-3 py-2.5 font-semibold">Contact</th>
                      <th className="px-3 py-2.5 font-semibold">Market</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold">Follow-up</th>
                      <th className="px-3 py-2.5 font-semibold">Attempts</th>
                      <th className="px-3 py-2.5 font-semibold">Owner</th>
                      <th className="px-3 py-2.5 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-3 py-12 text-center text-muted"
                        >
                          {rows.length === 0 ? (
                            <div>
                              <p className="font-medium text-deep">
                                No prospects yet
                              </p>
                              <p className="mt-1 text-sm">
                                Add a target company to start Monday/Wednesday
                                preparation.
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  setDialog({ type: "add-company" })
                                }
                                className="mt-3 rounded-lg bg-teal-accent px-3 py-1.5 text-xs font-bold uppercase text-white"
                              >
                                Add first company
                              </button>
                            </div>
                          ) : (
                            "No rows match these filters"
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map(({ contact, company }) => {
                        const overdue =
                          contact.nextFollowUpAt &&
                          contact.nextFollowUpAt < today;
                        const dueToday = contact.nextFollowUpAt === today;
                        return (
                          <tr
                            key={contact.id}
                            onClick={() => setSelectedContactId(contact.id)}
                            className={`cursor-pointer border-t border-line transition hover:bg-teal-soft/30 ${
                              selectedContactId === contact.id
                                ? "bg-teal-soft/40"
                                : ""
                            }`}
                          >
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-deep">
                                {company.name}
                              </div>
                              <div className="text-[11px] text-muted">
                                {[company.city, company.country]
                                  .filter(Boolean)
                                  .join(", ") || "—"}
                                {" · "}
                                {PROSPECT_SOURCE_LABELS[company.source]}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium text-ink">
                                {contact.name}
                                {contact.isPrimary && (
                                  <span className="ml-1 text-[10px] font-bold uppercase text-teal-accent">
                                    Primary
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted">
                                {contact.title || "—"}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="text-xs text-ink">
                                {PROSPECT_MARKET_LABELS[company.market]}
                              </div>
                              <div className="text-[10px] text-muted">
                                {company.product}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <StatusBadge status={contact.status} />
                              <div className="mt-1 text-[10px] uppercase text-muted">
                                {PROSPECT_PRIORITY_LABELS[contact.priority]}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={
                                  overdue
                                    ? "font-semibold text-amber-accent"
                                    : dueToday
                                      ? "font-semibold text-teal-accent"
                                      : "text-ink"
                                }
                              >
                                {formatShortDate(contact.nextFollowUpAt)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-muted">
                              {contact.outreachAttempts}
                            </td>
                            <td className="px-3 py-2.5 text-muted">
                              {ownerName(contact.ownerId, teamMembers)}
                            </td>
                            <td
                              className="px-3 py-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex flex-wrap gap-1">
                                {(contact.status === "target-identified" ||
                                  contact.status === "contact-prepared") && (
                                  <button
                                    type="button"
                                    title="Prepare"
                                    onClick={() =>
                                      setDialog({
                                        type: "prepare",
                                        company,
                                        contact,
                                      })
                                    }
                                    className="rounded-md border border-line px-2 py-1 text-[10px] font-bold uppercase text-deep hover:border-teal-accent hover:text-teal-accent"
                                  >
                                    Prep
                                  </button>
                                )}
                                {view !== "prepare" && (
                                  <button
                                    type="button"
                                    title="Log outreach"
                                    onClick={() =>
                                      setDialog({
                                        type: "log",
                                        company,
                                        contact,
                                      })
                                    }
                                    className="rounded-md border border-line px-2 py-1 text-[10px] font-bold uppercase text-deep hover:border-teal-accent hover:text-teal-accent"
                                  >
                                    Log
                                  </button>
                                )}
                                {(contact.status === "engaged" ||
                                  contact.status === "qualified" ||
                                  contact.status === "follow-up-due") && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDialog({ type: "qualify", company })
                                    }
                                    className="rounded-md border border-line px-2 py-1 text-[10px] font-bold uppercase text-deep hover:border-teal-accent hover:text-teal-accent"
                                  >
                                    Qualify
                                  </button>
                                )}
                                {(company.status === "qualified" ||
                                  company.status === "engaged" ||
                                  contact.status === "qualified") &&
                                  company.status !== "promoted" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDialog({
                                          type: "promote",
                                          company,
                                          contacts: contacts.filter(
                                            (c) => c.companyId === company.id,
                                          ),
                                        })
                                      }
                                      className="rounded-md bg-deep px-2 py-1 text-[10px] font-bold uppercase text-white"
                                    >
                                      Promote
                                    </button>
                                  )}
                                <button
                                  type="button"
                                  title="Delete contact"
                                  onClick={() =>
                                    handleDeleteContact(contact, company)
                                  }
                                  className="rounded-md border border-line px-2 py-1 text-[10px] font-bold uppercase text-muted hover:border-amber-accent/50 hover:text-amber-accent"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detail drawer */}
            {selected && (
              <aside className="hidden w-[22rem] shrink-0 flex-col overflow-hidden rounded-xl border border-line bg-panel lg:flex">
                <div className="border-b border-line px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-deep">
                        {selected.company.name}
                      </h3>
                      <p className="text-xs text-muted">
                        {selected.contact.name}
                        {selected.contact.title
                          ? ` · ${selected.contact.title}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedContactId(null)}
                      className="text-muted hover:text-deep"
                      aria-label="Close detail"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge status={selected.contact.status} />
                    <span className="rounded-md bg-surface-tint px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
                      {selected.company.product} ·{" "}
                      {PROSPECT_PRODUCT_PURITY[selected.company.product]}
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
                  <section>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Company
                    </h4>
                    <dl className="mt-1 space-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Market</dt>
                        <dd className="text-right text-ink">
                          {PROSPECT_MARKET_LABELS[selected.company.market]}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Source</dt>
                        <dd className="text-right text-ink">
                          {PROSPECT_SOURCE_LABELS[selected.company.source]}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Location</dt>
                        <dd className="text-right text-ink">
                          {[selected.company.city, selected.company.country]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </dd>
                      </div>
                      {selected.company.siteName && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted">Site</dt>
                          <dd className="text-right text-ink">
                            {selected.company.siteName}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {selected.company.strategyWhy && (
                      <p className="mt-2 rounded-lg bg-surface-tint px-2.5 py-2 text-xs text-ink">
                        {selected.company.strategyWhy}
                      </p>
                    )}
                  </section>

                  <section>
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Contacts ({companyContacts.length})
                      </h4>
                      <button
                        type="button"
                        onClick={() =>
                          setDialog({
                            type: "add-contact",
                            company: selected.company,
                          })
                        }
                        className="text-[10px] font-bold uppercase text-teal-accent"
                      >
                        + Add
                      </button>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {companyContacts.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedContactId(c.id)}
                            className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                              c.id === selected.contact.id
                                ? "bg-teal-soft text-deep"
                                : "hover:bg-surface-tint"
                            }`}
                          >
                            <div className="font-semibold">{c.name}</div>
                            <div className="text-muted">
                              {c.title || "No title"} ·{" "}
                              {PROSPECT_STATUS_LABELS[c.status]}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Contact details
                    </h4>
                    <dl className="mt-1 space-y-1 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Email</dt>
                        <dd className="truncate text-right text-ink">
                          {selected.contact.email || "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted">Phone</dt>
                        <dd className="text-right text-ink">
                          {selected.contact.phone || "—"}
                        </dd>
                      </div>
                      {(selected.contact.personalizationNote ||
                        selected.contact.notes) && (
                        <p className="mt-1 rounded-lg bg-surface-tint px-2.5 py-2 text-xs">
                          {selected.contact.personalizationNote ||
                            selected.contact.notes}
                        </p>
                      )}
                      {selected.contact.draftMessage && (
                        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line px-2.5 py-2 text-xs text-muted">
                          {selected.contact.draftMessage}
                        </p>
                      )}
                    </dl>
                  </section>

                  <section>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Activity
                    </h4>
                    {selectedActivities.length === 0 ? (
                      <p className="mt-1 text-xs text-muted">No outreach yet</p>
                    ) : (
                      <ul className="mt-1 space-y-2">
                        {selectedActivities.map((a) => (
                          <li
                            key={a.id}
                            className="rounded-lg border border-line px-2.5 py-2 text-xs"
                          >
                            <div className="flex justify-between gap-2 text-muted">
                              <span>{formatShortDate(a.createdAt)}</span>
                              <span>
                                {a.countsAsNewContact ? "New" : "Follow-up"}
                              </span>
                            </div>
                            <div className="mt-0.5 font-medium text-ink">
                              {a.summary || "—"}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {selected.company.promotedProjectId && (
                    <section>
                      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Sales project
                      </h4>
                      {(() => {
                        const linked = projects.find(
                          (p) => p.id === selected.company.promotedProjectId,
                        );
                        return (
                          <div className="mt-1 space-y-1">
                            <Link
                              href={`/projects/${selected.company.promotedProjectId}`}
                              className="inline-flex text-xs font-bold text-teal-accent hover:underline"
                            >
                              Open on Sales Projects →
                            </Link>
                            {linked && (
                              <p className="text-[11px] text-muted">
                                Stage:{" "}
                                {STAGE_LABELS[linked.stage as Stage] ??
                                  linked.stage}
                                {linked.stage === "cancelled"
                                  ? " · synced as Not Interested"
                                  : ""}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </section>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 border-t border-line p-3">
                  {selected.contact.status === "target-identified" && (
                    <button
                      type="button"
                      onClick={() => markPrepared(selected.contact.id)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase"
                    >
                      Quick prep
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setDialog({
                        type: "prepare",
                        company: selected.company,
                        contact: selected.contact,
                      })
                    }
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase"
                  >
                    Prepare
                  </button>
                  {view !== "prepare" && (
                    <button
                      type="button"
                      onClick={() =>
                        setDialog({
                          type: "log",
                          company: selected.company,
                          contact: selected.contact,
                        })
                      }
                      className="rounded-lg bg-teal-accent px-2.5 py-1.5 text-[10px] font-bold uppercase text-white"
                    >
                      Log outcome
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 7);
                      scheduleFollowUp(
                        selected.contact.id,
                        d.toISOString().slice(0, 10),
                        "Scheduled +7 days",
                      );
                    }}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase"
                  >
                    +7d follow-up
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      markEngaged(selected.contact.id);
                      linkToColdLead(selected.company, companyContacts);
                    }}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase"
                  >
                    Engaged → Cold Lead
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDialog({ type: "qualify", company: selected.company })
                    }
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase"
                  >
                    Qualify
                  </button>
                  {selected.company.status !== "promoted" && (
                    <button
                      type="button"
                      onClick={() =>
                        setDialog({
                          type: "promote",
                          company: selected.company,
                          contacts: companyContacts,
                        })
                      }
                      className="rounded-lg bg-deep px-2.5 py-1.5 text-[10px] font-bold uppercase text-white"
                    >
                      Promote
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteContact(selected.contact, selected.company)
                    }
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase text-muted hover:border-amber-accent/50 hover:text-amber-accent"
                  >
                    Delete contact
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCompany(selected.company)}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold uppercase text-muted hover:border-amber-accent/50 hover:text-amber-accent"
                  >
                    Delete company
                  </button>
                </div>
              </aside>
            )}
          </div>
        </>
      )}

      {dialog?.type === "add-company" && (
        <AddCompanyDialog onClose={() => setDialog(null)} />
      )}
      {dialog?.type === "add-contact" && (
        <AddContactDialog
          company={dialog.company}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "prepare" && (
        <PrepareContactDialog
          company={dialog.company}
          contact={dialog.contact}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "log" && (
        <LogOutreachDialog
          company={dialog.company}
          contact={dialog.contact}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "qualify" && (
        <QualifyDialog
          company={dialog.company}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "promote" && (
        <PromoteDialog
          company={dialog.company}
          contacts={dialog.contacts}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
