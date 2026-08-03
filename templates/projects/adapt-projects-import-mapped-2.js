const XLSX = require("xlsx");
const path = require("path");

/**
 * Rebuilds projects-import-mapped-2.xlsx with DB columns only:
 * public.projects (+ optional project_contacts fields).
 */
const v2Path = path.join(__dirname, "projects-import-mapped-2.xlsx");
const v1Path = path.join(__dirname, "projects-import-mapped.xlsx");

const v1rows = XLSX.utils.sheet_to_json(
  XLSX.readFile(v1Path).Sheets["projects_import"],
  { defval: null },
);
const v2rows = XLSX.utils.sheet_to_json(
  XLSX.readFile(v2Path).Sheets["projects_import"],
  { defval: null },
);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+null\b/gi, "")
    .replace(/[^a-z0-9а-я]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\s+null\b/gi, "")
    .replace(/\bnull\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function asDate(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return "";
}

function asIso(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString();
  const s = String(v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  const day = asDate(v);
  return day ? `${day}T12:00:00.000Z` : "";
}

const v1ByName = new Map();
for (const r of v1rows) {
  const key = norm(r.name);
  if (key && !v1ByName.has(key)) v1ByName.set(key, r);
}
for (const r of v1rows) {
  const key = norm(cleanText(r.name));
  if (key && !v1ByName.has(key)) v1ByName.set(key, r);
}

const COUNTRY_HINTS = [
  {
    re: /\bpoland\b|\bpolsk|\bwarsaw\b|\bkrakow\b|\banwil\b/i,
    country: "Poland",
  },
  {
    re: /\bportugal\b|\bporto\b|\blisbon\b|\bengenhar/i,
    country: "Portugal",
  },
  {
    re: /\bbulgaria\b|\bsofia\b|\bzlatna|\bagropolychim\b|\balcomet\b|\bмарица\b/i,
    country: "Bulgaria",
  },
  {
    re: /\bgermany\b|\bgerman\b|\bdeutschland\b|\bberlin\b|\bmunich\b/i,
    country: "Germany",
  },
  {
    re: /\bitaly\b|\bitalian\b|\bmilan\b|\brome\b|\bagenzia nazionale\b/i,
    country: "Italy",
  },
  {
    re: /\bfrance\b|\bfrench\b|\bparis\b|\bair liquide\b/i,
    country: "France",
  },
  {
    re: /\bspain\b|\bspanish\b|\bmadrid\b|\balcort\b/i,
    country: "Spain",
  },
  { re: /\baustria\b|\bvienna\b|\bagrana\b/i, country: "Austria" },
  { re: /\bswitzerland\b|\bswiss\b/i, country: "Switzerland" },
  { re: /\bserbia\b|\bbelgrade\b/i, country: "Serbia" },
  { re: /\bromania\b|\bbucharest\b/i, country: "Romania" },
  { re: /\bnetherlands\b|\bdutch\b/i, country: "Netherlands" },
  {
    re: /\bunited kingdom\b|\blondon\b|\baberdeen\b/i,
    country: "United Kingdom",
  },
  { re: /\bunited states\b|\bUSA\b/i, country: "United States" },
  { re: /\bgreece\b|\bathens\b/i, country: "Greece" },
  { re: /\bczech\b|\bprague\b/i, country: "Czechia" },
  { re: /\bhungary\b|\bbudapest\b/i, country: "Hungary" },
  { re: /\bbelgium\b/i, country: "Belgium" },
  {
    re: /\bcroatia\b|\bzadar\b|\bagencija za ruralni\b/i,
    country: "Croatia",
  },
  { re: /\bnorway\b|\baker solutions\b/i, country: "Norway" },
];

function guessCountry(name, client, v1country) {
  if (
    v1country &&
    String(v1country).trim() &&
    String(v1country) !== "Unknown"
  ) {
    return String(v1country).trim();
  }
  const blob = `${name || ""} ${client || ""}`;
  for (const h of COUNTRY_HINTS) {
    if (h.re.test(blob)) return h.country;
  }
  return "Unknown";
}

const colOrder = [
  "name",
  "client",
  "country",
  "city",
  "series",
  "market",
  "size_kw",
  "stage",
  "base_description",
  "lead_user_id",
  "last_client_contact_at",
  "email_reminder_days",
  "email_reminder_enabled",
  "created_at",
  "cancelled_at",
  "cancellation_reason",
  "contact_name",
  "contact_email",
  "contact_phone",
  "contact_position",
];

const adapted = v2rows.map((row) => {
  const name = cleanText(row.name) || "UNNAMED";
  const client = cleanText(row.client) || name;
  const v1 =
    v1ByName.get(norm(row.name)) ||
    v1ByName.get(norm(name)) ||
    v1ByName.get(norm(cleanText(row.client))) ||
    null;

  const country =
    row.country && row.country !== "Unknown"
      ? String(row.country)
      : guessCountry(name, client, v1?.country);

  const series = row.series || v1?.series || "Z Series";
  const market = row.market || v1?.market || "Clean H2";
  const stage = row.stage || "cold-lead";
  const sizeKw = row.size_kw != null ? Number(row.size_kw) : 10;

  const cancelledAt =
    asIso(row.cancelled_at) ||
    asIso(row.cancell_date) ||
    (stage === "cancelled"
      ? asIso(v1?.pipedrive_lost_time) || asIso(row.created_at)
      : "");

  const lastContact =
    asDate(row.last_client_contact_at) ||
    asDate(v1?.last_client_contact_at) ||
    asDate(row.created_at) ||
    new Date().toISOString().slice(0, 10);

  const createdAt =
    asIso(row.created_at) || asIso(v1?.created_at) || new Date().toISOString();

  const contactName = cleanText(row.contact_name || v1?.contact_name || "");

  const baseDescription =
    cleanText(row.base_description) ||
    cleanText(v1?.base_description) ||
    "Imported from Pipedrive via projects-import-mapped-2.";

  const emailEnabled = !(stage === "cancelled" || stage === "commissioned");

  return {
    name,
    client,
    country,
    city: cleanText(row.city || v1?.city || ""),
    series,
    market,
    size_kw: sizeKw,
    stage,
    base_description: baseDescription,
    lead_user_id: cleanText(row.lead_user_id || ""),
    last_client_contact_at: lastContact,
    email_reminder_days: Number(row.email_reminder_days) || 7,
    email_reminder_enabled: emailEnabled ? "TRUE" : "FALSE",
    created_at: createdAt,
    cancelled_at: cancelledAt,
    cancellation_reason: cleanText(row.cancellation_reason || ""),
    contact_name: contactName,
    contact_email: cleanText(row.contact_email || v1?.contact_email || ""),
    contact_phone: cleanText(row.contact_phone || v1?.contact_phone || ""),
    contact_position: cleanText(
      row.contact_position || v1?.contact_position || "",
    ),
  };
});

adapted.sort((a, b) => {
  if (a.stage !== b.stage) {
    if (a.stage === "cancelled") return 1;
    if (b.stage === "cancelled") return -1;
  }
  return String(a.name).localeCompare(String(b.name));
});

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(adapted, { header: colOrder });
ws["!cols"] = colOrder.map((k) => {
  if (k === "base_description") return { wch: 55 };
  if (k === "name" || k === "client") return { wch: 36 };
  if (k.startsWith("contact_")) return { wch: 22 };
  return { wch: 18 };
});
XLSX.utils.book_append_sheet(wb, ws, "projects_import");
XLSX.writeFile(wb, v2Path);

console.log("Wrote", v2Path);
console.log("rows", adapted.length);
console.log("cols:", colOrder.join(", "));
