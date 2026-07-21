import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { createInitiative } from "@/src/services/initiatives";
import { award, reverse } from "@/src/services/scoring";
import {
  areaLeaderboard,
  topInitiatives,
  initiativeStreamTotals,
  dashboardStats,
} from "@/src/services/scores";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";

/**
 * Property test (Gate 2): every aggregation the UI shows must equal a direct
 * SUM over score_events — no drift, including after reversals and manual streams.
 */
let actor: number;

beforeAll(async () => {
  await resetAndSeed();
  actor = await getSuperAdminId();

  // A varied dataset across areas, streams, weeks, plus a reversal.
  const a = await createInitiative(
    { title: "Alpha", region: "Sumatera", segment: "Masstige", pillar: "Social Buzz", stage: "Idea", pic: "P", entryDate: "2026-07-01", category: "Best Practice", detail: "d", bpOfWeekNominated: false, bestPresenter: false },
    actor,
  );
  const b = await createInitiative(
    { title: "Bravo", region: "CJWJ", segment: "Halal PC", pillar: "Personalized CRM", stage: "Pilot", pic: "P", entryDate: "2026-07-02", category: "Unlocking", detail: "d", bpOfWeekNominated: false, bestPresenter: false },
    actor,
  );
  // Weekly awards on Alpha's area (v1.2 two streams).
  await award({ reason: "best_presenter", initiativeId: a.initiativeId, region: "Sumatera", segment: "Masstige", effectiveDate: "2026-07-01", actorId: actor, refId: a.entryId });
  await award({ reason: "bp_of_week", initiativeId: a.initiativeId, region: "Sumatera", segment: "Masstige", effectiveDate: "2026-07-01", actorId: actor, refId: a.entryId });
  // A reversal on Bravo's entry point.
  const rows = await db.execute<{ id: number }>(sql`SELECT id FROM score_events WHERE initiative_id = ${b.initiativeId} AND reason='entry' LIMIT 1`);
  const entryEventId = Number((rows as unknown as Array<{ id: number }>)[0].id);
  await reverse(entryEventId, { actorId: actor, note: "test reversal" });
});

async function directAreaTotal(region: string, segment: string): Promise<number> {
  const r = await db.execute<{ t: number }>(sql`
    SELECT coalesce(sum(points),0)::int AS t FROM score_events
    WHERE region=${region}::region AND segment=${segment}::segment
  `);
  return Number((r as unknown as Array<{ t: number }>)[0].t);
}

describe("leaderboard == direct SUM", () => {
  it("each area's total equals a direct SUM over score_events", async () => {
    const board = await areaLeaderboard();
    for (const row of board) {
      expect(row.total).toBe(await directAreaTotal(row.region, row.segment));
    }
  });

  it("stream columns sum to the row total", async () => {
    const board = await areaLeaderboard();
    for (const row of board) {
      expect(row.best_practice + row.best_presenter).toBe(row.total);
    }
  });

  it("only areas with ≥1 initiative appear", async () => {
    const board = await areaLeaderboard();
    // We created exactly two areas.
    const areas = board.map((r) => `${r.region}/${r.segment}`).sort();
    expect(areas).toEqual(["CJWJ/Halal PC", "Sumatera/Masstige"]);
  });

  it("ties share rank (competition ranking)", async () => {
    // Craft a tie: give CJWJ/Halal PC the same total as some other area is hard;
    // instead assert the ranking function property on the returned board.
    const board = await areaLeaderboard();
    for (let i = 1; i < board.length; i++) {
      if (board[i].total === board[i - 1].total) {
        expect(board[i].rank).toBe(board[i - 1].rank);
      } else {
        expect(board[i].rank).toBeGreaterThan(board[i - 1].rank);
      }
    }
  });
});

describe("top initiatives == direct SUM", () => {
  it("each initiative's points equal a direct SUM of its linked events", async () => {
    const top = await topInitiatives();
    for (const t of top) {
      const r = await db.execute<{ s: number }>(sql`
        SELECT coalesce(sum(points),0)::int AS s FROM score_events WHERE initiative_id=${t.id}
      `);
      expect(t.points).toBe(Number((r as unknown as Array<{ s: number }>)[0].s));
    }
  });

  it("initiativeStreamTotals.total equals the linked-events SUM", async () => {
    const top = await topInitiatives();
    for (const t of top) {
      const totals = await initiativeStreamTotals(t.id);
      expect(totals.total).toBe(t.points);
    }
  });
});

describe("dashboard counts", () => {
  it("total equals the initiatives row count", async () => {
    const stats = await dashboardStats();
    const r = await db.execute<{ c: number }>(sql`SELECT count(*)::int AS c FROM initiatives`);
    expect(stats.total).toBe(Number((r as unknown as Array<{ c: number }>)[0].c));
    expect(stats.newThisWeek + stats.existing).toBe(stats.total);
  });

  it("distributions sum to the total", async () => {
    const stats = await dashboardStats();
    const sum = (o: Record<string, number>) =>
      Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(stats.byStage)).toBe(stats.total);
    expect(sum(stats.byRegion)).toBe(stats.total);
    expect(sum(stats.bySegment)).toBe(stats.total);
    expect(sum(stats.byPillar)).toBe(stats.total);
  });
});
