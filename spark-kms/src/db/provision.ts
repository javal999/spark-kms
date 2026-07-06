import { config } from "dotenv";

// Load a local .env if present (dev); in production the host sets real env vars
// and this is a harmless no-op. dotenv never throws on a missing file.
config({ path: ".env" });

/**
 * PRODUCTION provisioning — the safe alternative to the dev seed (which is
 * refused in production). Creates/updates the first super-admin and sets the
 * shared viewer password + baseline app_config. Idempotent: safe to re-run.
 *
 * Usage (do NOT commit these values):
 *   DATABASE_URL=postgres://... \
 *   ADMIN_EMAIL=you@company.com ADMIN_NAME="Your Name" ADMIN_PASSWORD='…' \
 *   VIEWER_PASSWORD='…' \
 *   npm run db:provision
 */
async function main() {
  const email = req("ADMIN_EMAIL").toLowerCase().trim();
  const name = (process.env.ADMIN_NAME ?? "Administrator").trim();
  const password = req("ADMIN_PASSWORD");
  const viewerPassword = req("VIEWER_PASSWORD");

  if (password.length < 8) fail("ADMIN_PASSWORD must be at least 8 characters");
  if (viewerPassword.length < 8) fail("VIEWER_PASSWORD must be at least 8 characters");

  // Imported here (not top-level) so env is loaded before the db reads DATABASE_URL.
  const { db } = await import("./index");
  const { users, appConfig } = await import("./schema");
  const { hashPassword } = await import("@/src/lib/password");
  const { sql } = await import("drizzle-orm");

  const superHash = await hashPassword(password);
  const viewerHash = await hashPassword(viewerPassword);

  await db
    .insert(users)
    .values({ email, name, passwordHash: superHash, isSuper: true, active: true })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash: superHash, isSuper: true, active: true, name },
    });

  await db
    .insert(appConfig)
    .values([
      { key: "viewer_password_hash", value: viewerHash },
      { key: "dedup_threshold", value: 0.4 },
      { key: "template_version", value: "v1.1" },
    ])
    .onConflictDoUpdate({ target: appConfig.key, set: { value: sql`excluded.value` } });

  // Start viewer sessions at epoch 0 without clobbering an existing epoch.
  await db
    .insert(appConfig)
    .values({ key: "viewer_epoch", value: 0 })
    .onConflictDoNothing({ target: appConfig.key });

  console.log(`✓ Provisioned super-admin ${email} and the viewer password.`);
  console.log("  These credentials are NOT stored anywhere else — keep them safe.");
  process.exit(0);
}

function req(key: string): string {
  const v = process.env[key];
  if (!v) fail(`Missing required env var: ${key}`);
  return v!;
}
function fail(msg: string): never {
  console.error("✗", msg);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
