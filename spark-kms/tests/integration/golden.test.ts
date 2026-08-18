import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { createInitiative } from "@/src/services/initiatives";
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
 * +1 new, first entry folds in; confirm → +2 bp_of_week) and proves the engine reproduces
 * the file's "Dashboard Final" Best-Practice recap exactly, per Area and per
 * Region. The expected numbers come from the file, not from SPARK_45, so a
 * scoring bug (wrong points, wrong Area attribution, wrong aggregation) breaks
 * this test.
 *
 * The fixture is IMMUTABLE: if a scoring change breaks this, the change is wrong.
 *
 * v1.2 re-baseline (plan B4/REQ-S7): bp_of_week now caps at 1/Area/week, so an
 * Area/week with multiple confirmed flags scores +2 once (not +2 per flag). The
 * EXPECTED_* maps were recomputed by hand for the capped model (see the fixture
 * comment) — 20 points total, not 28. Re-baselined and un-quarantined.
 */
describe("GOLDEN: replaying the 45 real entries reproduces the file's per-area BP scores", () => {
  beforeAll(async () => {
    await resetAndSeed();
    const actor = await getSuperAdminId();

    for (const e of SPARK_45) {
      // v1.2: bp_of_week now auto-awards +2 at create when nominated (capped
      // 1/Area/week), so no separate confirm/award step.
      await createInitiative(
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
    }
  });

  it("fixture integrity: 45 entries, 14 confirmed flags", () => {
    expect(SPARK_45).toHaveLength(45);
    expect(SPARK_45.filter((e) => e.bpConfirmed)).toHaveLength(
      EXPECTED_CONFIRMED_FLAGS,
    );
  });

  it("total bp_of_week points = 20 (capped 1/Area/week over 14 flags)", async () => {
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
