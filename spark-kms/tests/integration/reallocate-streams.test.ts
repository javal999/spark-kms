import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { award } from "@/src/services/scoring";
import { reallocateStreams } from "@/src/db/reallocate-streams";
import {
  resetAndSeed,
  getSuperAdminId,
  insertInitiative,
} from "@/tests/helpers/db";

/**
 * D23 retroactive stream reallocation (REQ-S8).
 *
 * Historical `new_initiative` and `entry` events were written to the
 * best_practice stream. D23 moves them to the contribution stream so that
 * best_practice means "won Best Practice of the Week" across all time. The move
 * goes through the ledger — reverse the old event, re-issue the same points on
 * the new stream — never a raw UPDATE (REQ-S2).
 */
const AREA = { region: "Sumatera", segment: "Masstige" } as const;

let actor: number;
let initA: number;

async function sumStream(stream: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(points),0)::int` })
    .from(scoreEvents)
    .where(sql`stream = ${stream}::score_stream`);
  return total;
}

/** Write a legacy row directly: the pre-D23 shape, which award() no longer produces. */
async function legacyEvent(reason: string, effectiveDate: string, points = 1) {
  const [row] = await db
    .insert(scoreEvents)
    .values({
      region: AREA.region as never,
      segment: AREA.segment as never,
      initiativeId: initA,
      stream: "best_practice",
      points,
      effectiveDate,
      reason: reason as never,
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

describe("D23 stream reallocation (REQ-S8)", () => {
  it("moves legacy new_initiative and entry points to contribution, leaving bp_of_week alone", async () => {
    await legacyEvent("new_initiative", "2026-07-01");
    await legacyEvent("entry", "2026-07-02");
    await legacyEvent("bp_of_week", "2026-07-01", 2);

    expect(await sumStream("best_practice")).toBe(4); // 1 + 1 + 2, pre-migration
    expect(await sumStream("presenter")).toBe(0);

    const { moved, skipped } = await reallocateStreams(actor);
    expect(moved).toBe(2);
    expect(skipped).toBe(0);

    // The award total is unchanged; only its stream moved.
    expect(await sumStream("best_practice")).toBe(2); // bp_of_week only
    expect(await sumStream("presenter")).toBe(2); // new_initiative + entry
  });

  it("writes compensating events instead of deleting or updating rows", async () => {
    const originalId = await legacyEvent("new_initiative", "2026-07-01");
    await reallocateStreams(actor);

    const [orig] = await db
      .select()
      .from(scoreEvents)
      .where(sql`id = ${originalId}`);
    // The original row is untouched — history is never rewritten (REQ-S2).
    expect(orig.stream).toBe("best_practice");
    expect(orig.points).toBe(1);

    const reversals = await db
      .select()
      .from(scoreEvents)
      .where(sql`reason = 'reversal' AND ref_id = ${originalId}`);
    expect(reversals).toHaveLength(1);
    expect(reversals[0].points).toBe(-1);
  });

  it("is idempotent: a second run moves nothing", async () => {
    await legacyEvent("new_initiative", "2026-07-01");
    await legacyEvent("entry", "2026-07-02");

    expect((await reallocateStreams(actor)).moved).toBe(2);
    expect((await reallocateStreams(actor)).moved).toBe(0);
    expect(await sumStream("presenter")).toBe(2);
    expect(await sumStream("best_practice")).toBe(0);
  });

  it("leaves events already on the contribution stream untouched", async () => {
    await award({
      reason: "new_initiative",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-05",
      actorId: actor,
    });
    expect(await sumStream("presenter")).toBe(1);

    expect((await reallocateStreams(actor)).moved).toBe(0);
    expect(await sumStream("presenter")).toBe(1);
  });

  it("does not touch manual adjustments posted to best_practice", async () => {
    await award({
      reason: "adjustment",
      stream: "best_practice",
      points: 5,
      note: "dispute",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-01",
      actorId: actor,
    });

    expect((await reallocateStreams(actor)).moved).toBe(0);
    expect(await sumStream("best_practice")).toBe(5);
  });

  it("preserves the original author, area and date on the re-issued event", async () => {
    await legacyEvent("entry", "2026-06-15");
    await reallocateStreams(actor);

    const [reissued] = await db
      .select()
      .from(scoreEvents)
      .where(sql`stream = 'presenter' AND reason = 'entry'`);
    expect(reissued.effectiveDate).toBe("2026-06-15");
    expect(reissued.region).toBe(AREA.region);
    expect(reissued.segment).toBe(AREA.segment);
    expect(reissued.createdBy).toBe(actor);
    expect(reissued.initiativeId).toBe(initA);
  });
});
