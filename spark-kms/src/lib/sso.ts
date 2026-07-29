import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Microsoft Entra ID (M365) OIDC — server-only (reads AZURE_CLIENT_SECRET).
 * A transparent auth-code + PKCE flow: we own every security check (state,
 * nonce, PKCE, issuer, audience, expiry) rather than delegating to a framework.
 * NEVER import this from a client component. TRD-2026-009 §6.2, §14.
 */

const SCOPE = "openid profile email";

export class SsoConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SsoConfigError";
  }
}

export type SsoConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authority: string;
};

/** Read + validate SSO env. Throws a clear error if anything is missing. */
export function ssoConfig(): SsoConfig {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const redirectUri = process.env.AZURE_REDIRECT_URI;
  const missing = Object.entries({
    AZURE_TENANT_ID: tenantId,
    AZURE_CLIENT_ID: clientId,
    AZURE_CLIENT_SECRET: clientSecret,
    AZURE_REDIRECT_URI: redirectUri,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new SsoConfigError(`SSO is enabled but env is missing: ${missing.join(", ")}`);
  }
  return {
    tenantId: tenantId!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    authority: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  };
}

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

const discoveryCache = new Map<string, Promise<Discovery>>();

/** Fetch (and cache) the tenant's OIDC discovery document. */
export function discover(cfg: SsoConfig): Promise<Discovery> {
  const url = `${cfg.authority}/.well-known/openid-configuration`;
  let p = discoveryCache.get(url);
  if (!p) {
    p = fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`);
        return (await r.json()) as Discovery;
      })
      .catch((e) => {
        discoveryCache.delete(url); // don't cache a failure
        throw e;
      });
    discoveryCache.set(url, p);
  }
  return p;
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

/**
 * Only accept a safe local return path. Rejects protocol-relative (`//host`),
 * absolute URLs (`https://…`), backslashes, and control chars — the open-redirect
 * surface. Falls back to the dashboard.
 */
export function sanitizeNext(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\\\x00-\x1f]/.test(raw)) return "/";
  return raw;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** PKCE verifier + S256 challenge. */
export function makePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** A random opaque token for `state` / `nonce`. */
export function randomToken(): string {
  return b64url(randomBytes(24));
}

export type SsoIdentity = { oid: string; email: string; name: string };

/**
 * Map validated id_token claims to our identity. Email = `preferred_username`
 * (UPN) first, then `email`/`upn`, lowercased. `oid` (stable) is required.
 */
export function claimsToIdentity(claims: JWTPayload & Record<string, unknown>): SsoIdentity {
  const oid = String(claims.oid ?? claims.sub ?? "").trim();
  const email = String(
    claims.preferred_username ?? claims.email ?? claims.upn ?? "",
  )
    .toLowerCase()
    .trim();
  const name = String(claims.name ?? email).trim();
  if (!oid) throw new Error("id_token missing oid/sub");
  if (!email) throw new Error("id_token missing a usable email claim");
  return { oid, email, name };
}

/** Build the Entra authorize URL for the redirect that starts sign-in. */
export function buildAuthUrl(
  disc: Discovery,
  cfg: SsoConfig,
  p: { state: string; nonce: string; challenge: string },
): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: SCOPE,
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  });
  return `${disc.authorization_endpoint}?${q.toString()}`;
}

// ── Flow (network; covered by the live test) ────────────────────────────────

/** Exchange the auth code for tokens (confidential client + PKCE). */
export async function exchangeCode(
  disc: Discovery,
  cfg: SsoConfig,
  p: { code: string; verifier: string },
): Promise<{ id_token: string }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: cfg.redirectUri,
    code_verifier: p.verifier,
    scope: SCOPE,
  });
  const res = await fetch(disc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text().catch(() => "")}`.trim());
  }
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("token response had no id_token");
  return { id_token: json.id_token };
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Validate the id_token: signature (JWKS), issuer, audience, expiry, nonce. */
export async function verifyIdToken(
  disc: Discovery,
  cfg: SsoConfig,
  idToken: string,
  expectedNonce: string,
): Promise<JWTPayload & Record<string, unknown>> {
  let jwks = jwksCache.get(disc.jwks_uri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(disc.jwks_uri));
    jwksCache.set(disc.jwks_uri, jwks);
  }
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: disc.issuer,
    audience: cfg.clientId,
    clockTolerance: 60,
  });
  if (payload.nonce !== expectedNonce) throw new Error("id_token nonce mismatch");
  return payload as JWTPayload & Record<string, unknown>;
}
