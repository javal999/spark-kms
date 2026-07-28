import { desc } from "drizzle-orm";
import { db } from "@/src/db";
import { errorEvents, type ErrorEvent } from "@/src/db/schema";

/**
 * Read-only access to captured server errors (observability). Written ONLY by
 * `captureError` in src/lib/error-log.ts; this module just lists them for the
 * in-app admin viewer.
 */

export async function listRecentErrors(limit = 50): Promise<ErrorEvent[]> {
  return db
    .select()
    .from(errorEvents)
    .orderBy(desc(errorEvents.createdAt))
    .limit(limit);
}
