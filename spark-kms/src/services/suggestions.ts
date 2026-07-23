import { and, eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, initiativeLinks } from "@/src/db/schema";
import { findSimilar } from "@/src/services/embeddings";

/**
 * AI link suggestions (Phase 9). Similar-initiative candidates are stored as
 * `derived_similar` edges (the reserved type + weight) — SUGGESTIONS a human
 * reviews. Confirming promotes one to an explicit edge; dismissing deletes it.
 * Never auto-linked, mirroring the duplicate-review pattern.
 */

export class SuggestionNotFoundError extends Error {
  constructor(id: number) {
    super(`suggestion ${id} not found`);
    this.name = "SuggestionNotFoundError";
  }
}

const pairKey = (a: number, b: number) => `${Math.min(a, b)}|${Math.max(a, b)}`;

/**
 * Generate `derived_similar` suggestions across the corpus, skipping pairs that
 * already have any edge (explicit or a prior suggestion). Idempotent.
 */
export async function generateSuggestions(
  opts: { threshold?: number; perInitiative?: number } = {},
): Promise<{ created: number }> {
  const threshold = opts.threshold ?? 0.6;
  const perInitiative = opts.perInitiative ?? 5;

  const inis = await db.select({ id: initiatives.id }).from(initiatives);
  const existing = await db
    .select({ src: initiativeLinks.srcId, dst: initiativeLinks.dstId })
    .from(initiativeLinks);
  const have = new Set(existing.map((e) => pairKey(e.src, e.dst)));

  const planned = new Set<string>();
  const rows: { srcId: number; dstId: number; type: "derived_similar"; weight: number }[] = [];
  for (const ini of inis) {
    const sims = await findSimilar(ini.id, { threshold, limit: perInitiative });
    for (const s of sims) {
      const key = pairKey(ini.id, s.initiativeId);
      if (have.has(key) || planned.has(key)) continue;
      planned.add(key);
      rows.push({
        srcId: Math.min(ini.id, s.initiativeId),
        dstId: Math.max(ini.id, s.initiativeId),
        type: "derived_similar",
        weight: s.score,
      });
    }
  }
  if (rows.length) {
    await db.insert(initiativeLinks).values(rows.map((r) => ({ ...r, createdBy: null })));
  }
  return { created: rows.length };
}

export type Suggestion = { edgeId: number; otherId: number; title: string; score: number };

/** Pending suggestions touching one initiative, best first. */
export async function listSuggestions(initiativeId: number): Promise<Suggestion[]> {
  const rows = await db.execute(sql`
    SELECT il.id AS edge_id, il.weight AS score,
      CASE WHEN il.src_id = ${initiativeId} THEN il.dst_id ELSE il.src_id END AS other_id,
      i.title
    FROM initiative_links il
    JOIN initiatives i
      ON i.id = CASE WHEN il.src_id = ${initiativeId} THEN il.dst_id ELSE il.src_id END
    WHERE il.type = 'derived_similar'
      AND (il.src_id = ${initiativeId} OR il.dst_id = ${initiativeId})
    ORDER BY il.weight DESC NULLS LAST, i.title
  `);
  return (rows as unknown as { edge_id: number; other_id: number; title: string; score: number | null }[]).map(
    (r) => ({ edgeId: Number(r.edge_id), otherId: Number(r.other_id), title: r.title, score: Number(r.score ?? 0) }),
  );
}

/** Promote a suggestion to an explicit link (idempotent on the explicit edge). */
export async function confirmSuggestion(edgeId: number, actorId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [sug] = await tx
      .select()
      .from(initiativeLinks)
      .where(and(eq(initiativeLinks.id, edgeId), eq(initiativeLinks.type, "derived_similar")))
      .limit(1);
    if (!sug) throw new SuggestionNotFoundError(edgeId);

    const [dup] = await tx
      .select({ id: initiativeLinks.id })
      .from(initiativeLinks)
      .where(
        and(
          eq(initiativeLinks.type, "explicit"),
          sql`((src_id = ${sug.srcId} AND dst_id = ${sug.dstId}) OR (src_id = ${sug.dstId} AND dst_id = ${sug.srcId}))`,
        ),
      )
      .limit(1);
    if (!dup) {
      await tx
        .insert(initiativeLinks)
        .values({ srcId: sug.srcId, dstId: sug.dstId, type: "explicit", createdBy: actorId });
    }
    await tx.delete(initiativeLinks).where(eq(initiativeLinks.id, edgeId));
  });
}

/** Dismiss (delete) a suggestion. */
export async function dismissSuggestion(edgeId: number): Promise<void> {
  await db
    .delete(initiativeLinks)
    .where(and(eq(initiativeLinks.id, edgeId), eq(initiativeLinks.type, "derived_similar")));
}
