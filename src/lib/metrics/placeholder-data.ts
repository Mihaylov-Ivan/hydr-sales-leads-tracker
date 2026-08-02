import type { Market, Series, Stage } from "@/lib/types";
import { MARKETS } from "@/lib/types";
import type { MetricsProject, StageHistoryEntry } from "./types";

/** Deterministic seeded RNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return fmt(dt);
}

function addDays(iso: string, days: number): string {
  const dt = new Date(iso + "T12:00:00");
  dt.setDate(dt.getDate() + days);
  return fmt(dt);
}

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00").getTime();
  const b = new Date(to + "T12:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

const OWNERS = ["u-andrew", "u-maria", "u-daniel", "u-irina"] as const;
const SERIES: Series[] = ["Z Series", "E Series", "Custom"];
const SIZES = [500, 1000, 2000, 2500, 5000, 10000];

const CLIENTS = [
  "Nordic Cement",
  "Baltic Power",
  "Alpine H2",
  "Rhine Steel",
  "Danube Energy",
  "Iberia Green",
  "Nordic Ports",
  "Central Utilities",
  "EastChem",
  "WestGrid",
  "Helios Fund",
  "Metro District",
  "Coastal Refinery",
  "Valley Glass",
  "Summit Mining",
];

const CITIES = [
  "Sofia",
  "Hamburg",
  "Rotterdam",
  "Barcelona",
  "Vienna",
  "Prague",
  "Warsaw",
  "Helsinki",
  "Lisbon",
  "Athens",
];

type Archetype =
  | "commissioned"
  | "under-dev-healthy"
  | "hot-healthy"
  | "hot-stale"
  | "cold-healthy"
  | "cold-stale"
  | "cancelled-early"
  | "cancelled-late"
  | "recent-cold";

/**
 * Rough mix tuned so mature Cold→UD ≈ 18% and Cold→Commissioned ≈ 5%,
 * with a meaningful stale share among open Cold/Hot leads.
 */
const ARCHETYPE_PLAN: { type: Archetype; count: number }[] = [
  { type: "commissioned", count: 5 },
  { type: "under-dev-healthy", count: 8 },
  { type: "hot-healthy", count: 7 },
  { type: "hot-stale", count: 5 },
  { type: "cold-healthy", count: 18 },
  { type: "cold-stale", count: 12 },
  { type: "cancelled-early", count: 22 },
  { type: "cancelled-late", count: 8 },
  { type: "recent-cold", count: 15 },
];

function buildHistory(
  entries: { stage: Stage; enteredAt: string }[],
): StageHistoryEntry[] {
  return entries.map((e, i) => ({
    stage: e.stage,
    enteredAt: e.enteredAt,
    exitedAt: entries[i + 1]?.enteredAt,
  }));
}

function makeProject(
  index: number,
  archetype: Archetype,
  asOf: string,
  rng: () => number,
): MetricsProject {
  const market = pick(rng, MARKETS) as Market;
  const series = pick(rng, SERIES);
  const ownerId = pick(rng, OWNERS);
  const sizeKw = pick(rng, SIZES);
  const client = pick(rng, CLIENTS);
  const city = pick(rng, CITIES);
  const name = `${client} ${city} ${Math.round(sizeKw / 100) / 10}MW`;

  // Anchor creation ages by archetype so maturity windows are populated.
  let createdAt: string;
  let currentStatus: Stage;
  let hotLeadEnteredAt: string | undefined;
  let underDevelopmentAt: string | undefined;
  let commissionedAt: string | undefined;
  let cancelledAt: string | undefined;
  let lastMeaningfulActivityAt: string;
  let nextActionText: string | undefined;
  let nextActionDueAt: string | undefined;
  let cancellationReason: string | undefined;
  let staleReason: string | undefined;

  switch (archetype) {
    case "commissioned": {
      // Created 36–48 months ago; full path to commissioned
      const ageMonths = 36 + Math.floor(rng() * 12);
      createdAt = addMonths(asOf, -ageMonths);
      const hotAt = addMonths(createdAt, 3 + Math.floor(rng() * 4));
      const udAt = addMonths(hotAt, 4 + Math.floor(rng() * 6));
      const comAt = addMonths(udAt, 10 + Math.floor(rng() * 8));
      hotLeadEnteredAt = hotAt;
      underDevelopmentAt = udAt;
      commissionedAt = comAt;
      currentStatus = "commissioned";
      lastMeaningfulActivityAt = comAt;
      break;
    }
    case "under-dev-healthy": {
      const ageMonths = 14 + Math.floor(rng() * 18);
      createdAt = addMonths(asOf, -ageMonths);
      hotLeadEnteredAt = addMonths(createdAt, 2 + Math.floor(rng() * 4));
      underDevelopmentAt = addMonths(
        hotLeadEnteredAt,
        3 + Math.floor(rng() * 5),
      );
      currentStatus = "under-development";
      lastMeaningfulActivityAt = addDays(asOf, -Math.floor(rng() * 40));
      nextActionText = "Technical design review with client";
      nextActionDueAt = addDays(asOf, 7 + Math.floor(rng() * 21));
      break;
    }
    case "hot-healthy": {
      const ageMonths = 8 + Math.floor(rng() * 16);
      createdAt = addMonths(asOf, -ageMonths);
      hotLeadEnteredAt = addMonths(createdAt, 1 + Math.floor(rng() * 4));
      currentStatus = "hot-lead";
      lastMeaningfulActivityAt = addDays(asOf, -Math.floor(rng() * 50));
      nextActionText = "Follow-up proposal call";
      nextActionDueAt = addDays(asOf, 5 + Math.floor(rng() * 20));
      break;
    }
    case "hot-stale": {
      const ageMonths = 12 + Math.floor(rng() * 18);
      createdAt = addMonths(asOf, -ageMonths);
      hotLeadEnteredAt = addMonths(createdAt, 2 + Math.floor(rng() * 3));
      currentStatus = "hot-lead";
      lastMeaningfulActivityAt = addDays(asOf, -(140 + Math.floor(rng() * 200)));
      staleReason = "Awaiting budget cycle with no agreed next step";
      break;
    }
    case "cold-healthy": {
      // Mix of mature and somewhat mature cold leads that never converted
      const ageMonths = 12 + Math.floor(rng() * 24);
      createdAt = addMonths(asOf, -ageMonths);
      currentStatus = "cold-lead";
      lastMeaningfulActivityAt = addDays(asOf, -Math.floor(rng() * 90));
      nextActionText = "Send introductory pack";
      nextActionDueAt = addDays(asOf, 3 + Math.floor(rng() * 14));
      break;
    }
    case "cold-stale": {
      const ageMonths = 14 + Math.floor(rng() * 28);
      createdAt = addMonths(asOf, -ageMonths);
      currentStatus = "cold-lead";
      lastMeaningfulActivityAt = addDays(asOf, -(200 + Math.floor(rng() * 250)));
      staleReason = "No response after initial outreach";
      break;
    }
    case "cancelled-early": {
      const ageMonths = 14 + Math.floor(rng() * 30);
      createdAt = addMonths(asOf, -ageMonths);
      cancelledAt = addMonths(createdAt, 2 + Math.floor(rng() * 8));
      currentStatus = "cancelled";
      lastMeaningfulActivityAt = cancelledAt;
      cancellationReason = "Client chose alternative technology";
      // ~30% reached hot before cancel
      if (rng() < 0.3) {
        hotLeadEnteredAt = addMonths(createdAt, 1 + Math.floor(rng() * 2));
      }
      break;
    }
    case "cancelled-late": {
      // Cancelled after reaching under development — counts as converted for UD
      const ageMonths = 20 + Math.floor(rng() * 24);
      createdAt = addMonths(asOf, -ageMonths);
      hotLeadEnteredAt = addMonths(createdAt, 2 + Math.floor(rng() * 3));
      underDevelopmentAt = addMonths(
        hotLeadEnteredAt,
        4 + Math.floor(rng() * 5),
      );
      cancelledAt = addMonths(
        underDevelopmentAt,
        3 + Math.floor(rng() * 8),
      );
      currentStatus = "cancelled";
      lastMeaningfulActivityAt = cancelledAt;
      cancellationReason = "Funding withdrawn after FEED";
      break;
    }
    case "recent-cold": {
      // Immature — excluded from mature conversion cohorts
      const ageMonths = 1 + Math.floor(rng() * 10);
      createdAt = addMonths(asOf, -ageMonths);
      currentStatus = "cold-lead";
      lastMeaningfulActivityAt = addDays(asOf, -Math.floor(rng() * 30));
      nextActionText = "Qualify site constraints";
      nextActionDueAt = addDays(asOf, 7 + Math.floor(rng() * 21));
      break;
    }
  }

  // Ensure createdAt is not in the future due to calendar edge cases
  if (createdAt > asOf) createdAt = addDays(asOf, -30);

  const historyEntries: { stage: Stage; enteredAt: string }[] = [
    { stage: "cold-lead", enteredAt: createdAt },
  ];
  if (hotLeadEnteredAt) {
    historyEntries.push({ stage: "hot-lead", enteredAt: hotLeadEnteredAt });
  }
  if (underDevelopmentAt) {
    historyEntries.push({
      stage: "under-development",
      enteredAt: underDevelopmentAt,
    });
  }
  if (commissionedAt) {
    historyEntries.push({ stage: "commissioned", enteredAt: commissionedAt });
  }
  if (cancelledAt) {
    historyEntries.push({ stage: "cancelled", enteredAt: cancelledAt });
  }

  const isStaleArchetype =
    archetype === "cold-stale" || archetype === "hot-stale";

  const inactiveDays = daysBetween(lastMeaningfulActivityAt, asOf);

  return {
    id: `metrics-p-${String(index + 1).padStart(3, "0")}`,
    name,
    ownerId,
    market,
    sizeKw,
    series,
    currentStatus,
    stageHistory: buildHistory(historyEntries),
    createdAt,
    coldLeadEnteredAt: createdAt,
    hotLeadEnteredAt,
    underDevelopmentAt,
    commissionedAt,
    cancelledAt,
    lastMeaningfulActivityAt,
    nextActionText,
    nextActionDueAt,
    staleStatus: isStaleArchetype || undefined,
    staleSince: isStaleArchetype
      ? addDays(lastMeaningfulActivityAt, 1)
      : undefined,
    staleReason: isStaleArchetype
      ? staleReason ?? `Inactive ${inactiveDays} days`
      : undefined,
    cancellationReason,
  };
}

/** Build a stable ~100-project cohort for metrics UI. */
export function buildPlaceholderMetricsProjects(
  asOf: string = "2026-08-02",
  seed = 42,
): MetricsProject[] {
  const rng = mulberry32(seed);
  const projects: MetricsProject[] = [];
  let index = 0;

  for (const { type, count } of ARCHETYPE_PLAN) {
    for (let i = 0; i < count; i++) {
      projects.push(makeProject(index, type, asOf, rng));
      index += 1;
    }
  }

  // Light shuffle for a natural list order while remaining deterministic
  for (let i = projects.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = projects[i]!;
    projects[i] = projects[j]!;
    projects[j] = tmp;
  }

  // Re-id after shuffle for stable display ids matching array order
  return projects.map((p, i) => ({
    ...p,
    id: `metrics-p-${String(i + 1).padStart(3, "0")}`,
  }));
}

/** Singleton cohort used by the Metrics page. */
export const PLACEHOLDER_METRICS_PROJECTS = buildPlaceholderMetricsProjects();
