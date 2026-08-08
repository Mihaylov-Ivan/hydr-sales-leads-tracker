/**
 * Snapshot live warehouse tables into:
 *   1) DB tables warehouse_original_backups + warehouse_original_rows
 *   2) JSON file under templates/warehouse-data/backups/
 *
 * Usage:
 *   node scripts/backup-warehouse-original.mjs
 *   node scripts/backup-warehouse-original.mjs --label pre-reorganisation
 *   node scripts/backup-warehouse-original.mjs --force   # replace existing label
 *
 * Requires migration-027 applied and .env.local with Supabase URL + anon key.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TABLES = [
  "warehouse_groups",
  "warehouse_items",
  "warehouse_lots",
  "warehouse_balances",
  "warehouse_movements",
  "warehouse_serials",
  "warehouse_boms",
  "warehouse_bom_lines",
  "warehouse_sklad_maps",
];

const PAGE = 1000;
const UPSERT_CHUNK = 200;

function parseArgs(argv) {
  const args = {
    label: "pre-reorganisation",
    force: false,
    note: "",
    fileOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--file-only") args.fileOnly = true;
    else if (a === "--label") args.label = argv[++i] || args.label;
    else if (a === "--note") args.note = argv[++i] || "";
    else if (a === "--help" || a === "-h") {
      console.log(
        `Usage: node scripts/backup-warehouse-original.mjs [--label NAME] [--note TEXT] [--force] [--file-only]`,
      );
      console.log(
        `  --file-only   Write JSON backup only (skip DB inject; no migration-027 needed)`,
      );
      process.exit(0);
    }
  }
  return args;
}

function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env.local (need NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  const env = fs.readFileSync(envPath, "utf8");
  const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
  const anon = env.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m)?.[1]?.trim();
  if (!url || !anon) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not found in .env.local");
  }
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
      typeof data === "object" && data && data.message
        ? data.message
        : typeof data === "string"
          ? data
          : JSON.stringify(data);
    throw new Error(`${method} ${route} → ${res.status}: ${msg}`);
  }
  return data;
}

async function fetchAll(url, anon, table) {
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const res = await fetch(
      `${url}/rest/v1/${table}?select=*&order=id.asc&limit=${PAGE}&offset=${from}`,
      {
        headers: {
          ...headers(anon, "return=representation"),
          Range: `${from}-${to}`,
          Prefer: "count=exact",
        },
      },
    );
    const text = await res.text();
    let chunk = [];
    if (text) {
      try {
        chunk = JSON.parse(text);
      } catch {
        throw new Error(`Failed to parse ${table}: ${text.slice(0, 200)}`);
      }
    }
    if (!res.ok) {
      const msg =
        typeof chunk === "object" && chunk?.message
          ? chunk.message
          : text.slice(0, 300);
      throw new Error(`GET ${table} → ${res.status}: ${msg}`);
    }
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function rowIdOf(row) {
  if (row == null) return crypto.randomUUID();
  if (row.id != null) return String(row.id);
  if (row.source_key != null) return String(row.source_key);
  if (row.source_sklad != null) return String(row.source_sklad);
  return crypto.randomUUID();
}

async function main() {
  const args = parseArgs(process.argv);
  const { url, anon } = loadEnv();

  console.log(
    `Backing up warehouse → label "${args.label}"${args.fileOnly ? " (file-only)" : ""}`,
  );

  const snapshot = {
    meta: {
      label: args.label,
      note: args.note || "Original warehouse data before reorganisation migration",
      created_at: new Date().toISOString(),
      source: "live-db",
    },
    tables: {},
  };

  const counts = {};
  for (const table of TABLES) {
    process.stdout.write(`  reading ${table}… `);
    try {
      const rows = await fetchAll(url, anon, table);
      snapshot.tables[table] = rows;
      counts[table] = rows.length;
      console.log(rows.length);
    } catch (e) {
      // Table may not exist yet in some environments
      console.log(`SKIP (${e.message})`);
      snapshot.tables[table] = [];
      counts[table] = 0;
    }
  }
  snapshot.meta.counts = counts;

  const outDir = path.join(ROOT, "templates", "warehouse-data", "backups");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = snapshot.meta.created_at.replace(/[:.]/g, "-");
  const fileName = `WH_original_${args.label}_${stamp}.json`;
  const outPath = path.join(outDir, fileName);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");
  const latestPath = path.join(outDir, `WH_original_${args.label}_latest.json`);
  fs.writeFileSync(latestPath, JSON.stringify(snapshot, null, 2), "utf8");

  let backupId = null;
  let injected = 0;

  if (!args.fileOnly) {
    try {
      await rest(
        url,
        anon,
        "GET",
        "warehouse_original_backups?select=id&limit=1",
        null,
        "return=representation",
      );
    } catch (e) {
      console.error(
        "\nBackup tables missing. Apply supabase/migration-027-warehouse-original-backup.sql in the Supabase SQL editor,",
      );
      console.error(
        "then re-run without --file-only. JSON file backup was still written:",
      );
      console.error(`  ${path.relative(ROOT, outPath)}`);
      throw e;
    }

    const existing = await rest(
      url,
      anon,
      "GET",
      `warehouse_original_backups?label=eq.${encodeURIComponent(args.label)}&select=id,label,created_at,counts`,
    );

    if (Array.isArray(existing) && existing.length > 0) {
      if (!args.force) {
        console.error(
          `Backup label "${args.label}" already exists (${existing[0].id}, ${existing[0].created_at}).\n` +
            `Re-run with --force to replace it, or pass --label <other>.`,
        );
        console.error(`JSON file was written: ${path.relative(ROOT, outPath)}`);
        process.exit(1);
      }
      console.log(`--force: deleting existing backup ${existing[0].id}`);
      await rest(
        url,
        anon,
        "DELETE",
        `warehouse_original_backups?id=eq.${existing[0].id}`,
        null,
        "return=minimal",
      );
    }

    backupId = crypto.randomUUID();
    await rest(url, anon, "POST", "warehouse_original_backups", {
      id: backupId,
      label: args.label,
      note: snapshot.meta.note,
      source: "live-db",
      counts,
      created_at: snapshot.meta.created_at,
    });

    for (const table of TABLES) {
      const rows = snapshot.tables[table] || [];
      if (!rows.length) continue;
      process.stdout.write(`  injecting ${table} (${rows.length})… `);
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        const chunk = rows.slice(i, i + UPSERT_CHUNK).map((row) => ({
          backup_id: backupId,
          table_name: table,
          row_id: rowIdOf(row),
          payload: row,
        }));
        await rest(
          url,
          anon,
          "POST",
          "warehouse_original_rows?on_conflict=backup_id,table_name,row_id",
          chunk,
          "resolution=merge-duplicates,return=minimal",
        );
        injected += chunk.length;
      }
      console.log("ok");
    }
  }

  console.log("");
  console.log("Backup complete.");
  if (backupId) {
    console.log(`  backup_id: ${backupId}`);
    console.log(`  rows injected: ${injected}`);
  } else {
    console.log("  db inject: skipped (--file-only)");
  }
  console.log(`  counts: ${JSON.stringify(counts)}`);
  console.log(`  file: ${path.relative(ROOT, outPath)}`);
  console.log(`  latest: ${path.relative(ROOT, latestPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
