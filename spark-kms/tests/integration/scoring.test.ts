import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { scoreEvents } from "@/src/db/schema";
import { award, reverse, reverseEntryScores } from "@/src/services/scoring";
import { resetAndSeed, getSuperAdminId, insertInitiative } from "@/tests/helpers/db";

/**
 * Scoring rulebook tests (requirements §5) — WRITTEN FIRST, per CLAUDE.md.
 * scoring.ts is the only module that writes score_events; these assert every
 * rule, cap, backdating behavior, and reversal.
 */

let actor: number;
let initA: number;
let initB: number;

async function sumFor(where: ReturnType<typeof sql>): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${scoreEvents.points}),0)::int` })
    .from(scoreEvents)
    .where(where);
  return total;
}

const AREA = { region: "Sumatera", segment: "Masstige" } as const;

beforeEach(async () => {
  await resetAndSeed();
  actor = await getSuperAdminId();
  initA = await insertInitiative(actor, { title: "A", ...AREA });
  initB = await insertInitiative(actor, { title: "B", ...AREA });
});

describe("contribution stream (§5.1, D23)", () => {
  it("new_initiative awards +1 to the contribution (presenter) stream", async () => {
    const r = await award({
      reason: "new_initiative",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-01",
      actorId: actor,
    });
    // D23: best_practice holds ONLY the Best-Practice-of-the-Week award.
    expect(r).toMatchObject({ status: "awarded", points: 1, stream: "presenter" });
  });

  it("entry awards +1 to the contribution stream, not best_practice", async () => {
    const r = await award({
      reason: "entry",
      initiativeId: initB,
      ...AREA,
      effectiveDate: "2026-07-03",
      actorId: actor,
    });
    expect(r).toMatchObject({ status: "awarded", points: 1, stream: "presenter" });
  });

  it("best_practice carries bp_of_week and nothing else", async () => {
    await award({ reason: "new_initiative", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-02", actorId: actor });
    await award({ reason: "bp_of_week", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });

    const rows = await db.execute<{ stream: string; reason: string }>(sql`
      SELECT stream::text AS stream, reason::text AS reason FROM score_events
      WHERE stream = 'best_practice'
    `);
    const reasons = (rows as unknown as Array<{ reason: string }>).map((r) => r.reason);
    expect(reasons).toEqual(["bp_of_week"]);
  });

  it("entry awards +1, but a second entry same initiative+date is capped (skipped)", async () => {
    const first = await award({
      reason: "entry",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-01",
      actorId: actor,
    });
    expect(first.status).toBe("awarded");

    const second = await award({
      reason: "entry",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-01",
      actorId: actor,
    });
    expect(second).toEqual({ status: "skipped", reason: "daily-cap" });

    // Only one +1 for initA.
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(1);
  });

  it("the daily cap is per-initiative (a different initiative same date still scores)", async () => {
    await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    const other = await award({ reason: "entry", initiativeId: initB, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    expect(other.status).toBe("awarded");
  });

  it("the daily cap uses effective_date, so a backdated entry is capped on its backdated date", async () => {
    // Backdated entry for 2026-06-01.
    const a = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-06-01", actorId: actor });
    expect(a.status).toBe("awarded");
    // Same backdated date → capped.
    const b = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-06-01", actorId: actor });
    expect(b.status).toBe("skipped");
    // A different (later) date → scores again.
    const c = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-06-02", actorId: actor });
    expect(c.status).toBe("awarded");
  });

  it("bp_of_week awards +2", async () => {
    const r = await award({
      reason: "bp_of_week",
      initiativeId: initA,
      ...AREA,
      effectiveDate: "2026-07-01",
      actorId: actor,
    });
    expect(r).toMatchObject({ status: "awarded", points: 2, stream: "best_practice" });
  });
});

describe("weekly award — bp_of_week (§5.1; best_presenter retired by D25)", () => {
  it("bp_of_week awards +2 best_practice, capped 1 per area per week", async () => {
    const first = await award({ reason: "bp_of_week", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    expect(first).toMatchObject({ status: "awarded", points: 2, stream: "best_practice" });
    // Same ISO week, same area (different initiative) → capped.
    const dup = await award({ reason: "bp_of_week", initiativeId: initB, ...AREA, effectiveDate: "2026-07-03", actorId: actor });
    expect(dup).toEqual({ status: "skipped", reason: "area-week-cap" });
  });

  it("the weekly cap resets next week and is per-area", async () => {
    await award({ reason: "bp_of_week", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    // bp_of_week next week → allowed.
    expect((await award({ reason: "bp_of_week", initiativeId: initA, ...AREA, effectiveDate: "2026-07-08", actorId: actor })).status).toBe("awarded");
    // same week, different area → allowed.
    expect((await award({ reason: "bp_of_week", initiativeId: initA, region: "CJWJ", segment: "Halal PC", effectiveDate: "2026-07-01", actorId: actor })).status).toBe("awarded");
  });

  it("adjustment writes the given points/stream and requires a note", async () => {
    const r = await award({
      reason: "adjustment",
      ...AREA,
      stream: "best_practice",
      points: -3,
      effectiveDate: "2026-07-01",
      actorId: actor,
      note: "manual correction after dispute",
    });
    expect(r).toMatchObject({ status: "awarded", points: -3 });
    await expect(
      award({
        reason: "adjustment",
        ...AREA,
        stream: "best_practice",
        points: 3,
        effectiveDate: "2026-07-01",
        actorId: actor,
        note: "",
      }),
    ).rejects.toThrow(/note/i);
  });
});

describe("reversal (§5.3 REQ-S2)", () => {
  it("reverse writes a compensating negative event; the area sum returns to zero", async () => {
    const r = await award({ reason: "bp_of_week", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    if (r.status !== "awarded") throw new Error("expected award");
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(2);

    const rev = await reverse(r.eventId, { actorId: actor, note: "deleted entry" });
    expect(rev.status).toBe("reversed");
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(0);
    // Original row still exists — history is never rewritten.
    const rows = await db.select().from(scoreEvents).where(sql`initiative_id = ${initA}`);
    expect(rows).toHaveLength(2);
  });

  it("reversing the same event twice is idempotent", async () => {
    const r = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    if (r.status !== "awarded") throw new Error("expected award");
    await reverse(r.eventId, { actorId: actor, note: "x" });
    const again = await reverse(r.eventId, { actorId: actor, note: "x" });
    expect(again.status).toBe("already-reversed");
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(0);
  });

  it("after reversing an entry's score, a new entry on that date can score again (cap frees up)", async () => {
    const r = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor, refId: 555 });
    if (r.status !== "awarded") throw new Error("expected award");
    await reverse(r.eventId, { actorId: actor, note: "undo" });
    const again = await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor });
    expect(again.status).toBe("awarded");
  });

  it("reverseEntryScores reverses every active event tied to an entry", async () => {
    const entryId = 4242;
    await award({ reason: "entry", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor, refId: entryId });
    await award({ reason: "bp_of_week", initiativeId: initA, ...AREA, effectiveDate: "2026-07-01", actorId: actor, refId: entryId });
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(3);

    const n = await reverseEntryScores(entryId, { actorId: actor, note: "entry deleted" });
    expect(n).toBe(2);
    expect(await sumFor(sql`initiative_id = ${initA}`)).toBe(0);
  });
});
