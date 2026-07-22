import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/src/db";
import { usageEvents } from "@/src/db/schema";
import { resetAndSeed } from "@/tests/helpers/db";
import { rollupUsageDaily } from "@/src/services/usage-retention";
import {
  topPages,
  topClicks,
  usageTrend,
  ownFrequency,
} from "@/src/services/usage-dashboard";

const NOW = new Date("2026-07-22T05:00:00Z");
const RANGE = { start: "2026-07-01", end: "2026-07-31" };

async function ev(
  daysAgo: number,
  eventType: "page_view" | "click",
  routePattern: string,
  actorHash: string,
  extra: { elementId?: string; elementText?: string } = {},
) {
  await db.insert(usageEvents).values({
    eventType,
    routePattern,
    sessionId: "s",
    actorHash,
    ts: new Date(NOW.getTime() - daysAgo * 24 * 3600 * 1000),
    elementId: extra.elementId,
    elementText: extra.elementText,
  });
}

describe("usage dashboard aggregations (T13)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    // Two actors. "me" = the caller; "them" = someone else.
    await ev(1, "page_view", "/", "me");
    await ev(1, "page_view", "/", "me");
    await ev(2, "page_view", "/", "them");
    await ev(1, "page_view", "/initiatives/[id]", "them");
    await ev(1, "click", "/", "me", { elementId: "submit-new", elementText: "Add" });
    await ev(1, "click", "/", "them", { elementId: "submit-new", elementText: "Add" });
    await ev(1, "click", "/", "them", { elementId: "nav-graph", elementText: "Graph" });
    await rollupUsageDaily();
  });

  it("ranks top pages by total views", async () => {
    const pages = await topPages(RANGE);
    expect(pages[0]).toEqual({ routePattern: "/", views: 3 });
    expect(pages.find((p) => p.routePattern === "/initiatives/[id]")?.views).toBe(1);
  });

  it("ranks top clicks by tracked element with a label", async () => {
    const clicks = await topClicks(RANGE);
    expect(clicks[0]).toEqual({ elementId: "submit-new", label: "Add", clicks: 2 });
    expect(clicks.find((c) => c.elementId === "nav-graph")?.clicks).toBe(1);
  });

  it("returns a daily trend of page views and clicks", async () => {
    const trend = await usageTrend(RANGE);
    const totalViews = trend.reduce((a, t) => a + t.pageViews, 0);
    const totalClicks = trend.reduce((a, t) => a + t.clicks, 0);
    expect(totalViews).toBe(4);
    expect(totalClicks).toBe(3);
  });

  it("own-frequency isolates to the given actor only (privacy)", async () => {
    const mine = await ownFrequency("me", RANGE);
    const mineTotal = mine.reduce((a, r) => a + r.views, 0);
    expect(mineTotal).toBe(2); // only "me" page views

    const theirs = await ownFrequency("them", RANGE);
    const theirsTotal = theirs.reduce((a, r) => a + r.views, 0);
    expect(theirsTotal).toBe(2); // "them" is 2 page views — never mixed with "me"
  });
});
