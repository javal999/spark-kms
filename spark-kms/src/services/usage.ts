import { createHmac } from "node:crypto";
import { z } from "zod";
import { db } from "@/src/db";
import { usageEvents } from "@/src/db/schema";

/**
 * Usage-tracking ingest (Phase 7, task T2). The ONLY writer of `usage_events`.
 * The store holds NO PII: the route supplies a pseudonymous actor hash and an
 * opaque session id; the client sends only route/element/geometry. Malformed
 * events in a batch are dropped, not fatal; a non-batch body is rejected.
 */

// One tracked event as sent by the client (identity is added server-side).
export const usageEventSchema = z.object({
  eventType: z.enum(["page_view", "click"]),
  routePattern: z.string().min(1).max(200),
  path: z.string().max(1000).optional(),
  elementId: z.string().max(200).optional(),
  elementText: z.string().max(200).optional(),
  viewportW: z.number().int().positive().max(30000).optional(),
  viewportH: z.number().int().positive().max(30000).optional(),
  clickXNorm: z.number().min(0).max(1).optional(),
  clickYNorm: z.number().min(0).max(1).optional(),
  referrerPath: z.string().max(1000).optional(),
});
export type UsageEventInput = z.infer<typeof usageEventSchema>;

export type UsageCtx = { sessionId: string; actorHash: string };

export class BadBatchError extends Error {
  constructor() {
    super("Body must be an object with an `events` array.");
    this.name = "BadBatchError";
  }
}

/**
 * Split a raw request body into valid events + a dropped count. Throws
 * BadBatchError when the body isn't `{ events: [...] }` (→ 400 at the route);
 * individual malformed events are dropped, never fatal.
 */
export function parseBatch(body: unknown): { valid: UsageEventInput[]; dropped: number } {
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as { events?: unknown }).events)
  ) {
    throw new BadBatchError();
  }
  const raw = (body as { events: unknown[] }).events.slice(0, 50); // cap batch size
  const valid: UsageEventInput[] = [];
  let dropped = 0;
  for (const item of raw) {
    const r = usageEventSchema.safeParse(item);
    if (r.success) valid.push(r.data);
    else dropped++;
  }
  return { valid, dropped };
}

/** Insert the valid events, stamping the pseudonymous identity. */
export async function recordEvents(
  events: UsageEventInput[],
  ctx: UsageCtx,
): Promise<number> {
  if (events.length === 0) return 0;
  await db
    .insert(usageEvents)
    .values(
      events.map((e) => ({
        eventType: e.eventType,
        routePattern: e.routePattern,
        path: e.path,
        elementId: e.elementId,
        elementText: e.elementText,
        sessionId: ctx.sessionId,
        actorHash: ctx.actorHash,
        viewportW: e.viewportW,
        viewportH: e.viewportH,
        clickXNorm: e.clickXNorm,
        clickYNorm: e.clickYNorm,
        referrerPath: e.referrerPath,
      })),
    );
  return events.length;
}

/**
 * Pseudonymous actor id: a keyed HMAC of a stable identity string. Admins key
 * on their user id (stable across sessions → "how often do I access" works);
 * viewers key on the opaque session id (no cross-session identity exists).
 * The raw identity never lands in the store.
 */
export function deriveActorHash(identity: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-usage-secret";
  return createHmac("sha256", secret).update(identity).digest("hex").slice(0, 32);
}

// ── Per-session flood control (in-memory) ───────────────────────────────────
const buckets = new Map<string, { count: number; reset: number }>();

/** True when this session has exceeded `limit` batches in the rolling window. */
export function usageRateLimited(
  sessionId: string,
  now: number = Date.now(),
  limit = 120,
  windowMs = 60_000,
): boolean {
  const b = buckets.get(sessionId);
  if (!b || now > b.reset) {
    buckets.set(sessionId, { count: 1, reset: now + windowMs });
    return false;
  }
  b.count++;
  return b.count > limit;
}

/** Test hook: clear the rate-limit buckets. */
export function __resetUsageLimiter(): void {
  buckets.clear();
}
