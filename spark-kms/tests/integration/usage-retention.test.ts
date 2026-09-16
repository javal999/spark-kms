import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { usageEvents, usageDaily } from "@/src/db/schema";
import { resetAndSeed } from "@/tests/helpers/db";
import { rollupUsageDaily, purgeOldEvents, runRetention } from "@/src/services/usage-retention";

const NOW = new Date("2026-07-22T05:00:00Z");

async function seedEvent(daysAgo: number, routePattern: string, eventType: "page_view" | "click") {
  const ts = new Date(NOW.getTime() - daysAgo * 24 * 3600 * 1000);
  await db.insert(usageEvents).values({
    eventType,
    routePattern,
    sessionId: "s",
    actorHash: "h",
    ts,
  });
}

async function seedAt(ts: Date, routePattern: string) {
  await db.insert(usageEvents).values({
    eventType: "page_view",
    routePattern,
    sessionId: "s",
    actorHash: "h",
    ts,
  });
}

async function rawCount(): Promise<number> {
  const [{ c }] = (await db.execute(
    sql`SELECT count(*)::int AS c FROM usage_events`,
  )) as unknown as { c: number }[];
  return c;
}

async function dailyRows() {
  return db
    .select({
      day: usageDaily.day,
      route: usageDaily.routePattern,
      type: usageDaily.eventType,
      count: usageDaily.count,
    })
    .from(usageDaily)
    .orderBy(usageDaily.day, usageDaily.routePattern);
}

describe("usage retention + rollup (T4)", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });

  it("rolls up raw events into correct daily counts", async () => {
    await seedEvent(1, "/", "page_view");
    await seedEvent(1, "/", "page_view");
    await seedEvent(1, "/", "click");
    await seedEvent(2, "/initiatives/[id]", "page_view");
    await rollupUsageDaily();
    const rows = await dailyRows();
    const home = rows.find((r) => r.route === "/" && r.type === "page_view");
    expect(home?.count).toBe(2);
    expect(rows.find((r) => r.route === "/" && r.type === "click")?.count).toBe(1);
    expect(rows.find((r) => r.route === "/initiatives/[id]")?.count).toBe(1);
  });

  it("purges only events older than 90 days; recent survive", async () => {
    await seedEvent(120, "/old", "page_view"); // > 90d
    await seedEvent(10, "/recent", "page_view"); // < 90d
    const purged = await purgeOldEvents(NOW);
    expect(purged).toBe(1);
    const [{ c }] = (await db.execute(
      sql`SELECT count(*)::int AS c FROM usage_events`,
    )) as unknown as { c: number }[];
    expect(c).toBe(1); // only the recent one remains
  });

  it("aggregate survives the purge (rollup runs first)", async () => {
    await seedEvent(120, "/old", "page_view");
    await seedEvent(120, "/old", "page_view");
    await runRetention(NOW);
    // raw old rows gone…
    const [{ c }] = (await db.execute(
      sql`SELECT count(*)::int AS c FROM usage_events`,
    )) as unknown as { c: number }[];
    expect(c).toBe(0);
    // …but the daily aggregate persists.
    const rows = await dailyRows();
    expect(rows.find((r) => r.route === "/old")?.count).toBe(2);
  });

  it("is idempotent: a second pass changes nothing", async () => {
    await seedEvent(5, "/", "page_view");
    await seedEvent(5, "/", "page_view");
    await runRetention(NOW);
    const first = await dailyRows();
    await runRetention(NOW);
    const second = await dailyRows();
    expect(second).toEqual(first);
    expect(first.find((r) => r.route === "/")?.count).toBe(2);
  });

  /**
   * NOW is 12:00 WIB on 2026-07-22, so NOW − 90 days is 12:00 WIB on 2026-04-23:
   * the purge cutoff falls in the MIDDLE of that Jakarta day. The rollup buckets
   * by whole Jakarta day and overwrites (`SET count = excluded.count`), so if a
   * purge removes only the morning of 04-23, the next night's rollup recomputes
   * 04-23 from the afternoon alone and overwrites the true count with a smaller
   * one — permanently, because once the rest is purged nothing recomputes it.
   */
  it("keeps the full count for a day the purge cutoff falls inside, across nights", async () => {
    await seedAt(new Date("2026-04-23T01:00:00Z"), "/straddle"); // 08:00 WIB, before the cutoff
    await seedAt(new Date("2026-04-23T09:00:00Z"), "/straddle"); // 16:00 WIB, after it

    await runRetention(NOW);
    await runRetention(new Date(NOW.getTime() + 24 * 3600 * 1000)); // the next night
    await runRetention(new Date(NOW.getTime() + 2 * 24 * 3600 * 1000));

    expect((await dailyRows()).find((r) => r.route === "/straddle")?.count).toBe(2);
  });

  it("never deletes an event younger than 90 days", async () => {
    const H = 3600 * 1000;
    await seedAt(new Date(NOW.getTime() - (90 * 24 * H - 60 * 1000)), "/young"); // 90d minus a minute
    await seedAt(new Date(NOW.getTime() - 89 * 24 * H), "/young");
    expect(await purgeOldEvents(NOW)).toBe(0);
    expect(await rawCount()).toBe(2);
  });

  it("deletes a Jakarta day whole once it is more than 90 days before today", async () => {
    // 2026-04-21 in Jakarta, 23:59 WIB — the last minute of a day 92 days before 07-22.
    await seedAt(new Date("2026-04-21T16:59:00Z"), "/stale");
    // 2026-04-22 00:00 WIB — the first minute of the day 91 days before.
    await seedAt(new Date("2026-04-21T17:00:00Z"), "/stale");
    await purgeOldEvents(NOW);
    expect(await rawCount()).toBe(0);
  });
});
