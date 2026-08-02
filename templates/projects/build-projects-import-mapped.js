const XLSX = require("xlsx");
const path = require("path");

const srcPath = path.join(__dirname, "deals-22614642-11.xlsx");
const outPath = path.join(__dirname, "projects-import-mapped.xlsx");

const deals = XLSX.utils.sheet_to_json(
  XLSX.readFile(srcPath).Sheets["deal list"],
  { defval: null },
);

const COUNTRY_HINTS = [
  {
    re: /\bpoland\b|\bpolsk|\bwarsaw\b|\bkrakow\b|\bgda[nń]sk\b/i,
    country: "Poland",
  },
  { re: /\bportugal\b|\bporto\b|\blisbon\b/i, country: "Portugal" },
  {
    re: /\bbulgaria\b|\bsofia\b|\bzlatna panega\b/i,
    country: "Bulgaria",
  },
  {
    re: /\bgermany\b|\bgerman\b|\bdeutschland\b|\bberlin\b|\bmunich\b/i,
    country: "Germany",
  },
  {
    re: /\bitaly\b|\bitalian\b|\bmilan\b|\brome\b|\bbolzano\b/i,
    country: "Italy",
  },
  { re: /\bfrance\b|\bfrench\b|\bparis\b/i, country: "France" },
  { re: /\bspain\b|\bspanish\b|\bmadrid\b/i, country: "Spain" },
  { re: /\baustria\b|\bvienna\b/i, country: "Austria" },
  { re: /\bswitzerland\b|\bswiss\b|\bmonaco\b/i, country: "Switzerland" },
  { re: /\bserbia\b|\bbelgrade\b/i, country: "Serbia" },
  { re: /\bromania\b|\bbucharest\b/i, country: "Romania" },
  { re: /\bnetherlands\b|\bdutch\b/i, country: "Netherlands" },
  { re: /\bunited kingdom\b|\blondon\b/i, country: "United Kingdom" },
  { re: /\bunited states\b|\bUSA\b/i, country: "United States" },
  { re: /\bgreece\b|\bathens\b/i, country: "Greece" },
  { re: /\bczech\b|\bprague\b/i, country: "Czechia" },
  { re: /\bhungary\b|\bbudapest\b/i, country: "Hungary" },
  { re: /\bbelgium\b/i, country: "Belgium" },
];

function asDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return null;
}

function asIso(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(normalized);
  if (!isNaN(d)) return d.toISOString();
  const day = asDate(v);
  return day ? `${day}T12:00:00.000Z` : null;
}

function cleanTitle(title) {
  return String(title || "")
    .replace(/^\[Sample\]\s*/i, "")
    .replace(/\s+deal\b/gi, "")
    .replace(/\s+lead\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function guessSeries(title, product) {
  const t = `${title || ""} ${product || ""}`;
  if (/\bE[\s-]?Series\b/i.test(t) || /\bGSH\d+/i.test(t)) return "E Series";
  if (/\bZ[\s-]?Series\b/i.test(t) || /\bZ series\b/i.test(t)) return "Z Series";
  if (/\bcustom\b/i.test(t) || /\bPEM\b/i.test(t) || /\bAEM\b/i.test(t)) {
    return "Custom";
  }
  return "Z Series";
}

function seriesWasDefaulted(title, product) {
  const t = `${title || ""} ${product || ""}`;
  return !/\b[ZE][\s-]?Series\b/i.test(t) && !/\bGSH\d+/i.test(t);
}

function guessSizeKw(title, product) {
  const t = `${title || ""} ${product || ""}`;
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*MW\b/i);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 1000);
  m = t.match(/(\d+(?:[.,]\d+)?)\s*kW\b/i);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")));
  return null;
}

function guessCountry(title, org) {
  const blob = `${title || ""} ${org || ""}`;
  for (const h of COUNTRY_HINTS) {
    if (h.re.test(blob)) return h.country;
  }
  return "";
}

function guessMarket(pipeline, title, product) {
  const t = `${title || ""} ${product || ""}`.toLowerCase();
  if (pipeline === "R&D") return "Funding";
  if (/tender|конкурс/i.test(t)) return "Tenders";
  if (/cement|цимент/i.test(t)) return "Cement";
  if (/burner|oxy|glass|boiler/i.test(t)) return "Burner Optimisation";
  if (/power plant|electrownie|utility|grid/i.test(t)) return "Power Plants";
  return "Clean H2";
}

function mapStage(pipedriveStage, status) {
  if (status === "Lost") return "cancelled";
  if (status === "Won") return "commissioned";
  switch (pipedriveStage) {
    case "Lead":
    case "First Meeting":
    case "Contact made":
    case "On hold":
      return "cold-lead";
    case "Qualified":
      return "hot-lead";
    case "Concrete opportunity":
    case "Offer":
    case "Negotiations":
    case "Contract preparation":
      return "under-development";
    default:
      return "cold-lead";
  }
}

function pickLastContact(row) {
  const candidates = [
    asDate(row["Deal - Last activity date"]),
    asDate(row["Deal - Last email sent"]),
    asDate(row["Deal - Last email received"]),
    asDate(row["Deal - Update time"]),
    asDate(row["Deal - Deal created"]),
  ].filter(Boolean);
  candidates.sort();
  return (
    candidates[candidates.length - 1] || new Date().toISOString().slice(0, 10)
  );
}

const mapped = deals.map((row) => {
  const title = row["Deal - Title"] || "";
  const isSample = /\[Sample\]/i.test(String(title));
  const status = row["Deal - Status"] || "";
  const pdStage = row["Deal - Stage"] || "";
  const org = (row["Deal - Organization"] || "").toString().trim();
  const product = row["Deal - Product name"] || "";
  const pipeline = row["Deal - Pipeline"] || "";
  const owner = row["Deal - Owner"] || "";
  const contact = (row["Deal - Contact person"] || "").toString().trim();

  const stage = mapStage(pdStage, status);
  const sizeGuess = guessSizeKw(title, product);
  const sizeKw = sizeGuess != null ? sizeGuess : 100;
  const series = guessSeries(title, product);
  const seriesDefaulted = seriesWasDefaulted(title, product);
  const country = guessCountry(title, org);
  const market = guessMarket(pipeline, title, product);
  const name = cleanTitle(title) || org || `Deal ${row["Deal - ID"]}`;
  const client = org || name;
  const created = asIso(row["Deal - Deal created"]) || new Date().toISOString();
  const lastContact = pickLastContact(row);

  const notes = [];
  if (isSample) notes.push("SAMPLE — exclude unless wanted");
  if (!org) notes.push("client missing — used title as client");
  if (!country) notes.push("country UNKNOWN — fill before import");
  else notes.push("country guessed from title/org");
  if (sizeGuess == null) notes.push("size_kw PLACEHOLDER 100 — fill real kW");
  else notes.push("size_kw parsed from title/product");
  if (seriesDefaulted) notes.push("series defaulted to Z Series — confirm");
  if (pipeline === "R&D") notes.push("R&D pipeline → market Funding (confirm)");
  if (status === "Open" && pdStage === "On hold") {
    notes.push("On hold → cold-lead (confirm)");
  }
  if (status === "Won") notes.push("Won → commissioned");
  if (status === "Lost") notes.push("Lost → cancelled");
  if (!contact) notes.push("no Pipedrive contact person");
  notes.push(`Pipedrive stage "${pdStage}" / status "${status}"`);

  let include = "N";
  if (!isSample && (status === "Open" || status === "Won")) include = "Y";
  if (!isSample && status === "Lost") include = "REVIEW";

  const confidence =
    country && sizeGuess != null && !seriesDefaulted
      ? "high"
      : country || sizeGuess != null
        ? "medium"
        : "low";

  const value = row["Deal - Value"];
  const currency = row["Deal - Currency of Value"] || "";
  const descParts = [];
  if (value != null && Number(value) > 0) {
    descParts.push(
      `Pipedrive deal value: ${Number(value).toLocaleString()} ${currency}`.trim(),
    );
  }
  if (row["Deal - Probability"] != null && row["Deal - Probability"] !== "") {
    descParts.push(`Pipedrive probability: ${row["Deal - Probability"]}%`);
  }
  if (pipeline) descParts.push(`Pipeline: ${pipeline}`);
  if (pdStage) descParts.push(`Pipedrive stage: ${pdStage}`);
  if (status === "Lost" && row["Deal - Lost reason"]) {
    descParts.push(`Lost reason: ${row["Deal - Lost reason"]}`);
  }
  if (product) descParts.push(`Product: ${product}`);
  descParts.push(`Imported from Pipedrive deal #${row["Deal - ID"]}.`);

  return {
    include_in_import: include,
    review_confidence: confidence,
    review_notes: notes.join(" · "),

    name,
    client,
    country,
    city: "",
    series,
    market,
    size_kw: sizeKw,
    stage,
    base_description: descParts.join(" "),
    lead_user_id: "",
    lead_user_name_suggested: owner,
    last_client_contact_at: lastContact,
    email_reminder_days: 7,
    email_reminder_enabled: status === "Open" ? "TRUE" : "FALSE",
    created_at: created,

    contact_name: contact,
    contact_email: "",
    contact_phone: "",
    contact_position: "",

    pipedrive_deal_id: row["Deal - ID"],
    pipedrive_title: title,
    pipedrive_stage: pdStage,
    pipedrive_status: status,
    pipedrive_pipeline: pipeline,
    pipedrive_owner: owner,
    pipedrive_organization: org,
    pipedrive_contact_person: contact,
    pipedrive_value: value,
    pipedrive_currency: currency,
    pipedrive_probability: row["Deal - Probability"],
    pipedrive_product_name: product,
    pipedrive_lost_reason: row["Deal - Lost reason"] || "",
    pipedrive_deal_created: row["Deal - Deal created"],
    pipedrive_last_activity_date: row["Deal - Last activity date"],
    pipedrive_last_email_sent: row["Deal - Last email sent"],
    pipedrive_last_email_received: row["Deal - Last email received"],
    pipedrive_expected_close_date: row["Deal - Expected close date"],
    pipedrive_won_time: row["Deal - Won time"],
    pipedrive_lost_time: row["Deal - Lost time"],
  };
});

const includeOrder = { Y: 0, REVIEW: 1, N: 2 };
mapped.sort((a, b) => {
  const ia = includeOrder[a.include_in_import] ?? 9;
  const ib = includeOrder[b.include_in_import] ?? 9;
  if (ia !== ib) return ia - ib;
  return String(a.name).localeCompare(String(b.name));
});

const legend = [
  {
    section: "How to use",
    detail:
      "Edit this workbook, set include_in_import to Y for rows you want imported, fix fields called out in review_notes (country, city, size_kw, series, market, stage, lead_user_id), then we can load Y rows into Supabase projects (+ optional project_contacts).",
  },
  {
    section: "include_in_import",
    detail:
      "Y = suggested import (Open + Won, non-sample). REVIEW = Lost deals kept for history — flip to Y if you want them as cancelled. N = sample / skip.",
  },
  {
    section: "projects columns (Supabase)",
    detail:
      "name, client, country, city, series, market, size_kw, stage, base_description, lead_user_id, last_client_contact_at, email_reminder_days, email_reminder_enabled, created_at. id is generated on insert.",
  },
  {
    section: "Allowed series",
    detail: "Z Series | E Series | Custom",
  },
  {
    section: "Allowed market",
    detail:
      "Cement | Power Plants | Funding | Clean H2 | Burner Optimisation | Tenders",
  },
  {
    section: "Allowed stage",
    detail:
      "cold-lead | hot-lead | under-development | commissioned | cancelled",
  },
  {
    section: "Stage mapping (Pipedrive → app)",
    detail:
      "Lost→cancelled; Won→commissioned; Lead/First Meeting/Contact made/On hold→cold-lead; Qualified→hot-lead; Concrete opportunity/Offer/Negotiations/Contract preparation→under-development",
  },
  {
    section: "size_kw",
    detail:
      "Parsed from title/product when possible (e.g. 1 MW → 1000). Otherwise PLACEHOLDER 100 — must be > 0 for DB. Fix before import.",
  },
  {
    section: "country / city",
    detail:
      "country guessed from title/org keywords when possible; otherwise blank. city always blank — fill manually.",
  },
  {
    section: "lead_user_id",
    detail:
      "Blank. Map lead_user_name_suggested (Pipedrive owner) to a team_members.id in the app.",
  },
  {
    section: "contact_*",
    detail:
      "Optional first project_contacts row. Email/phone/position not in Pipedrive export — fill if known.",
  },
  {
    section: "Not imported from this sheet",
    detail:
      "Financials (payments/expenses/milestones), todos, files, comments — add later in-app or separate imports.",
  },
  {
    section: "Counts in this export",
    detail: `Total deals: ${mapped.length}. Suggested Y: ${mapped.filter((r) => r.include_in_import === "Y").length}. REVIEW (lost): ${mapped.filter((r) => r.include_in_import === "REVIEW").length}. N: ${mapped.filter((r) => r.include_in_import === "N").length}.`,
  },
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(mapped);
ws["!cols"] = Object.keys(mapped[0]).map((k) => {
  if (k === "review_notes" || k === "base_description") return { wch: 60 };
  if (k.startsWith("pipedrive_")) return { wch: 18 };
  if (k === "name" || k === "client") return { wch: 28 };
  return { wch: 16 };
});
XLSX.utils.book_append_sheet(wb, ws, "projects_import");

const wsLegend = XLSX.utils.json_to_sheet(legend);
wsLegend["!cols"] = [{ wch: 28 }, { wch: 100 }];
XLSX.utils.book_append_sheet(wb, wsLegend, "mapping_notes");

const stageMap = [
  { pipedrive_status: "Lost", pipedrive_stage: "(any)", app_stage: "cancelled" },
  {
    pipedrive_status: "Won",
    pipedrive_stage: "(any)",
    app_stage: "commissioned",
  },
  { pipedrive_status: "Open", pipedrive_stage: "Lead", app_stage: "cold-lead" },
  {
    pipedrive_status: "Open",
    pipedrive_stage: "First Meeting",
    app_stage: "cold-lead",
  },
  {
    pipedrive_status: "Open",
    pipedrive_stage: "Contact made",
    app_stage: "cold-lead",
  },
  {
    pipedrive_status: "Open",
    pipedrive_stage: "On hold",
    app_stage: "cold-lead",
  },
  {
    pipedrive_status: "Open",
    pipedrive_stage: "Qualified",
    app_stage: "hot-lead",
  },
  {
    pipedrive_status: "Open",
    pipedrive_stage: "Concrete opportunity",
    app_stage: "under-development",
  },
  { pipedrive_status: "Open", pipedrive_stage: "Offer", app_stage: "under-development" },
  {
    pipedrive_status: "Open",
    pipedrive_stage: "Negotiations",
    app_stage: "under-development",
  },
  {
    pipedrive_status: "Open",
    pipedrive_stage: "Contract preparation",
    app_stage: "under-development",
  },
];
const wsStage = XLSX.utils.json_to_sheet(stageMap);
wsStage["!cols"] = [{ wch: 18 }, { wch: 24 }, { wch: 22 }];
XLSX.utils.book_append_sheet(wb, wsStage, "stage_map");

XLSX.writeFile(wb, outPath);
console.log("Wrote", outPath);
console.log("rows", mapped.length);
console.log(
  "Y",
  mapped.filter((r) => r.include_in_import === "Y").length,
);
console.log(
  "REVIEW",
  mapped.filter((r) => r.include_in_import === "REVIEW").length,
);
console.log(
  "N",
  mapped.filter((r) => r.include_in_import === "N").length,
);
console.log(
  "missing country",
  mapped.filter((r) => !r.country).length,
);
console.log(
  "placeholder size",
  mapped.filter((r) => /PLACEHOLDER/.test(r.review_notes)).length,
);
