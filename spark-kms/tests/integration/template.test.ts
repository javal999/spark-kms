import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { generateTemplate } from "@/src/services/template";
import { parseWorkbook } from "@/src/services/upload";
import { resetAndSeed } from "@/tests/helpers/db";
import { REGIONS } from "@/src/lib/enums";

describe("template generator (3.1)", () => {
  let buffer: Buffer;

  beforeAll(async () => {
    await resetAndSeed();
    buffer = await generateTemplate(new Date("2026-07-06T00:00:00Z"));
  });

  it("has the expected sheets, with Lists and _meta hidden", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(["Instructions", "Lists", "Entries", "_meta"]);
    expect(wb.getWorksheet("Lists")!.state).toBe("hidden");
    expect(wb.getWorksheet("_meta")!.state).toBe("hidden");
  });

  it("stamps the configured template version in _meta", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const meta = wb.getWorksheet("_meta")!;
    expect(String(meta.getCell(1, 1).value)).toBe("template_version");
    expect(String(meta.getCell(1, 2).value)).toBe("v1.2");
  });

  it("has the 14 template headers and dropdown validations sourced from Lists", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const en = wb.getWorksheet("Entries")!;
    expect(String(en.getCell(1, 1).value)).toBe("Tanggal");
    expect(String(en.getCell(1, 2).value)).toBe("Region");
    // Region dropdown on a data row references the Lists sheet.
    const dv = en.getCell(3, 2).dataValidation;
    expect(dv?.type).toBe("list");
    expect(dv?.formulae?.[0]).toContain("Lists!");
    // Lists carries the live enums.
    const lists = wb.getWorksheet("Lists")!;
    expect(String(lists.getCell(2, 1).value)).toBe(REGIONS[0]);
  });

  it("formats EVERY entry date cell as DD/MM/YYYY and says so in the hint", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const en = wb.getWorksheet("Entries")!;
    // Not just the example (row 3) — a blank data row lower down too.
    expect(en.getCell(3, 1).numFmt).toBe("dd/mm/yyyy");
    expect(en.getCell(20, 1).numFmt).toBe("dd/mm/yyyy");
    // The hint tells the user the format, with an example.
    expect(String(en.getCell(2, 1).value)).toMatch(/DD\/MM\/YYYY/);
  });

  it("round-trips: parsing the generated template yields the example row as valid", async () => {
    const { rows, templateVersion } = await parseWorkbook(buffer);
    expect(templateVersion).toBe("v1.2");
    expect(rows).toHaveLength(1); // the example row
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].data?.region).toBe("Sumatera");
    expect(rows[0].data?.category).toBe("Best Practice");
  });
});
