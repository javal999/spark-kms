import { config } from "dotenv";
import { db } from "./index";
import { users, appConfig } from "./schema";
import { hashPassword } from "@/src/lib/password";
import { sql } from "drizzle-orm";

config({ path: ".env" });

/**
 * Dev/test seed credentials. Known values so E2E and manual dev can log in.
 * NOT for production — production provisions its own admins + viewer password.
 */
export const SEED_CREDENTIALS = {
  super: { email: "super@spark.local", password: "super-password-123", name: "Super Admin" },
  admin: { email: "admin@spark.local", password: "admin-password-123", name: "Regular Admin" },
  viewerPassword: "viewer-password-123",
} as const;

export const DEFAULT_DEDUP_THRESHOLD = 0.4;
export const TEMPLATE_VERSION = "v1.1";

/**
 * Idempotent seed: 2 admins (1 super) + app_config (viewer password hash,
 * dedup threshold, template version). Safe to run repeatedly.
 */
export async function seedDatabase() {
  // Safety: never plant known-password admins in production. Production
  // provisions its own admins + viewer password (D5: launches empty).
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PROD_SEED !== "true"
  ) {
    throw new Error(
      "Refusing to seed known dev credentials in production. Set ALLOW_PROD_SEED=true only if you truly intend this.",
    );
  }

  const superHash = await hashPassword(SEED_CREDENTIALS.super.password);
  const adminHash = await hashPassword(SEED_CREDENTIALS.admin.password);
  const viewerHash = await hashPassword(SEED_CREDENTIALS.viewerPassword);

  await db
    .insert(users)
    .values([
      {
        email: SEED_CREDENTIALS.super.email,
        name: SEED_CREDENTIALS.super.name,
        passwordHash: superHash,
        isSuper: true,
      },
      {
        email: SEED_CREDENTIALS.admin.email,
        name: SEED_CREDENTIALS.admin.name,
        passwordHash: adminHash,
        isSuper: false,
      },
    ])
    .onConflictDoNothing({ target: users.email });

  await db
    .insert(appConfig)
    .values([
      { key: "viewer_password_hash", value: viewerHash },
      { key: "dedup_threshold", value: DEFAULT_DEDUP_THRESHOLD },
      { key: "template_version", value: TEMPLATE_VERSION },
    ])
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: sql`excluded.value` },
    });
}

async function main() {
  await seedDatabase();
  console.log("Seed complete.");
  console.log("  super admin:", SEED_CREDENTIALS.super.email, "/", SEED_CREDENTIALS.super.password);
  console.log("  admin:      ", SEED_CREDENTIALS.admin.email, "/", SEED_CREDENTIALS.admin.password);
  console.log("  viewer pw:  ", SEED_CREDENTIALS.viewerPassword);
  process.exit(0);
}

// Run as CLI only (not on import from tests).
if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
