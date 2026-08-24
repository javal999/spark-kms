import { sql } from "drizzle-orm";
import { db } from "@/src/db";
import {
  weekStart,
  weekEnd,
  weekRangeFromKey,
  periodRange,
  jakartaDate,
  type Period,
} from "@/src/services/week";

/**
 * Read-only score aggregations. REQ-S1: no stored totals — every number here is
 * a live SUM over score_events. Optional `weekKey` (YYYY-Www) restricts to a
 * week via effective_date; omit for all-time.
 */

function weekFilter(weekKey?: string) {
  if (!weekKey) return { start: null as string | null, end: null as string | null };
  const { start, end } = weekRangeFromKey(weekKey);
  return { start: jakartaDate(start), end: jakartaDate(end) };
}

/**
 * Same shape as weekFilter, for the week-or-month period the dashboard's Top
 * Initiatives filter selects (D27). Absent period = all-time.
 */
function periodFilter(period?: Period) {
  if (!period) return { start: null as string | null, end: null as string | null };
  const { start, end } = periodRange(period);
  return { start: jakartaDate(start), end: jakartaDate(end) };
}

export type LeaderboardRow = {
  rank: number;
  region: string;
  segment: string;
  best_practice: number;
  /** The `presenter` stream, displayed as "Contribution" since D23. The field
   *  name is kept for partner integrations reading /api/v1/leaderboard. */
  best_presenter: number;
  total: number;
};

/**
 * Per-Area (region × segment) stream sums + total, ranked. Only areas with ≥1
 * initiative appear (D4). Ties share rank (competition ranking: 1,2,2,4).
 */
export async function areaLeaderboard(weekKey?: string): Promise<LeaderboardRow[]> {
  const { start, end } = weekFilter(weekKey);
  const dateClause = start
    ? sql`AND se.effective_date BETWEEN ${start} AND ${end}`
    : sql``;

  const rows = await db.execute(sql`
    WITH areas AS (
      SELECT DISTINCT region::text AS region, segment::text AS segment FROM initiatives
      WHERE archived_at IS NULL
    ),
    agg AS (
      SELECT se.region::text AS region, se.segment::text AS segment,
             se.stream::text AS stream, sum(se.points)::int AS pts
      FROM score_events se
      WHERE true ${dateClause}
        AND (se.initiative_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM initiatives i
          WHERE i.id = se.initiative_id AND i.archived_at IS NOT NULL
        ))
      GROUP BY se.region, se.segment, se.stream
    )
    SELECT a.region, a.segment,
      coalesce(sum(agg.pts) FILTER (WHERE agg.stream = 'best_practice'), 0)::int AS best_practice,
      coalesce(sum(agg.pts) FILTER (WHERE agg.stream = 'presenter'), 0)::int AS best_presenter
    FROM areas a
    LEFT JOIN agg ON agg.region = a.region AND agg.segment = a.segment
    GROUP BY a.region, a.segment
  `);

  const list = (rows as unknown as Array<Record<string, unknown>>).map((r) => {
    const best_practice = Number(r.best_practice);
    const best_presenter = Number(r.best_presenter);
    return {
      region: String(r.region),
      segment: String(r.segment),
      best_practice,
      best_presenter,
      total: best_practice + best_presenter,
    };
  });

  // Sort by total desc, then a stable region/segment order for deterministic ties.
  list.sort(
    (a, b) =>
      b.total - a.total ||
      a.region.localeCompare(b.region) ||
      a.segment.localeCompare(b.segment),
  );

  // Competition ranking: equal totals share the same rank.
  let rank = 0;
  let prevTotal: number | null = null;
  return list.map((row, i) => {
    if (prevTotal === null || row.total !== prevTotal) {
      rank = i + 1;
      prevTotal = row.total;
    }
    return { rank, ...row };
  });
}

export type TopInitiative = {
  id: number;
  title: string;
  region: string;
  segment: string;
  pic: string; // v1.2 (item 11)
  stage: string; // v1.2 (item 11)
  points: number;
};

/**
 * Initiatives ranked by SUM of their linked score events. `period` restricts to
 * one week or one calendar month (D27); omit it for all-time.
 */
export async function topInitiatives(
  period?: Period,
  limit = 10,
): Promise<TopInitiative[]> {
  const { start, end } = periodFilter(period);
  const dateClause = start
    ? sql`AND se.effective_date BETWEEN ${start} AND ${end}`
    : sql``;

  const rows = await db.execute(sql`
    SELECT i.id, i.title, i.region::text AS region, i.segment::text AS segment,
           i.pic, i.stage::text AS stage,
           coalesce(sum(se.points), 0)::int AS points
    FROM initiatives i
    JOIN score_events se ON se.initiative_id = i.id
    WHERE i.archived_at IS NULL ${dateClause}
    GROUP BY i.id, i.title, i.region, i.segment, i.pic, i.stage
    HAVING coalesce(sum(se.points), 0) > 0
    ORDER BY points DESC, i.id ASC
    LIMIT ${limit}
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    region: String(r.region),
    segment: String(r.segment),
    pic: String(r.pic),
    stage: String(r.stage),
    points: Number(r.points),
  }));
}

export type StreamTotals = {
  best_practice: number;
  /** The `presenter` stream, displayed as "Contribution" since D23. The field
   *  name is kept for partner integrations reading /api/v1/leaderboard. */
  best_presenter: number;
  total: number;
};

/** Per-stream totals for a single initiative (detail page points panel). */
export async function initiativeStreamTotals(
  initiativeId: number,
): Promise<StreamTotals> {
  const rows = await db.execute(sql`
    SELECT stream::text AS stream, sum(points)::int AS pts
    FROM score_events WHERE initiative_id = ${initiativeId}
    GROUP BY stream
  `);
  const t: StreamTotals = { best_practice: 0, best_presenter: 0, total: 0 };
  for (const r of rows as unknown as Array<{ stream: string; pts: number }>) {
    const v = Number(r.pts);
    // Only the two live streams count; retired cee/cee_best rows (reversed on
    // migration) are ignored here.
    if (r.stream === "best_practice") t.best_practice += v;
    else if (r.stream === "presenter") t.best_presenter += v;
    else continue;
    t.total += v;
  }
  return t;
}

export type DashboardStats = {
  total: number;
  newThisWeek: number;
  existing: number;
  byStage: Record<string, number>;
  byPillar: Record<string, number>;
  byRegion: Record<string, number>;
  bySegment: Record<string, number>;
  withBestPractice: number;
  withUnlocking: number;
};

/** Dashboard counters + distributions (all counts, clickable to the list). */
export async function dashboardStats(now: Date = new Date()): Promise<DashboardStats> {
  const wkStart = weekStart(now).toISOString();
  const wkEnd = weekEnd(now).toISOString();

  const [{ total, newThisWeek }] = (await db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE created_at BETWEEN ${wkStart} AND ${wkEnd})::int AS "newThisWeek"
    FROM initiatives WHERE archived_at IS NULL
  `)) as unknown as Array<{ total: number; newThisWeek: number }>;

  const dist = async (col: string) => {
    const rows = await db.execute(
      sql`SELECT ${sql.raw(col)}::text AS k, count(*)::int AS c FROM initiatives WHERE archived_at IS NULL GROUP BY ${sql.raw(col)}`,
    );
    const out: Record<string, number> = {};
    for (const r of rows as unknown as Array<{ k: string; c: number }>) {
      out[String(r.k)] = Number(r.c);
    }
    return out;
  };

  const [byStage, byPillar, byRegion, bySegment] = await Promise.all([
    dist("stage"),
    dist("pillar"),
    dist("region"),
    dist("segment"),
  ]);

  const [{ withBestPractice, withUnlocking }] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM entries e WHERE e.initiative_id = i.id AND e.category = 'Best Practice'))::int AS "withBestPractice",
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM entries e WHERE e.initiative_id = i.id AND e.category = 'Unlocking'))::int AS "withUnlocking"
    FROM initiatives i WHERE i.archived_at IS NULL
  `)) as unknown as Array<{ withBestPractice: number; withUnlocking: number }>;

  return {
    total: Number(total),
    newThisWeek: Number(newThisWeek),
    existing: Number(total) - Number(newThisWeek),
    byStage,
    byPillar,
    byRegion,
    bySegment,
    withBestPractice: Number(withBestPractice),
    withUnlocking: Number(withUnlocking),
  };
}

/** Flat list of an area's score events for the leaderboard click-through. */
export async function areaScoreEvents(
  region: string,
  segment: string,
  weekKey?: string,
) {
  const { start, end } = weekFilter(weekKey);
  const dateClause = start
    ? sql`AND se.effective_date BETWEEN ${start} AND ${end}`
    : sql``;
  const rows = await db.execute(sql`
    SELECT se.id, se.stream::text AS stream, se.reason::text AS reason,
           se.points::int AS points, se.effective_date::text AS effective_date,
           se.initiative_id AS initiative_id, i.title AS title,
           i.pillar::text AS pillar, i.pic AS pic, se.note
    FROM score_events se
    LEFT JOIN initiatives i ON i.id = se.initiative_id
    WHERE se.region = ${region}::region AND se.segment = ${segment}::segment ${dateClause}
      AND (se.initiative_id IS NULL OR i.archived_at IS NULL)
    ORDER BY se.effective_date DESC, se.id DESC
  `);
  // Raw SQL: every selected column is a text/int/date scalar, so model the row
  // as scalars rather than `unknown`. The truthiness guards below narrow
  // `unknown` to `{}`, where String() can silently yield "[object Object]".
  return (rows as unknown as Array<Record<string, string | number | null>>).map((r) => ({
    id: Number(r.id),
    stream: String(r.stream),
    reason: String(r.reason),
    points: Number(r.points),
    effectiveDate: String(r.effective_date),
    initiativeId: r.initiative_id ? Number(r.initiative_id) : null,
    title: r.title ? String(r.title) : null,
    // v1.2 (item 18): surface which pillar and contributor (PIC) earned it.
    pillar: r.pillar ? String(r.pillar) : null,
    pic: r.pic ? String(r.pic) : null,
    note: r.note ? String(r.note) : null,
  }));
}
