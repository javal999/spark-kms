import { sql } from "drizzle-orm";
import { db } from "@/src/db";

/**
 * Usage retention + rollup (Phase 7, task T4). Two idempotent steps:
 *   1. rollupUsageDaily — recompute usage_daily counts from raw usage_events,
 *      bucketed by Asia/Jakarta calendar day. A full recompute per bucket
 *      (ON CONFLICT … SET count = excluded), so re-running is a no-op.
 *   2. purgeOldEvents — delete raw usage_events older than the retention window.
 *      The daily aggregates survive (they were computed in step 1).
 *
 * Order matters: rollup BEFORE purge, so a day's raw rows are counted before
 * they're deleted. Shipped as a runnable script; the cron trigger is open
 * question O4 (pg_cron vs app scheduler).
 */

const RETENTION_DAYS = 90;

/** Recompute usage_daily from all raw events currently present. Returns rows written. */
export async function rollupUsageDaily(): Promise<number> {
  const res = await db.execute(sql`
    INSERT INTO usage_daily (day, route_pattern, event_type, count)
    SELECT (ts AT TIME ZONE 'Asia/Jakarta')::date AS day,
           route_pattern, event_type, count(*)::int AS count
    FROM usage_events
    GROUP BY 1, route_pattern, event_type
    ON CONFLICT (day, route_pattern, event_type)
      DO UPDATE SET count = excluded.count
  `);
  return (res as unknown as { count?: number }).count ?? 0;
}

/** Delete raw events older than the retention window. Returns rows deleted. */
export async function purgeOldEvents(
  now: Date = new Date(),
  retentionDays: number = RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 3600 * 1000);
  const res = await db.execute(sql`
    DELETE FROM usage_events WHERE ts < ${cutoff.toISOString()}
  `);
  return (res as unknown as { count?: number }).count ?? 0;
}

/** Full retention pass: roll up, then purge. Safe to run repeatedly. */
export async function runRetention(
  now: Date = new Date(),
): Promise<{ purged: number }> {
  await rollupUsageDaily();
  const purged = await purgeOldEvents(now);
  return { purged };
}

// Runnable entrypoint: `tsx --env-file=<env> src/services/usage-retention.ts`
async function main() {
  const before = await db.execute(sql`SELECT count(*)::int AS c FROM usage_events`);
  await runRetention();
  const daily = await db.execute(sql`SELECT count(*)::int AS c FROM usage_daily`);
  console.log(
    `Retention complete. raw_events_before=${(before as unknown as { c: number }[])[0]?.c}, ` +
      `usage_daily_rows=${(daily as unknown as { c: number }[])[0]?.c}`,
  );
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("usage-retention.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
