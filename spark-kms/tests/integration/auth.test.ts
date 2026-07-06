import { describe, it, expect, beforeAll } from "vitest";
import {
  verifyViewerPassword,
  verifyAdminCredentials,
} from "@/src/services/auth";
import { resetAndSeed } from "@/tests/helpers/db";
import { SEED_CREDENTIALS } from "@/src/db/seed";

describe("auth credential verification", () => {
  beforeAll(async () => {
    await resetAndSeed();
  });

  it("accepts the correct viewer password", async () => {
    expect(await verifyViewerPassword(SEED_CREDENTIALS.viewerPassword)).toBe(
      true,
    );
  });

  it("rejects a wrong viewer password", async () => {
    expect(await verifyViewerPassword("nope")).toBe(false);
  });

  it("authenticates a super-admin and flags isSuper", async () => {
    const id = await verifyAdminCredentials(
      SEED_CREDENTIALS.super.email,
      SEED_CREDENTIALS.super.password,
    );
    expect(id).not.toBeNull();
    expect(id!.isSuper).toBe(true);
  });

  it("authenticates a regular admin (isSuper false)", async () => {
    const id = await verifyAdminCredentials(
      SEED_CREDENTIALS.admin.email,
      SEED_CREDENTIALS.admin.password,
    );
    expect(id).not.toBeNull();
    expect(id!.isSuper).toBe(false);
  });

  it("rejects a wrong admin password", async () => {
    expect(
      await verifyAdminCredentials(SEED_CREDENTIALS.admin.email, "wrong"),
    ).toBeNull();
  });

  it("rejects an unknown email", async () => {
    expect(
      await verifyAdminCredentials("ghost@spark.local", "whatever"),
    ).toBeNull();
  });
});
