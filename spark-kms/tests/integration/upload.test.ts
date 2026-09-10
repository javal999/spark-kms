import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, entries } from "@/src/db/schema";
import {
  previewUpload,
  commitUpload,
  parseWorkbook,
  UploadError,
  MAX_UPLOAD_ROWS,
} from "@/src/services/upload";
import { createInitiative } from "@/src/services/initiatives";
import { buildUploadFile, validRow } from "@/tests/helpers/xlsx";
import { resetAndSeed, getSuperAdminId, insertInitiative } from "@/tests/helpers/db";

let actor: number;

beforeEach(async () => {
  await resetAndSeed();
  actor = await getSuperAdminId();
});

async function countInitiatives() {
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(initiatives);
  return c;
}

describe("normalizer (REQ-U8)", () => {
  it("normalizes ALL→All, Teens & ES→Teen & ES, and case/whitespace", async () => {
    const buf = await buildUploadFile([
      validRow({ Segment: "  ALL " }),
      validRow({ Segment: "Teens & ES", Region: "cjwj", Pillar: "social buzz" }),
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows[0].data?.segment).toBe("All");
    expect(rows[1].data?.segment).toBe("Teen & ES");
    expect(rows[1].data?.region).toBe("CJWJ");
    expect(rows[1].data?.pillar).toBe("Social Buzz");
  });

  it("fails off-enum values with a clear per-row error (Papua)", async () => {
    const buf = await buildUploadFile([
      validRow({ Region: "Papua" }),
      validRow({ Pillar: "Radical Synergy" }),
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows[0].errors.join()).toMatch(/Papua.*not a valid region/i);
    expect(rows[1].errors.join()).toMatch(/Radical Synergy.*not a valid pillar/i);
  });

  it("imports the CEE pillar under its full name, and still accepts 'CEE' (D32)", async () => {
    // The rename is what the regions were already typing; the abbreviation has
    // to keep working because every template in circulation puts it in the
    // Pillar dropdown. Both spellings must land on the SAME stored value.
    const buf = await buildUploadFile([
      validRow({ Pillar: "Core Excellence Execution" }),
      validRow({ Pillar: "CEE" }),
      validRow({ Pillar: "  cee  " }),
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows.map((r) => r.errors)).toEqual([[], [], []]);
    expect(rows.map((r) => r.data?.pillar)).toEqual([
      "Core Excellence Execution",
      "Core Excellence Execution",
      "Core Excellence Execution",
    ]);
  });
});

describe("preview (dry-run)", () => {
  it("marks rows new / duplicate / error", async () => {
    await insertInitiative(actor, { title: "Existing Topic", region: "Sumatera", segment: "Masstige" });
    const buf = await buildUploadFile([
      validRow({ "Topic/Tema": "Brand New Topic" }),
      validRow({ "Topic/Tema": "Existing Topic" }),
      validRow({ Region: "Atlantis" }),
    ]);
    const res = await previewUpload(buf, "f.xlsx", actor);
    const byStatus = Object.fromEntries(res.rows.map((r) => [r.summary.title || r.rowNumber, r.status]));
    expect(byStatus["Brand New Topic"]).toBe("new");
    expect(byStatus["Existing Topic"]).toBe("duplicate");
    expect(res.rows.find((r) => r.summary.region === "Atlantis")?.status).toBe("error");
    expect(res.counts).toMatchObject({ total: 3, valid: 1, duplicate: 1, error: 1 });
  });
});

describe("commit (all-or-nothing)", () => {
  it("a file with one bad row commits NOTHING", async () => {
    const before = await countInitiatives();
    const buf = await buildUploadFile([
      validRow({ "Topic/Tema": "Good One" }),
      validRow({ "Topic/Tema": "Bad One", Region: "Nowhere" }),
    ]);
    await previewUpload(buf, "f.xlsx", actor);
    await expect(commitUpload(buf, {}, actor)).rejects.toBeInstanceOf(UploadError);
    expect(await countInitiatives()).toBe(before); // nothing written
  });

  it("re-committing the same file is blocked", async () => {
    const buf = await buildUploadFile([validRow({ "Topic/Tema": "Once Only" })]);
    await previewUpload(buf, "f.xlsx", actor);
    const first = await commitUpload(buf, {}, actor);
    expect(first.created).toBe(1);
    await expect(commitUpload(buf, {}, actor)).rejects.toMatchObject({ status: 409 });
    // And re-preview is blocked too.
    await expect(previewUpload(buf, "f.xlsx", actor)).rejects.toMatchObject({ status: 409 });
  });

  it("duplicate rows respect the resolved choice (append vs new)", async () => {
    const existingId = await insertInitiative(actor, {
      title: "Shared Topic",
      region: "Sumatera",
      segment: "Masstige",
    });

    // APPEND choice → no new initiative, but a new entry on the existing one.
    const appendBuf = await buildUploadFile([validRow({ "Topic/Tema": "Shared Topic", Progress: "appended progress" })]);
    const appendPreview = await previewUpload(appendBuf, "a.xlsx", actor);
    const rn = appendPreview.rows[0].rowNumber;
    const beforeCount = await countInitiatives();
    const appendRes = await commitUpload(appendBuf, { [rn]: { action: "append", initiativeId: existingId } }, actor);
    expect(appendRes).toMatchObject({ created: 0, appended: 1 });
    expect(await countInitiatives()).toBe(beforeCount);
    const [{ c: entryCount }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(entries)
      .where(sql`initiative_id = ${existingId}`);
    expect(entryCount).toBe(1);

    // NEW choice on a different file → a separate initiative is created.
    const newBuf = await buildUploadFile([validRow({ "Topic/Tema": "Shared Topic", Progress: "brand new" })]);
    const newPreview = await previewUpload(newBuf, "b.xlsx", actor);
    const rn2 = newPreview.rows[0].rowNumber;
    const newRes = await commitUpload(newBuf, { [rn2]: { action: "new" } }, actor);
    expect(newRes.created).toBe(1);
    expect(await countInitiatives()).toBe(beforeCount + 1);
  });

  it("a new row missing its pillar is rejected (pillar required for new topics)", async () => {
    const buf = await buildUploadFile([validRow({ "Topic/Tema": "No Pillar Topic", Pillar: "" })]);
    await previewUpload(buf, "f.xlsx", actor);
    await expect(commitUpload(buf, {}, actor)).rejects.toMatchObject({ status: 422 });
    expect(await countInitiatives()).toBe(0);
  });
});

describe("empty required enums (regression: undefined-data commit crash)", () => {
  it("flags an empty Region as a row error instead of silently valid", async () => {
    const buf = await buildUploadFile([
      validRow({ "Topic/Tema": "No Region", Region: "" }),
    ]);
    const { rows } = await parseWorkbook(buf);
    expect(rows[0].errors.join()).toMatch(/Region is required/i);
    expect(rows[0].data).toBeUndefined();
  });

  it("preview marks an empty-Segment row as error (was mis-counted as new)", async () => {
    const buf = await buildUploadFile([
      validRow({ "Topic/Tema": "Blank Segment", Segment: "" }),
    ]);
    const res = await previewUpload(buf, "f.xlsx", actor);
    expect(res.rows[0].status).toBe("error");
    expect(res.counts).toMatchObject({ error: 1, valid: 0 });
  });

  it("commit rejects an empty-Category row with a 422 instead of crashing", async () => {
    // The exact reported bug: a blank required enum used to yield data:undefined
    // that slipped past validation and threw `Cannot read properties of
    // undefined (reading 'pillar')`. It must now be a clean UploadError.
    const buf = await buildUploadFile([
      validRow({ "Topic/Tema": "Blank Category", Category: "" }),
    ]);
    await previewUpload(buf, "f.xlsx", actor);
    const err = await commitUpload(buf, {}, actor).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect((err as UploadError).status).toBe(422);
    expect(await countInitiatives()).toBe(0);
  });
});

describe("idempotency of scoring — form vs upload produce identical points", () => {
  it("an initiative created by upload scores the same as one created by form", async () => {
    // Via form service.
    await createInitiative(
      { title: "Form Topic", region: "EJBN", segment: "Halal PC", pillar: "Social Buzz", stage: "Idea", pic: "P", entryDate: "2026-07-01", category: "Best Practice", detail: "d", bpOfWeekNominated: false },
      actor,
    );
    // Via upload.
    const buf = await buildUploadFile([
      validRow({ "Topic/Tema": "Upload Topic", Region: "EJBN", Segment: "Halal PC", Pillar: "Social Buzz", Tanggal: "2026-07-01", Category: "Best Practice", Progress: "d" }),
    ]);
    await previewUpload(buf, "f.xlsx", actor);
    await commitUpload(buf, {}, actor);

    const sums = await db.execute<{ title: string; pts: number }>(sql`
      SELECT i.title AS title, coalesce(sum(se.points),0)::int AS pts
      FROM initiatives i LEFT JOIN score_events se ON se.initiative_id = i.id
      WHERE i.title IN ('Form Topic','Upload Topic') GROUP BY i.title
    `);
    const map = Object.fromEntries(
      (sums as unknown as Array<{ title: string; pts: number }>).map((r) => [r.title, Number(r.pts)]),
    );
    expect(map["Upload Topic"]).toBe(map["Form Topic"]); // +1 new (first entry folds in) = 1 each
    expect(map["Upload Topic"]).toBe(1);
  });
});

describe("row limit (REQ-U4)", () => {
  it(`accepts ${MAX_UPLOAD_ROWS} rows and rejects ${MAX_UPLOAD_ROWS + 1}`, async () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => validRow({ "Topic/Tema": `Row ${i}` }));

    const ok = await buildUploadFile(make(MAX_UPLOAD_ROWS));
    const okPreview = await previewUpload(ok, "500.xlsx", actor);
    expect(okPreview.counts.total).toBe(MAX_UPLOAD_ROWS);

    const tooMany = await buildUploadFile(make(MAX_UPLOAD_ROWS + 1));
    await expect(previewUpload(tooMany, "501.xlsx", actor)).rejects.toMatchObject({ status: 400 });
  });
});

describe("outdated template version (REQ-U0)", () => {
  it("warns but does not reject an old template version", async () => {
    const buf = await buildUploadFile([validRow({ "Topic/Tema": "Old Template Row" })], { version: "v0.9" });
    const res = await previewUpload(buf, "old.xlsx", actor);
    expect(res.templateOutdated).toBe(true);
    expect(res.rows).toHaveLength(1);
    // Still commits fine.
    const commit = await commitUpload(buf, {}, actor);
    expect(commit.created).toBe(1);
  });
});
