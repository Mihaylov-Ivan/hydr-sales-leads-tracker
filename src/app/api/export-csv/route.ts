import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_EXPORT_DIR =
  "C:\\Users\\User\\OneDrive\\Work\\Hydrogenera\\Finances\\app";

function csvFilename(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const base = path.basename(raw).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  if (!base.toLowerCase().endsWith(".csv")) return null;
  if (base.length < 5 || base.length > 180) return null;
  return base;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { filename?: unknown; csv?: unknown };
    const filename = csvFilename(body.filename);
    if (!filename) {
      return NextResponse.json(
        { ok: false, error: "A valid .csv filename is required" },
        { status: 400 },
      );
    }
    if (typeof body.csv !== "string") {
      return NextResponse.json(
        { ok: false, error: "CSV content is required" },
        { status: 400 },
      );
    }

    const dir = process.env.FINANCIAL_CSV_EXPORT_DIR?.trim() || DEFAULT_EXPORT_DIR;
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await writeFile(filePath, body.csv, "utf8");

    return NextResponse.json({ ok: true, path: filePath });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Failed to write CSV",
      },
      { status: 500 },
    );
  }
}
