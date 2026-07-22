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
});
