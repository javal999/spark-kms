import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  findDuplicateCandidates,
  normalizeTitle,
  DEFAULT_DEDUP_THRESHOLD,
} from "@/src/services/duplicates";
import {
  SPARK_REAL_TITLES,
  DUPLICATE_PROBES,
  NON_DUPLICATE_QUERY,
} from "@/tests/fixtures/spark-titles";
import { resetAndSeed, getSuperAdminId, insertInitiative } from "@/tests/helpers/db";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";

/**
 * Calibration test (task 1.6 gate): seed the real SPARK titles, then confirm
 * every known duplicate probe ranks its intended match in the top 3 at the
 * default 0.4 threshold — and that an unrelated title matches nothing.
 */
describe("duplicate detection calibration (pg_trgm @ 0.4)", () => {
  beforeAll(async () => {
    await resetAndSeed();
    const adminId = await getSuperAdminId();
    for (const title of SPARK_REAL_TITLES) {
      await insertInitiative(adminId, { title });
    }
  });

  afterAll(async () => {
    await db.execute(sql`SELECT 1`); // keep pool warm; truncate handled per-run
  });

  it("normalizeTitle lowercases and strips punctuation", () => {
    expect(normalizeTitle("Pop-up Store, Make Over!")).toBe(
      "pop up store make over",
    );
  });

  it.each(DUPLICATE_PROBES)(
    "ranks '$expectedMatch' in top-3 for query '$query'",
    async ({ query, expectedMatch }) => {
      const candidates = await findDuplicateCandidates(query, {
        threshold: DEFAULT_DEDUP_THRESHOLD,
      });
      const titles = candidates.map((c) => c.title);
      expect(titles).toContain(expectedMatch);
      expect(candidates.length).toBeLessThanOrEqual(3);
    },
  );

  it("returns at most 3 candidates, sorted by descending similarity", async () => {
    const candidates = await findDuplicateCandidates("Make Over pop up store", {
      threshold: 0.2,
    });
    expect(candidates.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].similarity).toBeGreaterThanOrEqual(
        candidates[i].similarity,
      );
    }
  });

  it("surfaces nothing above threshold for an unrelated title", async () => {
    const candidates = await findDuplicateCandidates(NON_DUPLICATE_QUERY, {
      threshold: DEFAULT_DEDUP_THRESHOLD,
    });
    expect(candidates).toHaveLength(0);
  });

  it("reads the default threshold from app_config when none is passed", async () => {
    // dedup_threshold seeded as 0.4; exact re-entry must still match.
    const candidates = await findDuplicateCandidates("Project ParaHub");
    expect(candidates.map((c) => c.title)).toContain("Project ParaHub");
  });
});
