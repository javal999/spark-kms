import { NextResponse } from "next/server";
import { getSession } from "@/src/lib/session";
import type { SessionData } from "@/src/lib/session-config";
import { isAdmin, isSuper } from "@/src/lib/session-config";

/**
 * API route guards. Each returns either the session (authorized) or a
 * NextResponse to short-circuit with 401/403. Usage:
 *
 *   const gate = await requireAdmin();
 *   if (gate instanceof NextResponse) return gate;
 *   // gate.userId is available here
 */

function unauthorized() {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function requireViewer(): Promise<SessionData | NextResponse> {
  const s = await getSession();
  if (!s.role) return unauthorized();
  return s;
}

export async function requireAdmin(): Promise<SessionData | NextResponse> {
  const s = await getSession();
  if (!s.role) return unauthorized();
  if (!isAdmin(s.role)) return forbidden();
  return s;
}

export async function requireSuper(): Promise<SessionData | NextResponse> {
  const s = await getSession();
  if (!s.role) return unauthorized();
  if (!isSuper(s.role)) return forbidden();
  return s;
}
