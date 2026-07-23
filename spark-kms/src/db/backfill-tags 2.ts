import { and, eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, tags, initiativeTags } from "@/src/db/schema";

/**
 * E2 backfill: populate `tags` + `initiative_tags` from every initiative's
 * legacy `tags[]` array. Free tags, created on first use (case-insensitive).
 * Generic tags are excluded (same set as the co-tag derivation). Idempotent —
 * a second run creates no new tags or links.
 *
 *   tsx --env-file=<env> src/db/backfill-tags.ts
 */

const GENERIC = new Set(["", "all", "general", "other", "misc", "n/a"]);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function upsertTag(tx: Tx, name: string): Promise<number> {
  const [existing] = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(sql`lower(${tags.name}) = lower(${name})`)
    .limit(1);
  if (existing) return existing.id;
  const [row] = await tx.insert(tags).values({ name }).returning({ id: tags.id });
  return row.id;
}

export async function backfillTags(): Promise<{ totalTags: number; linksCreated: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: initiatives.id, tags: initiatives.tags })
      .from(initiatives);
    let linksCreated = 0;
    for (const ini of rows) {
      const seen = new Set<string>();
      for (const raw of ini.tags ?? []) {
        const name = raw.trim();
        const key = name.toLowerCase();
        if (!name || GENERIC.has(key) || seen.has(key)) continue;
        seen.add(key);
        const tagId = await upsertTag(tx, name);
        const [link] = await tx
          .select({ t: initiativeTags.tagId })
          .from(initiativeTags)
          .where(
            and(
              eq(initiativeTags.initiativeId, ini.id),
              eq(initiativeTags.tagId, tagId),
            ),
          )
          .limit(1);
        if (!link) {
          await tx.insert(initiativeTags).values({ initiativeId: ini.id, tagId });
          linksCreated++;
        }
      }
    }
    const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(tags);
    return { totalTags: Number(c), linksCreated };
  });
}

async function main() {
  const res = await backfillTags();
  console.log(`Tag backfill: ${res.totalTags} tags, ${res.linksCreated} new links.`);
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("backfill-tags.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
