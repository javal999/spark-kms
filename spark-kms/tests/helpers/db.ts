import { db } from "@/src/db";
import { truncateAll } from "@/src/db/reset";
import { seedDatabase, SEED_CREDENTIALS } from "@/src/db/seed";
import { users, initiatives } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import type { NewInitiativeInput } from "@/src/validation/entry";

/**
 * Integration-test DB helpers. vitest.config injects DATABASE_URL =
 * TEST_DATABASE_URL, so `db` here points at the dedicated test database.
 */

/** Wipe + reseed to a known baseline (2 admins, app_config). */
export async function resetAndSeed() {
  await truncateAll();
  await seedDatabase();
}

/** The seeded super-admin's id (used as created_by in test inserts). */
export async function getSuperAdminId(): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_CREDENTIALS.super.email))
    .limit(1);
  if (!rows[0]) throw new Error("super admin not seeded");
  return rows[0].id;
}

/** Insert a minimal initiative directly (bypasses services) for setup. */
export async function insertInitiative(
  createdBy: number,
  overrides: Partial<NewInitiativeInput> & { title: string },
): Promise<number> {
  const [row] = await db
    .insert(initiatives)
    .values({
      title: overrides.title,
      description: overrides.description,
      region: overrides.region ?? "Jakarta Greater",
      segment: overrides.segment ?? "All",
      pillar: overrides.pillar ?? "Key Territory Execution",
      stage: overrides.stage ?? "Idea",
      pic: overrides.pic ?? "Test PIC",
      createdBy,
    })
    .returning({ id: initiatives.id });
  return row.id;
}
