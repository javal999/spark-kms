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
  // Params go before any fragment: `/x#frag` + `{e}` is `/x?e=…#frag`, never
  // `/x#frag?e=…`, which would hide the query inside the fragment.
  const hash = path.indexOf("#");
  const base = hash === -1 ? path : path.slice(0, hash);
  const fragment = hash === -1 ? "" : path.slice(hash);

  let location = base;
  if (params && Object.keys(params).length > 0) {
    location += (base.includes("?") ? "&" : "?") + new URLSearchParams(params).toString();
  }
  location += fragment;
  return new NextResponse(null, { status, headers: { Location: location } });
}
