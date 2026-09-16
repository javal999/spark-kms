import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/src/lib/session-config";
import { publicOrigin } from "@/src/lib/redirect";

/**
 * Route gate (Next 16 renamed `middleware` → `proxy`). It only DECRYPTS the
 * sealed session cookie — no DB, no argon2 — because it sits on the hot path for
 * every page navigation. Note this is a deliberate budget, not a runtime limit:
 * Next 16 runs Proxy on the **Node.js** runtime by default and the `runtime`
 * option is not available here (`node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/proxy.md` § Runtime), so the old "runs on
 * the Edge" reasoning no longer applies.
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

/** Absolute redirect to the public origin when APP_ORIGIN is set (FV-5 Option C);
 * otherwise the request's own origin, as before. Path and query are identical
 * either way — `tests/unit/proxy-gate.test.ts` checks every access decision in
 * both modes. */
function redirect(req: NextRequest, to: string, from: string | null) {
  const origin = publicOrigin();
  const url = origin ? new URL(to, origin) : req.nextUrl.clone();
  url.pathname = to;
  url.search = from ? `?next=${encodeURIComponent(from)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on all page routes; skip API (self-gated), Next internals, and files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
