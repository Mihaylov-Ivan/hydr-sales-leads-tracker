import type { Market } from "./types";
import {
  WarehouseBalance,
  WarehouseLocation,
  WarehouseSerial,
  WarehouseSite,
  WarehouseSlot,
  WarehouseState,
} from "./types";
import { cloneLocation, locationsEqual } from "./warehouse";

export type WarehouseSkladMap = {
  id: string;
  sourceSklad: string;
  projectId: string;
  site: WarehouseSite;
  slot: WarehouseSlot;
  createdAt: string;
};

/** Canonical MoneyWorks source_sklad → preferred project name in the app. */
export const SYSTEM_SKLAD_PROJECT_NAMES: Record<string, string> = {
  "System - 90kW Volkswagen (59)": "VW Vzesnya",
  "System - 60kW Brikel (60)": "Brikel",
  "System - 500kW Titan Zlatna Panega (58)": "Titan Zlatna Panega",
  "System - 10kW Italy": "Italy 10kW",
  "System - Украйна": "5MW BoP/BoS Ushgorod with N1",
  "System - 30KW ЦЕХ": "Workshop 30kW (Цех)",
  "System - 20kW Warsaw": "Warsaw 20kW",
};

export const SYSTEM_SKLAD_NAMES = Object.keys(SYSTEM_SKLAD_PROJECT_NAMES);

/** Projects that should exist for mapping (create if missing). */
export const SYSTEM_SKLAD_PROJECT_SEEDS: {
  name: string;
  client: string;
  country: string;
  city: string;
  series: "Z Series" | "E Series" | "Custom";
  sizeKw: number;
  market: Market;
  baseDescription: string;
}[] = [
  {
    name: "Italy 10kW",
    client: "Italy (MoneyWorks warehouse)",
    country: "Italy",
    city: "",
    series: "E Series",
    sizeKw: 10,
    market: "Clean H2",
    baseDescription:
      "Created for MoneyWorks warehouse mapping (System - 10kW Italy).",
  },
  {
    name: "Warsaw 20kW",
    client: "Warsaw (MoneyWorks warehouse)",
    country: "Poland",
    city: "Warsaw",
    series: "E Series",
    sizeKw: 20,
    market: "Clean H2",
    baseDescription:
      "Created for MoneyWorks warehouse mapping (System - 20kW Warsaw).",
  },
  {
    name: "Workshop 30kW (Цех)",
    client: "Internal workshop",
    country: "Bulgaria",
    city: "Sofia",
    series: "Custom",
    sizeKw: 30,
    market: "Clean H2",
    baseDescription:
      "Created for MoneyWorks warehouse mapping (System - 30KW ЦЕХ).",
  },
];

/**
 * Resolve project id for a System SKLAD using preferred names + fuzzy fallbacks.
 */
export function resolveProjectIdForSklad(
  sourceSklad: string,
  projects: { id: string; name: string }[],
): string | null {
  const preferred = SYSTEM_SKLAD_PROJECT_NAMES[sourceSklad];
  if (preferred) {
    const exact = projects.find(
      (p) => p.name.toLowerCase() === preferred.toLowerCase(),
    );
    if (exact) return exact.id;
    const partial = projects.find((p) =>
      p.name.toLowerCase().includes(preferred.toLowerCase()),
    );
    if (partial) return partial.id;
  }

  // Fuzzy from SKLAD text
  const lower = sourceSklad.toLowerCase();
  if (lower.includes("volkswagen") || lower.includes("vw")) {
    const vw90 = projects.find(
      (p) =>
        /vw|volkswagen/i.test(p.name) && /vzesnya|90/i.test(p.name),
    );
    if (vw90) return vw90.id;
    const anyVw = projects.find((p) => /vw|volkswagen/i.test(p.name));
    if (anyVw) return anyVw.id;
  }
  if (lower.includes("brikel")) {
    const p = projects.find((x) => /brikel/i.test(x.name));
    if (p) return p.id;
  }
  if (lower.includes("titan")) {
    const p = projects.find((x) => /titan/i.test(x.name));
    if (p) return p.id;
  }
  if (lower.includes("украйна") || lower.includes("ukraine")) {
    const ushgorod = projects.find((x) => /ushgorod|uzhgorod/i.test(x.name));
    if (ushgorod) return ushgorod.id;
    const p = projects.find((x) => /ukraine|украйн|interbud/i.test(x.name));
    if (p) return p.id;
  }
  if (lower.includes("warsaw") || lower.includes("варшава")) {
    const p = projects.find((x) => /warsaw/i.test(x.name));
    if (p) return p.id;
  }
  if (lower.includes("italy") || lower.includes("итал")) {
    const p = projects.find((x) => /italy|итал/i.test(x.name));
    if (p) return p.id;
  }
  if (lower.includes("цех") || lower.includes("30kw")) {
    const p = projects.find((x) => /цех|workshop|30kw/i.test(x.name));
    if (p) return p.id;
  }
  return null;
}

export function buildDefaultSkladMaps(
  projects: { id: string; name: string }[],
): WarehouseSkladMap[] {
  const now = new Date().toISOString();
  const maps: WarehouseSkladMap[] = [];
  for (const sourceSklad of SYSTEM_SKLAD_NAMES) {
    const projectId = resolveProjectIdForSklad(sourceSklad, projects);
    if (!projectId) continue;
    maps.push({
      id: crypto.randomUUID(),
      sourceSklad,
      projectId,
      site: "ELX",
      slot: "project",
      createdAt: now,
    });
  }
  return maps;
}

function targetLocation(map: WarehouseSkladMap): WarehouseLocation {
  if (map.slot === "project") {
    return { site: map.site, slot: "project", projectId: map.projectId };
  }
  return { site: map.site, slot: map.slot };
}

/**
 * Move balances / serials whose sourceSklad matches a map onto the mapped
 * site×slot (typically ELX / project / projectId). Merges into existing
 * same-lot location rows when present.
 */
export function applySkladMapsToWarehouseState(
  state: WarehouseState,
  maps: WarehouseSkladMap[],
): {
  state: WarehouseState;
  movedBalances: number;
  movedSerials: number;
  unmatched: string[];
} {
  const bySklad = new Map(maps.map((m) => [m.sourceSklad, m]));
  const unmatched = new Set<string>();

  let balances = [...state.balances];
  let movedBalances = 0;

  // Process one balance at a time; may merge into an existing row
  const nextBalances: WarehouseBalance[] = [];
  const indexByKey = new Map<string, number>();

  function keyOf(lotId: string, loc: WarehouseLocation): string {
    return `${lotId}|${loc.site}|${loc.slot}|${loc.projectId ?? ""}`;
  }

  for (const b of balances) {
    const sklad = b.sourceSklad;
    if (!sklad || !sklad.startsWith("System -")) {
      const k = keyOf(b.lotId, b.location);
      indexByKey.set(k, nextBalances.length);
      nextBalances.push(b);
      continue;
    }
    const map = bySklad.get(sklad);
    if (!map) {
      unmatched.add(sklad);
      const k = keyOf(b.lotId, b.location);
      indexByKey.set(k, nextBalances.length);
      nextBalances.push(b);
      continue;
    }
    const loc = targetLocation(map);
    const k = keyOf(b.lotId, loc);
    const existingIdx = indexByKey.get(k);
    if (existingIdx != null) {
      const cur = nextBalances[existingIdx]!;
      nextBalances[existingIdx] = {
        ...cur,
        qty: Math.round((cur.qty + b.qty) * 10000) / 10000,
        sourceSklad: sklad,
      };
    } else {
      indexByKey.set(k, nextBalances.length);
      nextBalances.push({
        ...b,
        location: cloneLocation(loc),
        sourceSklad: sklad,
      });
    }
    movedBalances++;
  }

  let movedSerials = 0;
  const serials: WarehouseSerial[] = state.serials.map((s) => {
    const sklad = s.sourceSklad;
    if (!sklad || !sklad.startsWith("System -")) return s;
    const map = bySklad.get(sklad);
    if (!map) {
      unmatched.add(sklad);
      return s;
    }
    const loc = targetLocation(map);
    if (locationsEqual(s.location, loc)) return s;
    movedSerials++;
    return { ...s, location: cloneLocation(loc) };
  });

  return {
    state: {
      ...state,
      balances: nextBalances.filter((b) => b.qty > 0.0001),
      serials,
    },
    movedBalances,
    movedSerials,
    unmatched: [...unmatched],
  };
}
