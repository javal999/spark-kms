import { describe, it, expect, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, scoreEvents } from "@/src/db/schema";
import { previewUpload, commitUpload } from "@/src/services/upload";
import { buildUploadFile, validRow } from "@/tests/helpers/xlsx";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";

/**
 * Task 1 (bulk-upload scoring): a bulk-uploaded row that flags Best Practice of
 * the Week awards +2 to the Best Practice stream, and a row that flags Best
 * Presenter of the Week awards +1 to the Presenter stream. New initiatives still
 * get +1 (best_practice; the first entry folds in), so BP/Presenter points stack
 * on top of that +1 without double counting.
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
      // C: new topic flagged Best Presenter of the Week — +1 new (BP stream), +1 presenter.
      validRow({
        "Topic/Tema": "Best Presenter Topic",
        Region: "EJBN",
        Segment: "All",
        "Best Presenter of the Week": "TRUE",
      }),
    ]);

    await previewUpload(buf, "scoring.xlsx", actor);
    const res = await commitUpload(buf, {}, actor);
    expect(res.created).toBe(3);

    const plain = await idByTitle("Plain Topic");
    const bp = await idByTitle("Best Practice Topic");
    const presenter = await idByTitle("Best Presenter Topic");

    // Per-initiative: the new-initiative +1 lands on best_practice; the weekly
    // flags stack on their own stream.
    expect(await initiativeStream(plain, "best_practice")).toBe(1);
    expect(await initiativeStream(plain, "presenter")).toBe(0);

    expect(await initiativeStream(bp, "best_practice")).toBe(3); // +1 new, +2 bp_of_week
    expect(await initiativeStream(bp, "presenter")).toBe(0);

    expect(await initiativeStream(presenter, "best_practice")).toBe(1); // +1 new only
    expect(await initiativeStream(presenter, "presenter")).toBe(1); // Best Presenter = +1

    // Global per-stream sums.
    expect(await streamTotal("presenter")).toBe(1);
    expect(await streamTotal("best_practice")).toBe(5); // 1 + 3 + 1
  });
});
