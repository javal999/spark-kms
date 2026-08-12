import { sql } from "drizzle-orm";
import { db } from "@/src/db";

/**
 * Usage dashboard aggregations (Phase 7, task T13). Read-only. Answers the four
 * owner questions: top pages, top clicks, usage trend, and the caller's OWN
 * access frequency.
 *
 * Privacy (PRD §6, product rule): there is no parameter for "another person's"
 * activity. Per-actor frequency is only ever computed for the caller's own
 * actor hash, which the route derives from the session — never from client
 * input. Everything else is an aggregate across all actors.
 */

export type DayRange = { start: string; end: string }; // YYYY-MM-DD inclusive

const jakartaDay = sql`(ts AT TIME ZONE 'Asia/Jakarta')::date`;

/** Most-viewed pages by grouped route pattern (page_view), from the rollup. */
export async function topPages(range: DayRange, limit = 20) {
  const rows = await db.execute(sql`
    SELECT route_pattern, sum(count)::int AS views
    FROM usage_daily
    WHERE event_type = 'page_view' AND day BETWEEN ${range.start} AND ${range.end}
    GROUP BY route_pattern
    ORDER BY views DESC, route_pattern
    LIMIT ${limit}
  `);
  return (rows as unknown as { route_pattern: string; views: number }[]).map((r) => ({
    routePattern: r.route_pattern,
    views: Number(r.views),
  }));
}

/** Most-clicked tracked elements (by element_id, with a human label). */
export async function topClicks(range: DayRange, limit = 20) {
  const rows = await db.execute(sql`
    SELECT element_id, max(element_text) AS label, count(*)::int AS clicks
    FROM usage_events
    WHERE event_type = 'click' AND element_id IS NOT NULL
      AND ${jakartaDay} BETWEEN ${range.start} AND ${range.end}
    GROUP BY element_id
    ORDER BY clicks DESC, element_id
    LIMIT ${limit}
  `);
  return (rows as unknown as { element_id: string; label: string | null; clicks: number }[]).map(
    (r) => ({ elementId: r.element_id, label: r.label ?? r.element_id, clicks: Number(r.clicks) }),
  );
}

/** Daily page-view + click totals across all pages (from the rollup). */
export async function usageTrend(range: DayRange) {
  const rows = await db.execute(sql`
    SELECT day::text AS day,
      coalesce(sum(count) FILTER (WHERE event_type = 'page_view'), 0)::int AS page_views,
      coalesce(sum(count) FILTER (WHERE event_type = 'click'), 0)::int AS clicks
    FROM usage_daily
    WHERE day BETWEEN ${range.start} AND ${range.end}
    GROUP BY day
    ORDER BY day
  `);
  return (rows as unknown as { day: string; page_views: number; clicks: number }[]).map((r) => ({
    day: r.day,
    pageViews: Number(r.page_views),
    clicks: Number(r.clicks),
  }));
}

/**
 * Distinct active users over the range — a pseudonymous COUNT DISTINCT over
 * actor_hash (logged-in users hash on their user id, anonymous viewers on their
 * session). No identities are read; this answers "how many people use the app",
 * not "who". Platform-wide, all users.
 */
export async function activeUsers(range: DayRange): Promise<number> {
  const rows = await db.execute(sql`
    SELECT count(DISTINCT actor_hash)::int AS n
    FROM usage_events
    WHERE ${jakartaDay} BETWEEN ${range.start} AND ${range.end}
  `);
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0);
}

/**
 * Most-viewed initiatives across ALL users (page_view on /initiatives/[id]).
 * Aggregate counts only — a bridge from usage to the entity/graph. The concrete
 * id comes from the stored path; the join drops ids with no live initiative.
 */
export async function topInitiativesByViews(range: DayRange, limit = 10) {
  const rows = await db.execute(sql`
    WITH v AS (
      SELECT split_part(path, '/', 3) AS id_txt, count(*)::int AS views
      FROM usage_events
      WHERE event_type = 'page_view'
        AND route_pattern = '/initiatives/[id]'
        AND split_part(path, '/', 3) ~ '^[0-9]+$'
        AND ${jakartaDay} BETWEEN ${range.start} AND ${range.end}
      GROUP BY 1
    )
    SELECT v.id_txt::int AS id, i.title AS title, v.views AS views
    FROM v JOIN initiatives i ON i.id = v.id_txt::int
    ORDER BY v.views DESC, id
    LIMIT ${limit}
  `);
  return (rows as unknown as { id: number; title: string; views: number }[]).map((r) => ({
    id: Number(r.id),
    title: r.title,
    views: Number(r.views),
  }));
}

/**
 * The caller's OWN daily page-view frequency. `actorHash` MUST come from the
 * caller's session — never client input — so no one can read another person's
 * activity through this endpoint.
 */
export async function ownFrequency(actorHash: string, range: DayRange) {
  const rows = await db.execute(sql`
    SELECT ${jakartaDay}::text AS day, count(*)::int AS views
    FROM usage_events
    WHERE event_type = 'page_view' AND actor_hash = ${actorHash}
      AND ${jakartaDay} BETWEEN ${range.start} AND ${range.end}
    GROUP BY 1
    ORDER BY 1
  `);
  return (rows as unknown as { day: string; views: number }[]).map((r) => ({
    day: r.day,
    views: Number(r.views),
  }));
}
