import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import { appConfig } from "@/src/db/schema";

/**
 * Fuzzy duplicate ("similar theme") detection via pg_trgm (section 8).
 *
 * REQ-D1: fuzzy match on the NORMALIZED title (lowercase, punctuation stripped)
 * using trigram similarity. Threshold default 0.4, configurable via app_config.
 * REQ-D2: never auto-merge — this only returns the top-3 candidates for a human
 * to pick "same as #ID" or "new".
 */

export const DEFAULT_DEDUP_THRESHOLD = 0.4;

export type DuplicateCandidate = {
  id: number;
  title: string;
  region: string;
  segment: string;
  pic: string;
  stage: string;
  similarity: number;
};

/**
 * Normalize a title the same way on both sides of the comparison: lowercase,
 * replace any run of non-alphanumeric chars with a single space, trim. Titles
 * are Indonesian/English mixed with brand names — no stemming (REQ-D3).
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// SQL-side normalization that mirrors normalizeTitle() exactly. Exported so the
// index drift-guard test can EXPLAIN the exact same expression this query uses.
export const normalizedTitleSql = sql`btrim(regexp_replace(lower(initiatives.title), '[^a-z0-9]+', ' ', 'g'))`;

export async function getConfiguredThreshold(): Promise<number> {
  const row = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(sql`${appConfig.key} = 'dedup_threshold'`)
    .limit(1);
  const v = row[0]?.value;
  return typeof v === "number" ? v : DEFAULT_DEDUP_THRESHOLD;
}

/**
 * Top candidates whose normalized-title trigram similarity to `title` meets the
 * threshold, most similar first. `limit` defaults to 3 (REQ-D2).
 */
export async function findDuplicateCandidates(
  title: string,
  opts: { threshold?: number; limit?: number } = {},
): Promise<DuplicateCandidate[]> {
  const normalized = normalizeTitle(title);
  if (normalized.length === 0) return [];

  const threshold = opts.threshold ?? (await getConfiguredThreshold());
  const limit = opts.limit ?? 3;

  const rows = await db.execute<{
    id: number;
    title: string;
    region: string;
    segment: string;
    pic: string;
    stage: string;
    similarity: number;
  }>(sql`
    SELECT
      initiatives.id,
      initiatives.title,
      initiatives.region::text  AS region,
      initiatives.segment::text AS segment,
      initiatives.pic,
      initiatives.stage::text   AS stage,
      similarity(${normalizedTitleSql}, ${normalized}) AS similarity
    FROM initiatives
    -- The trigram operator uses the GIN index (pg_trgm.similarity_threshold,
    -- default 0.3) to prefilter cheaply; the exact similarity() check then cuts
    -- to our configured threshold (default 0.4 >= 0.3, so nothing is missed).
    WHERE ${normalizedTitleSql} % ${normalized}
      AND similarity(${normalizedTitleSql}, ${normalized}) >= ${threshold}
    ORDER BY similarity DESC, initiatives.id ASC
    LIMIT ${limit}
  `);

  // drizzle postgres-js returns an array-like result.
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    region: String(r.region),
    segment: String(r.segment),
    pic: String(r.pic),
    stage: String(r.stage),
    similarity: Number(r.similarity),
  }));
}
