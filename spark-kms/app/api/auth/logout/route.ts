import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/src/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}

/** GET clears the cookie and redirects to /login — used to log out stale
 * viewer sessions after a password rotation (REQ-A1). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(new URL("/login", req.url));
}
