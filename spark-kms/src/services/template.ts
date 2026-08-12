import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { appConfig } from "@/src/db/schema";
import { REGIONS, SEGMENTS, PILLARS, CATEGORIES, STAGES } from "@/src/lib/enums";

/**
 * Generates the versioned bulk-upload .xlsx (REQ-U0), matching
 * KMS-Upload-Template.xlsx: an Instructions sheet, an Entries sheet with
 * dropdown validations sourced from a hidden Lists sheet, and a hidden _meta
 * sheet stamping the template version.
 *
 * Dropdowns are built from the live enum config (src/lib/enums), so they can
 * never drift from what the app accepts.
 */

export const DEFAULT_TEMPLATE_VERSION = "v1.2";

export async function getTemplateVersion(): Promise<string> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "template_version"))
    .limit(1);
  return typeof row?.value === "string" ? row.value : DEFAULT_TEMPLATE_VERSION;
}

// Column order = requirements 7.3. Kept here as the single source for the
// generator AND the parser (see upload.ts).
export const TEMPLATE_COLUMNS = [
  "Tanggal",
  "Region",
  "Segment",
  "PIC",
  "Pillar",
  "Category",
  "Topic/Tema",
  "Description",
  "Progress",
  "Need Follow Up Action/Unlocking",
  "Stage",
  "Best Practices of The Week",
  "Best Presenter of the Week",
  "Link File",
] as const;

const HINTS: Record<string, string> = {
  Tanggal: "Entry date in DD/MM/YYYY, e.g. 31/07/2026. Required.",
  Region: "Dropdown. Required.",
  Segment: "Dropdown. Required.",
  PIC: "Person in charge. Required.",
  Pillar: "Dropdown. Required for new topics.",
  Category: "Dropdown: Best Practice or Unlocking. Required.",
  "Topic/Tema": "Initiative title. Checked for duplicates on upload. Required.",
  Description: "Initiative description (new topics only).",
  Progress: "What happened. Required.",
  "Need Follow Up Action/Unlocking": "Follow-up needed, if any. Creates an action item.",
  Stage: "Dropdown. Blank = Idea.",
  "Best Practices of The Week": "TRUE = Best-Practice-of-the-Week nomination. Awards +2 (1 per Area per week).",
  "Best Presenter of the Week": "TRUE = Best-Presenter-of-the-Week. Awards +1 to the Presenter stream (1 per Area per week).",
  "Link File": "URL to deck/photo/file, if any.",
};

const WIDTHS = [14, 16, 12, 22, 26, 14, 34, 36, 44, 40, 14, 16, 26, 28];
const MAX_ROWS = 500;

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function generateTemplate(now: Date = new Date()): Promise<Buffer> {
  const version = await getTemplateVersion();
  const wb = new ExcelJS.Workbook();
  wb.creator = "SPARK KMS";

  // ---- Instructions ----
  const ins = wb.addWorksheet("Instructions");
  ins.getColumn(1).width = 110;
  const insLines = [
    `SPARK KMS bulk upload template ${version}`,
    "",
    "How to use",
    "1. Fill the Entries sheet: 1 row = 1 knowledge entry (a best practice or an unlocking) on a date.",
    "2. If the Topic/Tema already exists in the app, the row is appended to it as progress. New topics create a new initiative.",
    "3. Required: Tanggal, Region, Segment, PIC, Category, Topic/Tema, Progress. Pillar required for new topics.",
    "4. Use the dropdowns. Rows with values outside the dropdown lists fail validation at upload preview.",
    "5. Row 3 is an example (grey italic). Delete it or overwrite it before uploading.",
    "6. Max 500 rows per file. The same file cannot be committed twice.",
    "",
    "Notes",
    "- Best Practices of The Week = TRUE awards +2 to the Best Practice stream (1 per Area per week).",
    "- Best Presenter of the Week = TRUE awards +1 to the Presenter stream (1 per Area per week).",
    "- Stage left blank defaults to Idea.",
    "- Upload is 2-phase: you will see a preview with per-row errors and duplicate matches before anything is saved.",
  ];
  insLines.forEach((line, i) => {
    const cell = ins.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
    if (line === "How to use" || line === "Notes")
      cell.font = { bold: true, size: 12 };
  });

  // ---- Lists (hidden) — one column per enum, used by the dropdowns ----
  const lists = wb.addWorksheet("Lists", { state: "hidden" });
  const listCols: [string, readonly string[]][] = [
    ["Region", REGIONS],
    ["Segment", SEGMENTS],
    ["Pillar", PILLARS],
    ["Category", CATEGORIES],
    ["Stage", STAGES],
    ["BPWeek", ["TRUE", "FALSE"]],
    ["BPresWeek", ["TRUE", "FALSE"]],
  ];
  listCols.forEach(([header, values], c) => {
    lists.getCell(1, c + 1).value = header;
    values.forEach((v, r) => (lists.getCell(r + 2, c + 1).value = v));
  });
  const ranges: Record<string, string> = {};
  listCols.forEach(([header, values], c) => {
    const L = colLetter(c + 1);
    ranges[header] = `Lists!$${L}$2:$${L}$${values.length + 1}`;
  });

  // ---- Entries ----
  const en = wb.addWorksheet("Entries");
  en.columns = WIDTHS.map((w) => ({ width: w }));
  en.views = [{ state: "frozen", ySplit: 2 }];

  // Row 1: headers
  TEMPLATE_COLUMNS.forEach((h, c) => {
    const cell = en.getCell(1, c + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFF2F7" },
    };
  });
  // Row 2: hints
  TEMPLATE_COLUMNS.forEach((h, c) => {
    const cell = en.getCell(2, c + 1);
    cell.value = HINTS[h];
    cell.font = { italic: true, color: { argb: "FF888888" }, size: 9 };
  });
  // Row 3: example (grey italic)
  const example = [
    now, "Sumatera", "Masstige", "Sri Rafika Wulandari",
    "Activated New Touchpoint", "Best Practice", "Pop up store Make Over",
    "", "Make Over membuka pop up store di Living World, traffic 3x vs counter biasa",
    "Plan activation: Occasion Makeup class", "Pilot", "FALSE", "FALSE",
    "https://example.com/deck",
  ];
  example.forEach((v, c) => {
    const cell = en.getCell(3, c + 1);
    cell.value = v;
    cell.font = { italic: true, color: { argb: "FF999999" } };
    if (c === 0) cell.numFmt = "dd/mm/yyyy";
  });

  // Data validations for rows 3..(2+MAX_ROWS).
  const lastRow = 2 + MAX_ROWS;
  const dropdown = (col: number, listKey: string) => {
    for (let r = 3; r <= lastRow; r++) {
      en.getCell(r, col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [ranges[listKey]],
        showErrorMessage: true,
        errorStyle: "error",
        errorTitle: "Invalid value",
        error: "Pick a value from the dropdown list.",
      };
    }
  };
  dropdown(2, "Region");
  dropdown(3, "Segment");
  dropdown(5, "Pillar");
  dropdown(6, "Category");
  dropdown(11, "Stage");
  dropdown(12, "BPWeek");
  dropdown(13, "BPresWeek");
  // Tanggal: date validation + force DD/MM/YYYY display on EVERY entry cell (not
  // just the example) so a user's date never renders in their Excel locale's
  // default format.
  for (let r = 3; r <= lastRow; r++) {
    en.getCell(r, 1).numFmt = "dd/mm/yyyy";
    en.getCell(r, 1).dataValidation = {
      type: "date",
      operator: "greaterThan",
      allowBlank: true,
      formulae: [new Date("2000-01-01")],
      showErrorMessage: true,
      errorTitle: "Invalid date",
      error: "Enter a valid date (DD/MM/YYYY).",
    };
  }

  // ---- _meta (hidden) ----
  const meta = wb.addWorksheet("_meta", { state: "hidden" });
  meta.getCell(1, 1).value = "template_version";
  meta.getCell(1, 2).value = version;
  meta.getCell(2, 1).value = "generated";
  meta.getCell(2, 2).value = now.toISOString().slice(0, 10);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
