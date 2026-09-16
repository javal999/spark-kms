import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * proxy.ts is the page auth perimeter and had no test driving it directly. This
 * file pins its access decisions — who gets through, who is sent where — so a
 * change to how it builds redirects (FV-5 Option C) cannot quietly change who
 * gets in. Location assertions here compare path + query only; where the
 * redirect points (its origin) is covered separately below.
 */

const h = vi.hoisted(() => ({ role: undefined as string | undefined }));

vi.mock("iron-session", () => ({ getIronSession: vi.fn(async () => ({ role: h.role })) }));
vi.mock("@/src/lib/session-config", () => ({
  sessionOptions: () => ({ password: "x".repeat(32), cookieName: "spark_session" }),
}));

import { proxy } from "@/proxy";

// The address a request carries inside the production container.
const INTERNAL = "http://0.0.0.0:8080";

async function hit(pathname: string, role?: string) {
  h.role = role;
  return proxy(new NextRequest(`${INTERNAL}${pathname}`));
}

const location = (res: Response) => res.headers.get("location");
/** Path + query of a Location, whether it is absolute or relative. */
const target = (res: Response) => {
  const loc = location(res);
  if (!loc) return null;
  const u = new URL(loc, "http://origin.invalid");
  return u.pathname + u.search;
};
const passedThrough = (res: Response) =>
  location(res) === null && res.headers.get("x-middleware-next") === "1";

const PUBLIC = "https://kms.paracorplabs.com";

function setOrigin(value: string | undefined) {
  if (value === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = value;
}

beforeEach(() => setOrigin(undefined));

// Every access decision is checked in both modes: Option C may change where a
// redirect points, never whether one happens or where in the app it goes.
describe.each([
  ["APP_ORIGIN unset", undefined],
  ["APP_ORIGIN set", PUBLIC],
])("proxy access decisions — %s", (_mode, origin) => {
  beforeEach(() => setOrigin(origin));

  it.each([
    ["/login", undefined],
    ["/mcp-guide", undefined],
    ["/initiatives", "viewer"],
    ["/", "viewer"],
    ["/admin", "super"],
    ["/admin/overview", "super"],
    ["/submit", "admin"],
    ["/submit", "super"],
    ["/adjustments", "admin"],
    ["/guide", "admin"],
    ["/guide", "super"],
  ])("lets %s through for %s", async (path, role) => {
    expect(passedThrough(await hit(path, role))).toBe(true);
  });

  it.each([
    ["/initiatives", undefined, "/login?next=%2Finitiatives"],
    ["/", undefined, "/login?next=%2F"],
    // nextUrl.pathname is already encoded (`/tags/a%20b`), so `next` carries it
    // encoded once more; one decode gives back the correct return path. Pinned so
    // a rewrite of the redirect cannot silently double- or under-encode it.
    ["/tags/a b", undefined, "/login?next=%2Ftags%2Fa%2520b"],
    ["/admin", "admin", "/"],
    ["/admin/overview", "viewer", "/"],
    ["/submit", "viewer", "/"],
    ["/adjustments", "viewer", "/"],
    ["/guide", "viewer", "/"],
  ])("sends %s for %s to %s", async (path, role, expected) => {
    expect(target(await hit(path, role))).toBe(expected);
  });
});

describe("where proxy redirects point (FV-5 Option C)", () => {
  it("uses APP_ORIGIN, never the container's bind address", async () => {
    setOrigin(PUBLIC);
    expect(location(await hit("/initiatives"))).toBe(`${PUBLIC}/login?next=%2Finitiatives`);
    expect(location(await hit("/admin", "viewer"))).toBe(`${PUBLIC}/`);
  });

  it("reduces APP_ORIGIN to its origin, ignoring a trailing slash or path", async () => {
    for (const raw of [`${PUBLIC}/`, `${PUBLIC}/ignored/path?x=1`]) {
      setOrigin(raw);
      expect(location(await hit("/initiatives"))).toBe(`${PUBLIC}/login?next=%2Finitiatives`);
    }
  });

  it("keeps today's behavior when APP_ORIGIN is unset", async () => {
    // The request's own origin. It reaches the browser as a correct relative
    // Location only because Next's resolve-routes.js relativizes same-origin proxy
    // redirects — the dependency setting APP_ORIGIN removes.
    expect(location(await hit("/initiatives"))).toBe(`${INTERNAL}/login?next=%2Finitiatives`);
  });

  it("falls back rather than taking the perimeter down when APP_ORIGIN is invalid", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const bad of ["kms.paracorplabs.com", "ftp://kms.paracorplabs.com", "not a url", "   "]) {
      setOrigin(bad);
      const res = await hit("/initiatives");
      expect(res.status).toBe(307);
      expect(location(res)).toBe(`${INTERNAL}/login?next=%2Finitiatives`);
    }
    // Loud enough to find in the container log, once per bad value, not per request.
    expect(err).toHaveBeenCalled();
    const calls = err.mock.calls.length;
    setOrigin("not a url"); // already warned above
    await hit("/initiatives");
    await hit("/admin", "viewer");
    expect(err.mock.calls.length).toBe(calls);
    err.mockRestore();
  });
});

