"use client";

import { newId } from "@/lib/id";

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
import { useAuth } from "./auth-context";
import { guardWriteMethods, mutationAllowed } from "./viewer-write-guard";
import {
  recordPersistedChange,
  type RecordChangeInput,
} from "./change-history";
import {
  createEmptyCompany,
  createEmptyContact,
  createEmptyStrategy,
  DEFAULT_PROSPECTING_STRATEGIES,
  DEFAULT_PROSPECTING_TARGETS,
  dateOnly,
  isIsoInRange,
  normalizeStrategyMarkets,
  ProspectActivity,
  ProspectCompany,
  ProspectContact,
  ProspectingState,
  ProspectingStrategy,
  ProspectingTargets,
  ProspectMarket,
  ProspectPriority,
  ProspectSource,
  ProspectStatus,
  ProspectSystem,
  OutreachChannel,
  OutreachResult,
  OUTREACH_CHANNEL_LABELS,
  PROSPECTING_CHANNELS,
  ProspectQualification,
  startOfMonth,
  startOfWeekMonday,
  statusAfterOutreachResult,
  targetsFromStrategies,
  todayDateOnly,
  normalizeProspectMarket,
  normalizeProspectSource,
  normalizeProspectStatus,
  normalizeProspectSystem,
  DEFAULT_PROSPECT_SYSTEM,
} from "./prospecting-types";

const STORAGE_KEY = "hydrogenera-prospecting-v1";

function emptyState(): ProspectingState {
  return {
    companies: [],
    contacts: [],
    activities: [],
    targets: { ...DEFAULT_PROSPECTING_TARGETS },
    strategies: DEFAULT_PROSPECTING_STRATEGIES.map((s) => ({ ...s })),
  };
}

function sanitizeStrategies(raw: unknown): ProspectingStrategy[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_PROSPECTING_STRATEGIES.map((s) => ({ ...s }));
  }
  return raw.map((item) => {
    const s = item as Partial<ProspectingStrategy>;
    return createEmptyStrategy({
      id: typeof s.id === "string" ? s.id : undefined,
      name: String(s.name ?? "Strategy").trim() || "Strategy",
      markets: normalizeStrategyMarkets(s.markets),
      industries: String(s.industries ?? ""),
      weeklyContactTarget: Number(s.weeklyContactTarget) || 0,
      sortOrder: Number(s.sortOrder) || 0,
      isActive: s.isActive !== false,
      notes: String(s.notes ?? ""),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    });
  });
}

function sanitizeState(raw: unknown): ProspectingState {
  if (!raw || typeof raw !== "object") return emptyState();
  const o = raw as Partial<ProspectingState>;
  const companies = (Array.isArray(o.companies) ? o.companies : []).map(
    (c) => {
      const raw = c as ProspectCompany & { product?: string };
      return {
        ...raw,
        market: normalizeProspectMarket(raw.market),
        system: normalizeProspectSystem(raw.system ?? raw.product),
        source: normalizeProspectSource(raw.source),
        status: normalizeProspectStatus(raw.status),
        sizeKw:
          typeof raw.sizeKw === "number" &&
          Number.isFinite(raw.sizeKw) &&
          raw.sizeKw > 0
            ? raw.sizeKw
            : 0,
      };
    },
  );
  const contacts = (Array.isArray(o.contacts) ? o.contacts : []).map((c) => ({
    ...c,
    source: normalizeProspectSource(c.source),
    status: normalizeProspectStatus(c.status),
  }));
  const strategies = sanitizeStrategies(o.strategies);
  return {
    companies,
    contacts,
    activities: Array.isArray(o.activities) ? o.activities : [],
    strategies,
    targets: targetsFromStrategies(strategies),
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
    const [cRes, pRes, aRes, tRes, sRes] = await Promise.all([
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
      supabase
        .from("prospecting_strategies")
        .select("*")
        .order("sort_order", { ascending: true }),
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

    const strategies: ProspectingStrategy[] =
      sRes.error || !sRes.data
        ? DEFAULT_PROSPECTING_STRATEGIES.map((s) => ({ ...s }))
        : sRes.data.length === 0
          ? DEFAULT_PROSPECTING_STRATEGIES.map((s) => ({ ...s }))
          : (sRes.data as Record<string, unknown>[]).map(strategyFromRow);

    // Strategies are the source of truth for weekly quotas + market share.
    const targets = targetsFromStrategies(strategies);

    if (!sRes.error && supabase) {
      if (!sRes.data || sRes.data.length === 0) {
        void supabase
          .from("prospecting_strategies")
          .upsert(
            DEFAULT_PROSPECTING_STRATEGIES.map((s) => strategyToRow(s)),
          );
      }
      void supabase.from("prospecting_targets").upsert({
        id: 1,
        monthly_contact_target: targets.monthlyContactTarget,
        weekly_contact_target: targets.weeklyContactTarget,
        market_allocation: targets.marketAllocation,
        updated_at: new Date().toISOString(),
      });
      void tRes;
    }

    return { companies, contacts, activities, targets, strategies };
  } catch (e) {
    console.warn("Failed to load prospecting from Supabase:", e);
    return null;
  }
}

function strategyFromRow(row: Record<string, unknown>): ProspectingStrategy {
  return createEmptyStrategy({
    id: String(row.id),
    name: String(row.name ?? "Strategy"),
    markets: normalizeStrategyMarkets(row.markets),
    industries: String(row.industries ?? ""),
    weeklyContactTarget: Number(row.weekly_contact_target) || 0,
    sortOrder: Number(row.sort_order) || 0,
    isActive: row.is_active !== false,
    notes: String(row.notes ?? ""),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  });
}

function strategyToRow(s: ProspectingStrategy): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    markets: s.markets,
    industries: s.industries,
    weekly_contact_target: s.weeklyContactTarget,
    sort_order: s.sortOrder,
    is_active: s.isActive,
    notes: s.notes,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
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
    system: normalizeProspectSystem(String(row.product ?? DEFAULT_PROSPECT_SYSTEM)),
    source: normalizeProspectSource(String(row.source ?? "email")),
    priority: (row.priority as ProspectPriority) ?? "medium",
    ownerId: String(row.owner_id ?? ""),
    status: normalizeProspectStatus(String(row.status ?? "target-identified")),
    notes: String(row.notes ?? ""),
    strategyWhy: String(row.strategy_why ?? ""),
    strategyAngle: String(row.strategy_angle ?? ""),
    strategyMessage: String(row.strategy_message ?? ""),
    sizeKw: (() => {
      const n = Number(row.size_kw);
      return Number.isFinite(n) && n > 0 ? n : 0;
    })(),
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
    status: normalizeProspectStatus(String(row.status ?? "target-identified")),
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
    product: c.system,
    source: c.source,
    priority: c.priority,
    owner_id: c.ownerId || null,
    status: c.status,
    notes: c.notes,
    strategy_why: c.strategyWhy,
    strategy_angle: c.strategyAngle,
    strategy_message: c.strategyMessage,
    size_kw: c.sizeKw > 0 ? c.sizeKw : null,
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
  system?: ProspectSystem;
  source?: ProspectSource;
  priority?: ProspectPriority;
  ownerId: string;
  notes?: string;
  strategyWhy?: string;
  strategyAngle?: string;
  strategyMessage?: string;
  /** Optional system size in kW */
  sizeKw?: number;
  /** Optional first contact (legacy single-contact shape) */
  contact?: {
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    isPrimary?: boolean;
  };
  /** Optional contacts to create with the company (preferred) */
  contacts?: Array<{
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    isPrimary?: boolean;
  }>;
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
  /** When set, overrides activity createdAt (e.g. client response date). */
  occurredAt?: string | null;
}

export interface MarkContactedInput {
  companyId: string;
  contactId: string;
  userId: string;
  /** One or more channels used for this outreach. */
  channels: OutreachChannel[];
  summary: string;
  /** Follow-up date → reminder task for the logger */
  followUpAt: string;
}

export interface ProspectingKpis {
  newContactsWeek: number;
  newContactsMonth: number;
  weeklyTarget: number;
  monthlyTarget: number;
  /** Contacts still on the prepare list (awaiting Contacted). */
  toContact: number;
  followUpsDue: number;
  overdueFollowUps: number;
  engaged: number;
  qualified: number;
  promotedThisMonth: number;
}

export interface ProspectingApi {
  ready: boolean;
  usingRemote: boolean;
  companies: ProspectCompany[];
  contacts: ProspectContact[];
  activities: ProspectActivity[];
  targets: ProspectingTargets;
  strategies: ProspectingStrategy[];
  kpis: ProspectingKpis;
  addCompany: (input: AddCompanyInput) => { companyId: string; contactId?: string; duplicateWarning?: string };
  updateCompany: (id: string, patch: Partial<ProspectCompany>) => void;
  deleteCompany: (id: string) => void;
  addContact: (
    companyId: string,
    input: Partial<ProspectContact> & { ownerId: string },
  ) => { contactId: string; duplicateWarning?: string };
  updateContact: (id: string, patch: Partial<ProspectContact>) => void;
  deleteContact: (id: string) => void;
  logOutreach: (input: LogOutreachInput) => string;
  /** Prepare list → Contacted: log outreach + set follow-up. */
  markContacted: (input: MarkContactedInput) => string;
  scheduleFollowUp: (
    contactId: string,
    date: string,
    reason?: string,
  ) => void;
  /** Clear a scheduled follow-up (Outstanding “Done”). */
  completeFollowUp: (contactId: string) => void;
  markEngaged: (contactId: string) => void;
  /** Contacted → Engaged: log response and move to engaged (or not-interested). */
  logEngagement: (input: LogOutreachInput) => string;
  markQualified: (
    companyId: string,
    qualification?: ProspectQualification,
  ) => void;
  markPromoted: (
    companyId: string,
    projectId: string,
    options?: { prospectStatus?: ProspectStatus; contactId?: string },
  ) => void;
  /** Reflect a linked Sales Project stage onto the prospect (e.g. cancelled). */
  syncFromSalesProject: (
    projectId: string,
    stage: string,
  ) => void;
  updateTargets: (patch: Partial<ProspectingTargets>) => void;
  addStrategy: (
    input: Partial<ProspectingStrategy> & { name: string },
  ) => string;
  updateStrategy: (id: string, patch: Partial<ProspectingStrategy>) => void;
  deleteStrategy: (id: string) => void;
  findDuplicateCompany: (name: string) => ProspectCompany | undefined;
  findDuplicateContact: (
    companyId: string,
    email?: string,
    name?: string,
  ) => ProspectContact | undefined;
}

const ProspectingContext = createContext<ProspectingApi | null>(null);

export function ProspectingProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser, authEnabled } = useAuth();
  const [state, setState] = useState<ProspectingState>(emptyState);
  const [ready, setReady] = useState(false);
  const [usingRemote, setUsingRemote] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const remoteRef = useRef(false);
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;

  const recordProspectChange = useCallback(
    (
      input: Omit<
        RecordChangeInput,
        "domain" | "intentional" | "actorUserId" | "actorName"
      > & { intentional?: boolean },
    ) => {
      const actor = authUserRef.current;
      recordPersistedChange({
        ...input,
        domain: "prospecting",
        intentional: input.intentional ?? true,
        actorName: actor?.name ?? "You",
        ...(actor ? { actorUserId: actor.userId } : {}),
      });
    },
    [],
  );

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

  const persistCompany = useCallback(
    async (c: ProspectCompany, mode: "upsert" | "delete") => {
      if (!supabase || !remoteRef.current) return true;
      if (mode === "delete") {
        const res = await supabase
          .from("prospect_companies")
          .delete()
          .eq("id", c.id);
        if (res.error) {
          console.error(
            "Supabase prospect company delete failed:",
            res.error.message,
          );
          return false;
        }
        return true;
      }
      const res = await supabase
        .from("prospect_companies")
        .upsert(companyToRow(c));
      if (res.error) {
        console.error(
          "Supabase prospect company upsert failed:",
          res.error.message,
        );
        return false;
      }
      return true;
    },
    [],
  );

  const persistContact = useCallback(
    async (c: ProspectContact, mode: "upsert" | "delete") => {
      if (!supabase || !remoteRef.current) return true;
      if (mode === "delete") {
        const res = await supabase
          .from("prospect_contacts")
          .delete()
          .eq("id", c.id);
        if (res.error) {
          console.error(
            "Supabase prospect contact delete failed:",
            res.error.message,
          );
          return false;
        }
        return true;
      }
      const res = await supabase
        .from("prospect_contacts")
        .upsert(contactToRow(c));
      if (res.error) {
        console.error(
          "Supabase prospect contact upsert failed:",
          res.error.message,
        );
        return false;
      }
      return true;
    },
    [],
  );

  // Backfill: older company-only adds never appeared in the contact-centric queue.
  useEffect(() => {
    if (!ready) return;
    const orphans = stateRef.current.companies.filter(
      (co) => !stateRef.current.contacts.some((c) => c.companyId === co.id),
    );
    if (orphans.length === 0) return;

    const extras = orphans.map((co) =>
      createEmptyContact({
        companyId: co.id,
        name: "",
        ownerId: co.ownerId,
        source: co.source,
        priority: co.priority,
        isPrimary: true,
        status:
          co.status === "contacted" || co.status === "follow-up-due"
            ? co.status
            : "target-identified",
      }),
    );

    setState((prev) => ({
      ...prev,
      contacts: [...extras, ...prev.contacts],
    }));
    for (const contact of extras) {
      void persistContact(contact, "upsert");
    }
  }, [ready, state.companies, state.contacts, persistContact]);

  // (Company-only targets are shown in the work queue without inventing contacts.)

  const persistActivity = useCallback(async (a: ProspectActivity) => {
    if (!supabase || !remoteRef.current) return true;
    const res = await supabase.from("prospect_activities").upsert(activityToRow(a));
    if (res.error) {
      console.error(
        "Supabase prospect activity upsert failed:",
        res.error.message,
      );
      return false;
    }
    return true;
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
        system: input.system,
        source: input.source,
        priority: input.priority,
        ownerId: input.ownerId,
        notes: input.notes,
        strategyWhy: input.strategyWhy,
        strategyAngle: input.strategyAngle,
        strategyMessage: input.strategyMessage,
        sizeKw: input.sizeKw,
      });

      const draftContacts = (
        input.contacts?.length
          ? input.contacts
          : input.contact &&
              ((input.contact.name ?? "").trim() ||
                input.contact.title?.trim() ||
                input.contact.email?.trim() ||
                input.contact.phone?.trim() ||
                input.contact.linkedinUrl?.trim())
            ? [input.contact]
            : []
      ).filter(
        (c) =>
          (c.name ?? "").trim() ||
          c.title?.trim() ||
          c.email?.trim() ||
          c.phone?.trim() ||
          c.linkedinUrl?.trim(),
      );

      // Work queue is contact-centric — if none provided, keep a placeholder so
      // the company still appears (name optional on real contacts).
      const createdContacts: ProspectContact[] = (
        draftContacts.length > 0
          ? draftContacts
          : [
              {
                name: "",
                title: "",
                email: "",
                phone: "",
                isPrimary: true,
              },
            ]
      ).map((draft, index) =>
        createEmptyContact({
          companyId: company.id,
          name: draft.name ?? "",
          title: draft.title,
          email: draft.email,
          phone: draft.phone,
          linkedinUrl: draft.linkedinUrl,
          ownerId: input.ownerId,
          source: input.source,
          priority: input.priority,
          isPrimary: draft.isPrimary ?? index === 0,
          status: "target-identified",
        }),
      );

      // Only one primary per company
      if (createdContacts.some((c) => c.isPrimary)) {
        let sawPrimary = false;
        for (const c of createdContacts) {
          if (c.isPrimary && !sawPrimary) {
            sawPrimary = true;
          } else if (c.isPrimary) {
            c.isPrimary = false;
          }
        }
      } else if (createdContacts[0]) {
        createdContacts[0].isPrimary = true;
      }

      const contactDup = createdContacts
        .map((c) => findDuplicateContact(company.id, c.email, c.name))
        .find(Boolean);

      setState((prev) => ({
        ...prev,
        companies: [company, ...prev.companies],
        contacts: [...createdContacts, ...prev.contacts],
      }));
      // Company must exist in DB before contacts (FK). Chain the upserts.
      void persistCompany(company, "upsert").then((ok) => {
        if (!ok) {
          if (createdContacts.length) {
            console.error(
              "Supabase prospect contact upsert skipped: company insert failed",
              company.id,
            );
          }
          return;
        }
        for (const contact of createdContacts) {
          void persistContact(contact, "upsert");
        }
      });

      recordProspectChange({
        entityType: "prospect_company",
        entityId: company.id,
        action: "create",
        summary: `Created prospect ${company.name}`,
        payloadJson: {
          name: company.name,
          market: company.market,
          source: company.source,
        },
      });
      for (const contact of createdContacts) {
        recordProspectChange({
          entityType: "prospect_contact",
          entityId: contact.id,
          action: "create",
          summary: `Added contact ${contact.name} at ${company.name}`,
          payloadJson: { companyId: company.id, name: contact.name },
        });
      }

      const warnings: string[] = [];
      if (dup) warnings.push(`Similar company already exists: “${dup.name}”`);
      if (contactDup) warnings.push(`Similar contact already exists`);

      return {
        companyId: company.id,
        ...(createdContacts[0] ? { contactId: createdContacts[0].id } : {}),
        ...(warnings.length
          ? { duplicateWarning: warnings.join(". ") }
          : {}),
      };
    },
    [
      findDuplicateCompany,
      findDuplicateContact,
      persistCompany,
      persistContact,
      recordProspectChange,
    ],
  );

  const updateCompany = useCallback(
    (id: string, patch: Partial<ProspectCompany>) => {
      const before = stateRef.current.companies.find((c) => c.id === id);
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
      if (before) {
        const name = typeof patch.name === "string" ? patch.name : before.name;
        const changed = Object.keys(patch).filter((k) => k !== "updatedAt");
        if (changed.length > 0) {
          recordProspectChange({
            entityType: "prospect_company",
            entityId: id,
            action: "update",
            summary: `Updated prospect ${name}`,
            payloadJson: {
              fields: changed,
              ...(patch.status && patch.status !== before.status
                ? { oldStatus: before.status, newStatus: patch.status }
                : {}),
            },
          });
        }
      }
    },
    [persistCompany, recordProspectChange],
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
      if (existing) {
        persistCompany(existing, "delete");
        recordProspectChange({
          entityType: "prospect_company",
          entityId: id,
          action: "delete",
          summary: `Deleted prospect ${existing.name}`,
          payloadJson: { name: existing.name },
        });
      }
      if (supabase && remoteRef.current) {
        void supabase.from("prospect_contacts").delete().eq("company_id", id);
        void supabase.from("prospect_activities").delete().eq("company_id", id);
      }
    },
    [persistCompany, recordProspectChange],
  );

  const addContact = useCallback(
    (
      companyId: string,
      input: Partial<ProspectContact> & { name?: string; ownerId: string },
    ) => {
      const dup = findDuplicateContact(companyId, input.email, input.name);
      const contact = createEmptyContact({
        ...input,
        name: input.name ?? "",
        companyId,
      });
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        contacts: [
          contact,
          ...prev.contacts.map((c) => {
            if (
              contact.isPrimary &&
              c.companyId === companyId &&
              c.isPrimary
            ) {
              const next = { ...c, isPrimary: false, updatedAt: now };
              persistContact(next, "upsert");
              return next;
            }
            return c;
          }),
        ],
        companies: prev.companies.map((c) =>
          c.id === companyId
            ? { ...c, lastActivityAt: now, updatedAt: now }
            : c,
        ),
      }));
      persistContact(contact, "upsert");
      const company = stateRef.current.companies.find((c) => c.id === companyId);
      recordProspectChange({
        entityType: "prospect_contact",
        entityId: contact.id,
        action: "create",
        summary: `Added contact ${contact.name}${company ? ` at ${company.name}` : ""}`,
        payloadJson: { companyId, name: contact.name },
      });
      return {
        contactId: contact.id,
        ...(dup
          ? { duplicateWarning: `Similar contact already exists: “${dup.name}”` }
          : {}),
      };
    },
    [findDuplicateContact, persistContact, recordProspectChange],
  );

  const updateContact = useCallback(
    (id: string, patch: Partial<ProspectContact>) => {
      const before = stateRef.current.contacts.find((c) => c.id === id);
      setState((prev) => {
        const now = new Date().toISOString();
        const contacts = prev.contacts.map((c) => {
          if (c.id === id) {
            const next: ProspectContact = {
              ...c,
              ...patch,
              updatedAt: now,
            };
            persistContact(next, "upsert");
            return next;
          }
          if (
            patch.isPrimary === true &&
            before &&
            c.companyId === before.companyId &&
            c.isPrimary
          ) {
            const next = { ...c, isPrimary: false, updatedAt: now };
            persistContact(next, "upsert");
            return next;
          }
          return c;
        });
        return { ...prev, contacts };
      });
      if (before) {
        const name = typeof patch.name === "string" ? patch.name : before.name;
        const changed = Object.keys(patch).filter((k) => k !== "updatedAt");
        if (changed.length > 0) {
          recordProspectChange({
            entityType: "prospect_contact",
            entityId: id,
            action: "update",
            summary: `Updated contact ${name}`,
            payloadJson: {
              fields: changed,
              ...(patch.status && patch.status !== before.status
                ? { oldStatus: before.status, newStatus: patch.status }
                : {}),
            },
          });
        }
      }
    },
    [persistContact, recordProspectChange],
  );

  const deleteContact = useCallback(
    (id: string) => {
      const existing = stateRef.current.contacts.find((c) => c.id === id);
      setState((prev) => ({
        ...prev,
        contacts: prev.contacts.filter((c) => c.id !== id),
      }));
      if (existing) {
        persistContact(existing, "delete");
        recordProspectChange({
          entityType: "prospect_contact",
          entityId: id,
          action: "delete",
          summary: `Deleted contact ${existing.name}`,
          payloadJson: { name: existing.name, companyId: existing.companyId },
        });
      }
    },
    [persistContact, recordProspectChange],
  );

  const logOutreach = useCallback(
    (input: LogOutreachInput) => {
      const now = new Date().toISOString();
      const occurredAt = input.occurredAt
        ? new Date(input.occurredAt.includes("T")
            ? input.occurredAt
            : `${input.occurredAt}T12:00:00`).toISOString()
        : now;
      const contact = stateRef.current.contacts.find(
        (c) => c.id === input.contactId,
      );
      const isFirst =
        input.countsAsNewContact ??
        !(contact?.firstContactedAt || (contact?.outreachAttempts ?? 0) > 0);

      let newStatus = statusAfterOutreachResult(
        input.result,
        contact?.status ?? "contacted",
      );
      // Outreach with a follow-up date stays in the contacted queue as follow-up-due
      if (
        input.result === "outreach-sent" &&
        input.nextActionAt &&
        newStatus === "contacted"
      ) {
        newStatus = "follow-up-due";
      }

      const activity: ProspectActivity = {
        id: newId(),
        companyId: input.companyId,
        contactId: input.contactId,
        userId: input.userId,
        channel: input.channel,
        result: input.result,
        summary: input.summary.trim(),
        nextAction: input.nextAction?.trim() ?? "",
        nextActionAt: input.nextActionAt ?? null,
        countsAsNewContact: Boolean(isFirst),
        createdAt: occurredAt,
      };

      setState((prev) => {
        const contacts = prev.contacts.map((c) => {
          if (c.id !== input.contactId) return c;
          const next: ProspectContact = {
            ...c,
            status: newStatus,
            outreachAttempts: c.outreachAttempts + 1,
            firstContactedAt: c.firstContactedAt ?? occurredAt,
            lastContactedAt: occurredAt,
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
            newStatus === "follow-up-due" ||
            newStatus === "contacted"
          ) {
            nextStatus = newStatus;
          } else if (co.status === "target-identified") {
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

      const companyName =
        stateRef.current.companies.find((c) => c.id === input.companyId)?.name ??
        input.companyId;
      recordProspectChange({
        entityType: "prospect_activity",
        entityId: activity.id,
        action: "create",
        summary: `Logged ${input.channel} outreach at ${companyName}`,
        payloadJson: {
          companyId: input.companyId,
          contactId: input.contactId,
          channel: input.channel,
          result: input.result,
          preview: input.summary.trim().slice(0, 120),
        },
      });

      return activity.id;
    },
    [persistActivity, persistCompany, persistContact, recordProspectChange],
  );

  const markContacted = useCallback(
    (input: MarkContactedInput) => {
      const channels = [
        ...new Set(
          input.channels.filter((c) => PROSPECTING_CHANNELS.includes(c)),
        ),
      ];
      if (channels.length === 0) {
        throw new Error("Select at least one channel");
      }

      const now = new Date().toISOString();
      const occurredAt = now;
      const contact = stateRef.current.contacts.find(
        (c) => c.id === input.contactId,
      );
      const isFirst = !(
        contact?.firstContactedAt || (contact?.outreachAttempts ?? 0) > 0
      );
      let newStatus = statusAfterOutreachResult(
        "outreach-sent",
        contact?.status ?? "contacted",
      );
      if (input.followUpAt && newStatus === "contacted") {
        newStatus = "follow-up-due";
      }

      const summary = input.summary.trim();
      const activities: ProspectActivity[] = channels.map((channel, index) => ({
        id: newId(),
        companyId: input.companyId,
        contactId: input.contactId,
        userId: input.userId,
        channel,
        result: "outreach-sent" as const,
        summary,
        nextAction: "Follow up",
        nextActionAt: input.followUpAt,
        // Only the first channel row counts as the new-contact KPI touch.
        countsAsNewContact: Boolean(isFirst) && index === 0,
        createdAt: occurredAt,
      }));

      setState((prev) => {
        const contacts = prev.contacts.map((c) => {
          if (c.id !== input.contactId) return c;
          const next: ProspectContact = {
            ...c,
            status: newStatus,
            outreachAttempts: c.outreachAttempts + 1,
            firstContactedAt: c.firstContactedAt ?? occurredAt,
            lastContactedAt: occurredAt,
            responseStatus: "outreach-sent",
            nextFollowUpAt: input.followUpAt,
            followUpReason: "Follow up",
            updatedAt: now,
          };
          persistContact(next, "upsert");
          return next;
        });
        const companies = prev.companies.map((co) => {
          if (co.id !== input.companyId) return co;
          let nextStatus = co.status;
          if (co.status === "promoted" || co.status === "qualified") {
            nextStatus = co.status;
          } else if (
            newStatus === "follow-up-due" ||
            newStatus === "contacted"
          ) {
            nextStatus = newStatus;
          } else if (co.status === "target-identified") {
            nextStatus = "contacted";
          }
          const next: ProspectCompany = {
            ...co,
            status: nextStatus,
            lastActivityAt: now,
            nextAction: "Follow up",
            nextActionAt: input.followUpAt,
            updatedAt: now,
          };
          persistCompany(next, "upsert");
          return next;
        });
        for (const activity of activities) {
          persistActivity(activity);
        }
        return {
          ...prev,
          contacts,
          companies,
          activities: [...activities, ...prev.activities],
        };
      });

      const companyName =
        stateRef.current.companies.find((c) => c.id === input.companyId)?.name ??
        input.companyId;
      const channelLabel = channels
        .map((c) => OUTREACH_CHANNEL_LABELS[c])
        .join(", ");
      recordProspectChange({
        entityType: "prospect_activity",
        entityId: activities[0]!.id,
        action: "create",
        summary: `Logged ${channelLabel} outreach at ${companyName}`,
        payloadJson: {
          companyId: input.companyId,
          contactId: input.contactId,
          channels,
          result: "outreach-sent",
          preview: summary.slice(0, 120),
        },
      });

      return activities[0]!.id;
    },
    [persistActivity, persistCompany, persistContact, recordProspectChange],
  );

  const logEngagement = useCallback(
    (input: LogOutreachInput) => {
      return logOutreach({
        ...input,
        countsAsNewContact: false,
      });
    },
    [logOutreach],
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

  const completeFollowUp = useCallback(
    (contactId: string) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const contact = prev.contacts.find((c) => c.id === contactId);
        if (!contact) return prev;

        const contacts = prev.contacts.map((c) => {
          if (c.id !== contactId) return c;
          const next: ProspectContact = {
            ...c,
            nextFollowUpAt: null,
            followUpReason: "",
            status:
              c.status === "follow-up-due" ? "contacted" : c.status,
            updatedAt: now,
          };
          persistContact(next, "upsert");
          return next;
        });

        const companies = prev.companies.map((co) => {
          if (co.id !== contact.companyId) return co;
          const stillDue = contacts.some(
            (c) =>
              c.companyId === co.id &&
              c.id !== contactId &&
              c.nextFollowUpAt,
          );
          if (stillDue && co.nextActionAt && co.nextActionAt !== contact.nextFollowUpAt) {
            return co;
          }
          const nextCompanyFollowUp = contacts
            .filter((c) => c.companyId === co.id && c.nextFollowUpAt)
            .map((c) => c.nextFollowUpAt!)
            .sort()[0] ?? null;
          const next: ProspectCompany = {
            ...co,
            nextActionAt: nextCompanyFollowUp,
            nextAction: nextCompanyFollowUp ? co.nextAction : "",
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
      const company = stateRef.current.companies.find((c) => c.id === companyId);
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
      recordProspectChange({
        entityType: "prospect_company",
        entityId: companyId,
        action: "qualify",
        summary: `Qualified prospect ${company?.name ?? companyId}`,
        payloadJson: { previousStatus: company?.status ?? null },
      });
    },
    [persistCompany, persistContact, recordProspectChange],
  );

  const markPromoted = useCallback(
    (
      companyId: string,
      projectId: string,
      options?: { prospectStatus?: ProspectStatus; contactId?: string },
    ) => {
      const now = new Date().toISOString();
      const prospectStatus = options?.prospectStatus ?? "promoted";
      const company = stateRef.current.companies.find((c) => c.id === companyId);
      const companyContacts = stateRef.current.contacts.filter(
        (c) => c.companyId === companyId,
      );
      // Cold-lead "engaged" path: only touch the acting contact (or primary).
      // Full promote/qualify still updates all active contacts at the company.
      let contactIdsToUpdate: Set<string> | null = null;
      if (prospectStatus === "engaged") {
        const preferredId =
          options?.contactId ||
          companyContacts.find((c) => c.isPrimary)?.id ||
          companyContacts[0]?.id;
        contactIdsToUpdate = preferredId ? new Set([preferredId]) : new Set();
      }

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
          if (contactIdsToUpdate && !contactIdsToUpdate.has(c.id)) {
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
      recordProspectChange({
        entityType: "prospect_company",
        entityId: companyId,
        projectId,
        action: "promote",
        summary: `Promoted prospect ${company?.name ?? companyId} to sales project`,
        payloadJson: {
          projectId,
          status: prospectStatus,
          ...(options?.contactId ? { contactId: options.contactId } : {}),
        },
      });
    },
    [persistCompany, persistContact, recordProspectChange],
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

  const persistStrategy = useCallback(
    async (s: ProspectingStrategy, mode: "upsert" | "delete") => {
      if (!supabase || !remoteRef.current) return true;
      if (mode === "delete") {
        const res = await supabase
          .from("prospecting_strategies")
          .delete()
          .eq("id", s.id);
        if (res.error) {
          console.error(
            "Supabase prospecting strategy delete failed:",
            res.error.message,
          );
          return false;
        }
        return true;
      }
      const res = await supabase
        .from("prospecting_strategies")
        .upsert(strategyToRow(s));
      if (res.error) {
        console.error(
          "Supabase prospecting strategy upsert failed:",
          res.error.message,
        );
        return false;
      }
      return true;
    },
    [],
  );

  const persistTargetsRow = useCallback((targets: ProspectingTargets) => {
    if (!supabase || !remoteRef.current) return;
    void supabase.from("prospecting_targets").upsert({
      id: 1,
      monthly_contact_target: targets.monthlyContactTarget,
      weekly_contact_target: targets.weeklyContactTarget,
      market_allocation: targets.marketAllocation,
      updated_at: new Date().toISOString(),
    });
  }, []);

  const applyStrategies = useCallback(
    (
      nextStrategies: ProspectingStrategy[],
      change: {
        action: "create" | "update" | "delete";
        strategy: ProspectingStrategy;
        summary: string;
      },
    ) => {
      const targets = targetsFromStrategies(nextStrategies);
      setState((prev) => ({
        ...prev,
        strategies: nextStrategies,
        targets,
      }));
      persistTargetsRow(targets);
      recordProspectChange({
        entityType: "prospecting_strategy",
        entityId: change.strategy.id,
        action: change.action,
        summary: change.summary,
        payloadJson: { name: change.strategy.name },
      });
    },
    [persistTargetsRow, recordProspectChange],
  );

  const updateTargets = useCallback(
    (patch: Partial<ProspectingTargets>) => {
      setState((prev) => {
        const targets: ProspectingTargets = {
          ...prev.targets,
          ...patch,
          marketAllocation: {
            ...prev.targets.marketAllocation,
            ...(patch.marketAllocation ?? {}),
          },
        };
        persistTargetsRow(targets);
        return { ...prev, targets };
      });
      recordProspectChange({
        entityType: "prospecting_targets",
        entityId: "company",
        action: "update",
        summary: "Updated prospecting targets",
        payloadJson: { fields: Object.keys(patch) },
      });
    },
    [persistTargetsRow, recordProspectChange],
  );

  const addStrategy = useCallback(
    (input: Partial<ProspectingStrategy> & { name: string }) => {
      const maxSort = stateRef.current.strategies.reduce(
        (m, s) => Math.max(m, s.sortOrder),
        0,
      );
      const strategy = createEmptyStrategy({
        ...input,
        sortOrder: input.sortOrder ?? maxSort + 10,
      });
      const next = [...stateRef.current.strategies, strategy].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
      applyStrategies(next, {
        action: "create",
        strategy,
        summary: `Added strategy ${strategy.name}`,
      });
      void persistStrategy(strategy, "upsert");
      return strategy.id;
    },
    [applyStrategies, persistStrategy],
  );

  const updateStrategy = useCallback(
    (id: string, patch: Partial<ProspectingStrategy>) => {
      const prev = stateRef.current.strategies.find((s) => s.id === id);
      if (!prev) return;
      const now = new Date().toISOString();
      const strategy: ProspectingStrategy = {
        ...prev,
        ...patch,
        id: prev.id,
        name:
          patch.name !== undefined
            ? patch.name.trim() || prev.name
            : prev.name,
        markets:
          patch.markets !== undefined
            ? normalizeStrategyMarkets(patch.markets)
            : prev.markets,
        industries:
          patch.industries !== undefined
            ? patch.industries.trim()
            : prev.industries,
        weeklyContactTarget:
          patch.weeklyContactTarget !== undefined
            ? Math.max(0, Math.round(patch.weeklyContactTarget) || 0)
            : prev.weeklyContactTarget,
        notes: patch.notes !== undefined ? patch.notes.trim() : prev.notes,
        updatedAt: now,
      };
      const next = stateRef.current.strategies
        .map((s) => (s.id === id ? strategy : s))
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        );
      applyStrategies(next, {
        action: "update",
        strategy,
        summary: `Updated strategy ${strategy.name}`,
      });
      void persistStrategy(strategy, "upsert");
    },
    [applyStrategies, persistStrategy],
  );

  const deleteStrategy = useCallback(
    (id: string) => {
      const strategy = stateRef.current.strategies.find((s) => s.id === id);
      if (!strategy) return;
      const next = stateRef.current.strategies.filter((s) => s.id !== id);
      applyStrategies(next, {
        action: "delete",
        strategy,
        summary: `Deleted strategy ${strategy.name}`,
      });
      void persistStrategy(strategy, "delete");
    },
    [applyStrategies, persistStrategy],
  );

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
      "contacted",
      "follow-up-due",
      "engaged",
      "qualified",
    ]);

    const toContact = state.contacts.filter(
      (c) => c.status === "target-identified",
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

    return {
      newContactsWeek,
      newContactsMonth,
      weeklyTarget: state.targets.weeklyContactTarget,
      monthlyTarget: state.targets.monthlyContactTarget,
      toContact,
      followUpsDue,
      overdueFollowUps,
      engaged,
      qualified,
      promotedThisMonth,
    };
  }, [state]);

  const canMutateRef = useRef<() => boolean>(() => true);
  canMutateRef.current = () => mutationAllowed(authEnabled, authUser);

  const api = useMemo<ProspectingApi>(
    () =>
      guardWriteMethods(
        {
          ready,
          usingRemote,
          companies: state.companies,
          contacts: state.contacts,
          activities: state.activities,
          targets: state.targets,
          strategies: state.strategies,
          kpis,
          addCompany,
          updateCompany,
          deleteCompany,
          addContact,
          updateContact,
          deleteContact,
          logOutreach,
          markContacted,
          scheduleFollowUp,
          completeFollowUp,
          markEngaged,
          logEngagement,
          markQualified,
          markPromoted,
          syncFromSalesProject,
          updateTargets,
          addStrategy,
          updateStrategy,
          deleteStrategy,
          findDuplicateCompany,
          findDuplicateContact,
        },
        () => canMutateRef.current(),
        [
          "addCompany",
          "updateCompany",
          "deleteCompany",
          "addContact",
          "updateContact",
          "deleteContact",
          "logOutreach",
          "markContacted",
          "scheduleFollowUp",
          "completeFollowUp",
          "markEngaged",
          "logEngagement",
          "markQualified",
          "markPromoted",
          "syncFromSalesProject",
          "updateTargets",
          "addStrategy",
          "updateStrategy",
          "deleteStrategy",
        ],
      ),
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
      logOutreach,
      markContacted,
      scheduleFollowUp,
      completeFollowUp,
      markEngaged,
      logEngagement,
      markQualified,
      markPromoted,
      syncFromSalesProject,
      updateTargets,
      addStrategy,
      updateStrategy,
      deleteStrategy,
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
