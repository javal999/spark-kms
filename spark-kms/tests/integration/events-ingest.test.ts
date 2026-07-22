import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { usageEvents } from "@/src/db/schema";
import { resetAndSeed } from "@/tests/helpers/db";
import {
  parseBatch,
  recordEvents,
  deriveActorHash,
  usageRateLimited,
  __resetUsageLimiter,
  BadBatchError,
  type UsageEventInput,
} from "@/src/services/usage";

const ctx = { sessionId: "sess-1", actorHash: deriveActorHash("u:1") };

function pageView(routePattern: string): UsageEventInput {
  return { eventType: "page_view", routePattern };
}

describe("usage ingest (T2)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    __resetUsageLimiter();
  });

  it("parses a valid batch with zero dropped", () => {
    const { valid, dropped } = parseBatch({
      events: [pageView("/"), pageView("/initiatives/[id]")],
    });
    expect(valid).toHaveLength(2);
    expect(dropped).toBe(0);
  });

  it("drops malformed events but keeps the valid ones", () => {
    const { valid, dropped } = parseBatch({
      events: [
        pageView("/"),
        { eventType: "nope", routePattern: "/" }, // bad enum
        { eventType: "click" }, // missing routePattern
        { eventType: "click", routePattern: "/", clickXNorm: 5 }, // out of 0..1
      ],
    });
    expect(valid).toHaveLength(1);
    expect(dropped).toBe(3);
  });

  it("rejects a non-batch body with BadBatchError (→ 400)", () => {
    expect(() => parseBatch({ nope: true })).toThrow(BadBatchError);
    expect(() => parseBatch([pageView("/")])).toThrow(BadBatchError);
    expect(() => parseBatch("garbage")).toThrow(BadBatchError);
  });

  it("stores the valid rows with the supplied identity", async () => {
    const stored = await recordEvents(
      [pageView("/"), { eventType: "click", routePattern: "/", elementId: "submit" }],
      ctx,
    );
    expect(stored).toBe(2);
    const rows = await db.select().from(usageEvents);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sessionId === "sess-1")).toBe(true);
    expect(rows.every((r) => r.actorHash === ctx.actorHash)).toBe(true);
  });

  it("persists no PII: the store has no identity columns", async () => {
    await recordEvents([pageView("/")], ctx);
    const cols = (await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='usage_events'
    `)) as unknown as { column_name: string }[];
    const names = cols.map((c) => c.column_name.toLowerCase());
    for (const banned of ["ip", "email", "user_agent", "user_id", "name"]) {
      expect(names).not.toContain(banned);
    }
  });

  it("actor hash is deterministic and does not expose the identity", () => {
    const h = deriveActorHash("u:42");
    expect(h).toBe(deriveActorHash("u:42"));
    expect(h).not.toContain("42");
    expect(deriveActorHash("u:42")).not.toBe(deriveActorHash("u:43"));
  });

  it("rate-limits a flood from one session", () => {
    const now = 1_000_000;
    let limited = false;
    for (let i = 0; i < 130; i++) {
      limited = usageRateLimited("flood", now, 120, 60_000);
    }
    expect(limited).toBe(true);
    // A different session in the same window is unaffected.
    expect(usageRateLimited("other", now, 120, 60_000)).toBe(false);
  });
});
