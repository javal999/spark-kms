import { NextResponse } from "next/server";
import { relativeRedirect } from "@/src/lib/redirect";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}

/** GET clears the cookie and redirects to /login — used to log out stale
 * viewer sessions after a password rotation (REQ-A1). The redirect is relative:
 * req.url is the container's bind address in production (TRD-2026-009 E17). */
export async function GET() {
  const session = await getSession();
  session.destroy();
  return relativeRedirect("/login");
}
