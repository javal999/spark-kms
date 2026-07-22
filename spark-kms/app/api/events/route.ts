import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/src/lib/session";
import { flags } from "@/src/lib/flags";
import {
  parseBatch,
  recordEvents,
  deriveActorHash,
  usageRateLimited,
  BadBatchError,
} from "@/src/services/usage";

export const runtime = "nodejs";

/**
 * POST /api/events (T2) — usage ingest. Session-gated; dark when the tracking
 * flag is off. Identity (sessionId + actorHash) is derived server-side so the
 * client can't spoof it; malformed events drop, a non-batch body is a 400.
 */
export async function POST(req: NextRequest) {
  if (!flags.tracking) return NextResponse.json({ ok: false }, { status: 404 });

  const session = await getSession();
  if (!session.role) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Lazily assign an opaque per-session id (pseudonymous, no PII).
  if (!session.sid) {
    session.sid = randomUUID();
    await session.save();
  }
  const sessionId = session.sid;
  const actorHash = deriveActorHash(
    session.userId ? `u:${session.userId}` : `s:${sessionId}`,
  );

  if (usageRateLimited(sessionId)) {
    return NextResponse.json({ error: "Too many events" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let valid, dropped;
  try {
    ({ valid, dropped } = parseBatch(body));
  } catch (err) {
    if (err instanceof BadBatchError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const stored = await recordEvents(valid, { sessionId, actorHash });
  return NextResponse.json({ stored, dropped });
}
