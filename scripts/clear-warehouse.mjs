/**
 * Delete all live warehouse catalog/stock rows (fresh start).
 * Does not touch warehouse_original_* backup tables or projects.
 *
 * Usage:
 *   node scripts/clear-warehouse.mjs --yes
 *
 * Requires .env.local with Supabase URL + anon key.
 * Restore from templates/warehouse-data/WH_full_backup_2026-08-18.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BACKUP = path.join(
  ROOT,
  "templates",
  "warehouse-data",
  "WH_full_backup_2026-08-18.json",
);

/** Child → parent so FKs do not block deletes. */
const TABLES = [
  "warehouse_bom_lines",
  "warehouse_serials",
  "warehouse_movements",
  "warehouse_balances",
  "warehouse_lots",
  "warehouse_boms",
  "warehouse_sklad_maps",
  "warehouse_items",
  "warehouse_groups",
];

const PAGE = 1000;

function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env.local");
  }
  const env = fs.readFileSync(envPath, "utf8");
  const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
  const anon = env.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m)?.[1]?.trim();
  if (!url || !anon) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
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

async function fetchIds(url, anon, table) {
  const ids = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const res = await fetch(
      `${url}/rest/v1/${table}?select=id&limit=${PAGE}&offset=${from}`,
      {
        headers: {
          ...headers(anon),
          Range: `${from}-${to}`,
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
      throw new Error(`GET ${table} → ${res.status}: ${text.slice(0, 300)}`);
    }
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    ids.push(...chunk.map((r) => r.id).filter(Boolean));
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return ids;
}

async function deleteIds(url, anon, table, ids) {
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const list = chunk.join(",");
    const res = await fetch(
      `${url}/rest/v1/${table}?id=in.(${list})`,
      {
        method: "DELETE",
        headers: headers(anon, "return=minimal"),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DELETE ${table} → ${res.status}: ${text.slice(0, 300)}`);
    }
  }
}

async function nullGroupParents(url, anon) {
  const res = await fetch(`${url}/rest/v1/warehouse_groups?parent_id=not.is.null`, {
    method: "PATCH",
    headers: headers(anon, "return=minimal"),
    body: JSON.stringify({ parent_id: null }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clear group parents → ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("Refusing to wipe warehouse without --yes");
    console.error("Usage: node scripts/clear-warehouse.mjs --yes");
    process.exit(1);
  }
  if (!fs.existsSync(BACKUP)) {
    throw new Error(`Backup missing: ${path.relative(ROOT, BACKUP)}`);
  }

  const { url, anon } = loadEnv();
  console.log("Clearing live warehouse tables (backup kept):");
  console.log(`  ${path.relative(ROOT, BACKUP)}`);

  await nullGroupParents(url, anon);

  const counts = {};
  for (const table of TABLES) {
    process.stdout.write(`  ${table}… `);
    const ids = await fetchIds(url, anon, table);
    if (ids.length) await deleteIds(url, anon, table, ids);
    counts[table] = ids.length;
    console.log(`deleted ${ids.length}`);
  }

  console.log("");
  console.log("Warehouse is empty.");
  console.log(`  ${JSON.stringify(counts)}`);
  console.log("Hard-refresh the app (Ctrl+Shift+R) so local cache does not restore stock.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
