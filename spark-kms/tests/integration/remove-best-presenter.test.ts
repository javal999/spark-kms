import { describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { createInitiative } from "@/src/services/initiatives";
import { previewUpload, commitUpload } from "@/src/services/upload";
import { reverseBestPresenter } from "@/src/db/reverse-best-presenter";
import {
  resetAndSeed,
  getSuperAdminId,
  insertInitiative,
} from "@/tests/helpers/db";

/**
 * D25: "Best Presenter of the Week" is removed entirely — no checkbox, no
 * upload column, no award path — and every point it ever granted is reversed
 * through the ledger so no initiative carries a leftover point (REQ-S11).
 *
 * The `best_presenter` score_reason enum value and the `entries.best_presenter`
 * column stay in the schema: dropping them would be a destructive migration and
 * would break the audit trail of the very rows being reversed.
 */
const AREA = { region: "Sumatera", segment: "Masstige" } as const;

let actor: number;
let initA: number;

const baseInput = {
  ...AREA,
  pillar: "Social Buzz",
  stage: "Idea",
  pic: "Tester",
  category: "Best Practice",
  detail: "d",
  bpOfWeekNominated: false,
} as const;

async function sumReason(reason: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(points),0)::int` })
    .from(scoreEvents)
    .where(sql`reason = ${reason}::score_reason`);
  return total;
}

/** Write a legacy award directly: award() no longer produces this shape. */
async function legacyBestPresenter(effectiveDate: string, initiativeId: number) {
  const [row] = await db
    .insert(scoreEvents)
    .values({
      region: AREA.region as never,
      segment: AREA.segment as never,
      initiativeId,
      stream: "presenter",
      points: 1,
      effectiveDate,
      reason: "best_presenter" as never,
      createdBy: actor,
    })
    .returning({ id: scoreEvents.id });
  return row.id;
}

beforeEach(async () => {
  await resetAndSeed();
  actor = await getSuperAdminId();
  initA = await insertInitiative(actor, { title: "Legacy", ...AREA });
});

describe("D25: Best Presenter removed from the scoring engine", () => {
  it("awards nothing when a caller still sends the retired flag", async () => {
    const res = await createInitiative(
      {
        ...baseInput,
        title: "Still sending the flag",
        entryDate: "2026-07-01",
        // A stale API client or an old form payload. The key is not in the
        // schema any more, so it is stripped rather than honored.
        bestPresenter: true,
      } as never,
      actor,
    );

    expect(await sumReason("best_presenter")).toBe(0);
    // Only the +1 for the new initiative.
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(points),0)::int` })
      .from(scoreEvents)
      .where(sql`initiative_id = ${res.initiativeId}`);
    expect(total).toBe(1);
  });
});

describe("D25: an OLD upload file still parses correctly", () => {
  it("reads Link File from the right column when the retired column is present", async () => {
    // Exactly the pre-D25 template layout: Best Presenter sits between
    // "Best Practices of The Week" and "Link File". Positional parsing would
    // read the retired column's value as the link.
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Entries");
    const OLD_COLUMNS = [
      "Tanggal", "Region", "Segment", "PIC", "Pillar", "Category",
      "Topic/Tema", "Description", "Progress",
      "Need Follow Up Action/Unlocking", "Stage",
      "Best Practices of The Week", "Best Presenter of the Week", "Link File",
    ];
    OLD_COLUMNS.forEach((h, c) => (sheet.getCell(1, c + 1).value = h));
    OLD_COLUMNS.forEach((_h, c) => (sheet.getCell(2, c + 1).value = "hint"));
    const values: Record<string, string> = {
      Tanggal: "2026-07-01",
      Region: "Sumatera",
      Segment: "Masstige",
      PIC: "Tester",
      Pillar: "Activated New Touchpoint",
      Category: "Best Practice",
      "Topic/Tema": "Legacy File Topic",
      Progress: "Something happened",
      "Best Presenter of the Week": "TRUE",
      "Link File": "https://example.com/deck",
    };
    OLD_COLUMNS.forEach((h, c) => {
      if (values[h]) sheet.getCell(3, c + 1).value = values[h];
    });
    const meta = wb.addWorksheet("_meta", { state: "hidden" });
    meta.getCell(1, 1).value = "template_version";
    meta.getCell(1, 2).value = "v1.2";
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const preview = await previewUpload(buf, "legacy.xlsx", actor);
    expect(preview.rows[0].errors).toEqual([]);
    expect(preview.rows[0].summary.title).toBe("Legacy File Topic");

    await commitUpload(buf, {}, actor);

    // The link came from the "Link File" column, not from the retired column
    // that sits before it — the bug positional parsing would have caused.
    const rows = await db.execute<{ link_url: string }>(sql`
      SELECT e.link_url FROM entries e
      JOIN initiatives i ON i.id = e.initiative_id
      WHERE i.title = 'Legacy File Topic'
    `);
    const [entry] = rows as unknown as Array<{ link_url: string }>;
    expect(entry.link_url).toBe("https://example.com/deck");

    // And the ticked retired column scores nothing.
    expect(await sumReason("best_presenter")).toBe(0);
  });
});

describe("D25 reversal migration (REQ-S11)", () => {
  it("nets every historical Best Presenter point to zero", async () => {
    await legacyBestPresenter("2026-07-01", initA);
    await legacyBestPresenter("2026-07-08", initA);
    expect(await sumReason("best_presenter")).toBe(2);

    const { reversed } = await reverseBestPresenter(actor);
    expect(reversed).toBe(2);
    expect(await sumReason("best_presenter")).toBe(2); // originals untouched
    expect(await sumReason("reversal")).toBe(-2); // compensated
  });

  it("leaves no leftover points on any initiative", async () => {
    await legacyBestPresenter("2026-07-01", initA);
    await reverseBestPresenter(actor);

    const rows = await db.execute<{ initiative_id: number; pts: number }>(sql`
      SELECT initiative_id, sum(points)::int AS pts FROM score_events
      WHERE initiative_id = ${initA} GROUP BY initiative_id
    `);
    const [row] = rows as unknown as Array<{ pts: number }>;
    expect(Number(row.pts)).toBe(0);
  });

  it("is idempotent and leaves other reasons alone", async () => {
    await legacyBestPresenter("2026-07-01", initA);
    await createInitiative(
      { ...baseInput, title: "Untouched", entryDate: "2026-07-02" },
      actor,
    );

    expect((await reverseBestPresenter(actor)).reversed).toBe(1);
    expect((await reverseBestPresenter(actor)).reversed).toBe(0);
    expect(await sumReason("new_initiative")).toBe(1);
  });
});
