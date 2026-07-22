import { and, eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { tags, initiativeTags } from "@/src/db/schema";

/**
 * Tag write helpers (Phase 8, E11). The only place tags are written to the
 * `tags` + `initiative_tags` tables. Free tags, created on first use
 * (case-insensitive); generic tags excluded. Used by create/edit and the
 * one-shot backfill so the logic lives once.
 */

export const GENERIC_TAGS = new Set(["", "all", "general", "other", "misc", "n/a"]);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Find-or-create a tag by name (case-insensitive). Returns the tag id. */
export async function upsertTag(tx: Tx, name: string): Promise<number> {
  const [existing] = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(sql`lower(${tags.name}) = lower(${name})`)
    .limit(1);
  if (existing) return existing.id;
  const [row] = await tx.insert(tags).values({ name }).returning({ id: tags.id });
  return row.id;
}

/** Ensure the initiative is linked to exactly the given tags (adds missing links). */
export async function addInitiativeTags(
  tx: Tx,
  initiativeId: number,
  tagList: string[] | null | undefined,
): Promise<void> {
  if (!tagList?.length) return;
  const seen = new Set<string>();
  for (const raw of tagList) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || GENERIC_TAGS.has(key) || seen.has(key)) continue;
    seen.add(key);
    const tagId = await upsertTag(tx, name);
    const [link] = await tx
      .select({ t: initiativeTags.tagId })
      .from(initiativeTags)
      .where(
        and(eq(initiativeTags.initiativeId, initiativeId), eq(initiativeTags.tagId, tagId)),
      )
      .limit(1);
    if (!link) await tx.insert(initiativeTags).values({ initiativeId, tagId });
  }
}
