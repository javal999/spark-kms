import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { users, appConfig, entries, initiatives } from "@/src/db/schema";
import { hashPassword } from "@/src/lib/password";
import { bumpViewerEpoch } from "@/src/services/auth";
import { award, type Stream } from "@/src/services/scoring";

/**
 * Super-admin operations (REQ-A3: only super-admins confirm BP-of-week and log
 * manual point streams; admins can only nominate). All scoring goes through
 * scoring.ts.
 */

// ---- Users ----
export async function listAdmins() {
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

// ---- Weekly scoring console ----
export type PendingNomination = {
  entryId: number;
  initiativeId: number;
  title: string;
  region: string;
  segment: string;
  entryDate: string;
  detail: string;
};

/** Admin-nominated BP-of-week entries awaiting super-admin confirmation. */
export async function listPendingNominations(): Promise<PendingNomination[]> {
  const rows = await db
    .select({
      entryId: entries.id,
      initiativeId: entries.initiativeId,
      title: initiatives.title,
      region: sql<string>`${initiatives.region}::text`,
      segment: sql<string>`${initiatives.segment}::text`,
      entryDate: entries.entryDate,
      detail: entries.detail,
    })
    .from(entries)
    .innerJoin(initiatives, eq(initiatives.id, entries.initiativeId))
    .where(
      and(
        eq(entries.bpOfWeekNominated, true),
        isNull(entries.bpOfWeekConfirmedAt),
      ),
    )
    .orderBy(desc(entries.entryDate), desc(entries.id));
  return rows;
}

export type ConfirmResult =
  | { status: "confirmed"; points: number }
  | { status: "already-confirmed" }
  | { status: "not-nominated" }
  | { status: "not-found" };

/** Confirm a nomination: stamp confirmed_at and award +2 bp_of_week. Idempotent. */
export async function confirmBpOfWeek(
  entryId: number,
  actorId: number,
): Promise<ConfirmResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        entryId: entries.id,
        initiativeId: entries.initiativeId,
        entryDate: entries.entryDate,
        nominated: entries.bpOfWeekNominated,
        confirmedAt: entries.bpOfWeekConfirmedAt,
        region: initiatives.region,
        segment: initiatives.segment,
      })
      .from(entries)
      .innerJoin(initiatives, eq(initiatives.id, entries.initiativeId))
      .where(eq(entries.id, entryId))
      .limit(1);

    if (!row) return { status: "not-found" };
    if (!row.nominated) return { status: "not-nominated" };
    if (row.confirmedAt) return { status: "already-confirmed" };

    await tx
      .update(entries)
      .set({ bpOfWeekConfirmedAt: new Date() })
      .where(eq(entries.id, entryId));

    const res = await award(
      {
        reason: "bp_of_week",
        initiativeId: row.initiativeId,
        region: row.region,
        segment: row.segment,
        effectiveDate: row.entryDate,
        actorId,
        refId: entryId,
      },
      tx,
    );
    return { status: "confirmed", points: res.status === "awarded" ? res.points : 0 };
  });
}

/** Log a manual weekly stream against an Area (presenter/cee/cee_best). */
export async function logManualStream(
  input: {
    region: string;
    segment: string;
    stream: "presentation" | "cee_participation" | "cee_best";
    effectiveDate: string;
  },
  actorId: number,
) {
  return award({
    reason: input.stream,
    region: input.region,
    segment: input.segment,
    effectiveDate: input.effectiveDate,
    actorId,
  });
}

/** Post a manual adjustment (note required — the dispute mechanism, REQ-S3). */
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
