import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
  hashKey,
} from "@/src/services/apiKeys";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { db } from "@/src/db";
import { apiKeys } from "@/src/db/schema";

/** Gate 5 — API key lifecycle: hashing at rest, verification, revocation. */
describe("apiKeys service", () => {
  let actor: number;
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
  });

  it("creates a key, storing only its hash (never the raw secret)", async () => {
    const created = await createApiKey("Reader", "read", actor);
    expect(created.key).toMatch(/^spark_sk_[0-9a-f]{48}$/);
    expect(created.prefix.startsWith("spark_sk_")).toBe(true);

    const [row] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, created.id));
    expect(row.keyHash).toBe(hashKey(created.key));
    expect(row.keyHash).not.toContain(created.key);
  });

  it("verifies a valid key and returns scope + owner", async () => {
    const created = await createApiKey("Writer", "write", actor);
    const identity = await verifyApiKey(created.key);
    expect(identity).toMatchObject({
      keyId: created.id,
      scope: "write",
      ownerUserId: actor,
    });
  });

  it("rejects unknown, malformed, and revoked keys", async () => {
    expect(await verifyApiKey("spark_sk_deadbeef")).toBeNull();
    expect(await verifyApiKey("not-a-key")).toBeNull();

    const created = await createApiKey("Temp", "read", actor);
    expect(await revokeApiKey(created.id)).toBe(true);
    expect(await verifyApiKey(created.key)).toBeNull();
    // Second revoke is a no-op.
    expect(await revokeApiKey(created.id)).toBe(false);
  });

  it("lists keys without exposing hashes or secrets", async () => {
    const created = await createApiKey("K1", "read", actor);
    const keys = await listApiKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toHaveProperty("keyHash");
    const blob = JSON.stringify(keys);
    expect(blob).not.toContain(created.key); // full secret never listed
    expect(blob).not.toContain(hashKey(created.key)); // nor its hash
  });
});
