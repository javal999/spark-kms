import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives } from "@/src/db/schema";
import { upsertByName } from "@/src/services/people";

/**
 * E3 backfill: resolve each initiative's free-text `pic` to a `people` row and
 * set `pic_person_id`. New PICs create a people row (free, like tags), reusing
 * the case-insensitive `upsertByName`. Idempotent — re-running sets the same id.
 * Blank PICs are counted and left null.
 *
 *   tsx --env-file=<env> src/db/backfill-pic.ts
 */
export async function backfillPic(
  actorId?: number,
): Promise<{ resolved: number; blank: number }> {
  const rows = await db
    .select({ id: initiatives.id, pic: initiatives.pic })
    .from(initiatives);
  let resolved = 0;
  let blank = 0;
  for (const ini of rows) {
    const name = ini.pic?.trim();
    if (!name) {
      blank++;
      continue;
    }
    const personId = await upsertByName(name, actorId);
    await db
      .update(initiatives)
      .set({ picPersonId: personId })
      .where(eq(initiatives.id, ini.id));
    resolved++;
  }
  return { resolved, blank };
}

async function main() {
  const res = await backfillPic();
  console.log(`PIC backfill: ${res.resolved} resolved, ${res.blank} blank (left null).`);
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("backfill-pic.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
