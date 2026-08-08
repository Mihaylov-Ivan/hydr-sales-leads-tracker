/**
 * Apply warehouse reorganisation to live Supabase (safer first pass).
 *
 * - Upserts new type taxonomy into warehouse_groups (source_key = reorg:<id>)
 * - Remaps each warehouse_items.group_id to the new leaf category
 * - Sets preferred_supplier, system_tags, legacy_group_name, optional name cleanup
 * - Does NOT merge duplicate tool SKUs / re-link lots (that is a later pass)
 *
 * Prerequisites:
 *   1. migration-027 applied + backup inject (label pre-reorganisation)
 *   2. migration-028 applied (item metadata columns)
 *   3. WH_data_reorganised_updated.json present
 *
 * Usage:
 *   node scripts/apply-warehouse-reorg.mjs
 *   node scripts/apply-warehouse-reorg.mjs --dry-run
 *   node scripts/apply-warehouse-reorg.mjs --retire-old-groups
 *   node scripts/apply-warehouse-reorg.mjs --allow-without-backup
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REORG_PATH = path.join(
  ROOT,
  "templates",
  "warehouse-data",
  "WH_data_reorganised_updated.json",
);

const PAGE = 1000;
const CHUNK = 150;
const BACKUP_LABEL = "pre-reorganisation";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    retireOldGroups: false,
    allowWithoutBackup: false,
    applyNames: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--retire-old-groups") args.retireOldGroups = true;
    else if (a === "--allow-without-backup") args.allowWithoutBackup = true;
    else if (a === "--keep-names") args.applyNames = false;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/apply-warehouse-reorg.mjs [options]
  --dry-run                 Show plan only, no writes
  --retire-old-groups       Delete MoneyWorks groups with no items after remap
  --allow-without-backup    Skip check for DB backup label "${BACKUP_LABEL}"
  --keep-names              Do not overwrite item.name with normalised names`);
      process.exit(0);
    }
  }
  return args;
}

function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  const env = fs.readFileSync(envPath, "utf8");
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
    .replace(/[`´']/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9а-яёіїґ]/gi, "");
}

function uuid() {
  return crypto.randomUUID();
}

async function patchItem(url, anon, id, patch, dryRun) {
  if (dryRun) return;
  await rest(
    url,
    anon,
    "PATCH",
    `warehouse_items?id=eq.${id}`,
    patch,
    "return=minimal",
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const { url, anon } = loadEnv();

  if (!fs.existsSync(REORG_PATH)) {
    throw new Error(`Missing ${REORG_PATH} — run reorganise script first`);
  }
  const reorg = JSON.parse(fs.readFileSync(REORG_PATH, "utf8"));

  console.log(
    `Apply warehouse reorg${args.dryRun ? " (DRY RUN)" : ""}`,
  );

  // --- Preconditions ---
  if (!args.allowWithoutBackup) {
    try {
      const backups = await rest(
        url,
        anon,
        "GET",
        `warehouse_original_backups?label=eq.${encodeURIComponent(BACKUP_LABEL)}&select=id,created_at,counts`,
      );
      if (!Array.isArray(backups) || backups.length === 0) {
        throw new Error(
          `No DB backup with label "${BACKUP_LABEL}". Run:\n` +
            `  1) Apply migration-027\n` +
            `  2) node scripts/backup-warehouse-original.mjs\n` +
            `Or pass --allow-without-backup (not recommended).`,
        );
      }
      console.log(`  backup ok: ${backups[0].id} @ ${backups[0].created_at}`);
    } catch (e) {
      if (String(e.message).includes("Could not find the table")) {
        throw new Error(
          "warehouse_original_backups missing — apply migration-027 and run backup first.",
        );
      }
      throw e;
    }
  }

  // Probe migration-028 columns
  try {
    await rest(
      url,
      anon,
      "GET",
      "warehouse_items?select=id,preferred_supplier,system_tags,legacy_group_name,name_original&limit=1",
    );
  } catch (e) {
    throw new Error(
      "migration-028 fields missing on warehouse_items. Apply supabase/migration-028-warehouse-reorg-fields.sql first.\n" +
        e.message,
    );
  }

  // --- Build article lookup by soft key / old names ---
  /** @type {Map<string, any>} */
  const bySoft = new Map();
  for (const art of reorg.articles) {
    const keys = new Set([art.soft_key, softKey(art.name)]);
    for (const n of art.old_names || []) keys.add(softKey(n));
    for (const k of keys) {
      if (!k) continue;
      if (!bySoft.has(k)) bySoft.set(k, art);
    }
  }

  // Group mapping fallback: old group name → category id
  const groupToCat = new Map();
  for (const g of reorg.group_mapping || []) {
    groupToCat.set(g.old_group, g.new_category_id);
  }

  // --- Upsert taxonomy groups ---
  const existingGroups = await fetchAll(
    url,
    anon,
    "warehouse_groups",
    "id,name,parent_id,source_key",
  );
  const bySource = new Map(
    existingGroups.filter((g) => g.source_key).map((g) => [g.source_key, g]),
  );

  /** @type {Map<string, string>} categoryId → uuid */
  const catIdToUuid = new Map();
  const groupUpserts = [];

  for (const root of reorg.taxonomy) {
    const sourceKey = `reorg:${root.id}`;
    const id = bySource.get(sourceKey)?.id || uuid();
    catIdToUuid.set(root.id, id);
    groupUpserts.push({
      id,
      name: `${root.code} ${root.name}`,
      parent_id: null,
      source_key: sourceKey,
    });
    for (const ch of root.children || []) {
      const chKey = `reorg:${ch.id}`;
      const chId = bySource.get(chKey)?.id || uuid();
      catIdToUuid.set(ch.id, chId);
      groupUpserts.push({
        id: chId,
        name: `${ch.code} ${ch.name}`,
        parent_id: id,
        source_key: chKey,
      });
    }
  }

  console.log(`  taxonomy groups to upsert: ${groupUpserts.length}`);
  if (!args.dryRun) {
    // roots first
    const roots = groupUpserts.map((g) => ({ ...g, parent_id: null }));
    for (let i = 0; i < roots.length; i += CHUNK) {
      await rest(
        url,
        anon,
        "POST",
        "warehouse_groups?on_conflict=id",
        roots.slice(i, i + CHUNK),
        "resolution=merge-duplicates,return=minimal",
      );
    }
    const withParents = groupUpserts.filter((g) => g.parent_id);
    for (let i = 0; i < withParents.length; i += CHUNK) {
      await rest(
        url,
        anon,
        "POST",
        "warehouse_groups?on_conflict=id",
        withParents.slice(i, i + CHUNK),
        "resolution=merge-duplicates,return=minimal",
      );
    }
  }

  // Refresh groups for name lookup of legacy
  const groupsNow = args.dryRun
    ? [
        ...existingGroups,
        ...groupUpserts.map((g) => ({
          ...g,
          // dry-run fake
        })),
      ]
    : await fetchAll(url, anon, "warehouse_groups", "id,name,parent_id,source_key");
  const groupNameById = new Map(groupsNow.map((g) => [g.id, g.name]));

  const items = await fetchAll(
    url,
    anon,
    "warehouse_items",
    "id,name,group_id,preferred_supplier,system_tags,legacy_group_name,name_original",
  );
  console.log(`  live items: ${items.length}`);

  const stats = {
    matched_article: 0,
    matched_group_only: 0,
    unmatched: 0,
    name_updates: 0,
    patched: 0,
  };
  const unmatchedSample = [];

  for (const item of items) {
    const sk = softKey(item.name);
    const art = bySoft.get(sk);
    const legacyName =
      item.legacy_group_name ||
      (item.group_id ? groupNameById.get(item.group_id) : null) ||
      null;

    let catId = art?.new_category_id || null;
    if (!catId && legacyName && groupToCat.has(legacyName)) {
      catId = groupToCat.get(legacyName);
      stats.matched_group_only++;
    } else if (art) {
      stats.matched_article++;
    } else {
      stats.unmatched++;
      if (unmatchedSample.length < 25) {
        unmatchedSample.push({ name: item.name, legacyName });
      }
    }

    // Prefer leaf categories; if parent id somehow, leave as-is mapping
    const newGroupUuid = catId ? catIdToUuid.get(catId) : null;

    const patch = {
      legacy_group_name: legacyName,
      system_tags: art?.system_tags || [],
      preferred_supplier: art?.supplier || item.preferred_supplier || null,
    };
    if (newGroupUuid) patch.group_id = newGroupUuid;

    if (args.applyNames && art?.name && art.name !== item.name) {
      if (!item.name_original) patch.name_original = item.name;
      patch.name = art.name;
      stats.name_updates++;
    }

    await patchItem(url, anon, item.id, patch, args.dryRun);
    stats.patched++;
  }

  // --- Optionally retire old (non-reorg) empty groups ---
  let retired = 0;
  if (args.retireOldGroups) {
    const itemsAfter = args.dryRun
      ? items
      : await fetchAll(url, anon, "warehouse_items", "id,group_id");
    const used = new Set(itemsAfter.map((i) => i.group_id).filter(Boolean));
    const stale = groupsNow.filter(
      (g) =>
        !(g.source_key || "").startsWith("reorg:") && !used.has(g.id),
    );
    console.log(`  old unused groups to retire: ${stale.length}`);
    if (!args.dryRun) {
      for (let i = 0; i < stale.length; i += CHUNK) {
        const ids = stale.slice(i, i + CHUNK).map((g) => g.id);
        // delete one-by-one via or filter — PostgREST in.(...) 
        const filter = ids.map((id) => `"${id}"`).join(",");
        await rest(
          url,
          anon,
          "DELETE",
          `warehouse_groups?id=in.(${filter})`,
          null,
          "return=minimal",
        );
        retired += ids.length;
      }
    } else {
      retired = stale.length;
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    dry_run: args.dryRun,
    stats,
    retired_old_groups: retired,
    unmatched_sample: unmatchedSample,
    taxonomy_group_count: groupUpserts.length,
  };

  const reportPath = path.join(
    ROOT,
    "templates",
    "warehouse-data",
    "backups",
    `WH_reorg_apply_${args.dryRun ? "dryrun_" : ""}${report.generated_at.replace(/[:.]/g, "-")}.json`,
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log("Done.");
  console.log(`  matched by article name: ${stats.matched_article}`);
  console.log(`  matched by old group only: ${stats.matched_group_only}`);
  console.log(`  unmatched: ${stats.unmatched}`);
  console.log(`  name updates: ${stats.name_updates}`);
  console.log(`  items patched: ${stats.patched}`);
  console.log(`  old groups retired: ${retired}`);
  console.log(`  report: ${path.relative(ROOT, reportPath)}`);
  if (args.dryRun) {
    console.log("\nDry run only — re-run without --dry-run to write.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
