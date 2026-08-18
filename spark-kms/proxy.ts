import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/src/lib/session-config";

/**
 * Route gate (Next 16 renamed `middleware` → `proxy`). Runs on the Edge, so it
 * only DECRYPTS the sealed session cookie — no DB, no argon2.
 *
 * Tiers:
 *  - /login              public
 *  - /admin/*            super only
 *  - /submit/*           admin or super
 *  - /adjustments        admin or super (D24: manual adjustments are no longer
 *                        super-only, but the rest of /admin still is)
 *  - /guide              admin or super (the rulebook is for people who write)
 *  - everything else     any authenticated session (viewer+)
 *
 * Fine-grained checks (per-record, per-action) still happen in the route
 * handlers/pages; this is the coarse perimeter.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public pages: the login screen and the partner-team integration guide
  // (direct-link only; not linked in the app nav).
  if (pathname === "/login" || pathname === "/mcp-guide") {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions());
  const role = session.role;

  if (!role) return redirect(req, "/login", pathname);

  if (pathname.startsWith("/admin") && role !== "super") {
    return redirect(req, "/", null);
  }
  if (
    (pathname.startsWith("/submit") ||
      pathname.startsWith("/adjustments") ||
      pathname.startsWith("/guide")) &&
    !(role === "admin" || role === "super")
  ) {
    return redirect(req, "/", null);
  }

  return res;
}

function redirect(req: NextRequest, to: string, from: string | null) {
  const url = req.nextUrl.clone();
  url.pathname = to;
  url.search = from ? `?next=${encodeURIComponent(from)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on all page routes; skip API (self-gated), Next internals, and files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
