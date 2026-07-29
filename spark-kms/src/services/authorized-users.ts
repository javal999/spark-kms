import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import type { Role } from "@/src/lib/session-config";

/**
 * The M365 SSO allow-list (TRD-2026-009). ONE row per authorized person =
 * `email → role`; this table is simultaneously "who may sign in" (D3) and "what
 * role they get" (D1). Sole writer of the allow-list fields. SSO users have no
 * password; `entra_oid` is bound on first login and is the stable match key.
 *
 * A super-admin manages this via the Admin → Access panel. The one invariant
 * enforced here: at least one active super-admin must always remain.
 */

export class LastSuperError extends Error {
  constructor() {
    super("At least one active super-admin must remain.");
    this.name = "LastSuperError";
  }
}
export class AuthorizedUserNotFoundError extends Error {
  constructor(id: number) {
    super(`Authorized user ${id} not found.`);
    this.name = "AuthorizedUserNotFoundError";
  }
}

const norm = (email: string) => email.trim().toLowerCase();

export type AuthorizedUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  entraOid: string | null;
  lastLoginAt: Date | null;
};

const cols = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  active: users.active,
  entraOid: users.entraOid,
  lastLoginAt: users.lastLoginAt,
} as const;

async function one(id: number): Promise<AuthorizedUser> {
  const [row] = await db.select(cols).from(users).where(eq(users.id, id)).limit(1);
  if (!row) throw new AuthorizedUserNotFoundError(id);
  return row;
}

/** How many active super-admins remain (optionally excluding one row). */
async function activeSuperCount(excludingId?: number): Promise<number> {
  const conds = [eq(users.role, "super"), eq(users.active, true)];
  if (excludingId != null) conds.push(ne(users.id, excludingId));
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(...conds));
  return Number(row?.n ?? 0);
}

export async function listAuthorized(): Promise<AuthorizedUser[]> {
  const rows = await db.select(cols).from(users).orderBy(users.email);
  return rows;
}

/** Add an email to the allow-list, or change an existing person's role. */
export async function upsertAuthorized(
  emailRaw: string,
  role: Role,
): Promise<AuthorizedUser> {
  const email = norm(emailRaw);
  const [existing] = await db
    .select({ id: users.id, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    // Guard: don't strip the last active super by downgrading them.
    if (existing.role === "super" && existing.active && role !== "super") {
      if ((await activeSuperCount(existing.id)) === 0) throw new LastSuperError();
    }
    await db.update(users).set({ role }).where(eq(users.id, existing.id));
    return one(existing.id);
  }
  // New allow-list entry: name defaults to the email until first SSO login sets
  // the real display name; no password (SSO).
  const [ins] = await db
    .insert(users)
    .values({ email, name: email, role, active: true })
    .returning({ id: users.id });
  return one(ins.id);
}

/** Activate / deactivate an authorized person. */
export async function setActive(id: number, active: boolean): Promise<AuthorizedUser> {
  const [u] = await db
    .select({ role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!u) throw new AuthorizedUserNotFoundError(id);
  if (!active && u.role === "super" && u.active) {
    if ((await activeSuperCount(id)) === 0) throw new LastSuperError();
  }
  await db.update(users).set({ active }).where(eq(users.id, id));
  return one(id);
}

/**
 * Login lookup: match by stable `oid` first, else by email. Returns the row
 * regardless of `active` so the caller can distinguish "not authorized" from
 * "deactivated". Null = not on the allow-list at all.
 */
export async function findByOidOrEmail(
  oid: string | null,
  emailRaw: string,
): Promise<AuthorizedUser | null> {
  if (oid) {
    const [byOid] = await db.select(cols).from(users).where(eq(users.entraOid, oid)).limit(1);
    if (byOid) return byOid;
  }
  const [byEmail] = await db
    .select(cols)
    .from(users)
    .where(eq(users.email, norm(emailRaw)))
    .limit(1);
  return (byEmail) ?? null;
}

/** Bind the Entra oid on first login (idempotent — never overwrites an existing one). */
export async function bindOid(userId: number, oid: string): Promise<void> {
  await db
    .update(users)
    .set({ entraOid: oid })
    .where(and(eq(users.id, userId), sql`${users.entraOid} IS NULL`));
}

/** Stamp last-login (and refresh the display name from the IdP). */
export async function recordLogin(userId: number, name?: string): Promise<void> {
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), ...(name ? { name } : {}) })
    .where(eq(users.id, userId));
}

/**
 * The user's CURRENT role + active flag, straight from the DB (E4). Guards use
 * this to enforce revocation immediately for privileged actions, rather than
 * trusting a possibly-stale session cookie. Null = the row is gone.
 */
export async function getUserAccess(
  userId: number,
): Promise<{ role: Role; active: boolean } | null> {
  const [row] = await db
    .select({ role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}
