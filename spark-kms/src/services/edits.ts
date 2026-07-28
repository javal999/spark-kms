import { and, desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import {
  actionItems,
  editLog,
  entries,
  initiatives,
  users,
} from "@/src/db/schema";
import { InitiativeNotFoundError } from "@/src/services/initiatives";

/**
 * Admin edits + the edit-log audit trail (admin-only feature).
 *
 * ONLY descriptive fields are editable here. Fields that drive the leaderboard
 * — an initiative's Area (region/segment) and an entry's date — are deliberately
 * NOT accepted, so an edit can never silently move points (Levi's decision:
 * "lock scoring fields"). Category is descriptive (it doesn't change points), so
 * it is editable. Stage keeps its own `stage_changes` history and is handled by
 * `changeStage`, not here.
 *
 * Every changed field writes one edit_log row (old → new + who + when), always
 * scoped to the owning initiative so the whole history renders in one query.
 */

export class EntryNotFoundError extends Error {
  constructor(id: number) {
    super(`Entry ${id} not found`);
    this.name = "EntryNotFoundError";
  }
}
export class ActionItemNotFoundError extends Error {
  constructor(id: number) {
    super(`Action item ${id} not found`);
    this.name = "ActionItemNotFoundError";
  }
}

/**
 * Render a column value as the text we store in the log (arrays → CSV). Empty
 * string and null/undefined both collapse to null, so a cleared-but-was-empty
 * optional field (e.g. the form sends "" where the DB had null) is NOT treated
 * as a change and never produces a spurious "∅ → ∅" log row.
 */
function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  if (typeof v === "string") return v === "" ? null : v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
    return String(v);
  }
  if (v instanceof Date) return String(v);
  // Anything left is a plain object, which would stringify to "[object Object]"
  // — useless in an audit trail — so serialize it instead.
  const s = JSON.stringify(v) ?? "";
  return s === "" ? null : s;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type LogRow = { field: string; old: string | null; new: string | null };

export type InitiativePatch = {
  title?: string;
  description?: string | null;
  pillar?: (typeof initiatives.$inferSelect)["pillar"];
  pic?: string;
  linkUrl?: string | null;
  tags?: string[] | null;
};

export type EntryPatch = {
  detail?: string;
  followUp?: string | null;
  category?: (typeof entries.$inferSelect)["category"];
  linkUrl?: string | null;
};

export type ActionItemPatch = {
  description?: string;
  pic?: string;
  dueDate?: string | null;
  status?: (typeof actionItems.$inferSelect)["status"];
};

/** Diff `patch` against `current` over `keys`; return the set-map + log rows. */
function diff<T extends Record<string, unknown>>(
  current: T,
  patch: Partial<T>,
  keys: readonly (keyof T & string)[],
): { set: Record<string, unknown>; logs: LogRow[] } {
  const set: Record<string, unknown> = {};
  const logs: LogRow[] = [];
  for (const key of keys) {
    const next = patch[key];
    if (next === undefined) continue; // field not being edited
    const before = asText(current[key]);
    const after = asText(next);
    if (before === after) continue; // unchanged
    set[key] = next;
    logs.push({ field: key, old: before, new: after });
  }
  return { set, logs };
}

async function writeLog(
  tx: Tx,
  initiativeId: number,
  entity: (typeof editLog.$inferInsert)["entity"],
  entityId: number,
  logs: LogRow[],
  actorId: number,
): Promise<void> {
  if (logs.length === 0) return;
  await tx.insert(editLog).values(
    logs.map((l) => ({
      initiativeId,
      entity,
      entityId,
      field: l.field,
      oldValue: l.old,
      newValue: l.new,
      editedBy: actorId,
    })),
  );
}

/** Edit an initiative's descriptive fields. Returns the number of fields changed. */
export async function updateInitiativeFields(
  id: number,
  patch: InitiativePatch,
  actorId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(initiatives)
      .where(eq(initiatives.id, id))
      .limit(1);
    if (!cur) throw new InitiativeNotFoundError(id);

    const { set, logs } = diff(cur, patch, [
      "title",
      "description",
      "pillar",
      "pic",
      "linkUrl",
      "tags",
    ]);
    if (logs.length === 0) return 0;

    set.updatedAt = new Date();
    await tx.update(initiatives).set(set).where(eq(initiatives.id, id));
    await writeLog(tx, id, "initiative", id, logs, actorId);
    return logs.length;
  });
}

/** Edit an entry's descriptive fields (never its date/area). */
export async function updateEntryFields(
  entryId: number,
  patch: EntryPatch,
  actorId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(entries)
      .where(eq(entries.id, entryId))
      .limit(1);
    if (!cur) throw new EntryNotFoundError(entryId);

    const { set, logs } = diff(cur, patch, [
      "detail",
      "followUp",
      "category",
      "linkUrl",
    ]);
    if (logs.length === 0) return 0;

    await tx.update(entries).set(set).where(eq(entries.id, entryId));
    await writeLog(tx, cur.initiativeId, "entry", entryId, logs, actorId);
    return logs.length;
  });
}

/** Edit an action item (description / PIC / due date / status). */
export async function updateActionItemFields(
  actionItemId: number,
  patch: ActionItemPatch,
  actorId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(actionItems)
      .where(eq(actionItems.id, actionItemId))
      .limit(1);
    if (!cur) throw new ActionItemNotFoundError(actionItemId);

    const { set, logs } = diff(cur, patch, [
      "description",
      "pic",
      "dueDate",
      "status",
    ]);
    if (logs.length === 0) return 0;

    set.updatedAt = new Date();
    await tx
      .update(actionItems)
      .set(set)
      .where(eq(actionItems.id, actionItemId));
    await writeLog(tx, cur.initiativeId, "action_item", actionItemId, logs, actorId);
    return logs.length;
  });
}

export type EditLogRow = {
  id: number;
  entity: (typeof editLog.$inferSelect)["entity"];
  entityId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  editedAt: Date;
  editorName: string;
};

/** Full edit history for an initiative (its own edits + its entries + items). */
export async function getInitiativeEditLog(
  initiativeId: number,
): Promise<EditLogRow[]> {
  return db
    .select({
      id: editLog.id,
      entity: editLog.entity,
      entityId: editLog.entityId,
      field: editLog.field,
      oldValue: editLog.oldValue,
      newValue: editLog.newValue,
      editedAt: editLog.editedAt,
      editorName: users.name,
    })
    .from(editLog)
    .innerJoin(users, eq(users.id, editLog.editedBy))
    .where(eq(editLog.initiativeId, initiativeId))
    .orderBy(desc(editLog.editedAt), desc(editLog.id));
}

/** Guard used by the entry-edit route: confirm the entry belongs to the id. */
export async function entryBelongsToInitiative(
  entryId: number,
  initiativeId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.initiativeId, initiativeId)))
    .limit(1);
  return Boolean(row);
}
