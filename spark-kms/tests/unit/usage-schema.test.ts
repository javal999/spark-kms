import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/src/db";

/**
 * T1 acceptance: usage_events carries NO PII. A schema-level guard so a future
 * column addition that leaks identity fails CI, not review.
 */
describe("usage_events schema (T1)", () => {
  async function columns(table: string): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
    `);
    return (rows as unknown as { column_name: string }[]).map((r) =>
      r.column_name.toLowerCase(),
    );
  }

  it("has no PII columns", async () => {
    const cols = await columns("usage_events");
    for (const banned of [
      "ip",
      "ip_address",
      "email",
      "user_agent",
      "useragent",
      "full_name",
      "name",
      "user_id",
    ]) {
      expect(cols).not.toContain(banned);
    }
  });

  it("has the expected pseudonymous columns", async () => {
    const cols = await columns("usage_events");
    for (const expected of ["route_pattern", "actor_hash", "session_id", "event_type", "ts"]) {
      expect(cols).toContain(expected);
    }
  });
});
