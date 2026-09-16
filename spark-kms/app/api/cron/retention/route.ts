import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runRetention } from "@/src/services/usage-retention";
import { captureError, serverErrorResponse } from "@/src/lib/error-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Constant-time check of the Authorization header against `Bearer <secret>`.
 * Compares SHA-256 digests, which are always 32 bytes, so `timingSafeEqual`
 * never throws on a length mismatch and neither the secret nor its length
 * leaks through response timing.
 */
function hasSecret(header: string | null, secret: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`));
}

/**
 * POST /api/cron/retention — nightly usage rollup + 90-day purge (Phase 7 O4).
 * Not user-facing: protected by a shared secret (CRON_SECRET), meant to be hit
 * by a scheduler (GitLab scheduled pipeline, EventBridge, a machine cron, …).
 * Idempotent — safe to run more than once a day.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !hasSecret(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { purged } = await runRetention();
    return NextResponse.json({ ok: true, purged });
  } catch (err) {
    // The scheduler only sees a status code. Record the cause so a failed night
    // is findable in /admin's error log by the trace id in the job output.
    const traceId = await captureError(err, { route: "POST /api/cron/retention" });
    return serverErrorResponse(traceId);
  }
}
