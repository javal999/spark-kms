import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/src/db";
import { errorEvents } from "@/src/db/schema";

/**
 * Reusable server-side error capture (observability). An instrumented route
 * catches an UNEXPECTED error (not a domain error it already maps to a clean
 * status) and calls `captureError`, which:
 *   1. mints a short `traceId`,
 *   2. writes a structured JSON line to stdout (Lightsail container logs), and
 *   3. best-effort inserts a row into `error_events` (viewable in-app by admins).
 * The traceId is returned to the caller so it can be shown to the user — a
 * reported "err_… code" then maps to an exact log line and DB row.
 *
 * PRIVACY: never pass raw request bodies, uploaded row content, PICs, or any
 * PII in `meta`. Attach only bounded scalars that help triage (batch id, row
 * counts, file size, chosen action counts). The message/stack come from the
 * thrown Error, which for our DB/runtime errors do not contain user PII.
 */

export type ErrorContext = {
  /** Stable route label, e.g. "POST /api/upload/commit". */
  route: string;
  /** Acting user id when known (may be null if the error precedes auth). */
  actorId?: number | null;
  /** Bounded, non-PII scalars for triage. */
  meta?: Record<string, unknown>;
};

/** A short, greppable, collision-resistant trace id (e.g. "err_a1b2c3d4"). */
function newTraceId(): string {
  return `err_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Capture an unexpected error. Never throws — logging must not mask the
 * original failure. Returns the traceId to surface to the user.
 */
export async function captureError(
  err: unknown,
  ctx: ErrorContext,
): Promise<string> {
  const traceId = newTraceId();
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // 1. Structured stdout — captured by the container platform's logs even if
  //    the DB write below fails (e.g. the DB itself is the thing that broke).
  try {
    console.error(
      JSON.stringify({
        level: "error",
        traceId,
        route: ctx.route,
        actorId: ctx.actorId ?? null,
        name,
        message,
        meta: ctx.meta ?? {},
        at: new Date().toISOString(),
      }),
    );
  } catch {
    // console must never throw the request into a worse state.
  }

  // 2. Best-effort DB persist for in-app viewing. Swallow any failure.
  try {
    await db.insert(errorEvents).values({
      traceId,
      route: ctx.route,
      actorId: ctx.actorId ?? null,
      name,
      message,
      stack: stack ?? null,
      meta: (ctx.meta ?? {}) as Record<string, unknown>,
    });
  } catch (persistErr) {
    try {
      console.error(
        JSON.stringify({
          level: "error",
          traceId,
          note: "error-log DB persist failed",
          message: persistErr instanceof Error ? persistErr.message : String(persistErr),
        }),
      );
    } catch {
      /* give up quietly */
    }
  }

  return traceId;
}

/**
 * Standard 500 body for an instrumented route: a generic user-facing message
 * plus the traceId, so the client can show "…(ref err_abc123)" for reporting.
 */
export function serverErrorResponse(traceId: string): NextResponse {
  return NextResponse.json(
    { error: "Something went wrong on the server.", traceId },
    { status: 500 },
  );
}

/**
 * Early-warning for latency creep: log a request that ran longer than
 * SLOW_REQUEST_MS as a structured stdout line (visible in the container logs),
 * so we see slow endpoints trending UP long before they hit the ~60s gateway
 * timeout. Call it in a `finally` with the handler's start time. Never throws.
 */
export const SLOW_REQUEST_MS = 5000;

export function logSlowRequest(
  route: string,
  startedAt: number,
  meta?: Record<string, unknown>,
): void {
  const ms = Date.now() - startedAt;
  if (ms < SLOW_REQUEST_MS) return;
  try {
    console.warn(
      JSON.stringify({
        level: "warn",
        kind: "slow-request",
        route,
        ms,
        meta: meta ?? {},
        at: new Date().toISOString(),
      }),
    );
  } catch {
    /* logging must never worsen the request */
  }
}
