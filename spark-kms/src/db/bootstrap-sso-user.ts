import { upsertAuthorized } from "@/src/services/authorized-users";
import type { Role } from "@/src/lib/session-config";

/**
 * Bootstrap an SSO user onto the allow-list (TRD-2026-009). Use it to seed the
 * FIRST super-admin before the Access panel (E6) exists, or to add a user from
 * the CLI. Idempotent — re-running just updates the role.
 *
 *   npx tsx --env-file=.env src/db/bootstrap-sso-user.ts <email> [viewer|admin|super]
 *
 * Default role is `super` (so you can sign in and manage everyone else).
 */
async function main() {
  const email = process.argv[2];
  const role = (process.argv[3] ?? "super") as Role;
  if (!email || !email.includes("@")) {
    console.error(
      "Usage: tsx --env-file=.env src/db/bootstrap-sso-user.ts <email> [viewer|admin|super]",
    );
    process.exit(1);
  }
  if (!["viewer", "admin", "super"].includes(role)) {
    console.error(`Invalid role "${role}" — use viewer, admin, or super.`);
    process.exit(1);
  }
  const u = await upsertAuthorized(email, role);
  console.log(
    `✓ ${u.email} authorized as ${u.role} (id ${u.id}). They can now sign in via Microsoft.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
