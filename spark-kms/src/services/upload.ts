import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { uploadBatches } from "@/src/db/schema";
import { uploadRowSchema, type UploadRowInput, type NewInitiativeInput } from "@/src/validation/entry";
import {
  REGIONS,
  SEGMENTS,
  PILLARS,
  CATEGORIES,
  STAGES,
  LEGACY_PILLAR_SPELLINGS,
} from "@/src/lib/enums";
import { TEMPLATE_COLUMNS, getTemplateVersion } from "@/src/services/template";
import {
  findDuplicateCandidates,
  getConfiguredThreshold,
  type DuplicateCandidate,
} from "@/src/services/duplicates";
import { createInitiativeInTx, appendEntryInTx } from "@/src/services/initiatives";
import { upsertByName } from "@/src/services/people";

/**
 * Excel upload parsing + normalization (REQ-U8) feeding the SHARED validation
 * pipeline (REQ-U6). Off-enum values that can't be normalized produce a clear
 * per-row error at dry-run (D5) rather than being silently mapped.
 */

export const MAX_UPLOAD_ROWS = 500;
// Hard byte cap before we hand the file to exceljs (which loads it fully into
// memory). Guards against oversized files / zip-bomb-ish xlsx from an admin.
// 500 rows of text is well under this.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ParsedRow = {
  /** 1-based row number in the Entries sheet (for user-facing messages). */
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
  data?: UploadRowInput;
};

export function fileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// Case-insensitive normalize to a canonical enum value, with optional aliases.
function normEnum(
  rawValue: string,
  canonical: readonly string[],
  aliases: Record<string, string> = {},
): { value?: string; unmapped?: string } {
  const t = rawValue.trim();
  if (!t) return {};
  const lower = t.toLowerCase();
  for (const [alias, target] of Object.entries(aliases)) {
    if (alias.toLowerCase() === lower) return { value: target };
  }
  const hit = canonical.find((c) => c.toLowerCase() === lower);
  return hit ? { value: hit } : { unmapped: t };
}

const SEGMENT_ALIASES = { ALL: "All", "Teens & ES": "Teen & ES" };

// D32 renamed the pillar from the "CEE" abbreviation to its full name. The
// upload normalizer reads the SHARED alias table rather than keeping its own,
// so the spelling a partner may send to the API and the spelling an admin may
// upload in a sheet can never diverge.
const PILLAR_ALIASES = LEGACY_PILLAR_SPELLINGS;

function parseCellDate(value: ExcelJS.CellValue): string | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) {
    // Excel date cells come back as UTC midnight — read calendar parts directly.
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // Reuse cellText so rich-text/formula date cells resolve to their payload
  // instead of stringifying to "[object Object]" and failing schema validation.
  const s = cellText(value).trim();
  // DD/MM/YYYY
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD (pass through; schema validates it's a real date)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s; // let the schema reject an unparseable value
}

function parseBool(raw: string | undefined | null): boolean {
  const t = (raw ?? "").trim().toLowerCase();
  return t === "true" || t === "1" || t === "yes";
}

/** Stringify a value of unknown static type without risking "[object Object]". */
function scalarText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
    return String(v);
  }
  if (v instanceof Date) return String(v);
  return "";
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return String(value);
  if (typeof value === "object") {
    // hyperlink / rich text / formula result
    const anyV = value as { text?: string; result?: unknown; hyperlink?: string };
    if (typeof anyV.text === "string") return anyV.text;
    if (anyV.hyperlink) return anyV.hyperlink;
    if (anyV.result != null) return scalarText(anyV.result);
    // An object cell with no readable payload: empty beats "[object Object]".
    return "";
  }
  return String(value);
}

/** Parse + normalize + validate every data row of the Entries sheet. */
export async function parseWorkbook(buffer: Buffer): Promise<{
  rows: ParsedRow[];
  templateVersion: string | null;
  tooManyRows: boolean;
}> {
  const wb = new ExcelJS.Workbook();
  // exceljs accepts a Node Buffer at runtime; cast past the @types/node Buffer
  // generic mismatch with exceljs's bundled types.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const templateVersion = readMetaVersion(wb);

  const sheet = wb.getWorksheet("Entries") ?? wb.worksheets[0];
  const rows: ParsedRow[] = [];

  // Map each template column to the position it actually occupies in THIS
  // file, by header name (row 1). Reading by fixed position would silently
  // misread every file whose column set differs from the current template —
  // e.g. a file still carrying the retired "Best Presenter of the Week" column
  // (D25) would have its Link File read from the wrong cell. Falls back to
  // template order when a header is missing or renamed.
  const headerIndex = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const name = cellText(cell.value).trim();
    if (name && !headerIndex.has(name)) headerIndex.set(name, col);
  });

  // Bound the scan by the rows that ACTUALLY exist, not `sheet.rowCount`.
  // exceljs reports rowCount as the sheet's max (1,048,576) for any file
  // carrying formatting/validation on far-down rows — which real files exported
  // from Excel/Sheets routinely do. Looping to that bound called `getRow()` a
  // million times, and getRow() *materializes* the row on access: a 209-row
  // upload peaked at 3.4 GB of heap and OOM-killed the container before the
  // route's catch block could run, so nothing reached the error log (D31).
  // `eachRow({includeEmpty:false})` walks only rows present in the model.
  const dataRowNumbers: number[] = [];
  // Data starts at row 3 (row 1 = headers, row 2 = hints).
  sheet.eachRow({ includeEmpty: false }, (_row, n) => {
    if (n >= 3) dataRowNumbers.push(n);
  });

  for (const r of dataRowNumbers) {
    const row = sheet.getRow(r);
    const raw: Record<string, string> = {};
    let hasAny = false;
    const cellValues: ExcelJS.CellValue[] = [];
    TEMPLATE_COLUMNS.forEach((col, c) => {
      const value = row.getCell(headerIndex.get(col) ?? c + 1).value;
      cellValues[c] = value;
      const text = cellText(value).trim();
      raw[col] = text;
      if (text) hasAny = true;
    });
    // Also expose every header the file actually carries, so alias spellings
    // ("Best Practice of the Week" vs "Best Practices of The Week") resolve by
    // name rather than by luck of position.
    for (const [name, col] of headerIndex) {
      if (name in raw) continue;
      raw[name] = cellText(row.getCell(col).value).trim();
    }
    // Skip fully-blank rows (and the example row if it's untouched? no — the
    // example is grey but real text; users are told to delete it. We parse it.)
    if (!hasAny) continue;

    rows.push(buildRow(r, raw, cellValues[0]));
    if (rows.length > MAX_UPLOAD_ROWS) {
      return { rows: rows.slice(0, MAX_UPLOAD_ROWS), templateVersion, tooManyRows: true };
    }
  }

  return { rows, templateVersion, tooManyRows: false };
}

function buildRow(
  rowNumber: number,
  raw: Record<string, string>,
  tanggalCell: ExcelJS.CellValue,
): ParsedRow {
  const errors: string[] = [];

  const region = normEnum(raw["Region"], REGIONS);
  const segment = normEnum(raw["Segment"], SEGMENTS, SEGMENT_ALIASES);
  const pillar = normEnum(raw["Pillar"], PILLARS, PILLAR_ALIASES);
  const category = normEnum(raw["Category"], CATEGORIES);
  const stageRaw = raw["Stage"].trim();
  const stage = stageRaw ? normEnum(stageRaw, STAGES) : { value: "Idea" };

  if (region.unmapped) errors.push(`Region "${region.unmapped}" is not a valid region`);
  if (segment.unmapped) errors.push(`Segment "${segment.unmapped}" is not a valid segment`);
  if (pillar.unmapped) errors.push(`Pillar "${pillar.unmapped}" is not a valid pillar`);
  if (category.unmapped) errors.push(`Category "${category.unmapped}" must be Best Practice or Unlocking`);
  if (stage.unmapped) errors.push(`Stage "${stage.unmapped}" is not a valid stage`);

  // An EMPTY required enum has no `unmapped` value, so it produces no message
  // above AND its Zod error is skipped below (enum fields are filtered out) —
  // leaving the row with errors:[] but data:undefined, which slips past the
  // commit's rowErrors guard and crashes `data!.pillar`. Flag them explicitly.
  // (pillar is optional for uploads; stage defaults to Idea — so only these.)
  if (!region.value && !region.unmapped) errors.push("Region is required");
  if (!segment.value && !segment.unmapped) errors.push("Segment is required");
  if (!category.value && !category.unmapped) errors.push("Category is required");

  const candidate = {
    entryDate: parseCellDate(tanggalCell),
    region: region.value,
    segment: segment.value,
    pic: raw["PIC"],
    pillar: pillar.value,
    category: category.value,
    title: raw["Topic/Tema"],
    description: raw["Description"] || undefined,
    detail: raw["Progress"],
    followUp: raw["Need Follow Up Action/Unlocking"] || undefined,
    stage: stage.value,
    bpOfWeekNominated: parseBool(
      raw["Best Practice of the Week"] ?? raw["Best Practices of The Week"],
    ),
    linkUrl: raw["Link File"] || undefined,
  };

  const parsed = uploadRowSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      // Enum-normalization errors are already reported with the raw value.
      if (["region", "segment", "pillar", "category", "stage"].includes(field))
        continue;
      errors.push(`${humanField(field)}: ${issue.message}`);
    }
  }

  return {
    rowNumber,
    raw,
    errors,
    data: parsed.success && errors.length === 0 ? parsed.data : undefined,
  };
}

function humanField(field: string): string {
  const map: Record<string, string> = {
    entryDate: "Tanggal",
    pic: "PIC",
    title: "Topic/Tema",
    detail: "Progress",
  };
  return map[field] ?? field;
}

export function readMetaVersion(wb: ExcelJS.Workbook): string | null {
  const meta = wb.getWorksheet("_meta");
  if (!meta) return null;
  const key = cellText(meta.getCell(1, 1).value).trim();
  if (key !== "template_version") return null;
  const v = cellText(meta.getCell(1, 2).value).trim();
  return v || null;
}

// ---------------------------------------------------------------------------
// 2-phase pipeline: preview (dry-run) → commit (all-or-nothing).
// ---------------------------------------------------------------------------

/** Service error carrying an HTTP status for the route to map. */
export class UploadError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export type RowStatus = "new" | "duplicate" | "error";

export type PreviewRow = {
  rowNumber: number;
  status: RowStatus;
  errors: string[];
  candidates: DuplicateCandidate[];
  summary: {
    title: string;
    region: string;
    segment: string;
    category: string;
    entryDate: string;
  };
};

export type PreviewResult = {
  batchId: number;
  hash: string;
  templateOutdated: boolean;
  templateVersion: string | null;
  counts: { total: number; valid: number; duplicate: number; error: number };
  rows: PreviewRow[];
};

/** Dry-run: parse, validate, find duplicate candidates, record the batch. */
export async function previewUpload(
  buffer: Buffer,
  filename: string,
  actorId: number,
): Promise<PreviewResult> {
  const hash = fileHash(buffer);

  const [existing] = await db
    .select()
    .from(uploadBatches)
    .where(eq(uploadBatches.fileHash, hash))
    .limit(1);
  if (existing?.status === "committed") {
    throw new UploadError(409, "This file has already been uploaded and committed.");
  }

  const { rows, templateVersion, tooManyRows } = await parseWorkbook(buffer);
  if (tooManyRows) {
    throw new UploadError(400, `Too many rows — the limit is ${MAX_UPLOAD_ROWS} per file.`);
  }
  if (rows.length === 0) {
    throw new UploadError(400, "No data rows found in the Entries sheet.");
  }

  // Fetch the dedup threshold ONCE, not once per row (bulk-upload perf).
  const dupThreshold = await getConfiguredThreshold();
  const previewRows: PreviewRow[] = [];
  for (const row of rows) {
    const candidates =
      row.data && row.errors.length === 0
        ? await findDuplicateCandidates(row.data.title, { threshold: dupThreshold })
        : [];
    const status: RowStatus = row.errors.length
      ? "error"
      : candidates.length
        ? "duplicate"
        : "new";
    previewRows.push({
      rowNumber: row.rowNumber,
      status,
      errors: row.errors,
      candidates,
      summary: {
        title: row.raw["Topic/Tema"] ?? "",
        region: row.raw["Region"] ?? "",
        segment: row.raw["Segment"] ?? "",
        category: row.raw["Category"] ?? "",
        entryDate: row.data?.entryDate ?? row.raw["Tanggal"] ?? "",
      },
    });
  }

  // Record (or reuse) the previewed batch.
  const batchId = existing
    ? existing.id
    : (
        await db
          .insert(uploadBatches)
          .values({
            filename,
            fileHash: hash,
            rowCount: rows.length,
            status: "previewed",
            uploadedBy: actorId,
          })
          .returning({ id: uploadBatches.id })
      )[0].id;

  const currentVersion = await getTemplateVersion();
  const counts = {
    total: previewRows.length,
    valid: previewRows.filter((r) => r.status === "new").length,
    duplicate: previewRows.filter((r) => r.status === "duplicate").length,
    error: previewRows.filter((r) => r.status === "error").length,
  };

  return {
    batchId,
    hash,
    templateVersion,
    templateOutdated: templateVersion !== currentVersion,
    counts,
    rows: previewRows,
  };
}

export type RowChoice = { action: "new" | "append"; initiativeId?: number };

export type CommitResult = {
  batchId: number;
  created: number;
  appended: number;
};

/**
 * Commit the previewed file. All-or-nothing: any row error, or a "new" row
 * missing its pillar, aborts the whole import (nothing is written).
 * `choices` is keyed by row number (default action "new" when a row has no
 * duplicate to resolve).
 */
export async function commitUpload(
  buffer: Buffer,
  choices: Record<number, RowChoice>,
  actorId: number,
): Promise<CommitResult> {
  const hash = fileHash(buffer);

  const [batch] = await db
    .select()
    .from(uploadBatches)
    .where(eq(uploadBatches.fileHash, hash))
    .limit(1);
  if (!batch) {
    throw new UploadError(400, "No preview found for this file — preview it first.");
  }
  if (batch.status === "committed") {
    throw new UploadError(409, "This file has already been committed.");
  }

  const { rows, tooManyRows } = await parseWorkbook(buffer);
  if (tooManyRows) {
    throw new UploadError(400, `Too many rows — the limit is ${MAX_UPLOAD_ROWS} per file.`);
  }

  // Validate everything up front — commit nothing if any row is bad.
  const rowErrors = rows.filter((r) => r.errors.length > 0);
  if (rowErrors.length > 0) {
    throw new UploadError(422, "Some rows have errors; nothing was imported.", {
      rows: rowErrors.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors })),
    });
  }

  // Resolve choices + enforce pillar-for-new.
  const plan = rows.map((r) => {
    const choice = choices[r.rowNumber] ?? { action: "new" as const };
    return { row: r, choice };
  });
  // `data?.` (not `data!.`) is defensive: buildRow now guarantees a row reaching
  // here has data (any undefined-data row carries an error and was rejected by
  // the rowErrors guard above), but optional chaining means a future gap yields
  // a clean "Pillar is required" 422 instead of a 500 crash.
  const missingPillar = plan.filter(
    (p) => p.choice.action === "new" && !p.row.data?.pillar,
  );
  if (missingPillar.length > 0) {
    throw new UploadError(422, "Pillar is required for new topics; nothing was imported.", {
      rows: missingPillar.map((p) => ({
        rowNumber: p.row.rowNumber,
        errors: ["Pillar is required for a new topic"],
      })),
    });
  }

  let created = 0;
  let appended = 0;

  await db.transaction(async (tx) => {
    for (const { row, choice } of plan) {
      const data = row.data!;
      const entryInput = {
        entryDate: data.entryDate,
        category: data.category,
        detail: data.detail,
        followUp: data.followUp,
        bpOfWeekNominated: data.bpOfWeekNominated,
        linkUrl: data.linkUrl,
      };
      const withActionItem = {
        createActionItem: !!data.followUp,
        uploadBatchId: batch.id,
        actionItemPic: data.pic, // v1.2 (D15): items inherit the row PIC
      };
      // v1.2 (D9): every uploaded PIC joins the people directory. (createInitiative
      // also upserts, so this covers append rows too — idempotent.)
      await upsertByName(data.pic, actorId, tx);

      if (choice.action === "append" && choice.initiativeId) {
        await appendEntryInTx(tx, choice.initiativeId, entryInput, actorId, withActionItem);
        appended++;
      } else {
        await createInitiativeInTx(
          tx,
          data as NewInitiativeInput,
          actorId,
          withActionItem,
        );
        created++;
      }
    }
    await tx
      .update(uploadBatches)
      .set({ status: "committed" })
      .where(eq(uploadBatches.id, batch.id));
  });

  return { batchId: batch.id, created, appended };
}
