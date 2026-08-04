/**
 * Fix payment/expense dates after gantt linking:
 * - Restore original standalone due dates (ISO)
 * - Sync linked gantt deadline dates to those dues
 * - actual/received/paid = expected only when expected <= today
 * - Skip changing Titan payment link state (still no milestone)
 *
 * Usage: node scripts/fix-payment-dates.mjs
 */
import fs from "fs";
import crypto from "crypto";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)[1].trim();
const anon = env.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m)[1].trim();
const headers = {
  apikey: anon,
  Authorization: "Bearer " + anon,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const CSV_PATH =
  "templates/finance-import/financial-data-2026-08-04 (45).csv";

/** Today per project context */
const TODAY = "2026-08-04";

/** Original standalone due dates (before link script overwrote with gantt dates).
 *  Typo corrections kept: UBE FAC→2027-12-01, Interbudkomplex SAT→2027-08-20, ZF FAC→2028-02-01.
 */
const ORIGINAL_DUE = {
  // Ceramika
  "e958928b-c99e-41c6-b775-fec40133940f": "2026-09-01",
  "c62eb586-55e8-46ed-92b4-f4c94fce2101": "2026-10-01",
  "06b13f4a-d616-40b6-ade0-0e722c362739": "2026-10-01",
  "ef69783f-ca3d-4343-b247-67de93ef3e3e": "2027-03-01",
  "222215cc-2f74-4182-978f-d1fe695239be": "2027-04-01",
  "d5345d92-e32b-4c20-a81f-42424449e8b1": "2027-05-01",
  // Titan
  "d3cfda1c-40fb-493d-bd28-df49a79609a9": "2026-11-01",
  // Brikel
  "8721bc66-6990-4b7a-ab00-21e850485a2d": "2025-12-01",
  "67cce710-382e-42ba-9ee1-1c8f46204c1d": "2026-04-01",
  "93ea57f6-309c-4de7-8a35-4190adbcf655": "2026-08-01",
  // FBK
  "40bcc400-c787-439f-b44e-94780173a38d": "2026-02-02",
  "c2d90f8f-2ea1-4189-9841-11f68402c709": "2027-10-01",
  "55229b88-f6e8-41dc-befd-207de2979672": "2027-10-22",
  "26e0931e-d33b-4520-b7dc-1ca5178a5aa2": "2027-11-30",
  // Metlen
  "63817e9e-4e22-4a31-8f35-0114b16b6dc3": "2026-12-01",
  "886ff57b-51e6-433f-b34a-c714e5c3f1ef": "2027-02-01",
  "887ac5a9-3073-43ef-9688-66e22a2fd3b3": "2027-03-15",
  "58c4a1c7-3086-46da-bc44-053f17153724": "2028-01-04",
  "e041b483-cfeb-4880-b12f-4ef10cd9a88f": "2028-05-15",
  "8eaf4be8-78b7-4185-9713-1a7a443c1faf": "2028-07-04",
  "0a64471c-0ad5-474c-8660-b37494840d4b": "2028-11-04",
  "420458ea-c227-49ec-895f-a2f3fdba7f9e": "2028-12-05",
  // VW Poznan
  "c19e1e38-b205-4dd6-9e85-0d165fce8f9b": "2026-11-05",
  "d178e4ae-21aa-46a1-bd30-baf09edb9579": "2027-01-01",
  "831a3573-6556-4c05-b1aa-5530cbbbbe04": "2027-02-01",
  "ee3cbd14-2253-4414-92db-b995067b806a": "2027-05-03",
  "3f508ea1-2e44-4eba-9a1a-9cbd9fbc837d": "2027-07-01",
  "5a47686d-7987-4cbd-809f-289c6a0d048d": "2027-08-02",
  // UBE (FAC typo fixed to 2027-12-01)
  "388aded7-4ee4-474e-967a-bcc213e38673": "2026-12-07",
  "5bb3b285-aca2-454c-99e7-b802f347a7d9": "2027-03-01",
  "022eb4e2-3e3e-4a53-86b5-f387a846f0ac": "2027-05-03",
  "e37f46d5-f777-4e19-9f59-14ff9a68ed52": "2027-10-01",
  "ee2ed293-e128-41c8-8b84-050f223c97f4": "2027-11-01",
  "90d63ae5-aed5-40dc-8ccc-4165f746d366": "2027-12-01",
  // Ushgorod
  "be8ceeae-fa0c-4ec1-b984-78871f4adc6c": "2026-11-02",
  "b930e09d-6200-431c-b0c1-1d65b78edd52": "2027-03-01",
  "79141cf6-d285-4ca3-9d21-b4a3da79b769": "2027-04-01",
  "6514fae8-2d42-4618-adab-dfa96b740af0": "2028-03-01",
  "67f3cfe7-6fb5-48b0-9990-3d6945ce9ad1": "2028-04-03",
  "6c999119-d4eb-408f-97ac-45125c46e790": "2028-05-01",
  // Burkhard
  "326ca741-fa4e-4575-b986-7fb39e6ef994": "2026-10-05",
  "7d2f4ede-2ef3-4aeb-9795-521f1002c32a": "2026-11-04",
  "c8932c18-abeb-4977-8eda-742ee9bb414b": "2026-12-01",
  "ff7350bb-b95b-43a9-89ce-74803a0815de": "2027-02-01",
  "2b8d8e31-7619-44c8-a61a-e8391b11395b": "2027-03-01",
  "38cafe2b-3c7a-4240-89c3-0f6fa92b2b48": "2027-04-01",
  // Interbudkomplex (SAT typo fixed)
  "efd139f0-899b-482a-aba2-77e6adb9b95a": "2027-03-20",
  "8eebac6b-3707-4c26-ab81-3b6527b7d703": "2027-04-20",
  "318478ac-9dd7-475e-a67f-b4f3388181f1": "2027-05-20",
  "3c078b34-0b35-46e8-9b44-57538f1f8479": "2027-07-20",
  "6f1d9b60-8938-48af-8e3c-45a545791cb5": "2027-08-20",
  "798883ba-7425-407d-bfb7-6e35379c9a36": "2027-08-20",
  // VW Vzesnya
  "801b7f28-4ff4-49c6-90db-4ebbf6cd3b4f": "2025-10-15",
  "82cf8ce9-c50c-40cb-9b55-68484c3e97f9": "2026-02-01",
  "44007203-e843-4975-9790-7ba209b55362": "2026-04-01",
  // ZF (FAC typo fixed)
  "560bd2da-da9a-4cec-885a-d5b8d7249203": "2027-02-01",
  "0cdbccb0-3f08-4900-be20-4b0fc4c1acf1": "2027-05-03",
  "d42f6db7-738e-4609-b85d-10355feac880": "2027-07-01",
  "57d0dbc4-a1aa-4cc5-ba27-0008332a5939": "2027-12-01",
  "a954aa9a-afe5-44fd-b59d-75d96427e71b": "2028-01-01",
  "291e08f4-d42b-4616-9b88-6738143b441c": "2028-02-01",
  // N1
  "dbcb8424-d49c-47e4-adf3-e5ebebbd619b": "2026-05-01",
  "2d1a4a07-a375-45e5-9062-404a2fb2fc16": "2026-12-01",
  "30f118af-2048-45e2-af2e-f229f96fbd82": "2027-05-01",
  "1e1333d0-7088-4cfc-bd97-ed525c929d63": "2027-06-04",
  // Inver
  "8c366f05-6f66-4e5b-a1e6-ac1717591f38": "2026-11-02",
  "2a633a59-9135-4b4c-9dec-e465823bb5ec": "2027-03-01",
  "cd9ef615-33ec-4e49-b103-e9c37fc252b6": "2027-04-01",
  "bbeeca8d-c96a-4d73-ad55-67718acf0041": "2028-03-04",
  "afbe35fb-2415-4c2a-a6fd-e43b5eef75d1": "2028-04-03",
  "32561095-5614-46f8-b670-bbc7e5669564": "2028-05-01",
  // Bestway
  "15391957-9d1c-4fbe-abc2-e06dd5f3eabc": "2026-09-10",
  "10685556-91d1-4d36-b98a-03ccdcaffb1a": "2026-09-20",
  "a1a4f547-711a-4d72-bdae-f68b51795e84": "2026-09-30",
  "1b11506b-198a-4197-b87b-a39b1688751f": "2026-11-02",
  "b6e279e5-f325-4a75-88a9-5c44e9af855e": "2026-12-01",
  "95dbd655-6f11-44d3-9145-35b250d48e0f": "2027-01-10",
};

/** Expense original dues (normalize + paid-if-past). */
const EXPENSE_DUE = {
  "818421ec-9751-4f5d-ac9b-d27369f69141": "2026-10-01",
  "502541f0-e139-4a08-bb59-82acf067685b": "2026-10-01",
  "4816c22f-56f4-4981-a4c8-8018cce3fb99": "2026-04-01",
  "5ea716af-7b71-4ffd-bc13-cc2fd35d81ba": "2026-07-15",
  "fb169941-66bd-464b-9dc2-2463f5bcbb11": "2026-09-01",
  "7201c602-0e4a-4a54-96b7-f99ab1312457": "2026-12-01",
  "df60cf16-be2b-449e-8941-39e011ed5aae": "2026-07-01",
  "f04d93d4-fb64-4e21-b009-81842c5d8d59": "2026-03-01",
  "5db7b389-0acb-4e22-9852-653d94ccddb6": "2026-08-15",
  "b0751a68-a23c-4e96-9a22-834dd84b194c": "2026-07-01",
  "391f3365-ebea-4772-bb17-c98780934325": "2026-08-01",
  "62d32287-3057-4ff4-9b28-4e54b1053817": "2026-09-01",
  "86e56eeb-2323-4a92-9ee8-beaed85718cc": "2026-10-01",
  "03d432a5-9991-4cd3-bae2-2b0e5f3ae30f": "2026-11-01",
  "ea878e3b-730d-4173-a4c1-15dee03ad6af": "2026-12-01",
  "6e8f2f6d-0756-49e3-81e0-7511a9cf9311": "2027-01-01",
  "c19ded40-e0d2-465e-8de5-a369a8859c03": "2027-02-01",
  "2e99bd74-b0af-4609-bd00-dad8b4206e8e": "2027-03-01",
  "4fb98863-1ee7-411c-8cc4-1e5f7b3d7c82": "2027-04-01",
  "18168f15-4f6d-4e11-902f-b013ad3230a0": "2026-08-15",
};

function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function actualFor(due) {
  return due <= TODAY ? due : "";
}

const text = fs.readFileSync(CSV_PATH, "utf8");
const lines = text.split(/\r?\n/);
const header = lines[0].split(",");
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

/** milestone_id → preferred due date (from payments that link to it) */
const milestoneDates = new Map();
/** For Metlen Engineering done — give it its own deadline */
const METLEN_ENG_DONE_PAYMENT = "887ac5a9-3073-43ef-9688-66e22a2fd3b3";
const METLEN_DESIGN_COMPLETE = "438dce7c-76d7-4aa0-b4f8-c7d04a22af19";
const METLEN_PROJECT_COMPLETE = "a0ed2b1c-ef92-4c53-ae52-d700437dc7f2";
const METLEN_SAT2_PAYMENT = "0a64471c-0ad5-474c-8660-b37494840d4b";
const METLEN_FAC_PAYMENT = "420458ea-c227-49ec-895f-a2f3fdba7f9e";
const NEW_METLEN_ENG_DEADLINE = crypto.randomUUID();

let report = { payments: 0, expenses: 0, actualSet: 0, actualCleared: 0 };

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const cols = lines[i].split(",");
  const type = cols[idx.type];
  const id = cols[idx.id];

  if (type === "payment") {
    const due = ORIGINAL_DUE[id] || parseDate(cols[idx.due_date]);
    if (!due) continue;
    cols[idx.due_date] = due;
    const act = actualFor(due);
    cols[idx.actual_date] = act;
    if (act) report.actualSet += 1;
    else report.actualCleared += 1;

    let mid = (cols[idx.milestone_id] || "").trim();

    // Metlen: Engineering done gets its own Engineering Complete deadline
    if (id === METLEN_ENG_DONE_PAYMENT) {
      mid = NEW_METLEN_ENG_DEADLINE;
      cols[idx.milestone_id] = mid;
    }
    // Metlen: SAT 2/2 and FAC shared Project Complete — FAC keeps it; SAT 2/2
    // stays on Project Complete only if same date; they differ so FAC owns
    // Project Complete @ 12/05, SAT 2/2 needs Second handover renamed date.
    // Keep SAT 2/2 on Project Complete temporarily then set date from FAC;
    // re-link SAT 2/2 to Second 4MW Handover — same id currently. Split by
    // giving SAT 2/2 the handover id and FAC a new Project Complete? Simpler:
    // use Project Complete for FAC @ 12/05; SAT 2/2 → Second FAT is wrong.
    // Link SAT 2/2 to existing Second 4MW Handover (same as Project Complete id).
    // They ARE the same deadline in Metlen seed. Update to FAC date for FAC
    // payment; for SAT 2/2 use activity link — fetch later.
    // For now: if SAT 2/2, we'll patch milestone date preference by payment
    // order — FAC wins for shared id. SAT 2/2 date stored on payment due_date;
    // linked expected will follow FAC date unless we split.
    // Create a Second 4MW SAT Complete deadline for SAT 2/2.
    // (handled below after loop if needed)

    if (mid) {
      // Prefer earlier date if multiple payments share a milestone, except FAC wins for project-complete
      const prev = milestoneDates.get(mid);
      if (!prev) milestoneDates.set(mid, due);
      else if (id === METLEN_FAC_PAYMENT) milestoneDates.set(mid, due);
      else if (id !== METLEN_SAT2_PAYMENT && due < prev)
        milestoneDates.set(mid, due);
    }

    lines[i] = cols.join(",");
    report.payments += 1;
  }

  if (type === "expense") {
    const due = EXPENSE_DUE[id] || parseDate(cols[idx.due_date]);
    if (!due) continue;
    cols[idx.due_date] = due;
    const act = actualFor(due);
    cols[idx.actual_date] = act;
    if (act) report.actualSet += 1;
    else report.actualCleared += 1;
    lines[i] = cols.join(",");
    report.expenses += 1;
  }
}

// Metlen Engineering Complete deadline + SAT 2/2 dedicated deadline
const NEW_METLEN_SAT2_DEADLINE = crypto.randomUUID();

// Re-scan to set SAT 2/2 milestone
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const cols = lines[i].split(",");
  if (cols[idx.type] !== "payment") continue;
  if (cols[idx.id] === METLEN_SAT2_PAYMENT) {
    cols[idx.milestone_id] = NEW_METLEN_SAT2_DEADLINE;
    milestoneDates.set(NEW_METLEN_SAT2_DEADLINE, ORIGINAL_DUE[METLEN_SAT2_PAYMENT]);
    // Remove SAT2 from forcing Project Complete date
    milestoneDates.set(
      METLEN_PROJECT_COMPLETE,
      ORIGINAL_DUE[METLEN_FAC_PAYMENT],
    );
    lines[i] = cols.join(",");
  }
  if (cols[idx.id] === METLEN_ENG_DONE_PAYMENT) {
    milestoneDates.set(NEW_METLEN_ENG_DEADLINE, ORIGINAL_DUE[METLEN_ENG_DONE_PAYMENT]);
  }
  if (cols[idx.id] === "886ff57b-51e6-433f-b34a-c714e5c3f1ef") {
    // Engineering approval → Design Complete @ 2027-02-01
    milestoneDates.set(METLEN_DESIGN_COMPLETE, "2027-02-01");
  }
}

fs.writeFileSync(CSV_PATH, lines.join("\n"), "utf8");

// Sync gantt deadline dates + insert Metlen extras
async function patchDeadline(id, date) {
  const r = await fetch(
    `${url}/rest/v1/project_gantt_deadlines?id=eq.${id}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ date }),
    },
  );
  if (!r.ok) throw new Error(`patch ${id}: ${r.status} ${await r.text()}`);
}

async function insertDeadline(row) {
  const r = await fetch(`${url}/rest/v1/project_gantt_deadlines`, {
    method: "POST",
    headers,
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`insert deadline: ${r.status} ${await r.text()}`);
  return r.json();
}

const METLEN_PROJECT = "140dfb68-fb1b-482c-8ba4-34d6c389028a";
const METLEN_PHASE_COMMON = "7704f672-6305-4a72-8ce6-9d9ec83023d0";
const METLEN_PHASE_SECOND = "4fc97d0b-4fa3-4ef8-a358-c7f392baee07";

await insertDeadline({
  id: NEW_METLEN_ENG_DEADLINE,
  project_id: METLEN_PROJECT,
  phase_id: METLEN_PHASE_COMMON,
  name: "Engineering Complete",
  date: "2027-03-15",
  wbs: "1.4",
  owner: "Hydrogenera",
});

await insertDeadline({
  id: NEW_METLEN_SAT2_DEADLINE,
  project_id: METLEN_PROJECT,
  phase_id: METLEN_PHASE_SECOND,
  name: "Second 4MW SAT Complete",
  date: "2028-11-04",
  wbs: "3.9a",
  owner: "Hydrogenera / Metlen",
});

let patched = 0;
for (const [mid, date] of milestoneDates) {
  if (mid === NEW_METLEN_ENG_DEADLINE || mid === NEW_METLEN_SAT2_DEADLINE) {
    patched += 1;
    continue; // already inserted with correct date
  }
  await patchDeadline(mid, date);
  patched += 1;
}

console.log(
  JSON.stringify(
    {
      ...report,
      ganttDeadlinesSynced: patched,
      newMetlenDeadlines: [NEW_METLEN_ENG_DEADLINE, NEW_METLEN_SAT2_DEADLINE],
      today: TODAY,
    },
    null,
    2,
  ),
);
