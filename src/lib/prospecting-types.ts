import {
  isMarketTag,
  MARKETS,
  type MarketTag,
  type SeriesTag,
  type Stage,
} from "./types";

/** Same market list as Sales Projects. */
export type ProspectMarket = MarketTag;

export const PROSPECT_MARKETS: ProspectMarket[] = [...MARKETS];

export const PROSPECT_MARKET_LABELS: Record<ProspectMarket, string> =
  Object.fromEntries(MARKETS.map((m) => [m, m])) as Record<
    ProspectMarket,
    string
  >;

export type ProspectProduct = "E-Series" | "Z-Series";

export const PROSPECT_PRODUCTS: ProspectProduct[] = ["E-Series", "Z-Series"];

/** Default product by Sales Projects market. */
export const PROSPECT_MARKET_PRODUCT: Record<ProspectMarket, ProspectProduct> = {
  Cement: "E-Series",
  "Burner Optimisation": "E-Series",
  "Power Plants": "Z-Series",
  "Clean H2": "Z-Series",
  Funding: "Z-Series",
  Tenders: "Z-Series",
};

export const PROSPECT_PRODUCT_PURITY: Record<ProspectProduct, string> = {
  "E-Series": "99.9%",
  "Z-Series": "99.999%",
};

/** Markets are identical — pass through for Sales Project creation. */
export function prospectMarketToProjectMarket(
  market: ProspectMarket | string,
): MarketTag {
  return normalizeProspectMarket(market);
}

/** @deprecated use prospectMarketToProjectMarket — kept for call-site clarity */
export const PROSPECT_TO_PROJECT_MARKET: Record<ProspectMarket, MarketTag> =
  Object.fromEntries(MARKETS.map((m) => [m, m])) as Record<
    ProspectMarket,
    MarketTag
  >;

export const PROSPECT_TO_PROJECT_SERIES: Record<ProspectProduct, SeriesTag> = {
  "E-Series": "E Series",
  "Z-Series": "Z Series",
};

/** Map legacy prospecting market ids onto Sales Projects markets. */
export function normalizeProspectMarket(
  value: string | null | undefined,
): ProspectMarket {
  if (!value) return "Clean H2";
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
      return "Clean H2";
  }
}

export type ProspectSource =
  | "email"
  | "phone"
  | "referral"
  | "linkedin"
  | "in-person"
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

/** Source options match Prepare / Log channel options. */
export const PROSPECT_SOURCES: ProspectSource[] = [
  "email",
  "phone",
  "referral",
  "linkedin",
  "in-person",
];

export const PROSPECT_SOURCE_LABELS: Record<ProspectSource, string> = {
  email: "Email",
  phone: "Phone",
  referral: "Referral",
  linkedin: "LinkedIn",
  "in-person": "In-Person",
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
  // Map common legacy sources onto the channel-aligned set
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
 */
export type ProspectStatus =
  | "target-identified"
  | "contact-prepared"
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
  "contact-prepared",
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
  "contact-prepared": "Contact Prepared",
  contacted: "Contacted",
  "follow-up-due": "Follow-Up Due",
  engaged: "Engaged",
  qualified: "Qualified",
  promoted: "Promoted to Sales Project",
  "not-interested": "Not Interested",
  dormant: "No Response / Dormant",
  disqualified: "Disqualified",
};

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

/** Channels used on Prepare / Log outreach forms. */
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

export const OUTREACH_RESULTS: OutreachResult[] = [
  "communication-started",
  "no-response-follow-up",
  "no-response-cancel",
];

export const OUTREACH_RESULT_LABELS: Record<OutreachResult, string> = {
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
  product?: ProspectProduct;
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
  market: ProspectMarket;
  product: ProspectProduct;
  source: ProspectSource;
  priority: ProspectPriority;
  ownerId: string;
  status: ProspectStatus;
  notes: string;
  strategyWhy: string;
  strategyAngle: string;
  strategyMessage: string;
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
  /** Preparation fields (optional) */
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
  /** Share 0–100 per market; should sum ~100 */
  marketAllocation: Record<ProspectMarket, number>;
}

export const DEFAULT_PROSPECTING_TARGETS: ProspectingTargets = {
  monthlyContactTarget: 80,
  weeklyContactTarget: 20,
  marketAllocation: {
    "Burner Optimisation": 30,
    Cement: 25,
    "Power Plants": 20,
    "Clean H2": 15,
    Funding: 5,
    Tenders: 5,
  },
};

export interface ProspectingState {
  companies: ProspectCompany[];
  contacts: ProspectContact[];
  activities: ProspectActivity[];
  targets: ProspectingTargets;
}

export type ProspectView =
  | "my-work"
  | "prepare"
  | "contact"
  | "engaged"
  | "all"
  | "insights";

export const PROSPECT_VIEW_LABELS: Record<ProspectView, string> = {
  "my-work": "My Work",
  prepare: "Prepare",
  contact: "Contact",
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
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name.trim(),
    country: partial.country?.trim() ?? "",
    city: partial.city?.trim() ?? "",
    siteName: partial.siteName?.trim() ?? "",
    website: partial.website?.trim() ?? "",
    industry: partial.industry?.trim() ?? "",
    market,
    product: partial.product ?? PROSPECT_MARKET_PRODUCT[market],
    source: normalizeProspectSource(partial.source ?? "email"),
    priority: partial.priority ?? "medium",
    ownerId: partial.ownerId,
    status: partial.status ?? "target-identified",
    notes: partial.notes?.trim() ?? "",
    strategyWhy: partial.strategyWhy?.trim() ?? "",
    strategyAngle: partial.strategyAngle?.trim() ?? "",
    strategyMessage: partial.strategyMessage?.trim() ?? "",
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
    id: partial.id ?? crypto.randomUUID(),
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
      return current === "target-identified" || current === "contact-prepared"
        ? "contacted"
        : current;
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
    title: "Prepare contacts",
    hint: "Identify companies, decision-makers, and outreach angles for the next contact day.",
    prepareTarget: 10,
    contactTarget: 0,
  },
  contact: {
    title: "Outreach day",
    hint: "Contact prepared prospects and clear due follow-ups.",
    prepareTarget: 0,
    contactTarget: 10,
  },
  research: {
    title: "Research day",
    hint: "Scan tenders, funding, and announcements while preparing contacts.",
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
