import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { buildWarehouseFromMoneyWorks } from "@/lib/moneyworks-import";

export const runtime = "nodejs";

const CORE = path.join(
  process.cwd(),
  "templates",
  "warehouse-data",
  "MoneyWorks_Core_Warehouse_CSV",
  "tables",
);

async function readCsv(name: string): Promise<string> {
  return readFile(path.join(CORE, name), "utf8");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      holdingProjectId?: string;
    };
    const holdingProjectId = body.holdingProjectId?.trim();
    if (!holdingProjectId) {
      return NextResponse.json(
        { ok: false, error: "holdingProjectId is required" },
        { status: 400 },
      );
    }

    const [grupi, stokiDef, stoki, serNo, kupuwaItems, kupuwa] =
      await Promise.all([
        readCsv("GRUPI.csv"),
        readCsv("STOKI_DEF.csv"),
        readCsv("STOKI.csv"),
        readCsv("SER_NO.csv"),
        readCsv("KUPUWA_ITEMS.csv"),
        readCsv("KUPUWA.csv"),
      ]);

    const result = buildWarehouseFromMoneyWorks(
      { grupi, stokiDef, stoki, serNo, kupuwaItems, kupuwa },
      { holdingProjectId },
    );

    return NextResponse.json({
      ok: true,
      stats: result.stats,
      warnings: result.warnings,
      warehouse: result.state,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("MoneyWorks import failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
