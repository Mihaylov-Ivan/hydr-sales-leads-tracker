import {
  formatMarketTags,
  formatSeriesTags,
  isMarketTag,
  isSeriesTag,
  MARKETS,
  parseMarketTags,
  parseSeriesTags,
  SERIES,
  type Market,
  type MarketTag,
  type Series,
  type SeriesTag,
  type Stage,
} from "./types";
import { newId } from "@/lib/id";

/** Same market tags as Sales Projects (multi-select; stored as "Tag + Tag"). */
export type ProspectMarketTag = MarketTag;
export type ProspectMarket = Market;

export const PROSPECT_MARKETS: ProspectMarketTag[] = [...MARKETS];

export const PROSPECT_MARKET_LABELS: Record<ProspectMarketTag, string> =
  Object.fromEntries(MARKETS.map((m) => [m, m])) as Record<
    ProspectMarketTag,
    string
  >;

/** Same system tags as Sales Projects (multi-select; stored as "Tag + Tag"). */
export type ProspectSystem = Series;

export const PROSPECT_SYSTEMS: SeriesTag[] = [...SERIES];

/** Default system when none set. */
export const DEFAULT_PROSPECT_SYSTEM: ProspectSystem = "Z Series";

/** Markets are identical — pass through for Sales Project creation. */
export function prospectMarketToProjectMarket(
  market: ProspectMarket | string,
): Market {
  return normalizeProspectMarket(market);
}

/** Systems are identical — pass through for Sales Project creation. */
export function prospectSystemToProjectSeries(
  system: ProspectSystem | string,
): Series {
  return normalizeProspectSystem(system);
}

/** @deprecated use prospectMarketToProjectMarket */
export const PROSPECT_TO_PROJECT_MARKET: Record<ProspectMarketTag, MarketTag> =
  Object.fromEntries(MARKETS.map((m) => [m, m])) as Record<
    ProspectMarketTag,
    MarketTag
  >;

/** Map a single legacy prospecting market id onto a Sales Projects market tag. */
function mapLegacyMarketPart(value: string): MarketTag | null {
  if (value === "Funding") return null;
  if (isMarketTag(value)) return value;
  switch (value) {
    case "cng-optimisation":
      return "Burner Optimisation";
    case "cement":
      return "Cement";
    case "generator-cooling":
      return "Power Plants";
    case "industrial-h2":
    case "h2-valleys":
      return "Clean H2";
    default:
      return null;
  }
}

/** Normalize stored market (single, multi, or legacy ids) onto Sales format. */
export function normalizeProspectMarket(
  value: string | null | undefined,
): ProspectMarket {
  if (!value) return "Clean H2";
  const parts = value
    .split(/\s*\+\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const tags: MarketTag[] = [];
  const seen = new Set<MarketTag>();
  for (const part of parts) {
    const mapped = mapLegacyMarketPart(part);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    tags.push(mapped);
  }
  return formatMarketTags(tags.length > 0 ? tags : parseMarketTags(value));
}

/** Map legacy product labels onto Sales system tags. */
function mapLegacySystemPart(value: string): SeriesTag | null {
  if (isSeriesTag(value)) return value;
  switch (value) {
    case "Custom":
      return "Z Series";
    case "E-Series":
    case "E-Series ":
    case "E series":
      return "E Series";
    case "Z-Series":
    case "Z series":
      return "Z Series";
    default:
      return null;
  }
}

/** Normalize stored system/product onto Sales series format. */
export function normalizeProspectSystem(
  value: string | null | undefined,
): ProspectSystem {
  if (!value) return DEFAULT_PROSPECT_SYSTEM;
  const parts = value
    .split(/\s*\+\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const tags: SeriesTag[] = [];
  const seen = new Set<SeriesTag>();
  for (const part of parts) {
    const mapped = mapLegacySystemPart(part);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    tags.push(mapped);
  }
  return formatSeriesTags(
    tags.length > 0 ? tags : parseSeriesTags(value),
  );
}

export type ProspectSource =
  | "email"
  | "phone"
  | "referral"
  | "linkedin"
  | "in-person"
  | "research"
  /** Legacy values kept for existing stored records */
  | "cold-outreach"
  | "personal-contact"
  | "existing-client"
  | "public-tender"
  | "public-procurement"
  | "funding-call"
  | "eu-consortium"
  | "hydrogen-valley"
  | "project-announcement"
  | "epc-partner"
  | "consultant"
  | "distributor"
  | "conference"
  | "website"
  | "other";

/** Source options on Add company / filters. */
export const PROSPECT_SOURCES: ProspectSource[] = [
  "email",
  "phone",
  "referral",
  "linkedin",
  "in-person",
  "research",
];

export const PROSPECT_SOURCE_LABELS: Record<ProspectSource, string> = {
  email: "Email",
  phone: "Phone",
  referral: "Referral",
  linkedin: "LinkedIn",
  "in-person": "In-Person",
  research: "Research",
  "cold-outreach": "Cold Outreach",
  "personal-contact": "Existing Personal Contact",
  "existing-client": "Existing Client / Cross-Sell",
  "public-tender": "Public Tender",
  "public-procurement": "Public Procurement",
  "funding-call": "Funding Call",
  "eu-consortium": "EU Project / Consortium",
  "hydrogen-valley": "Hydrogen Valley",
  "project-announcement": "Project Announcement",
  "epc-partner": "EPC / Engineering Partner",
  consultant: "Consultant",
  distributor: "Distributor / Sales Partner",
  conference: "Conference / Event",
  website: "Website Inquiry",
  other: "Other",
};

export function normalizeProspectSource(
  value: string | null | undefined,
): ProspectSource {
  if (!value) return "email";
  if ((PROSPECT_SOURCES as string[]).includes(value)) {
    return value as ProspectSource;
  }
  // Map common legacy sources onto the selectable set
  switch (value) {
    case "cold-outreach":
    case "website":
      return "email";
    case "personal-contact":
    case "existing-client":
    case "conference":
      return "in-person";
    case "linkedin":
      return "linkedin";
    case "referral":
    case "consultant":
    case "distributor":
    case "epc-partner":
      return "referral";
    default:
      return "email";
  }
}

/**
 * Contact / company pipeline statuses.
 * Stored as strings so new statuses (e.g. Warm) can be added later.
 * Legacy "contact-prepared" is remapped to "target-identified" on read.
 */
export type ProspectStatus =
  | "target-identified"
  | "contacted"
  | "follow-up-due"
  | "engaged"
  | "qualified"
  | "promoted"
  | "not-interested"
  | "dormant"
  | "disqualified";

export const PROSPECT_STATUSES: ProspectStatus[] = [
  "target-identified",
  "contacted",
  "follow-up-due",
  "engaged",
  "qualified",
  "promoted",
  "not-interested",
  "dormant",
  "disqualified",
];

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  "target-identified": "Target Identified",
  contacted: "Contacted",
  "follow-up-due": "Follow-Up Due",
  engaged: "Engaged",
  qualified: "Qualified",
  promoted: "Promoted to Sales Project",
  "not-interested": "Not Interested",
  dormant: "No Response / Dormant",
  disqualified: "Disqualified",
};

/** Map legacy prep status onto the prepare-list stage. */
export function normalizeProspectStatus(raw: string | null | undefined): ProspectStatus {
  if (raw === "contact-prepared") return "target-identified";
  if (raw && (PROSPECT_STATUSES as string[]).includes(raw)) {
    return raw as ProspectStatus;
  }
  return "target-identified";
}

export type ProspectPriority = "high" | "medium" | "low";

export const PROSPECT_PRIORITIES: ProspectPriority[] = [
  "high",
  "medium",
  "low",
];

export const PROSPECT_PRIORITY_LABELS: Record<ProspectPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export type OutreachChannel =
  | "email"
  | "phone"
  | "linkedin"
  | "meeting"
  | "video-call"
  | "in-person"
  | "referral"
  | "tender-submission"
  | "other";

/** Channels used on Log outreach forms. */
export const PROSPECTING_CHANNELS: OutreachChannel[] = [
  "email",
  "phone",
  "referral",
  "linkedin",
  "in-person",
];

export const OUTREACH_CHANNELS: OutreachChannel[] = [
  "email",
  "phone",
  "linkedin",
  "meeting",
  "video-call",
  "in-person",
  "referral",
  "tender-submission",
  "other",
];

export const OUTREACH_CHANNEL_LABELS: Record<OutreachChannel, string> = {
  email: "Email",
  phone: "Phone",
  linkedin: "LinkedIn",
  meeting: "Meeting",
  "video-call": "Video Call",
  "in-person": "In-Person",
  referral: "Referral",
  "tender-submission": "Tender Submission",
  other: "Other",
};

export type OutreachResult =
  | "outreach-sent"
  | "communication-started"
  | "no-response-follow-up"
  | "no-response-cancel"
  /** Legacy values kept for existing stored activities */
  | "no-response"
  | "positive"
  | "negative"
  | "requested-info"
  | "requested-meeting"
  | "requested-offer"
  | "follow-up-later"
  | "referred"
  | "not-relevant";

/** Results used when logging that outreach was sent (prepare list → Contacted). */
export const CONTACTED_OUTREACH_RESULT: OutreachResult = "outreach-sent";

/** Results used on the Engaged form (Contacted → Engaged). */
export const ENGAGED_RESULTS: OutreachResult[] = [
  "positive",
  "requested-info",
  "requested-meeting",
  "requested-offer",
  "negative",
];

export const OUTREACH_RESULTS: OutreachResult[] = [
  "communication-started",
  "no-response-follow-up",
  "no-response-cancel",
];

export const OUTREACH_RESULT_LABELS: Record<OutreachResult, string> = {
  "outreach-sent": "Outreach sent",
  "communication-started": "Communication started",
  "no-response-follow-up": "No response, follow up",
  "no-response-cancel": "No response, cancel lead",
  "no-response": "No Response",
  positive: "Positive Response",
  negative: "Negative Response",
  "requested-info": "Requested Information",
  "requested-meeting": "Requested Meeting",
  "requested-offer": "Requested Offer",
  "follow-up-later": "Follow-Up Later",
  referred: "Referred to Another Person",
  "not-relevant": "Not Relevant",
};

export type ContactMethod = "email" | "phone" | "linkedin" | "other";

export const CONTACT_METHODS: ContactMethod[] = [
  "email",
  "phone",
  "linkedin",
  "other",
];

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  email: "Email",
  phone: "Phone",
  linkedin: "LinkedIn",
  other: "Other",
};

export type YesNoUnknown = "yes" | "no" | "unknown";

export interface ProspectQualification {
  identifiedProject?: string;
  /** Preferred system(s); same format as Sales Projects series. */
  system?: ProspectSystem;
  /** @deprecated legacy single product label */
  product?: string;
  existingFuelOrH2Use?: string;
  energyOrH2Requirement?: string;
  existingEquipment?: string;
  painPoint?: string;
  projectTiming?: string;
  budgetKnown?: YesNoUnknown;
  fundingNeeded?: YesNoUnknown;
  decisionMakerIdentified?: YesNoUnknown;
  technicalContactIdentified?: YesNoUnknown;
  clientRequested?: string[];
  estimatedValue?: number | null;
  confidence?: number | null;
  notes?: string;
}

export interface ProspectCompany {
  id: string;
  name: string;
  country: string;
  city: string;
  siteName: string;
  website: string;
  industry: string;
  /** Multi market, same storage as Sales Projects ("Tag + Tag"). */
  market: ProspectMarket;
  /** Multi system, same storage as Sales Projects series ("Tag + Tag"). */
  system: ProspectSystem;
  source: ProspectSource;
  priority: ProspectPriority;
  ownerId: string;
  status: ProspectStatus;
  notes: string;
  strategyWhy: string;
  strategyAngle: string;
  strategyMessage: string;
  /** Optional estimated system size in kW (maps to Sales Project sizeKw on promote). */
  sizeKw: number;
  potentialValue: number | null;
  existingRelationship: string;
  nextAction: string;
  nextActionAt: string | null;
  lastActivityAt: string | null;
  promotedProjectId: string | null;
  qualification: ProspectQualification;
  createdAt: string;
  updatedAt: string;
}

export interface ProspectContact {
  id: string;
  companyId: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  preferredMethod: ContactMethod;
  source: ProspectSource;
  status: ProspectStatus;
  priority: ProspectPriority;
  ownerId: string;
  isPrimary: boolean;
  notes: string;
  /** Legacy prep fields — kept for stored data; no longer used in UI. */
  contactObjective: string;
  outreachAngle: string;
  personalizationNote: string;
  draftMessage: string;
  plannedChannel: OutreachChannel | "";
  plannedContactDate: string | null;
  preparedAt: string | null;
  firstContactedAt: string | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  followUpReason: string;
  outreachAttempts: number;
  responseStatus: OutreachResult | "";
  createdAt: string;
  updatedAt: string;
}

export interface ProspectActivity {
  id: string;
  companyId: string;
  contactId: string | null;
  userId: string;
  channel: OutreachChannel;
  result: OutreachResult;
  summary: string;
  nextAction: string;
  nextActionAt: string | null;
  /** Counts toward the 20/80 new-contact KPI when true */
  countsAsNewContact: boolean;
  createdAt: string;
}

export interface ProspectingTargets {
  monthlyContactTarget: number;
  weeklyContactTarget: number;
  /** Share 0–100 per market tag; should sum ~100 */
  marketAllocation: Record<ProspectMarketTag, number>;
}

export const DEFAULT_PROSPECTING_TARGETS: ProspectingTargets = {
  monthlyContactTarget: 80,
  weeklyContactTarget: 20,
  marketAllocation: {
    "Burner Optimisation": 30,
    Cement: 25,
    "Power Plants": 20,
    "Clean H2": 25,
    Tenders: 0,
  },
};

/** Go-to-market strategy with a weekly contacts quota tied to markets. */
export interface ProspectingStrategy {
  id: string;
  name: string;
  /** Markets this strategy tackles (Sales / prospecting tags). */
  markets: ProspectMarketTag[];
  /** Free-text industries / segments covered. */
  industries: string;
  weeklyContactTarget: number;
  sortOrder: number;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_PROSPECTING_STRATEGIES: ProspectingStrategy[] = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    name: "CNG Optimisation",
    markets: ["Burner Optimisation"],
    industries: "CNG / burner optimisation sites",
    weeklyContactTarget: 6,
    sortOrder: 10,
    isActive: true,
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a1000000-0000-4000-8000-000000000002",
    name: "Cement Plants",
    markets: ["Cement"],
    industries: "Cement manufacturing plants",
    weeklyContactTarget: 5,
    sortOrder: 20,
    isActive: true,
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a1000000-0000-4000-8000-000000000003",
    name: "Power Plants",
    markets: ["Power Plants"],
    industries: "Power generation facilities",
    weeklyContactTarget: 4,
    sortOrder: 30,
    isActive: true,
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "a1000000-0000-4000-8000-000000000004",
    name: "H2 Valleys Construction",
    markets: ["Clean H2"],
    industries: "Hydrogen valleys and industrial H2 construction",
    weeklyContactTarget: 5,
    sortOrder: 40,
    isActive: true,
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export function normalizeStrategyMarkets(
  value: unknown,
): ProspectMarketTag[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\s*\+\s*/)
      : [];
  const tags: ProspectMarketTag[] = [];
  const seen = new Set<ProspectMarketTag>();
  for (const part of raw) {
    const mapped = mapLegacyMarketPart(String(part).trim());
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    tags.push(mapped);
  }
  return tags.length > 0 ? tags : ["Clean H2"];
}

/** Derive company-wide weekly/monthly targets + market % from strategies. */
export function targetsFromStrategies(
  strategies: ProspectingStrategy[],
): ProspectingTargets {
  const active = strategies.filter((s) => s.isActive);
  const weekly = active.reduce(
    (sum, s) => sum + Math.max(0, Math.round(s.weeklyContactTarget) || 0),
    0,
  );

  const weights: Record<ProspectMarketTag, number> = Object.fromEntries(
    PROSPECT_MARKETS.map((m) => [m, 0]),
  ) as Record<ProspectMarketTag, number>;

  for (const s of active) {
    const w = Math.max(0, Math.round(s.weeklyContactTarget) || 0);
    if (w <= 0 || s.markets.length === 0) continue;
    const perMarket = w / s.markets.length;
    for (const m of s.markets) {
      weights[m] = (weights[m] ?? 0) + perMarket;
    }
  }

  const weightTotal = PROSPECT_MARKETS.reduce((sum, m) => sum + weights[m], 0);
  const marketAllocation = { ...DEFAULT_PROSPECTING_TARGETS.marketAllocation };
  if (weightTotal <= 0) {
    for (const m of PROSPECT_MARKETS) marketAllocation[m] = 0;
  } else {
    let allocated = 0;
    for (let i = 0; i < PROSPECT_MARKETS.length; i++) {
      const m = PROSPECT_MARKETS[i]!;
      if (i === PROSPECT_MARKETS.length - 1) {
        marketAllocation[m] = Math.max(0, 100 - allocated);
      } else {
        const pct = Math.round((weights[m] / weightTotal) * 100);
        marketAllocation[m] = pct;
        allocated += pct;
      }
    }
  }

  return {
    weeklyContactTarget: weekly,
    monthlyContactTarget: weekly * 4,
    marketAllocation,
  };
}

export function createEmptyStrategy(
  partial: Partial<ProspectingStrategy> & Pick<ProspectingStrategy, "name">,
): ProspectingStrategy {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? newId(),
    name: partial.name.trim(),
    markets: normalizeStrategyMarkets(partial.markets ?? ["Clean H2"]),
    industries: partial.industries?.trim() ?? "",
    weeklyContactTarget: Math.max(
      0,
      Math.round(partial.weeklyContactTarget ?? 0) || 0,
    ),
    sortOrder: partial.sortOrder ?? 100,
    isActive: partial.isActive ?? true,
    notes: partial.notes?.trim() ?? "",
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

export interface ProspectingState {
  companies: ProspectCompany[];
  contacts: ProspectContact[];
  activities: ProspectActivity[];
  targets: ProspectingTargets;
  strategies: ProspectingStrategy[];
}

export type ProspectView =
  | "prepare"
  | "contacted"
  | "engaged"
  | "all"
  | "insights";

export const PROSPECT_VIEW_LABELS: Record<ProspectView, string> = {
  prepare: "Prepare",
  contacted: "Contacted",
  engaged: "Engaged",
  all: "All Prospects",
  insights: "Insights",
};

/** Flattened row for the work table (one contact + company context). */
export interface ProspectWorkRow {
  contact: ProspectContact;
  company: ProspectCompany;
}

export function emptyQualification(): ProspectQualification {
  return {};
}

export function createEmptyCompany(
  partial: Partial<ProspectCompany> &
    Pick<ProspectCompany, "name" | "market" | "ownerId">,
): ProspectCompany {
  const now = new Date().toISOString();
  const market = normalizeProspectMarket(partial.market);
  return {
    id: partial.id ?? newId(),
    name: partial.name.trim(),
    country: partial.country?.trim() ?? "",
    city: partial.city?.trim() ?? "",
    siteName: partial.siteName?.trim() ?? "",
    website: partial.website?.trim() ?? "",
    industry: partial.industry?.trim() ?? "",
    market,
    system: normalizeProspectSystem(partial.system ?? DEFAULT_PROSPECT_SYSTEM),
    source: normalizeProspectSource(partial.source ?? "email"),
    priority: partial.priority ?? "medium",
    ownerId: partial.ownerId,
    status: partial.status ?? "target-identified",
    notes: partial.notes?.trim() ?? "",
    strategyWhy: partial.strategyWhy?.trim() ?? "",
    strategyAngle: partial.strategyAngle?.trim() ?? "",
    strategyMessage: partial.strategyMessage?.trim() ?? "",
    sizeKw:
      typeof partial.sizeKw === "number" &&
      Number.isFinite(partial.sizeKw) &&
      partial.sizeKw > 0
        ? partial.sizeKw
        : 0,
    potentialValue: partial.potentialValue ?? null,
    existingRelationship: partial.existingRelationship?.trim() ?? "",
    nextAction: partial.nextAction?.trim() ?? "",
    nextActionAt: partial.nextActionAt ?? null,
    lastActivityAt: partial.lastActivityAt ?? now,
    promotedProjectId: partial.promotedProjectId ?? null,
    qualification: partial.qualification ?? emptyQualification(),
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

export function createEmptyContact(
  partial: Partial<ProspectContact> &
    Pick<ProspectContact, "companyId" | "name" | "ownerId">,
): ProspectContact {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? newId(),
    companyId: partial.companyId,
    name: partial.name.trim(),
    title: partial.title?.trim() ?? "",
    department: partial.department?.trim() ?? "",
    email: partial.email?.trim() ?? "",
    phone: partial.phone?.trim() ?? "",
    linkedinUrl: partial.linkedinUrl?.trim() ?? "",
    preferredMethod: partial.preferredMethod ?? "email",
    source: normalizeProspectSource(partial.source ?? "email"),
    status: partial.status ?? "target-identified",
    priority: partial.priority ?? "medium",
    ownerId: partial.ownerId,
    isPrimary: partial.isPrimary ?? false,
    notes: partial.notes?.trim() ?? "",
    contactObjective: partial.contactObjective?.trim() ?? "",
    outreachAngle: partial.outreachAngle?.trim() ?? "",
    personalizationNote: partial.personalizationNote?.trim() ?? "",
    draftMessage: partial.draftMessage?.trim() ?? "",
    plannedChannel: partial.plannedChannel ?? "",
    plannedContactDate: partial.plannedContactDate ?? null,
    preparedAt: partial.preparedAt ?? null,
    firstContactedAt: partial.firstContactedAt ?? null,
    lastContactedAt: partial.lastContactedAt ?? null,
    nextFollowUpAt: partial.nextFollowUpAt ?? null,
    followUpReason: partial.followUpReason?.trim() ?? "",
    outreachAttempts: partial.outreachAttempts ?? 0,
    responseStatus: partial.responseStatus ?? "",
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

export function startOfWeekMonday(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isIsoInRange(
  iso: string | null | undefined,
  from: Date,
  to: Date,
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export function dateOnly(isoOrDate: string | Date): string {
  if (typeof isoOrDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(isoOrDate)) {
    return isoOrDate.slice(0, 10);
  }
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayDateOnly(): string {
  return dateOnly(new Date());
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a.slice(0, 10) + "T12:00:00");
  const db = new Date(b.slice(0, 10) + "T12:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function statusAfterOutreachResult(
  result: OutreachResult,
  current: ProspectStatus,
): ProspectStatus {
  if (current === "promoted" || current === "disqualified") return current;
  switch (result) {
    case "outreach-sent":
      return "contacted";
    case "communication-started":
    case "positive":
    case "requested-info":
    case "requested-meeting":
    case "requested-offer":
      return "engaged";
    case "no-response-cancel":
    case "negative":
    case "not-relevant":
      return "not-interested";
    case "no-response-follow-up":
    case "follow-up-later":
    case "no-response":
    case "referred":
      return "follow-up-due";
    default:
      return current === "target-identified" ? "contacted" : current;
  }
}

export function promoteDefaultStage(
  company: ProspectCompany,
): Stage {
  const conf = company.qualification.confidence ?? 0;
  if (conf >= 70) return "hot-lead";
  return "cold-lead";
}

export type WeekdayFocus =
  | "prepare"
  | "contact"
  | "research"
  | "review"
  | "weekend";

export function weekdayFocus(d = new Date()): WeekdayFocus {
  const day = d.getDay();
  if (day === 1) return "prepare"; // Monday
  if (day === 2 || day === 4) return "contact"; // Tue / Thu
  if (day === 3) return "research"; // Wednesday prepare + tender/funding scan
  if (day === 5) return "review";
  return "weekend";
}

export const WEEKDAY_FOCUS_COPY: Record<
  WeekdayFocus,
  { title: string; hint: string; prepareTarget: number; contactTarget: number }
> = {
  prepare: {
    title: "Build the prepare list",
    hint: "Add target companies and contacts so outreach days have a clear queue.",
    prepareTarget: 10,
    contactTarget: 0,
  },
  contact: {
    title: "Outreach day",
    hint: "Contact prepare-list prospects and clear due follow-ups.",
    prepareTarget: 0,
    contactTarget: 10,
  },
  research: {
    title: "Research day",
    hint: "Scan tenders, funding, and announcements while adding targets.",
    prepareTarget: 10,
    contactTarget: 0,
  },
  review: {
    title: "Pipeline review",
    hint: "Review replies, overdue follow-ups, qualified leads, and next-week priorities.",
    prepareTarget: 0,
    contactTarget: 0,
  },
  weekend: {
    title: "Weekend",
    hint: "Optional catch-up — focus on overdue follow-ups if needed.",
    prepareTarget: 0,
    contactTarget: 0,
  },
};
