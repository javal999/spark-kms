import { describe, it, expect, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, scoreEvents } from "@/src/db/schema";
import { previewUpload, commitUpload } from "@/src/services/upload";
import { buildUploadFile, validRow } from "@/tests/helpers/xlsx";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";

/**
 * Bulk-upload scoring: a row that flags Best Practice of the Week awards +2 to
 * the Best Practice stream — the only thing that stream carries (D23) — and
 * every new initiative earns +1 (the first entry folds in) on the Contribution
 * stream (`presenter`). Best Presenter was retired by D25.
 *
 * Rows sit in distinct Areas (region × segment) so the 1-per-Area-per-week cap on
 * the weekly awards never interferes with the assertions.
 */
let actor: number;

async function streamTotal(stream: string): Promise<number> {
  const [{ t }] = await db
    .select({ t: sql<number>`coalesce(sum(points),0)::int` })
    .from(scoreEvents)
    .where(eq(scoreEvents.stream, stream as never));
  return t;
}

async function initiativeStream(initiativeId: number, stream: string): Promise<number> {
  const [{ t }] = await db
    .select({ t: sql<number>`coalesce(sum(points),0)::int` })
    .from(scoreEvents)
    .where(
      and(
        eq(scoreEvents.initiativeId, initiativeId),
        eq(scoreEvents.stream, stream as never),
      ),
    );
  return t;
}

async function idByTitle(title: string): Promise<number> {
  const [row] = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(eq(initiatives.title, title))
    .limit(1);
  return row.id;
}

describe("bulk-upload scoring: BP of the Week = +2, Best Presenter = +1", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
  });

  it("awards the right per-stream points after commit", async () => {
    const buf = await buildUploadFile([
      // A: plain new topic — only the +1 new-initiative award.
      validRow({
        "Topic/Tema": "Plain Topic",
        Region: "Sumatera",
        Segment: "Masstige",
      }),
      // B: new topic flagged Best Practice of the Week — +1 new, +2 bp.
      validRow({
        "Topic/Tema": "Best Practice Topic",
        Region: "CJWJ",
        Segment: "Halal PC",
        "Best Practices of The Week": "TRUE",
      }),
      // C: a plain new topic in a third area — +1 new only. (The Best Presenter
      // column was removed from the template by D25.)
      validRow({
        "Topic/Tema": "Third Topic",
        Region: "EJBN",
        Segment: "All",
      }),
    ]);

    await previewUpload(buf, "scoring.xlsx", actor);
    const res = await commitUpload(buf, {}, actor);
    expect(res.created).toBe(3);

    const plain = await idByTitle("Plain Topic");
    const bp = await idByTitle("Best Practice Topic");
    const third = await idByTitle("Third Topic");

    // D23: best_practice holds ONLY bp_of_week; the new-initiative +1 is a
    // contribution point on the presenter stream.
    expect(await initiativeStream(plain, "best_practice")).toBe(0);
    expect(await initiativeStream(plain, "presenter")).toBe(1); // +1 new

    expect(await initiativeStream(bp, "best_practice")).toBe(2); // +2 bp_of_week
    expect(await initiativeStream(bp, "presenter")).toBe(1); // +1 new

    expect(await initiativeStream(third, "best_practice")).toBe(0);
    expect(await initiativeStream(third, "presenter")).toBe(1); // +1 new

    // Global per-stream sums.
    expect(await streamTotal("presenter")).toBe(3); // 1 + 1 + 1
    expect(await streamTotal("best_practice")).toBe(2); // bp_of_week only
    // D25: nothing anywhere carries a Best Presenter point.
    const [{ bp: presenterAwards }] = await db
      .select({ bp: sql<number>`coalesce(sum(points),0)::int` })
      .from(scoreEvents)
      .where(sql`reason = 'best_presenter'`);
    expect(presenterAwards).toBe(0);
  });
});
