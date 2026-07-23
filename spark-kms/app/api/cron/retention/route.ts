import { NextResponse, type NextRequest } from "next/server";
import { runRetention } from "@/src/services/usage-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cron/retention — nightly usage rollup + 90-day purge (Phase 7 O4).
 * Not user-facing: protected by a shared secret (CRON_SECRET), meant to be hit
 * by a scheduler (GitLab scheduled pipeline, EventBridge, a machine cron, …).
 * Idempotent — safe to run more than once a day.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { purged } = await runRetention();
  return NextResponse.json({ ok: true, purged });
}
