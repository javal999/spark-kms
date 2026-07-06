import { eq, and, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { users, appConfig } from "@/src/db/schema";
import { verifyPassword } from "@/src/lib/password";

/**
 * Credential verification (Node runtime — argon2). Never called from the Edge
 * proxy, which only decrypts an already-issued session.
 */

export async function verifyViewerPassword(password: string): Promise<boolean> {
  const row = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "viewer_password_hash"))
    .limit(1);
  const hash = row[0]?.value;
  if (typeof hash !== "string") return false;
  return verifyPassword(hash, password);
}

export type AdminIdentity = {
  id: number;
  email: string;
  name: string;
  isSuper: boolean;
};

export async function verifyAdminCredentials(
  email: string,
  password: string,
): Promise<AdminIdentity | null> {
  const row = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email.toLowerCase().trim()), eq(users.active, true)))
    .limit(1);
  const user = row[0];
  if (!user) return null;
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuper: user.isSuper,
  };
}

/**
 * Viewer-password rotation epoch (REQ-A1). Sealed into each viewer session at
 * login; bumping it on rotation invalidates every existing viewer session.
 */
export async function getViewerEpoch(): Promise<number> {
  const row = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "viewer_epoch"))
    .limit(1);
  const v = row[0]?.value;
  return typeof v === "number" ? v : 0;
}

export async function bumpViewerEpoch(): Promise<number> {
  const next = (await getViewerEpoch()) + 1;
  await db
    .insert(appConfig)
    .values({ key: "viewer_epoch", value: next })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: sql`excluded.value` } });
  return next;
}
