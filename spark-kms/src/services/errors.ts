import { desc } from "drizzle-orm";
import { db } from "@/src/db";
import {
  errorEvents,
  slowRequests,
  type ErrorEvent,
  type SlowRequest,
} from "@/src/db/schema";

/**
 * Read-only access to observability data (server errors + slow requests).
 * Written ONLY by src/lib/error-log.ts; this module just lists them for the
 * in-app admin viewers.
 */

export async function listRecentErrors(limit = 50): Promise<ErrorEvent[]> {
  return db
    .select()
    .from(errorEvents)
    .orderBy(desc(errorEvents.createdAt))
    .limit(limit);
}

export async function listRecentSlowRequests(limit = 50): Promise<SlowRequest[]> {
  return db
    .select()
    .from(slowRequests)
    .orderBy(desc(slowRequests.createdAt))
    .limit(limit);
}
