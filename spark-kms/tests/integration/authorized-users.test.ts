import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import {
  listAuthorized,
  upsertAuthorized,
  setActive,
  findByOidOrEmail,
  bindOid,
  recordLogin,
  getUserAccess,
  LastSuperError,
} from "@/src/services/authorized-users";
import { resetAndSeed } from "@/tests/helpers/db";

/**
 * E1 gate (TRD-2026-009): the allow-list is the source of truth for who may
 * sign in and at what role. Must normalize emails, keep at least one active
 * super-admin, and match logins by the stable oid once bound.
 */
describe("authorized-users allow-list", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });

  it("seeded admins carry a role (backfill / createAdmin keeps role in step)", async () => {
    const supers = (await listAuthorized()).filter((u) => u.role === "super");
    expect(supers.length).toBeGreaterThanOrEqual(1);
    // no seeded user is left on the accidental 'viewer' default
    expect((await listAuthorized()).every((u) => u.role !== "viewer")).toBe(true);
  });

  it("adds a person by normalized email, then updates role in place", async () => {
    const u = await upsertAuthorized("  New.Person@Paragon.com ", "viewer");
    expect(u.email).toBe("new.person@paragon.com");
    expect(u.role).toBe("viewer");
    const promoted = await upsertAuthorized("new.person@paragon.com", "admin");
    expect(promoted.id).toBe(u.id); // same row, not a duplicate
    expect(promoted.role).toBe("admin");
  });

  it("blocks downgrading or deactivating the last active super-admin", async () => {
    // Collapse to exactly one active super.
    const supers = (await listAuthorized()).filter((u) => u.role === "super" && u.active);
    for (const s of supers.slice(1)) await upsertAuthorized(s.email, "admin");
    const [last] = (await listAuthorized()).filter((u) => u.role === "super" && u.active);
    await expect(upsertAuthorized(last.email, "viewer")).rejects.toBeInstanceOf(LastSuperError);
    await expect(setActive(last.id, false)).rejects.toBeInstanceOf(LastSuperError);
  });

  it("matches by email, and by stable oid once bound (survives an email change)", async () => {
    const v = await upsertAuthorized("sso@paragon.com", "viewer");
    expect((await findByOidOrEmail(null, "SSO@paragon.com"))?.id).toBe(v.id);
    await bindOid(v.id, "oid-123");
    await db.update(users).set({ email: "renamed@paragon.com" }).where(eq(users.id, v.id));
    expect((await findByOidOrEmail("oid-123", "nope@paragon.com"))?.id).toBe(v.id);
  });

  it("bindOid never overwrites an existing oid (idempotent)", async () => {
    const v = await upsertAuthorized("x@paragon.com", "viewer");
    await bindOid(v.id, "oid-A");
    await bindOid(v.id, "oid-B");
    const [row] = await db.select({ oid: users.entraOid }).from(users).where(eq(users.id, v.id));
    expect(row.oid).toBe("oid-A");
  });

  it("recordLogin stamps last_login_at and refreshes the display name", async () => {
    const v = await upsertAuthorized("y@paragon.com", "viewer");
    await recordLogin(v.id, "Yuni Real Name");
    const [row] = (await listAuthorized()).filter((r) => r.id === v.id);
    expect(row.name).toBe("Yuni Real Name");
    expect(row.lastLoginAt).not.toBeNull();
  });

  it("returns null for an email not on the allow-list", async () => {
    expect(await findByOidOrEmail(null, "stranger@paragon.com")).toBeNull();
  });

  it("getUserAccess reflects the LIVE role + active (E4 immediate revocation)", async () => {
    const u = await upsertAuthorized("guard@paragon.com", "admin");
    expect(await getUserAccess(u.id)).toEqual({ role: "admin", active: true });
    // Deactivating and downgrading both show up immediately.
    await setActive(u.id, false);
    await upsertAuthorized("guard@paragon.com", "viewer");
    expect(await getUserAccess(u.id)).toEqual({ role: "viewer", active: false });
    expect(await getUserAccess(999_999)).toBeNull();
  });
});
