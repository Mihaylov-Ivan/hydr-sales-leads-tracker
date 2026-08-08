/**
 * Second pass: merge duplicate hand-tool warehouse_items into one SKU.
 * Re-points lots / serials / BOM refs; does NOT merge lots (qty stays per lot/location).
 *
 * Usage:
 *   node scripts/merge-tool-skus.mjs --dry-run
 *   node scripts/merge-tool-skus.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PAGE = 1000;

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Usage: node scripts/merge-tool-skus.mjs [--dry-run]");
      process.exit(0);
    }
  }
  return args;
}

function loadEnv() {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
  const anon = env.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m)?.[1]?.trim();
  if (!url || !anon) throw new Error("Missing Supabase env in .env.local");
  return { url, anon };
}

function headers(anon, prefer) {
  return {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    "Content-Type": "application/json",
    Prefer: prefer || "return=representation",
  };
}

async function rest(url, anon, method, route, body, prefer) {
  const res = await fetch(`${url}/rest/v1/${route}`, {
    method,
    headers: headers(anon, prefer),
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data?.message
        ? data.message
        : typeof data === "string"
          ? data
          : JSON.stringify(data);
    throw new Error(`${method} ${route} → ${res.status}: ${msg}`);
  }
  return data;
}

async function fetchAll(url, anon, table, select = "*") {
  const rows = [];
  let from = 0;
  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=id.asc&limit=${PAGE}&offset=${from}`,
      { headers: headers(anon) },
    );
    const text = await res.text();
    const chunk = text ? JSON.parse(text) : [];
    if (!res.ok) {
      throw new Error(
        `GET ${table}: ${res.status} ${chunk?.message || text.slice(0, 200)}`,
      );
    }
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function softKey(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .replace(/[“”„]|``|''/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїґ]/gi, "");
}

function pickSurvivor(candidates) {
  // Prefer most lots, then earliest created_at, then stable id
  return candidates
    .slice()
    .sort((a, b) => {
      if (b.lotCount !== a.lotCount) return b.lotCount - a.lotCount;
      const ac = a.created_at || "";
      const bc = b.created_at || "";
      if (ac !== bc) return ac.localeCompare(bc);
      return a.id.localeCompare(b.id);
    })[0];
}

async function main() {
  const args = parseArgs(process.argv);
  const { url, anon } = loadEnv();

  console.log(`Merge duplicate tool SKUs${args.dryRun ? " (DRY RUN)" : ""}`);

  const groups = await fetchAll(
    url,
    anon,
    "warehouse_groups",
    "id,name,source_key",
  );
  const toolGroupIds = new Set(
    groups
      .filter(
        (g) =>
          (g.source_key || "").includes("06.01-hand-tools") ||
          (g.source_key || "") === "reorg:06.01-hand-tools",
      )
      .map((g) => g.id),
  );
  if (toolGroupIds.size === 0) {
    // fallback: name contains hand tools leaf
    for (const g of groups) {
      if (/06\.01/.test(g.name) || /ръчни инструмент/i.test(g.name)) {
        toolGroupIds.add(g.id);
      }
    }
  }
  console.log(`  tool groups: ${toolGroupIds.size}`);

  const items = await fetchAll(
    url,
    anon,
    "warehouse_items",
    "id,name,group_id,created_at,name_original,legacy_group_name,preferred_supplier,system_tags",
  );
  const lots = await fetchAll(url, anon, "warehouse_lots", "id,item_id");
  const serials = await fetchAll(
    url,
    anon,
    "warehouse_serials",
    "id,item_id",
  ).catch(() => []);
  const boms = await fetchAll(
    url,
    anon,
    "warehouse_boms",
    "id,output_item_id",
  ).catch(() => []);
  const bomLines = await fetchAll(
    url,
    anon,
    "warehouse_bom_lines",
    "id,component_item_id",
  ).catch(() => []);

  const lotCount = new Map();
  const lotsByItem = new Map();
  for (const l of lots) {
    lotCount.set(l.item_id, (lotCount.get(l.item_id) || 0) + 1);
    if (!lotsByItem.has(l.item_id)) lotsByItem.set(l.item_id, []);
    lotsByItem.get(l.item_id).push(l.id);
  }

  const toolItems = items
    .filter((it) => toolGroupIds.has(it.group_id))
    .map((it) => ({
      ...it,
      soft: softKey(it.name),
      lotCount: lotCount.get(it.id) || 0,
    }));

  /** @type {Map<string, typeof toolItems>} */
  const bySoft = new Map();
  for (const it of toolItems) {
    if (!it.soft) continue;
    if (!bySoft.has(it.soft)) bySoft.set(it.soft, []);
    bySoft.get(it.soft).push(it);
  }

  const plans = [];
  for (const [soft, list] of bySoft) {
    if (list.length < 2) continue;
    const survivor = pickSurvivor(list);
    const losers = list.filter((x) => x.id !== survivor.id);
    plans.push({
      soft_key: soft,
      name: survivor.name,
      survivor_id: survivor.id,
      loser_ids: losers.map((l) => l.id),
      lots_moved: losers.reduce((n, l) => n + l.lotCount, 0),
      members: list.map((m) => ({
        id: m.id,
        name: m.name,
        lotCount: m.lotCount,
        role: m.id === survivor.id ? "survivor" : "merge_away",
      })),
    });
  }

  plans.sort((a, b) => a.name.localeCompare(b.name, "bg"));
  console.log(`  duplicate soft-keys: ${plans.length}`);
  for (const p of plans) {
    console.log(
      `  - ${p.name}: keep ${p.survivor_id.slice(0, 8)}…, merge ${p.loser_ids.length} (move ${p.lots_moved} lots)`,
    );
  }

  if (plans.length === 0) {
    console.log("Nothing to merge.");
    return;
  }

  let lotsUpdated = 0;
  let serialsUpdated = 0;
  let bomsUpdated = 0;
  let bomLinesUpdated = 0;
  let itemsDeleted = 0;

  for (const plan of plans) {
    for (const loserId of plan.loser_ids) {
      const loserLots = lotsByItem.get(loserId) || [];
      for (const lotId of loserLots) {
        if (!args.dryRun) {
          await rest(
            url,
            anon,
            "PATCH",
            `warehouse_lots?id=eq.${lotId}`,
            { item_id: plan.survivor_id },
            "return=minimal",
          );
        }
        lotsUpdated++;
      }

      const loserSerials = serials.filter((s) => s.item_id === loserId);
      for (const s of loserSerials) {
        if (!args.dryRun) {
          await rest(
            url,
            anon,
            "PATCH",
            `warehouse_serials?id=eq.${s.id}`,
            { item_id: plan.survivor_id },
            "return=minimal",
          );
        }
        serialsUpdated++;
      }

      const loserBoms = boms.filter((b) => b.output_item_id === loserId);
      for (const b of loserBoms) {
        if (!args.dryRun) {
          await rest(
            url,
            anon,
            "PATCH",
            `warehouse_boms?id=eq.${b.id}`,
            { output_item_id: plan.survivor_id },
            "return=minimal",
          );
        }
        bomsUpdated++;
      }

      const loserLines = bomLines.filter((l) => l.component_item_id === loserId);
      for (const line of loserLines) {
        if (!args.dryRun) {
          await rest(
            url,
            anon,
            "PATCH",
            `warehouse_bom_lines?id=eq.${line.id}`,
            { component_item_id: plan.survivor_id },
            "return=minimal",
          );
        }
        bomLinesUpdated++;
      }

      if (!args.dryRun) {
        await rest(
          url,
          anon,
          "DELETE",
          `warehouse_items?id=eq.${loserId}`,
          null,
          "return=minimal",
        );
      }
      itemsDeleted++;
    }

    // Enrich survivor: keep preferred name casing; clear process tags on pure tools if any
    if (!args.dryRun) {
      await rest(
        url,
        anon,
        "PATCH",
        `warehouse_items?id=eq.${plan.survivor_id}`,
        {
          name: plan.name,
          system_tags: [],
        },
        "return=minimal",
      );
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    dry_run: args.dryRun,
    plans,
    stats: {
      merge_groups: plans.length,
      lots_updated: lotsUpdated,
      serials_updated: serialsUpdated,
      boms_updated: bomsUpdated,
      bom_lines_updated: bomLinesUpdated,
      items_deleted: itemsDeleted,
    },
  };

  const outDir = path.join(ROOT, "templates", "warehouse-data", "backups");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = report.generated_at.replace(/[:.]/g, "-");
  const outPath = path.join(
    outDir,
    `WH_tool_sku_merge_${args.dryRun ? "dryrun_" : ""}${stamp}.json`,
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("Done.");
  console.log(`  merge groups: ${plans.length}`);
  console.log(`  lots re-pointed: ${lotsUpdated}`);
  console.log(`  serials re-pointed: ${serialsUpdated}`);
  console.log(`  BOM headers re-pointed: ${bomsUpdated}`);
  console.log(`  BOM lines re-pointed: ${bomLinesUpdated}`);
  console.log(`  duplicate items removed: ${itemsDeleted}`);
  console.log(`  report: ${path.relative(ROOT, outPath)}`);
  if (args.dryRun) console.log("\nDry run only — re-run without --dry-run to write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
