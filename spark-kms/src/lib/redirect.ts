import { NextResponse } from "next/server";

/**
 * A redirect with a RELATIVE `Location`, which the browser resolves against the
 * public host it is already on.
 *
 * Route handlers must not build redirects from `req.url`. In the standalone
 * production build it carries the address the server binds to
 * (`0.0.0.0:8080`), not the host the Lightsail proxy forwards, so an absolute
 * URL built from it sends the browser nowhere (TRD-2026-009 E17).
 *
 * Middleware (`proxy.ts`) does not use this and is unaffected in production —
 * verified at the wire, not by anything the code enforces: it builds an absolute
 * URL from `nextUrl`, which Next normalizes to a relative `Location` on the way
 * out (BACKLOG.md FV-5).
 *
 * Only same-site paths are accepted, so this can never become an open redirect.
 */
export function relativeRedirect(
  path: string,
  params?: Record<string, string>,
  status: 302 | 303 | 307 | 308 = 307,
): NextResponse {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    throw new Error(`relativeRedirect needs a same-site path, got ${JSON.stringify(path)}`);
  }
  let location = path;
  if (params && Object.keys(params).length > 0) {
    location += (path.includes("?") ? "&" : "?") + new URLSearchParams(params).toString();
  }
  return new NextResponse(null, { status, headers: { Location: location } });
}
