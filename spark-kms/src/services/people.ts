import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { people } from "@/src/db/schema";

/**
 * PIC people directory (v1.2, D9). Names only — NOT login accounts. Powers the
 * searchable PIC picker on Submit; grown by admin upload, by typing a new name,
 * or from bulk upload. Matching is case-insensitive so "Sri" and "sri" are one.
 */

export type Person = { id: number; name: string; active: boolean };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Find-or-create a person by name (case-insensitive). Returns the person id. */
export async function upsertByName(
  name: string,
  actorId?: number,
  tx?: Tx,
): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("person name required");
  const run = async (t: Tx) => {
    const [existing] = await t
      .select({ id: people.id })
      .from(people)
      .where(sql`lower(${people.name}) = lower(${trimmed})`)
      .limit(1);
    if (existing) return existing.id;
    const [row] = await t
      .insert(people)
      .values({ name: trimmed, createdBy: actorId ?? null })
      .returning({ id: people.id });
    return row.id;
  };
  return tx ? run(tx) : db.transaction(run);
}

/** Active people whose name matches `q` (for the picker autocomplete). */
export async function searchPeople(q?: string, limit = 20): Promise<Person[]> {
  const where =
    q && q.trim()
      ? and(eq(people.active, true), ilike(people.name, `%${q.trim()}%`))
      : eq(people.active, true);
  return db
    .select({ id: people.id, name: people.name, active: people.active })
    .from(people)
    .where(where)
    .orderBy(asc(people.name))
    .limit(limit);
}

/** All people, active + inactive (admin management). */
export async function listPeople(): Promise<Person[]> {
  return db
    .select({ id: people.id, name: people.name, active: people.active })
    .from(people)
    .orderBy(asc(people.name));
}

export async function setPersonActive(id: number, active: boolean): Promise<void> {
  await db.update(people).set({ active }).where(eq(people.id, id));
}

/** Bulk upsert names from an admin upload. Returns how many were newly added. */
export async function bulkUpsertNames(
  names: string[],
  actorId: number,
): Promise<{ added: number; total: number }> {
  let added = 0;
  await db.transaction(async (tx) => {
    for (const raw of names) {
      const name = raw.trim();
      if (!name) continue;
      const [existing] = await tx
        .select({ id: people.id })
        .from(people)
        .where(sql`lower(${people.name}) = lower(${name})`)
        .limit(1);
      if (!existing) {
        await tx.insert(people).values({ name, createdBy: actorId });
        added++;
      }
    }
  });
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(people);
  return { added, total: Number(total) };
}
