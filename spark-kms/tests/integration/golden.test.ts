import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { createInitiative } from "@/src/services/initiatives";
import { award } from "@/src/services/scoring";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import {
  SPARK_45,
  EXPECTED_BP_BY_REGION,
  EXPECTED_BP_BY_AREA,
  EXPECTED_BP_TOTAL,
  EXPECTED_CONFIRMED_FLAGS,
} from "@/tests/fixtures/spark-45";

/**
 * THE GOLDEN TEST (task 2.3) — the single most valuable test in the project.
 *
 * Replays the 45 real SPARK entries through the REAL scoring path (create →
 * +1 new +1 entry; confirm → +2 bp_of_week) and proves the engine reproduces
 * the file's "Dashboard Final" Best-Practice recap exactly, per Area and per
 * Region. The expected numbers come from the file, not from SPARK_45, so a
 * scoring bug (wrong points, wrong Area attribution, wrong aggregation) breaks
 * this test.
 *
 * The fixture is IMMUTABLE: if a scoring change breaks this, the change is wrong.
 */
describe("GOLDEN: replaying the 45 real entries reproduces the file's per-area BP scores", () => {
  beforeAll(async () => {
    await resetAndSeed();
    const actor = await getSuperAdminId();

    for (const e of SPARK_45) {
      const { initiativeId, entryId } = await createInitiative(
        {
          title: e.title,
          region: e.region as never,
          segment: e.segment as never,
          pillar: e.pillar as never,
          stage: "Idea",
          pic: "Fixture",
          entryDate: e.date,
          category: e.category,
          detail: e.title,
          bpOfWeekNominated: e.bpConfirmed,
        },
        actor,
      );
      // A nomination alone scores nothing; the super-admin confirm awards +2.
      if (e.bpConfirmed) {
        await award({
          reason: "bp_of_week",
          initiativeId,
          region: e.region,
          segment: e.segment,
          effectiveDate: e.date,
          actorId: actor,
          refId: entryId,
        });
      }
    }
  });

  it("fixture integrity: 45 entries, 14 confirmed flags", () => {
    expect(SPARK_45).toHaveLength(45);
    expect(SPARK_45.filter((e) => e.bpConfirmed)).toHaveLength(
      EXPECTED_CONFIRMED_FLAGS,
    );
  });

  it("total bp_of_week points = 28 (2 × 14 flags)", async () => {
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(points),0)::int` })
      .from(sql`score_events`)
      .where(sql`reason = 'bp_of_week'`);
    expect(total).toBe(EXPECTED_BP_TOTAL);
  });

  it("per-REGION bp scores match the file's Dashboard Final recap exactly", async () => {
    const rows = await db.execute<{ region: string; pts: number }>(sql`
      SELECT region::text AS region, sum(points)::int AS pts
      FROM score_events WHERE reason = 'bp_of_week'
      GROUP BY region
    `);
    const got: Record<string, number> = {};
    for (const r of rows as unknown as Array<{ region: string; pts: number }>) {
      got[r.region] = Number(r.pts);
    }
    expect(got).toEqual(EXPECTED_BP_BY_REGION);
  });

  it("per-AREA (region × segment) bp scores match the hand-verified expected map", async () => {
    const rows = await db.execute<{
      region: string;
      segment: string;
      pts: number;
    }>(sql`
      SELECT region::text AS region, segment::text AS segment, sum(points)::int AS pts
      FROM score_events WHERE reason = 'bp_of_week'
      GROUP BY region, segment
    `);
    const got: Record<string, number> = {};
    for (const r of rows as unknown as Array<{
      region: string;
      segment: string;
      pts: number;
    }>) {
      got[`${r.region} / ${r.segment}`] = Number(r.pts);
    }
    expect(got).toEqual(EXPECTED_BP_BY_AREA);
  });
});
