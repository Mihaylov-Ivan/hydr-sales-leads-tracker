import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { SebestoynostSeed } from "@/lib/manufacturing-bom-seed";

export const runtime = "nodejs";

const SEED_PATH = path.join(
  process.cwd(),
  "templates",
  "warehouse-data",
  "sebestoynost-500kw-z-series-seed.json",
);

export async function GET() {
  try {
    const raw = await readFile(SEED_PATH, "utf8");
    const seed = JSON.parse(raw) as SebestoynostSeed;
    if (!seed?.modules?.length || !seed.project?.name) {
      return NextResponse.json(
        { ok: false, error: "Seed file is missing modules or project" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, seed });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Sebestoynost seed load failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
