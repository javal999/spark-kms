import ExcelJS from "exceljs";
import { TEMPLATE_COLUMNS } from "@/src/services/template";

export type UploadRow = Partial<Record<(typeof TEMPLATE_COLUMNS)[number], string | Date>>;

/**
 * Build an in-memory upload .xlsx matching the Entries sheet layout (headers on
 * row 1, hints on row 2, data from row 3) plus an optional _meta version — so
 * integration tests can exercise the parser/preview/commit without fixtures.
 */
export async function buildUploadFile(
  rows: UploadRow[],
  opts: { version?: string | null; includeMeta?: boolean } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const en = wb.addWorksheet("Entries");
  TEMPLATE_COLUMNS.forEach((h, c) => (en.getCell(1, c + 1).value = h));
  TEMPLATE_COLUMNS.forEach((h, c) => (en.getCell(2, c + 1).value = "hint"));
  rows.forEach((r, i) => {
    const row = en.getRow(3 + i);
    TEMPLATE_COLUMNS.forEach((h, c) => {
      const v = r[h];
      if (v != null) row.getCell(c + 1).value = v as ExcelJS.CellValue;
    });
  });

  if (opts.includeMeta !== false) {
    const meta = wb.addWorksheet("_meta", { state: "hidden" });
    meta.getCell(1, 1).value = "template_version";
    meta.getCell(1, 2).value = opts.version ?? "v1.1";
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A valid row with sensible defaults, overridable per field. */
export function validRow(over: UploadRow = {}): UploadRow {
  return {
    Tanggal: "2026-07-01",
    Region: "Sumatera",
    Segment: "Masstige",
    PIC: "Tester",
    Pillar: "Activated New Touchpoint",
    Category: "Best Practice",
    "Topic/Tema": "Some Topic",
    Progress: "Something happened",
    ...over,
  };
}
