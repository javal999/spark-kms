import { describe, it, expect, beforeEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { tags, initiativeTags, initiatives } from "@/src/db/schema";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";

/**
 * E1 acceptance: the entity-graph schema is additive — tags + initiative_tags
 * exist with a unique pair, initiatives gains a nullable pic_person_id, and the
 * legacy tags[] array is NOT dropped.
 */
describe("entity-graph schema (E1)", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });

  async function cols(table: string): Promise<string[]> {
    const rows = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
    `);
    return (rows as unknown as { column_name: string }[]).map((r) => r.column_name);
  }

  it("keeps the legacy tags[] column and adds a nullable pic_person_id", async () => {
    const c = await cols("initiatives");
    expect(c).toContain("tags"); // not dropped (transition mirror)
    expect(c).toContain("pic_person_id");
  });

  it("blocks a duplicate initiative_tags pair", async () => {
    const actor = await getSuperAdminId();
    const [ini] = await db
      .insert(initiatives)
      .values({
        title: "T",
        region: "Jakarta Greater",
        segment: "Masstige",
        pillar: "Social Buzz",
        stage: "Idea",
        pic: "P",
        createdBy: actor,
      })
      .returning({ id: initiatives.id });
    const [tag] = await db.insert(tags).values({ name: "pop-up" }).returning({ id: tags.id });

    await db.insert(initiativeTags).values({ initiativeId: ini.id, tagId: tag.id });
    await expect(
      db.insert(initiativeTags).values({ initiativeId: ini.id, tagId: tag.id }),
    ).rejects.toThrow();
  });

  it("enforces case-insensitive tag uniqueness", async () => {
    await db.insert(tags).values({ name: "Pop-Up" });
    await expect(db.insert(tags).values({ name: "pop-up" })).rejects.toThrow();
    const rows = await db.select().from(tags).where(eq(tags.name, "Pop-Up"));
    expect(rows).toHaveLength(1);
  });
});
