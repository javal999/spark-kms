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
 * Middleware (`proxy.ts`) cannot use this — Next re-parses a proxy redirect with
 * `new NextURL()`, which throws on a relative URL — so it redirects to
 * `publicOrigin()` instead (BACKLOG.md FV-5).
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

const warnedOrigins = new Set<string>();

/**
 * The public origin page redirects point at, from `APP_ORIGIN`
 * (`https://kms.paracorplabs.com`), reduced to scheme + host + port. Null when
 * unset or unusable.
 *
 * `proxy.ts` needs this because it cannot use `relativeRedirect()`: Next re-parses
 * a proxy redirect with `new NextURL(location)`, which throws on a relative URL
 * (BACKLOG.md FV-5). Left to `req.nextUrl`, the redirect is correct in production
 * only because Next's `resolve-routes.js` relativizes a same-origin proxy
 * redirect — an internal no config option controls and an upgrade could change.
 *
 * Fails SAFE, never closed: an invalid value logs once and returns null, so the
 * caller keeps today's behavior instead of 500-ing every gated page. A wrong but
 * valid origin cannot be detected here — the post-deploy check catches it.
 */
export function publicOrigin(): string | null {
  const raw = process.env.APP_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch {
    // not a URL at all — warn below
  }
  if (!warnedOrigins.has(raw)) {
    warnedOrigins.add(raw);
    console.error(
      `APP_ORIGIN ${JSON.stringify(raw)} is not an http(s) origin; page redirects fall back to the request origin (TRD-2026-009 E17).`,
    );
  }
  return null;
}
