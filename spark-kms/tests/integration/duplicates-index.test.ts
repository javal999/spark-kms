import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { normalizedTitleSql } from "@/src/services/duplicates";
import { createInitiative } from "@/src/services/initiatives";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import type { NewInitiativeInput } from "@/src/validation/entry";

/**
 * Regression guard for the 2026-07-28 bulk-upload timeout: the trigram index
 * MUST match findDuplicateCandidates' normalized-title expression, or every row
 * falls back to a sequential scan (fast on a tiny DB, minutes in prod → gateway
 * timeout). We force the planner off seq scans and assert the query can use the
 * index. If someone changes the query expression or the index and they drift
 * apart, the plan loses the index and this fails.
 */
describe("duplicate detection is index-backed (drift guard)", () => {
  beforeAll(async () => {
    await resetAndSeed();
    const actor = await getSuperAdminId();
    await createInitiative(
      {
        title: "Seed Topic",
        region: "Kalimantan",
        segment: "Masstige",
        pillar: "Social Buzz",
        stage: "Idea",
        pic: "P",
        entryDate: "2026-07-01",
        category: "Best Practice",
        detail: "d",
        bpOfWeekNominated: false,
        bestPresenter: false,
      } as NewInitiativeInput,
      actor,
    );
  });

  it("EXPLAIN uses the trigram index, not a seq scan", async () => {
    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      const rows = await tx.execute(sql`
        EXPLAIN SELECT initiatives.id
        FROM initiatives
        WHERE ${normalizedTitleSql} % ${"seed topic"}
          AND similarity(${normalizedTitleSql}, ${"seed topic"}) >= 0.4
      `);
      return (rows as unknown as Array<Record<string, string>>)
        .map((r) => String(r["QUERY PLAN"]))
        .join("\n");
    });
    expect(plan).toContain("initiatives_title_trgm_idx");
    expect(plan).not.toMatch(/Seq Scan/);
  });
});
