import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  sanitizeNext,
  makePkce,
  randomToken,
  claimsToIdentity,
  buildAuthUrl,
  ssoConfig,
  SsoConfigError,
  type SsoConfig,
} from "@/src/lib/sso";

/**
 * E2 gate (TRD-2026-009): the security-critical pure helpers. The live token
 * exchange is covered by the end-to-end test against Entra; here we lock down
 * open-redirect defense, PKCE, claim mapping, auth-URL shape, and config guard.
 */

describe("sanitizeNext (open-redirect defense)", () => {
  it("passes a safe local path (with query)", () => {
    expect(sanitizeNext("/initiatives?q=x")).toBe("/initiatives?q=x");
    expect(sanitizeNext("/")).toBe("/");
  });
  it("rejects every open-redirect vector → '/'", () => {
    for (const bad of [
      "//evil.com",
      "https://evil.com",
      "http://x",
      "/\\evil",
      "\\\\evil",
      "evil",
      "  /x",
      "/foo\nbar",
    ]) {
      expect(sanitizeNext(bad)).toBe("/");
    }
    expect(sanitizeNext(null)).toBe("/");
    expect(sanitizeNext(undefined)).toBe("/");
  });
});

describe("makePkce / randomToken", () => {
  it("challenge is base64url(sha256(verifier))", () => {
    const { verifier, challenge } = makePkce();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("is random per call", () => {
    expect(makePkce().verifier).not.toBe(makePkce().verifier);
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("claimsToIdentity", () => {
  it("prefers preferred_username (lowercased) and oid", () => {
    expect(
      claimsToIdentity({
        oid: "OID1",
        preferred_username: "User@Paragon.com",
        name: "User X",
        email: "e@p.com",
      }),
    ).toEqual({ oid: "OID1", email: "user@paragon.com", name: "User X" });
  });
  it("falls back email→upn and sub→oid; name defaults to email", () => {
    expect(claimsToIdentity({ sub: "S1", email: "A@B.com" })).toEqual({
      oid: "S1",
      email: "a@b.com",
      name: "a@b.com",
    });
    expect(claimsToIdentity({ oid: "O", upn: "U@P.com" }).email).toBe("u@p.com");
  });
  it("throws when oid or email is missing", () => {
    expect(() => claimsToIdentity({ preferred_username: "x@y.com" })).toThrow();
    expect(() => claimsToIdentity({ oid: "O" })).toThrow();
  });
});

describe("buildAuthUrl", () => {
  it("carries PKCE S256, state, nonce, scope and redirect", () => {
    const url = buildAuthUrl(
      {
        authorization_endpoint: "https://login.microsoftonline.com/t/oauth2/v2.0/authorize",
        token_endpoint: "x",
        jwks_uri: "x",
        issuer: "x",
      },
      { clientId: "CID", redirectUri: "http://localhost:3000/api/auth/sso/callback" } as SsoConfig,
      { state: "ST", nonce: "NO", challenge: "CH" },
    );
    const u = new URL(url);
    expect(u.searchParams.get("client_id")).toBe("CID");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("code_challenge")).toBe("CH");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe("ST");
    expect(u.searchParams.get("nonce")).toBe("NO");
    expect(u.searchParams.get("scope")).toContain("openid");
    expect(u.searchParams.get("redirect_uri")).toContain("/api/auth/sso/callback");
  });
});

describe("ssoConfig", () => {
  const KEYS = [
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "AZURE_REDIRECT_URI",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  const snapshot = () => KEYS.forEach((k) => (saved[k] = process.env[k]));
  afterEach(() => {
    KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it("throws SsoConfigError when any env var is missing", () => {
    snapshot();
    KEYS.forEach((k) => delete process.env[k]);
    expect(() => ssoConfig()).toThrow(SsoConfigError);
  });
  it("derives the v2.0 authority from the tenant when set", () => {
    snapshot();
    process.env.AZURE_TENANT_ID = "TEN";
    process.env.AZURE_CLIENT_ID = "CID";
    process.env.AZURE_CLIENT_SECRET = "SEC";
    process.env.AZURE_REDIRECT_URI = "http://x/cb";
    const cfg = ssoConfig();
    expect(cfg.authority).toBe("https://login.microsoftonline.com/TEN/v2.0");
    expect(cfg.clientId).toBe("CID");
  });
});
