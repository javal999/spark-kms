import { eq, sql, isNotNull } from "drizzle-orm";
import { db } from "@/src/db";
import { users, appConfig } from "@/src/db/schema";
import { hashPassword } from "@/src/lib/password";
import { bumpViewerEpoch } from "@/src/services/auth";
import { award, type Stream } from "@/src/services/scoring";

/**
 * Super-admin operations. v1.2 (D14): BP-of-week + Best-Presenter auto-award at
 * submit, so there is no nomination-confirm or manual-stream console anymore.
 * The only super-admin score action left is `postAdjustment` (REQ-S3). All
 * scoring still goes through scoring.ts.
 */

// ---- Users ----
export async function listAdmins() {
  // Password / break-glass accounts only (TRD-2026-009): SSO users live on the
  // allow-list and are managed in the Access panel, not here. A row with a
  // password hash is a real password login.
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isSuper: users.isSuper,
      active: users.active,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNotNull(users.passwordHash))
    .orderBy(users.id);
}

export async function createAdmin(input: {
  email: string;
  name: string;
  password: string;
  isSuper: boolean;
}): Promise<{ id: number }> {
  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      passwordHash,
      isSuper: input.isSuper,
      // Keep the new `role` source-of-truth in step with is_super (TRD-2026-009).
      role: input.isSuper ? "super" : "admin",
    })
    .returning({ id: users.id });
  return row;
}

export async function setUserActive(id: number, active: boolean): Promise<void> {
  await db.update(users).set({ active }).where(eq(users.id, id));
}

// ---- Viewer password rotation (REQ-A1) ----
export async function rotateViewerPassword(newPassword: string): Promise<number> {
  const hash = await hashPassword(newPassword);
  await db
    .insert(appConfig)
    .values({ key: "viewer_password_hash", value: hash })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: sql`excluded.value` } });
  // Invalidate every existing viewer session.
  return bumpViewerEpoch();
}

/**
 * Post a manual adjustment (note required — the dispute mechanism, REQ-S3).
 * Any admin may call this since D24; the caller's route enforces requireAdmin().
 * The stream is chosen by the admin, so this is the one path that can put
 * points on best_practice without a Best-Practice-of-the-Week win (D23).
 */
export async function postAdjustment(
  input: {
    region: string;
    segment: string;
    stream: Stream;
    points: number;
    effectiveDate: string;
    note: string;
    initiativeId?: number;
  },
  actorId: number,
) {
  return award({
    reason: "adjustment",
    region: input.region,
    segment: input.segment,
    stream: input.stream,
    points: input.points,
    effectiveDate: input.effectiveDate,
    note: input.note,
    initiativeId: input.initiativeId,
    actorId,
  });
}
