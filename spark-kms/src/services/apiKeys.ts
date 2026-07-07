import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/src/db";
import { apiKeys } from "@/src/db/schema";

/**
 * Integration API key lifecycle (requirements 14, REQ-X2/X3).
 *
 * A key is a high-entropy random token `spark_sk_<48 hex>`. We store only its
 * SHA-256 hash — the raw token is returned exactly once at creation and never
 * again. Because tokens are high-entropy (not user-chosen), a fast one-way hash
 * is the correct primitive here (unlike passwords, which use argon2): there is
 * nothing to brute-force, and verification runs on every API request.
 */

export type ApiScope = "read" | "write";

const KEY_PREFIX = "spark_sk_";
/** How much of the raw key we keep as a non-secret display fragment. */
const DISPLAY_PREFIX_LEN = KEY_PREFIX.length + 6;

export type ApiKeyIdentity = {
  keyId: number;
  scope: ApiScope;
  /** The user this key acts as for created_by attribution + audit (REQ-X5). */
  ownerUserId: number;
};

export type ApiKeySummary = {
  id: number;
  name: string;
  prefix: string;
  scope: ApiScope;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export type CreatedApiKey = {
  id: number;
  name: string;
  scope: ApiScope;
  prefix: string;
  /** Full secret — shown to the caller ONCE, never persisted in the clear. */
  key: string;
};

/** SHA-256 hex of a raw key. Deterministic → indexable for O(1) lookup. */
export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Generate a fresh random API token. */
function generateRawKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("hex");
}

/** Create + persist a new key; returns the raw secret for one-time display. */
export async function createApiKey(
  name: string,
  scope: ApiScope,
  actorId: number,
): Promise<CreatedApiKey> {
  const raw = generateRawKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      name,
      keyHash: hashKey(raw),
      prefix: raw.slice(0, DISPLAY_PREFIX_LEN),
      scope,
      createdBy: actorId,
    })
    .returning({ id: apiKeys.id, prefix: apiKeys.prefix });

  return { id: row.id, name, scope, prefix: row.prefix, key: raw };
}

/** All keys (active + revoked), newest first. Never exposes hashes. */
export async function listApiKeys(): Promise<ApiKeySummary[]> {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scope: apiKeys.scope,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));
  return rows as ApiKeySummary[];
}

/** Revoke a key (idempotent). Returns true if a still-active key was revoked. */
export async function revokeApiKey(id: number): Promise<boolean> {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return Boolean(row);
}

/**
 * Verify a presented raw key. Returns the identity if it maps to an active
 * (non-revoked) key, else null. Stamps last_used_at for the audit trail.
 */
export async function verifyApiKey(
  raw: string,
): Promise<ApiKeyIdentity | null> {
  if (!raw || !raw.startsWith(KEY_PREFIX)) return null;

  const [row] = await db
    .select({
      id: apiKeys.id,
      scope: apiKeys.scope,
      ownerUserId: apiKeys.createdBy,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashKey(raw)))
    .limit(1);

  if (!row || row.revokedAt) return null;

  // Fire-and-forget: last-used is audit metadata, not on the critical path.
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .then(
      () => {},
      () => {},
    );

  return {
    keyId: row.id,
    scope: row.scope as ApiScope,
    ownerUserId: row.ownerUserId,
  };
}
