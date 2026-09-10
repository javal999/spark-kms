import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseWorkbook, MAX_UPLOAD_ROWS } from "@/src/services/upload";
import { buildUploadFile, validRow } from "@/tests/helpers/xlsx";

/**
 * Regression: the Entries scan must be bounded by the rows that ACTUALLY carry
 * data, not by `sheet.rowCount` (D31).
 *
 * A real 209-row upload from the regions reported `rowCount = 1,048,576`
 * because the file carried formatting on far-down rows. The parser looped to
 * that bound calling `sheet.getRow(r)`, which *materializes* each row on
 * access — peaking at 3.4 GB of heap. On the 1 GB Lightsail container the
 * kernel SIGKILLed the process, so the route's catch block never ran and
 * nothing reached `error_events`: the upload failed with no admin-visible
 * trace at all. Bounding the scan keeps the same parse under ~20 MB.
 */
describe("parseWorkbook row bound (D31)", () => {
  it("the fixture really does inflate rowCount (guards the fixture itself)", async () => {
    const buf = await buildUploadFile([validRow()], { inflateRowCount: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Entries")!;
    // If exceljs ever stops reporting the sheet max here, this fixture no
    // longer reproduces the bug and the memory test below is meaningless.
    expect(sheet.rowCount).toBe(1_048_576);
    expect(sheet.actualRowCount).toBeLessThan(10);
  });

  it("parses only the real rows when rowCount is inflated", async () => {
    const rows = [
      validRow({ "Topic/Tema": "First" }),
      validRow({ "Topic/Tema": "Second" }),
      validRow({ "Topic/Tema": "Third" }),
    ];
    const inflated = await parseWorkbook(
      await buildUploadFile(rows, { inflateRowCount: true }),
    );
    const plain = await parseWorkbook(await buildUploadFile(rows));

    expect(inflated.rows).toHaveLength(3);
    expect(inflated.tooManyRows).toBe(false);
    expect(inflated.rows.map((r) => r.data?.title)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    // An inflated rowCount must not change the parse in ANY way — same row
    // numbers, same data — it only changes how far the scan walks.
    expect(inflated.rows.map((r) => r.rowNumber)).toEqual(
      plain.rows.map((r) => r.rowNumber),
    );
  });

  it("does not allocate a heap proportional to rowCount", async () => {
    const buf = await buildUploadFile(
      Array.from({ length: 200 }, (_, i) =>
        validRow({ "Topic/Tema": `Topic ${i}` }),
      ),
      { inflateRowCount: true },
    );

    const before = process.memoryUsage().heapUsed;
    const { rows } = await parseWorkbook(buf);
    const grewBytes = process.memoryUsage().heapUsed - before;

    expect(rows).toHaveLength(200);
    // The unbounded loop grew the heap by ~3.4 GB for a file this shape; the
    // bounded scan grows it by tens of MB. 300 MB sits far from both, so this
    // catches the regression without being sensitive to GC timing.
    expect(grewBytes).toBeLessThan(300 * 1024 * 1024);
  });

  it("still reports tooManyRows on an inflated file with real overflow", async () => {
    const buf = await buildUploadFile(
      Array.from({ length: MAX_UPLOAD_ROWS + 5 }, (_, i) =>
        validRow({ "Topic/Tema": `Topic ${i}` }),
      ),
      { inflateRowCount: true },
    );
    const { rows, tooManyRows } = await parseWorkbook(buf);
    expect(tooManyRows).toBe(true);
    expect(rows).toHaveLength(MAX_UPLOAD_ROWS);
  });

  it("skips gaps between data rows without stopping the scan", async () => {
    // A user deleting a row's contents mid-file leaves a hole. The scan must
    // walk past it, not treat it as the end of the data.
    const wb = new ExcelJS.Workbook();
    const en = wb.addWorksheet("Entries");
    const headers = ["Tanggal", "Region", "Segment", "PIC", "Pillar", "Category", "Topic/Tema", "Progress"];
    headers.forEach((h, c) => (en.getCell(1, c + 1).value = h));
    headers.forEach((_h, c) => (en.getCell(2, c + 1).value = "hint"));
    const write = (r: number, title: string) => {
      const vals = ["2026-07-01", "Sumatera", "Masstige", "Tester", "Activated New Touchpoint", "Best Practice", title, "Something happened"];
      vals.forEach((v, c) => (en.getCell(r, c + 1).value = v));
    };
    write(3, "Before gap");
    write(7, "After gap"); // rows 4-6 never written
    en.getRow(1_048_576).height = 15;

    const { rows } = await parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(rows.map((r) => r.data?.title)).toEqual(["Before gap", "After gap"]);
    expect(rows.map((r) => r.rowNumber)).toEqual([3, 7]);
  });
});
