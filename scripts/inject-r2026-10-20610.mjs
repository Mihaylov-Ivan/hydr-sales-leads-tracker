/**
 * Inject Schubert & Salzer proforma R2026.10.20610 into warehouse + financial CSV.
 *
 * - Lots go to N1 - LE Power Clean H2 Production (ELX / project)
 * - Linked to planned expense "Component costs 3/10" (budget envelope; no new expenses)
 * - Writes financial-data-2026-08-25_updated.csv
 *
 * Run: node scripts/inject-r2026-10-20610.mjs
 * Dry:  node scripts/inject-r2026-10-20610.mjs --dry-run
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

const SEED_PATH = path.join(
  root,
  "templates/warehouse-data/r2026-10-20610-seed.json",
);
const CSV_IN = path.join(root, "financial-data-2026-08-25.csv");
const CSV_OUT = path.join(root, "financial-data-2026-08-25_updated.csv");

const HEADERS = [
  "type",
  "project_id",
  "project_name",
  "id",
  "label",
  "amount",
  "amount_ex_vat",
  "vat_rate",
  "percent",
  "due_date",
  "actual_date",
  "milestone_id",
  "created_at",
  "contract_value",
  "contract_signed_date",
  "expenses",
  "expected_profit",
  "max_materials_expense",
  "max_man_hr_expense",
  "opex_value",
  "opex_expense_percent",
  "warranty_years",
  "system_lifetime_years",
  "milestone_kind",
  "milestone_note",
  "month",
  "status",
  "opening_cash",
  "opening_cash_as_of",
  "min_working_capital",
  "prob_cold_lead",
  "prob_hot_lead",
  "prob_under_development",
  "prob_commissioned",
  "fixed_monthly",
  "category",
  "subcategory",
  "warehouse_lot_id",
  "warehouse_item_id",
  "qty",
  "is_maintenance",
  "is_opex",
  "budget_amount",
  "source_sklad",
  "wh_site",
  "wh_slot",
  "event_id",
  "intentional",
  "actor_user_id",
  "actor_name",
  "action",
  "field",
  "old_value",
  "new_value",
  "summary",
  "occurred_at",
  "entity_type",
  "entity_id",
];

function loadEnv() {
  const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function escCell(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function emptyRow() {
  return Object.fromEntries(HEADERS.map((h) => [h, ""]));
}

function rowLine(row) {
  return HEADERS.map((h) => escCell(row[h])).join(",");
}

async function rest(
  url,
  key,
  method,
  pathAndQuery,
  body,
  prefer = "return=representation",
) {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${pathAndQuery} → ${res.status}: ${
        typeof json === "string" ? json : JSON.stringify(json)
      }`,
    );
  }
  return json;
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const seedNote = `seed:${seed.sourceKey}`;
  const receivedAt = seed.orderDate;
  const now = new Date().toISOString();
  const expenseId = seed.linkExpense.id;

  const projects = await rest(
    url,
    key,
    "GET",
    `projects?select=id,name&id=eq.${seed.projectId}`,
  );
  const project = projects?.[0];
  if (!project) throw new Error(`Project not found: ${seed.projectName}`);
  console.log(`Project: ${project.name} (${project.id})`);
  console.log(
    `Link expense: ${seed.linkExpense.label} (${expenseId}) — budget envelope`,
  );

  const existingLots = await rest(
    url,
    key,
    "GET",
    `warehouse_lots?select=id,notes,label&notes=like.*${seed.sourceKey}*`,
  );
  const alreadyInjected = existingLots?.length > 0;
  if (alreadyInjected) {
    console.log(
      `Already injected (${existingLots.length} lots with ${seedNote}). Skipping WH insert.`,
    );
  }

  const lines = seed.lines.filter((l) => l.includeInWarehouse !== false);
  const planned = [];

  for (const line of lines) {
    const qty = Number(line.qty) || 0;
    if (!(qty > 0)) continue;
    const unitInc = Number(line.unitCostIncVat);
    const unitEx = Number(line.unitCostExVat);
    planned.push({
      line,
      qty,
      unitInc,
      unitEx,
      totalInc: roundMoney(qty * unitInc),
      totalEx: roundMoney(qty * unitEx),
      itemId: randomUUID(),
      lotId: randomUUID(),
      balanceId: randomUUID(),
      movementId: randomUUID(),
      label: `${line.name} [${line.sku}]`,
      expenseId,
    });
  }

  const totalIncAll = roundMoney(planned.reduce((s, p) => s + p.totalInc, 0));
  console.log(
    `Lines: ${planned.length} · total €${totalIncAll} · date ${receivedAt}`,
  );
  for (const p of planned) {
    console.log(`  - ${p.qty} × ${p.line.sku} @ ${p.unitInc} = ${p.totalInc}`);
  }

  if (!dryRun && !alreadyInjected) {
    for (const p of planned) {
      const sku = (p.line.sku || "").trim();
      if (!sku) continue;
      const found = await rest(
        url,
        key,
        "GET",
        `warehouse_items?select=id,sku&sku=eq.${encodeURIComponent(sku)}&limit=1`,
      );
      if (found?.[0]?.id) {
        p.itemId = found[0].id;
        p.itemMatched = true;
      }
    }

    const newItems = planned
      .filter((p) => !p.itemMatched)
      .map((p) => ({
        id: p.itemId,
        name: p.line.name,
        sku: p.line.sku || null,
        barcode: null,
        unit: p.line.unit || "pcs",
        default_material_kind: "materials",
        group_id: null,
        min_qty: null,
        max_qty: null,
        tracks_serial: false,
        preferred_supplier: seed.supplier,
        system_tags: ["n1", "schubert-salzer", seed.sourceKey],
        legacy_group_name: null,
        name_original: null,
        created_at: now,
      }));

    if (newItems.length) {
      await rest(url, key, "POST", "warehouse_items", newItems);
      console.log(`Created ${newItems.length} catalog items`);
    }

    const lots = planned.map((p) => ({
      id: p.lotId,
      item_id: p.itemId,
      qty_received: p.qty,
      unit_cost_inc_vat: p.unitInc,
      unit_cost_ex_vat: p.unitEx,
      received_at: receivedAt,
      purchase_project_id: project.id,
      expense_id: expenseId,
      category: "materials",
      subcategory: null,
      supplier: seed.supplier,
      notes: `${seedNote}; ${seed.documentNumber}; linked→${seed.linkExpense.label}; ${seed.notes}`,
      label: p.label,
      source_sklad: null,
      created_at: now,
    }));
    await rest(url, key, "POST", "warehouse_lots", lots);
    console.log(`Created ${lots.length} lots → expense ${expenseId}`);

    const balances = planned.map((p) => ({
      id: p.balanceId,
      lot_id: p.lotId,
      location_type: "project",
      site: seed.site || "ELX",
      slot: "project",
      project_id: project.id,
      qty: p.qty,
      source_sklad: null,
    }));
    await rest(url, key, "POST", "warehouse_balances", balances);
    console.log(`Created ${balances.length} balances @ ${seed.site}/project`);

    const movements = planned.map((p) => ({
      id: p.movementId,
      lot_id: p.lotId,
      action: "receive",
      qty: p.qty,
      from_location_type: null,
      from_project_id: null,
      from_site: null,
      from_slot: null,
      to_location_type: "project",
      to_project_id: project.id,
      to_site: seed.site || "ELX",
      to_slot: "project",
      occurred_at: `${receivedAt}T12:00:00.000Z`,
      note: seedNote,
    }));
    await rest(url, key, "POST", "warehouse_movements", movements);
    console.log(`Created ${movements.length} receive movements`);
  } else if (dryRun) {
    console.log("Dry run — skipped Supabase writes");
  }

  // Reload from DB if already present
  let csvPlanned = planned;
  if (alreadyInjected && !dryRun) {
    const lots = await rest(
      url,
      key,
      "GET",
      `warehouse_lots?select=id,item_id,qty_received,unit_cost_inc_vat,unit_cost_ex_vat,expense_id,label,notes,received_at,created_at&notes=like.*${seed.sourceKey}*&order=created_at.asc`,
    );
    csvPlanned = (lots || []).map((lot) => ({
      qty: Number(lot.qty_received),
      unitInc: Number(lot.unit_cost_inc_vat),
      unitEx: Number(lot.unit_cost_ex_vat),
      totalInc: roundMoney(
        Number(lot.qty_received) * Number(lot.unit_cost_inc_vat),
      ),
      itemId: lot.item_id,
      lotId: lot.id,
      expenseId: lot.expense_id || expenseId,
      label: lot.label || "R2026 line",
      line: { sku: "", vatPercent: 0 },
    }));
  }

  if (!fs.existsSync(CSV_IN)) throw new Error(`Missing ${CSV_IN}`);
  let csvText = fs.readFileSync(CSV_IN, "utf8");
  const alreadyInCsv =
    csvText.includes(seed.documentNumber) || csvText.includes(seedNote);

  const extra = [];
  if (!alreadyInCsv) {
    for (const p of csvPlanned) {
      const vatRate = "0";
      const lot = emptyRow();
      lot.type = "warehouse_lot";
      lot.project_id = project.id;
      lot.project_name = project.name;
      lot.id = p.lotId;
      lot.label = p.label;
      lot.amount = String(p.unitInc);
      lot.amount_ex_vat = String(p.unitEx);
      lot.vat_rate = vatRate;
      lot.due_date = receivedAt;
      lot.created_at = now;
      lot.category = "materials";
      lot.warehouse_lot_id = p.lotId;
      lot.warehouse_item_id = p.itemId;
      lot.qty = String(p.qty);
      lot.entity_id = expenseId;
      lot.wh_site = seed.site || "ELX";
      lot.wh_slot = "project";
      lot.summary = seedNote;
      extra.push(rowLine(lot));
    }

    const hist = emptyRow();
    hist.type = "history";
    hist.event_id = randomUUID();
    hist.project_id = project.id;
    hist.project_name = project.name;
    hist.intentional = "true";
    hist.actor_name = "inject-r2026-10-20610";
    hist.action = "link";
    hist.summary = `Injected ${seed.documentNumber} WH lots (€${totalIncAll}) linked to ${seed.linkExpense.label}`;
    hist.occurred_at = now;
    hist.entity_type = "expense";
    hist.entity_id = expenseId;
    hist.new_value = String(totalIncAll);
    extra.push(rowLine(hist));
  } else {
    console.log("CSV already contains document marker — no new rows");
  }

  const out =
    csvText.replace(/\s*$/, "") +
    (extra.length ? "\n" + extra.join("\n") + "\n" : "\n");

  if (dryRun) {
    console.log(`Dry run — would write ${extra.length} CSV rows to ${CSV_OUT}`);
  } else {
    fs.writeFileSync(CSV_OUT, out, "utf8");
    console.log(`Wrote ${CSV_OUT} (+${extra.length} rows)`);
  }

  console.log("Done.");
  console.log(
    "Next: hard-refresh the app for WH lots; import financial-data-2026-08-25_updated.csv if you want the lot snapshots in the CSV financial DB. Expense stays as planned Component costs 3/10 (lots draw against it).",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
