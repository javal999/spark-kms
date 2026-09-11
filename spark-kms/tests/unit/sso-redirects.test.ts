import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

/**
 * API-route redirects must be RELATIVE (2026-09-11).
 *
 * In the standalone production build, a route handler's `req.url` takes its
 * origin from the address the server binds to (`HOSTNAME=0.0.0.0`, port 8080)
 * and ignores the Host header the Lightsail proxy forwards. So
 * `NextResponse.redirect(new URL("/login", req.url))` sent browsers to
 * `https://0.0.0.0:8080/login`. It was invisible while every Microsoft sign-in
 * failed earlier on a placeholder client secret; the first successful sign-in
 * after deployment 33 landed on ERR_CONNECTION_REFUSED.
 *
 * Page redirects in proxy.ts are unaffected — middleware's nextUrl carries the
 * forwarded host — which is why only the /api routes broke.
 */

// The internal address a route handler sees in production.
const INTERNAL = "http://0.0.0.0:8080";

const h = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FEATURE_SSO = "1";
  process.env.SESSION_SECRET = "test-only-session-secret-at-least-32-chars";
  return {
    session: { destroy: vi.fn(), save: vi.fn() } as Record<string, unknown>,
    unsealData: vi.fn(),
    findByOidOrEmail: vi.fn(),
  };
});

vi.mock("@/src/lib/session", () => ({
  getSession: vi.fn(async () => h.session),
  VIEWER_TTL_SECONDS: 3600,
  ADMIN_TTL_SECONDS: 3600,
}));
vi.mock("iron-session", () => ({ unsealData: h.unsealData, sealData: vi.fn(async () => "sealed") }));
vi.mock("@/src/lib/sso", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/sso")>("@/src/lib/sso");
  return {
    ...actual, // keep the real sanitizeNext open-redirect defense
    ssoConfig: vi.fn(() => ({})),
    discover: vi.fn(async () => ({})),
    exchangeCode: vi.fn(async () => ({ id_token: "t" })),
    verifyIdToken: vi.fn(async () => ({})),
    claimsToIdentity: vi.fn(() => ({ oid: "oid-1", email: "levi@example.com", name: "Levi" })),
  };
});
vi.mock("@/src/services/authorized-users", () => ({
  findByOidOrEmail: h.findByOidOrEmail,
  bindOid: vi.fn(async () => {}),
  recordLogin: vi.fn(async () => {}),
}));
vi.mock("@/src/lib/error-log", () => ({ captureError: vi.fn(async () => "err_test") }));

import { relativeRedirect } from "@/src/lib/redirect";
import { GET as callback } from "@/app/api/auth/sso/callback/route";
import { GET as logoutGet } from "@/app/api/auth/logout/route";

beforeEach(() => {
  h.unsealData.mockReset();
  h.findByOidOrEmail.mockReset();
});

const location = (res: Response) => res.headers.get("location");

describe("relativeRedirect", () => {
  it("emits a relative Location with its query", () => {
    const res = relativeRedirect("/login", { e: "sso", ref: "err_1" });
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/login?e=sso&ref=err_1");
  });

  it("refuses anything that is not a same-site path", () => {
    // Protocol-relative and absolute targets would turn this into an open redirect.
    for (const bad of ["//evil.example", "https://evil.example", "login", ""]) {
      expect(() => relativeRedirect(bad)).toThrow();
    }
  });
});

describe("SSO callback redirects stay on the public site", () => {
  it("successful sign-in lands on `next`, not on 0.0.0.0", async () => {
    // The exact path the first real sign-in took after deployment 33.
    h.unsealData.mockResolvedValue({ state: "s1", next: "/initiatives", verifier: "v", nonce: "n" });
    h.findByOidOrEmail.mockResolvedValue({ id: 1, role: "admin", active: true, email: "levi@example.com" });
    const req = new NextRequest(`${INTERNAL}/api/auth/sso/callback?code=c1&state=s1`, {
      headers: { cookie: "spark_sso_flow=sealed" },
    });
    const res = await callback(req);
    expect(location(res)).toBe("/initiatives");
    expect(h.session.save).toHaveBeenCalled();
  });

  it("a missing code goes back to /login relatively", async () => {
    const res = await callback(new NextRequest(`${INTERNAL}/api/auth/sso/callback`));
    expect(location(res)).toBe("/login?e=sso");
  });

  it("an IdP error goes back to /login relatively", async () => {
    const res = await callback(new NextRequest(`${INTERNAL}/api/auth/sso/callback?error=access_denied`));
    expect(location(res)).toBe("/login?e=sso");
  });

  it("a user not on the allow-list is refused relatively", async () => {
    h.unsealData.mockResolvedValue({ state: "s2", next: "/", verifier: "v", nonce: "n" });
    h.findByOidOrEmail.mockResolvedValue(null);
    const req = new NextRequest(`${INTERNAL}/api/auth/sso/callback?code=c2&state=s2`, {
      headers: { cookie: "spark_sso_flow=sealed" },
    });
    expect(location(await callback(req))).toBe("/login?denied=1");
  });
});

describe("logout redirect stays on the public site", () => {
  it("GET /api/auth/logout redirects to /login relatively", async () => {
    // The handler no longer reads the request at all, so the internal address
    // has nothing to leak into.
    const res = await logoutGet();
    expect(location(res)).toBe("/login");
    expect(h.session.destroy).toHaveBeenCalled();
  });
});

describe("no API route builds a redirect from req.url", () => {
  // Guards every route handler, including ones added later.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "route.ts") files.push(p);
    }
  };
  walk(path.join(process.cwd(), "app/api"));

  it("found the route files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [path.relative(process.cwd(), f), f]))("%s", (_rel, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/new URL\([^)]*,\s*(req|request)\.(url|nextUrl)\s*\)/);
  });
});
