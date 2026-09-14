"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "./supabase";
import {
  createEmptyCompany,
  createEmptyContact,
  DEFAULT_PROSPECTING_TARGETS,
  dateOnly,
  isIsoInRange,
  ProspectActivity,
  ProspectCompany,
  ProspectContact,
  ProspectingState,
  ProspectingTargets,
  ProspectMarket,
  ProspectPriority,
  ProspectSource,
  ProspectStatus,
  OutreachChannel,
  OutreachResult,
  ProspectQualification,
  ProspectProduct,
  startOfMonth,
  startOfWeekMonday,
  statusAfterOutreachResult,
  todayDateOnly,
  normalizeProspectMarket,
  normalizeProspectSource,
} from "./prospecting-types";

const STORAGE_KEY = "hydrogenera-prospecting-v1";

function emptyState(): ProspectingState {
  return {
    companies: [],
    contacts: [],
    activities: [],
    targets: { ...DEFAULT_PROSPECTING_TARGETS },
  };
}

function sanitizeState(raw: unknown): ProspectingState {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<ProspectingState>;
  const companies = (Array.isArray(o.companies) ? o.companies : []).map(
    (c) => ({
      ...c,
      market: normalizeProspectMarket(c.market),
      source: normalizeProspectSource(c.source),
    }),
  );
  const contacts = (Array.isArray(o.contacts) ? o.contacts : []).map((c) => ({
    ...c,
    source: normalizeProspectSource(c.source),
  }));
  const rawAlloc = o.targets?.marketAllocation ?? {};
  const marketAllocation = { ...DEFAULT_PROSPECTING_TARGETS.marketAllocation };
  for (const [key, value] of Object.entries(rawAlloc)) {
    const market = normalizeProspectMarket(key);
    marketAllocation[market] = Number(value) || marketAllocation[market] || 0;
  }
  return {
    companies,
    contacts,
    activities: Array.isArray(o.activities) ? o.activities : [],
    targets: {
      ...DEFAULT_PROSPECTING_TARGETS,
      ...(o.targets ?? {}),
      marketAllocation,
    },
  };
}

function loadLocal(): ProspectingState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

async function loadRemote(): Promise<ProspectingState | null> {
  if (!supabase) return null;
  try {
    const [cRes, pRes, aRes, tRes] = await Promise.all([
      supabase.from("prospect_companies").select("*").order("created_at", {
        ascending: false,
      }),
      supabase.from("prospect_contacts").select("*").order("created_at", {
        ascending: false,
      }),
      supabase.from("prospect_activities").select("*").order("created_at", {
        ascending: false,
      }),
      supabase.from("prospecting_targets").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (cRes.error || pRes.error || aRes.error) {
      // Tables not migrated yet — fall back to local.
      console.warn(
        "Prospecting tables unavailable, using local storage:",
        cRes.error?.message ?? pRes.error?.message ?? aRes.error?.message,
      );
      return null;
    }

    const companies: ProspectCompany[] = (cRes.data ?? []).map((row) =>
      companyFromRow(row as Record<string, unknown>),
    );
    const contacts: ProspectContact[] = (pRes.data ?? []).map((row) =>
      contactFromRow(row as Record<string, unknown>),
    );
    const activities: ProspectActivity[] = (aRes.data ?? []).map((row) =>
      activityFromRow(row as Record<string, unknown>),
    );

    let targets = { ...DEFAULT_PROSPECTING_TARGETS };
    if (tRes.data && !tRes.error) {
      const t = tRes.data as Record<string, unknown>;
      const rawAlloc =
        (t.market_allocation as Record<string, number> | null) ?? {};
      const marketAllocation = {
        ...DEFAULT_PROSPECTING_TARGETS.marketAllocation,
      };
      for (const [key, value] of Object.entries(rawAlloc)) {
        const market = normalizeProspectMarket(key);
        marketAllocation[market] =
          Number(value) || marketAllocation[market] || 0;
      }
      targets = {
        monthlyContactTarget: Number(t.monthly_contact_target) || 80,
        weeklyContactTarget: Number(t.weekly_contact_target) || 20,
        marketAllocation,
      };
    }

    return { companies, contacts, activities, targets };
  } catch (e) {
    console.warn("Failed to load prospecting from Supabase:", e);
    return null;
  }
}

function companyFromRow(row: Record<string, unknown>): ProspectCompany {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    country: String(row.country ?? ""),
    city: String(row.city ?? ""),
    siteName: String(row.site_name ?? ""),
    website: String(row.website ?? ""),
    industry: String(row.industry ?? ""),
    market: normalizeProspectMarket(String(row.market ?? "")),
    product: (row.product as ProspectProduct) ?? "E-Series",
    source: normalizeProspectSource(String(row.source ?? "email")),
    priority: (row.priority as ProspectPriority) ?? "medium",
    ownerId: String(row.owner_id ?? ""),
    status: (row.status as ProspectStatus) ?? "target-identified",
    notes: String(row.notes ?? ""),
    strategyWhy: String(row.strategy_why ?? ""),
    strategyAngle: String(row.strategy_angle ?? ""),
    strategyMessage: String(row.strategy_message ?? ""),
    potentialValue:
      row.potential_value == null ? null : Number(row.potential_value),
    existingRelationship: String(row.existing_relationship ?? ""),
    nextAction: String(row.next_action ?? ""),
    nextActionAt: row.next_action_at
      ? String(row.next_action_at).slice(0, 10)
      : null,
    lastActivityAt: row.last_activity_at
      ? String(row.last_activity_at)
      : null,
    promotedProjectId: row.promoted_project_id
      ? String(row.promoted_project_id)
      : null,
    qualification: (row.qualification as ProspectQualification) ?? {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function contactFromRow(row: Record<string, unknown>): ProspectContact {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name ?? ""),
    title: String(row.title ?? ""),
    department: String(row.department ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    linkedinUrl: String(row.linkedin_url ?? ""),
    preferredMethod: (row.preferred_method as ProspectContact["preferredMethod"]) ?? "email",
    source: normalizeProspectSource(String(row.source ?? "email")),
    status: (row.status as ProspectStatus) ?? "target-identified",
    priority: (row.priority as ProspectPriority) ?? "medium",
    ownerId: String(row.owner_id ?? ""),
    isPrimary: Boolean(row.is_primary),
    notes: String(row.notes ?? ""),
    contactObjective: String(row.contact_objective ?? ""),
    outreachAngle: String(row.outreach_angle ?? ""),
    personalizationNote: String(row.personalization_note ?? ""),
    draftMessage: String(row.draft_message ?? ""),
    plannedChannel: (row.planned_channel as OutreachChannel | "") ?? "",
    plannedContactDate: row.planned_contact_date
      ? String(row.planned_contact_date).slice(0, 10)
      : null,
    preparedAt: row.prepared_at ? String(row.prepared_at) : null,
    firstContactedAt: row.first_contacted_at
      ? String(row.first_contacted_at)
      : null,
    lastContactedAt: row.last_contacted_at
      ? String(row.last_contacted_at)
      : null,
    nextFollowUpAt: row.next_follow_up_at
      ? String(row.next_follow_up_at).slice(0, 10)
      : null,
    followUpReason: String(row.follow_up_reason ?? ""),
    outreachAttempts: Number(row.outreach_attempts) || 0,
    responseStatus: (row.response_status as OutreachResult | "") ?? "",
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function activityFromRow(row: Record<string, unknown>): ProspectActivity {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    contactId: row.contact_id ? String(row.contact_id) : null,
    userId: String(row.user_id ?? ""),
    channel: (row.channel as OutreachChannel) ?? "other",
    result: (row.result as OutreachResult) ?? "no-response",
    summary: String(row.summary ?? ""),
    nextAction: String(row.next_action ?? ""),
    nextActionAt: row.next_action_at
      ? String(row.next_action_at).slice(0, 10)
      : null,
    countsAsNewContact: Boolean(row.counts_as_new_contact),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function companyToRow(c: ProspectCompany) {
  return {
    id: c.id,
    name: c.name,
    country: c.country,
    city: c.city,
    site_name: c.siteName,
    website: c.website,
    industry: c.industry,
    market: c.market,
    product: c.product,
    source: c.source,
    priority: c.priority,
    owner_id: c.ownerId || null,
    status: c.status,
    notes: c.notes,
    strategy_why: c.strategyWhy,
    strategy_angle: c.strategyAngle,
    strategy_message: c.strategyMessage,
    potential_value: c.potentialValue,
    existing_relationship: c.existingRelationship,
    next_action: c.nextAction,
    next_action_at: c.nextActionAt,
    last_activity_at: c.lastActivityAt,
    promoted_project_id: c.promotedProjectId,
    qualification: c.qualification,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function contactToRow(c: ProspectContact) {
  return {
    id: c.id,
    company_id: c.companyId,
    name: c.name,
    title: c.title,
    department: c.department,
    email: c.email,
    phone: c.phone,
    linkedin_url: c.linkedinUrl,
    preferred_method: c.preferredMethod,
    source: c.source,
    status: c.status,
    priority: c.priority,
    owner_id: c.ownerId || null,
    is_primary: c.isPrimary,
    notes: c.notes,
    contact_objective: c.contactObjective,
    outreach_angle: c.outreachAngle,
    personalization_note: c.personalizationNote,
    draft_message: c.draftMessage,
    planned_channel: c.plannedChannel || null,
    planned_contact_date: c.plannedContactDate,
    prepared_at: c.preparedAt,
    first_contacted_at: c.firstContactedAt,
    last_contacted_at: c.lastContactedAt,
    next_follow_up_at: c.nextFollowUpAt,
    follow_up_reason: c.followUpReason,
    outreach_attempts: c.outreachAttempts,
    response_status: c.responseStatus || null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function activityToRow(a: ProspectActivity) {
  return {
    id: a.id,
    company_id: a.companyId,
    contact_id: a.contactId,
    user_id: a.userId || null,
    channel: a.channel,
    result: a.result,
    summary: a.summary,
    next_action: a.nextAction,
    next_action_at: a.nextActionAt,
    counts_as_new_contact: a.countsAsNewContact,
    created_at: a.createdAt,
  };
}

export interface AddCompanyInput {
  name: string;
  country?: string;
  city?: string;
  siteName?: string;
  website?: string;
  industry?: string;
  market: ProspectMarket;
  product?: ProspectProduct;
  source?: ProspectSource;
  priority?: ProspectPriority;
  ownerId: string;
  notes?: string;
  strategyWhy?: string;
  strategyAngle?: string;
  strategyMessage?: string;
  /** Optional first contact */
  contact?: {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    isPrimary?: boolean;
  };
}

export interface LogOutreachInput {
  companyId: string;
  contactId: string;
  userId: string;
  channel: OutreachChannel;
  result: OutreachResult;
  summary: string;
  nextAction?: string;
  nextActionAt?: string | null;
  /** Force counting as new contact; default = first outreach for this contact */
  countsAsNewContact?: boolean;
}

export interface ProspectingKpis {
  newContactsWeek: number;
  newContactsMonth: number;
  weeklyTarget: number;
  monthlyTarget: number;
  prepared: number;
  followUpsDue: number;
  overdueFollowUps: number;
  engaged: number;
  qualified: number;
  promotedThisMonth: number;
  preparedThisWeek: number;
}

export interface ProspectingApi {
  ready: boolean;
  usingRemote: boolean;
  companies: ProspectCompany[];
  contacts: ProspectContact[];
  activities: ProspectActivity[];
  targets: ProspectingTargets;
  kpis: ProspectingKpis;
  addCompany: (input: AddCompanyInput) => { companyId: string; contactId?: string; duplicateWarning?: string };
  updateCompany: (id: string, patch: Partial<ProspectCompany>) => void;
  deleteCompany: (id: string) => void;
  addContact: (
    companyId: string,
    input: Partial<ProspectContact> & { name: string; ownerId: string },
  ) => { contactId: string; duplicateWarning?: string };
  updateContact: (id: string, patch: Partial<ProspectContact>) => void;
  deleteContact: (id: string) => void;
  markPrepared: (contactId: string) => void;
  logOutreach: (input: LogOutreachInput) => string;
  scheduleFollowUp: (
    contactId: string,
    date: string,
    reason?: string,
  ) => void;
  markEngaged: (contactId: string) => void;
  markQualified: (
    companyId: string,
    qualification?: ProspectQualification,
  ) => void;
  markPromoted: (
    companyId: string,
    projectId: string,
    options?: { prospectStatus?: ProspectStatus },
  ) => void;
  /** Reflect a linked Sales Project stage onto the prospect (e.g. cancelled). */
  syncFromSalesProject: (
    projectId: string,
    stage: string,
  ) => void;
  updateTargets: (patch: Partial<ProspectingTargets>) => void;
  findDuplicateCompany: (name: string) => ProspectCompany | undefined;
  findDuplicateContact: (
    companyId: string,
    email?: string,
    name?: string,
  ) => ProspectContact | undefined;
}

const ProspectingContext = createContext<ProspectingApi | null>(null);

export function ProspectingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProspectingState>(emptyState);
  const [ready, setReady] = useState(false);
  const [usingRemote, setUsingRemote] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const remoteRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await loadRemote();
      if (cancelled) return;
      if (remote) {
        setState(remote);
        setUsingRemote(true);
        remoteRef.current = true;
      } else {
        setState(loadLocal());
        setUsingRemote(false);
        remoteRef.current = false;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, ready]);

  const persistCompany = useCallback((c: ProspectCompany, mode: "upsert" | "delete") => {
    if (!supabase || !remoteRef.current) return;
    if (mode === "delete") {
      void supabase.from("prospect_companies").delete().eq("id", c.id);
      return;
    }
    void supabase.from("prospect_companies").upsert(companyToRow(c));
  }, []);

  const persistContact = useCallback((c: ProspectContact, mode: "upsert" | "delete") => {
    if (!supabase || !remoteRef.current) return;
    if (mode === "delete") {
      void supabase.from("prospect_contacts").delete().eq("id", c.id);
      return;
    }
    void supabase.from("prospect_contacts").upsert(contactToRow(c));
  }, []);

  const persistActivity = useCallback((a: ProspectActivity) => {
    if (!supabase || !remoteRef.current) return;
    void supabase.from("prospect_activities").upsert(activityToRow(a));
  }, []);

  const findDuplicateCompany = useCallback((name: string) => {
    const n = name.trim().toLowerCase();
    if (!n) return undefined;
    return stateRef.current.companies.find(
      (c) => c.name.trim().toLowerCase() === n,
    );
  }, []);

  const findDuplicateContact = useCallback(
    (companyId: string, email?: string, name?: string) => {
      const em = email?.trim().toLowerCase();
      const nm = name?.trim().toLowerCase();
      return stateRef.current.contacts.find((c) => {
        if (c.companyId !== companyId) return false;
        if (em && c.email.trim().toLowerCase() === em) return true;
        if (nm && c.name.trim().toLowerCase() === nm) return true;
        return false;
      });
    },
    [],
  );

  const addCompany = useCallback(
    (input: AddCompanyInput) => {
      const dup = findDuplicateCompany(input.name);
      const company = createEmptyCompany({
        name: input.name,
        country: input.country,
        city: input.city,
        siteName: input.siteName,
        website: input.website,
        industry: input.industry,
        market: input.market,
        product: input.product,
        source: input.source,
        priority: input.priority,
        ownerId: input.ownerId,
        notes: input.notes,
        strategyWhy: input.strategyWhy,
        strategyAngle: input.strategyAngle,
        strategyMessage: input.strategyMessage,
      });

      let contact: ProspectContact | undefined;
      let contactDup: ProspectContact | undefined;
      if (input.contact?.name.trim()) {
        contactDup = findDuplicateContact(
          company.id,
          input.contact.email,
          input.contact.name,
        );
        contact = createEmptyContact({
          companyId: company.id,
          name: input.contact.name,
          title: input.contact.title,
          email: input.contact.email,
          phone: input.contact.phone,
          linkedinUrl: input.contact.linkedinUrl,
          ownerId: input.ownerId,
          source: input.source,
          priority: input.priority,
          isPrimary: input.contact.isPrimary ?? true,
          status: "target-identified",
        });
      }

      setState((prev) => ({
        ...prev,
        companies: [company, ...prev.companies],
        contacts: contact ? [contact, ...prev.contacts] : prev.contacts,
      }));
      persistCompany(company, "upsert");
      if (contact) persistContact(contact, "upsert");

      const warnings: string[] = [];
      if (dup) warnings.push(`Similar company already exists: “${dup.name}”`);
      if (contactDup) warnings.push(`Similar contact already exists`);

      return {
        companyId: company.id,
        ...(contact ? { contactId: contact.id } : {}),
        ...(warnings.length
          ? { duplicateWarning: warnings.join(". ") }
          : {}),
      };
    },
    [findDuplicateCompany, findDuplicateContact, persistCompany, persistContact],
  );

  const updateCompany = useCallback(
    (id: string, patch: Partial<ProspectCompany>) => {
      setState((prev) => {
        const companies = prev.companies.map((c) => {
          if (c.id !== id) return c;
          const next: ProspectCompany = {
            ...c,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
          persistCompany(next, "upsert");
          return next;
        });
        return { ...prev, companies };
      });
    },
    [persistCompany],
  );

  const deleteCompany = useCallback(
    (id: string) => {
      const existing = stateRef.current.companies.find((c) => c.id === id);
      setState((prev) => ({
        ...prev,
        companies: prev.companies.filter((c) => c.id !== id),
        contacts: prev.contacts.filter((c) => c.companyId !== id),
        activities: prev.activities.filter((a) => a.companyId !== id),
      }));
      if (existing) persistCompany(existing, "delete");
      if (supabase && remoteRef.current) {
        void supabase.from("prospect_contacts").delete().eq("company_id", id);
        void supabase.from("prospect_activities").delete().eq("company_id", id);
      }
    },
    [persistCompany],
  );

  const addContact = useCallback(
    (
      companyId: string,
      input: Partial<ProspectContact> & { name: string; ownerId: string },
    ) => {
      const dup = findDuplicateContact(companyId, input.email, input.name);
      const contact = createEmptyContact({ ...input, companyId });
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        contacts: [contact, ...prev.contacts],
        companies: prev.companies.map((c) =>
          c.id === companyId
            ? { ...c, lastActivityAt: now, updatedAt: now }
            : c,
        ),
      }));
      persistContact(contact, "upsert");
      return {
        contactId: contact.id,
        ...(dup
          ? { duplicateWarning: `Similar contact already exists: “${dup.name}”` }
          : {}),
      };
    },
    [findDuplicateContact, persistContact],
  );

  const updateContact = useCallback(
    (id: string, patch: Partial<ProspectContact>) => {
      setState((prev) => {
        const contacts = prev.contacts.map((c) => {
          if (c.id !== id) return c;
          const next: ProspectContact = {
            ...c,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
          persistContact(next, "upsert");
          return next;
        });
        return { ...prev, contacts };
      });
    },
    [persistContact],
  );

  const deleteContact = useCallback(
    (id: string) => {
      const existing = stateRef.current.contacts.find((c) => c.id === id);
      setState((prev) => ({
        ...prev,
        contacts: prev.contacts.filter((c) => c.id !== id),
      }));
      if (existing) persistContact(existing, "delete");
    },
    [persistContact],
  );

  const markPrepared = useCallback(
    (contactId: string) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const contacts = prev.contacts.map((c) => {
          if (c.id !== contactId) return c;
          const next: ProspectContact = {
            ...c,
            status: "contact-prepared",
            preparedAt: c.preparedAt ?? now,
            updatedAt: now,
          };
          persistContact(next, "upsert");
          return next;
        });
        const contact = contacts.find((c) => c.id === contactId);
        const companies = prev.companies.map((co) => {
          if (!contact || co.id !== contact.companyId) return co;
          const next: ProspectCompany = {
            ...co,
            status:
              co.status === "target-identified" || !co.status
                ? "contact-prepared"
                : co.status,
            lastActivityAt: now,
            updatedAt: now,
          };
          persistCompany(next, "upsert");
          return next;
        });
        return { ...prev, contacts, companies };
      });
    },
    [persistCompany, persistContact],
  );

  const logOutreach = useCallback(
    (input: LogOutreachInput) => {
      const now = new Date().toISOString();
      const contact = stateRef.current.contacts.find(
        (c) => c.id === input.contactId,
      );
      const isFirst =
        input.countsAsNewContact ??
        !(contact?.firstContactedAt || (contact?.outreachAttempts ?? 0) > 0);

      const activity: ProspectActivity = {
        id: crypto.randomUUID(),
        companyId: input.companyId,
        contactId: input.contactId,
        userId: input.userId,
        channel: input.channel,
        result: input.result,
        summary: input.summary.trim(),
        nextAction: input.nextAction?.trim() ?? "",
        nextActionAt: input.nextActionAt ?? null,
        countsAsNewContact: Boolean(isFirst),
        createdAt: now,
      };

      const newStatus = statusAfterOutreachResult(
        input.result,
        contact?.status ?? "contacted",
      );

      setState((prev) => {
        const contacts = prev.contacts.map((c) => {
          if (c.id !== input.contactId) return c;
          const next: ProspectContact = {
            ...c,
            status: newStatus,
            outreachAttempts: c.outreachAttempts + 1,
            firstContactedAt: c.firstContactedAt ?? now,
            lastContactedAt: now,
            responseStatus: input.result,
            nextFollowUpAt: input.nextActionAt ?? c.nextFollowUpAt,
            followUpReason: input.nextAction?.trim() || c.followUpReason,
            updatedAt: now,
          };
          persistContact(next, "upsert");
          return next;
        });
        const companies = prev.companies.map((co) => {
          if (co.id !== input.companyId) return co;
          let nextStatus = co.status;
          if (
            newStatus === "not-interested" ||
            newStatus === "disqualified" ||
            newStatus === "dormant"
          ) {
            nextStatus = newStatus;
          } else if (co.status === "promoted" || co.status === "qualified") {
            nextStatus = co.status;
          } else if (
            newStatus === "engaged" ||
            newStatus === "follow-up-due"
          ) {
            nextStatus = newStatus;
          } else if (
            co.status === "target-identified" ||
            co.status === "contact-prepared"
          ) {
            nextStatus = "contacted";
          }
          const next: ProspectCompany = {
            ...co,
            status: nextStatus,
            lastActivityAt: now,
            nextAction: input.nextAction?.trim() || co.nextAction,
            nextActionAt: input.nextActionAt ?? co.nextActionAt,
            updatedAt: now,
          };
          persistCompany(next, "upsert");
          return next;
        });
        persistActivity(activity);
        return {
          ...prev,
          contacts,
          companies,
          activities: [activity, ...prev.activities],
        };
      });

      return activity.id;
    },
    [persistActivity, persistCompany, persistContact],
  );

  const scheduleFollowUp = useCallback(
    (contactId: string, date: string, reason?: string) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const contacts = prev.contacts.map((c) => {
          if (c.id !== contactId) return c;
          const next: ProspectContact = {
            ...c,
            nextFollowUpAt: date,
            followUpReason: reason?.trim() ?? c.followUpReason,
            status:
              c.status === "promoted" ||
              c.status === "engaged" ||
              c.status === "qualified"
                ? c.status
                : "follow-up-due",
            updatedAt: now,
          };
          persistContact(next, "upsert");
          return next;
        });
        const contact = contacts.find((c) => c.id === contactId);
        const companies = prev.companies.map((co) => {
          if (!contact || co.id !== contact.companyId) return co;
          const next: ProspectCompany = {
            ...co,
            nextActionAt: date,
            nextAction: reason?.trim() || co.nextAction,
            lastActivityAt: now,
            updatedAt: now,
          };
          persistCompany(next, "upsert");
          return next;
        });
        return { ...prev, contacts, companies };
      });
    },
    [persistCompany, persistContact],
  );

  const markEngaged = useCallback(
    (contactId: string) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const contacts = prev.contacts.map((c) => {
          if (c.id !== contactId) return c;
          const next: ProspectContact = {
            ...c,
            status: "engaged",
            updatedAt: now,
          };
          persistContact(next, "upsert");
          return next;
        });
        const contact = contacts.find((c) => c.id === contactId);
        const companies = prev.companies.map((co) => {
          if (!contact || co.id !== contact.companyId) return co;
          const next: ProspectCompany = {
            ...co,
            status: co.status === "promoted" ? co.status : "engaged",
            lastActivityAt: now,
            updatedAt: now,
          };
          persistCompany(next, "upsert");
          return next;
        });
        return { ...prev, contacts, companies };
      });
    },
    [persistCompany, persistContact],
  );

  const markQualified = useCallback(
    (companyId: string, qualification?: ProspectQualification) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const companies = prev.companies.map((co) => {
          if (co.id !== companyId) return co;
          const next: ProspectCompany = {
            ...co,
            status: "qualified",
            qualification: {
              ...co.qualification,
              ...(qualification ?? {}),
            },
            lastActivityAt: now,
            updatedAt: now,
          };
          persistCompany(next, "upsert");
          return next;
        });
        const contacts = prev.contacts.map((c) => {
          if (c.companyId !== companyId) return c;
          if (
            c.status === "promoted" ||
            c.status === "not-interested" ||
            c.status === "disqualified"
          ) {
            return c;
          }
          const next: ProspectContact = {
            ...c,
            status: "qualified",
            updatedAt: now,
          };
          persistContact(next, "upsert");
          return next;
        });
        return { ...prev, companies, contacts };
      });
    },
    [persistCompany, persistContact],
  );

  const markPromoted = useCallback(
    (
      companyId: string,
      projectId: string,
      options?: { prospectStatus?: ProspectStatus },
    ) => {
      const now = new Date().toISOString();
      const prospectStatus = options?.prospectStatus ?? "promoted";
      setState((prev) => {
        const companies = prev.companies.map((co) => {
          if (co.id !== companyId) return co;
          const next: ProspectCompany = {
            ...co,
            status: prospectStatus,
            promotedProjectId: projectId,
            lastActivityAt: now,
            updatedAt: now,
          };
          persistCompany(next, "upsert");
          return next;
        });
        const contacts = prev.contacts.map((c) => {
          if (c.companyId !== companyId) return c;
          if (
            c.status === "not-interested" ||
            c.status === "disqualified" ||
            c.status === "dormant"
          ) {
            return c;
          }
          const next: ProspectContact = {
            ...c,
            status: prospectStatus,
            updatedAt: now,
          };
          persistContact(next, "upsert");
          return next;
        });
        return { ...prev, companies, contacts };
      });
    },
    [persistCompany, persistContact],
  );

  const syncFromSalesProject = useCallback(
    (projectId: string, stage: string) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const linked = prev.companies.filter(
          (c) => c.promotedProjectId === projectId,
        );
        if (linked.length === 0) return prev;

        let changed = false;
        const companies = prev.companies.map((co) => {
          if (co.promotedProjectId !== projectId) return co;
          if (stage === "cancelled") {
            if (co.status === "not-interested") return co;
            changed = true;
            const next: ProspectCompany = {
              ...co,
              status: "not-interested",
              lastActivityAt: now,
              updatedAt: now,
              nextAction: co.nextAction || "Cancelled in Sales Projects",
            };
            persistCompany(next, "upsert");
            return next;
          }
          // Un-cancelled / active again — restore engaged if we had cancelled them
          if (co.status === "not-interested") {
            changed = true;
            const next: ProspectCompany = {
              ...co,
              status: "engaged",
              lastActivityAt: now,
              updatedAt: now,
            };
            persistCompany(next, "upsert");
            return next;
          }
          return co;
        });

        if (!changed) return prev;

        const contacts = prev.contacts.map((c) => {
          const company = companies.find((co) => co.id === c.companyId);
          if (!company || company.promotedProjectId !== projectId) return c;
          if (stage === "cancelled") {
            if (c.status === "not-interested") return c;
            const next: ProspectContact = {
              ...c,
              status: "not-interested",
              updatedAt: now,
            };
            persistContact(next, "upsert");
            return next;
          }
          if (c.status === "not-interested") {
            const next: ProspectContact = {
              ...c,
              status: "engaged",
              updatedAt: now,
            };
            persistContact(next, "upsert");
            return next;
          }
          return c;
        });

        return { ...prev, companies, contacts };
      });
    },
    [persistCompany, persistContact],
  );

  const updateTargets = useCallback((patch: Partial<ProspectingTargets>) => {
    setState((prev) => {
      const targets: ProspectingTargets = {
        ...prev.targets,
        ...patch,
        marketAllocation: {
          ...prev.targets.marketAllocation,
          ...(patch.marketAllocation ?? {}),
        },
      };
      if (supabase && remoteRef.current) {
        void supabase.from("prospecting_targets").upsert({
          id: 1,
          monthly_contact_target: targets.monthlyContactTarget,
          weekly_contact_target: targets.weeklyContactTarget,
          market_allocation: targets.marketAllocation,
          updated_at: new Date().toISOString(),
        });
      }
      return { ...prev, targets };
    });
  }, []);

  const kpis = useMemo((): ProspectingKpis => {
    const weekStart = startOfWeekMonday();
    const monthStart = startOfMonth();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const today = todayDateOnly();

    const newContactsWeek = state.activities.filter(
      (a) =>
        a.countsAsNewContact &&
        isIsoInRange(a.createdAt, weekStart, weekEnd),
    ).length;
    const newContactsMonth = state.activities.filter(
      (a) =>
        a.countsAsNewContact &&
        isIsoInRange(a.createdAt, monthStart, monthEnd),
    ).length;

    const activeStatuses = new Set<ProspectStatus>([
      "target-identified",
      "contact-prepared",
      "contacted",
      "follow-up-due",
      "engaged",
      "qualified",
    ]);

    const prepared = state.contacts.filter(
      (c) => c.status === "contact-prepared",
    ).length;
    const followUpsDue = state.contacts.filter((c) => {
      if (!c.nextFollowUpAt) return false;
      if (!activeStatuses.has(c.status) && c.status !== "follow-up-due") {
        return false;
      }
      return c.nextFollowUpAt <= today;
    }).length;
    const overdueFollowUps = state.contacts.filter((c) => {
      if (!c.nextFollowUpAt) return false;
      if (c.status === "promoted" || c.status === "not-interested" || c.status === "disqualified") {
        return false;
      }
      return c.nextFollowUpAt < today;
    }).length;
    const engaged = state.contacts.filter((c) => c.status === "engaged").length;
    const qualified = state.companies.filter(
      (c) => c.status === "qualified",
    ).length;
    const promotedThisMonth = state.companies.filter(
      (c) =>
        c.status === "promoted" &&
        isIsoInRange(c.updatedAt, monthStart, monthEnd),
    ).length;
    const preparedThisWeek = state.contacts.filter(
      (c) => c.preparedAt && isIsoInRange(c.preparedAt, weekStart, weekEnd),
    ).length;

    return {
      newContactsWeek,
      newContactsMonth,
      weeklyTarget: state.targets.weeklyContactTarget,
      monthlyTarget: state.targets.monthlyContactTarget,
      prepared,
      followUpsDue,
      overdueFollowUps,
      engaged,
      qualified,
      promotedThisMonth,
      preparedThisWeek,
    };
  }, [state]);

  const api = useMemo<ProspectingApi>(
    () => ({
      ready,
      usingRemote,
      companies: state.companies,
      contacts: state.contacts,
      activities: state.activities,
      targets: state.targets,
      kpis,
      addCompany,
      updateCompany,
      deleteCompany,
      addContact,
      updateContact,
      deleteContact,
      markPrepared,
      logOutreach,
      scheduleFollowUp,
      markEngaged,
      markQualified,
      markPromoted,
      syncFromSalesProject,
      updateTargets,
      findDuplicateCompany,
      findDuplicateContact,
    }),
    [
      ready,
      usingRemote,
      state,
      kpis,
      addCompany,
      updateCompany,
      deleteCompany,
      addContact,
      updateContact,
      deleteContact,
      markPrepared,
      logOutreach,
      scheduleFollowUp,
      markEngaged,
      markQualified,
      markPromoted,
      syncFromSalesProject,
      updateTargets,
      findDuplicateCompany,
      findDuplicateContact,
    ],
  );

  return (
    <ProspectingContext.Provider value={api}>
      {children}
    </ProspectingContext.Provider>
  );
}

export function useProspecting(): ProspectingApi {
  const ctx = useContext(ProspectingContext);
  if (!ctx) {
    throw new Error("useProspecting must be used inside ProspectingProvider");
  }
  return ctx;
}

/** Helper used by UI for date display */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = dateOnly(iso);
  return new Date(d + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
