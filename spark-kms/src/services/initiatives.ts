import { and, desc, asc, eq, ilike, or, sql, inArray } from "drizzle-orm";
import { db } from "@/src/db";
import {
  initiatives,
  entries,
  actionItems,
  stageChanges,
} from "@/src/db/schema";
import type {
  NewInitiativeInput,
  EntryInput,
} from "@/src/validation/entry";
import { award } from "@/src/services/scoring";
import { splitFollowUp } from "@/src/lib/follow-up";
import { upsertByName } from "@/src/services/people";
import { addInitiativeTags } from "@/src/services/tags";

/**
 * Initiative + entry CRUD (Phase 1). NOTE: scoring is Phase 2 — nothing here
 * writes score_events. `src/services/scoring.ts` (task 2.1) is the only module
 * allowed to, and it will be wired into these create/append paths in task 2.2.
 */

/** Thrown when an append/edit targets an initiative id that doesn't exist. */
export class InitiativeNotFoundError extends Error {
  constructor(id: number) {
    super(`Initiative ${id} not found`);
    this.name = "InitiativeNotFoundError";
  }
}

export type CreateInitiativeResult = {
  initiativeId: number;
  entryId: number;
  /** One id per action item — a multi-line/numbered follow-up splits into several. */
  actionItemIds: number[];
};

/**
 * Create a new initiative + its first entry, optionally spawning an action item
 * from the entry's follow_up. All-or-nothing in one transaction.
 */
export async function createInitiative(
  input: NewInitiativeInput,
  actorId: number,
  opts: CreateOpts = {},
): Promise<CreateInitiativeResult> {
  return db.transaction((tx) => createInitiativeInTx(tx, input, actorId, opts));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CreateOpts = {
  createActionItem?: boolean;
  actionItem?: ActionItemDraft;
  uploadBatchId?: number;
  // v1.2 (D15): PIC to assign to action items when no explicit draft PIC is
  // given (e.g. bulk upload, so items don't default to "Unassigned").
  actionItemPic?: string;
};

/** Core create, runnable inside a caller's transaction (e.g. bulk commit). */
export async function createInitiativeInTx(
  tx: Tx,
  input: NewInitiativeInput,
  actorId: number,
  opts: CreateOpts = {},
): Promise<CreateInitiativeResult> {
  {
    // v1.2 (D9): add the PIC to the people directory (find-or-create).
    // Phase 8 (E11): capture the person id so the initiative resolves its PIC.
    const picPersonId = await upsertByName(input.pic, actorId, tx);

    const [ini] = await tx
      .insert(initiatives)
      .values({
        title: input.title,
        description: input.description,
        region: input.region,
        segment: input.segment,
        pillar: input.pillar,
        stage: input.stage,
        pic: input.pic,
        picPersonId,
        tags: input.tags,
        createdBy: actorId,
      })
      .returning({ id: initiatives.id });

    // Phase 8 (E11): write tags through the join too (tags[] mirror kept).
    await addInitiativeTags(tx, ini.id, input.tags);

    const [entry] = await tx
      .insert(entries)
      .values({
        initiativeId: ini.id,
        entryDate: input.entryDate,
        category: input.category,
        detail: input.detail,
        followUp: input.followUp,
        bpOfWeekNominated: input.bpOfWeekNominated,
        bestPresenter: input.bestPresenter,
        linkUrl: input.linkUrl,
        uploadBatchId: opts.uploadBatchId,
        createdBy: actorId,
      })
      .returning({ id: entries.id });

    const actionItemIds = await maybeCreateActionItems(
      tx,
      ini.id,
      entry.id,
      actorId,
      input.followUp,
      opts,
    );

    // Scoring (§5.1): +1 new_initiative, +1 entry (day-capped). Both land on the
    // entry_date so a backdated historical import scores in the correct week.
    // A BP-of-week nomination scores NOTHING here — only super-admin confirm does.
    await award(
      {
        reason: "new_initiative",
        initiativeId: ini.id,
        region: input.region,
        segment: input.segment,
        effectiveDate: input.entryDate,
        actorId,
        refId: ini.id,
      },
      tx,
    );
    await award(
      {
        reason: "entry",
        initiativeId: ini.id,
        region: input.region,
        segment: input.segment,
        effectiveDate: input.entryDate,
        actorId,
        refId: entry.id,
      },
      tx,
    );
    // v1.2 (D14): the two weekly awards auto-score +2 at submit (1/Area/week cap
    // enforced inside award()); a ticked box that hits the cap is silently skipped.
    await awardWeeklyFlags(tx, {
      bpOfWeek: input.bpOfWeekNominated,
      bestPresenter: input.bestPresenter,
      initiativeId: ini.id,
      region: input.region,
      segment: input.segment,
      effectiveDate: input.entryDate,
      actorId,
      refId: entry.id,
    });

    return { initiativeId: ini.id, entryId: entry.id, actionItemIds };
  }
}

export type AppendEntryResult = {
  entryId: number;
  actionItemIds: number[];
};

/** Append an entry to an existing initiative (append branch of Submit). */
export async function appendEntry(
  initiativeId: number,
  input: EntryInput,
  actorId: number,
  opts: CreateOpts = {},
): Promise<AppendEntryResult> {
  return db.transaction((tx) =>
    appendEntryInTx(tx, initiativeId, input, actorId, opts),
  );
}

/** Core append, runnable inside a caller's transaction (e.g. bulk commit). */
export async function appendEntryInTx(
  tx: Tx,
  initiativeId: number,
  input: EntryInput,
  actorId: number,
  opts: CreateOpts = {},
): Promise<AppendEntryResult> {
  {
    // 404 instead of a raw FK violation; also grab the owning Area for scoring.
    const [owner] = await tx
      .select({
        id: initiatives.id,
        region: initiatives.region,
        segment: initiatives.segment,
      })
      .from(initiatives)
      .where(eq(initiatives.id, initiativeId))
      .limit(1);
    if (!owner) throw new InitiativeNotFoundError(initiativeId);

    const [entry] = await tx
      .insert(entries)
      .values({
        initiativeId,
        entryDate: input.entryDate,
        category: input.category,
        detail: input.detail,
        followUp: input.followUp,
        bpOfWeekNominated: input.bpOfWeekNominated,
        bestPresenter: input.bestPresenter,
        linkUrl: input.linkUrl,
        uploadBatchId: opts.uploadBatchId,
        createdBy: actorId,
      })
      .returning({ id: entries.id });

    const actionItemIds = await maybeCreateActionItems(
      tx,
      initiativeId,
      entry.id,
      actorId,
      input.followUp,
      opts,
    );

    // Scoring (§5.1): append earns entry points only (day-capped), attributed
    // to the initiative's current Area.
    await award(
      {
        reason: "entry",
        initiativeId,
        region: owner.region,
        segment: owner.segment,
        effectiveDate: input.entryDate,
        actorId,
        refId: entry.id,
      },
      tx,
    );
    await awardWeeklyFlags(tx, {
      bpOfWeek: input.bpOfWeekNominated,
      bestPresenter: input.bestPresenter,
      initiativeId,
      region: owner.region,
      segment: owner.segment,
      effectiveDate: input.entryDate,
      actorId,
      refId: entry.id,
    });

    return { entryId: entry.id, actionItemIds };
  }
}

/**
 * v1.2 (D14): award the two weekly +2 flags at submit. Each is capped 1/Area/week
 * inside award(); a ticked box that hits the cap is silently skipped (no error).
 */
async function awardWeeklyFlags(
  tx: Tx,
  a: {
    bpOfWeek: boolean;
    bestPresenter: boolean;
    initiativeId: number;
    region: NewInitiativeInput["region"];
    segment: NewInitiativeInput["segment"];
    effectiveDate: string;
    actorId: number;
    refId: number;
  },
): Promise<void> {
  const area = {
    initiativeId: a.initiativeId,
    region: a.region,
    segment: a.segment,
    effectiveDate: a.effectiveDate,
    actorId: a.actorId,
    refId: a.refId,
  };
  if (a.bpOfWeek) await award({ reason: "bp_of_week", ...area }, tx);
  if (a.bestPresenter) await award({ reason: "best_presenter", ...area }, tx);
}

export type ActionItemDraft = {
  description: string;
  pic: string;
  dueDate?: string;
};

async function maybeCreateActionItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  initiativeId: number,
  sourceEntryId: number,
  actorId: number,
  followUp: string | undefined,
  opts: {
    createActionItem?: boolean;
    actionItem?: ActionItemDraft;
    actionItemPic?: string;
  },
): Promise<number[]> {
  if (!opts.createActionItem) return [];
  const draft = opts.actionItem;
  // A multi-line or numbered/bulleted follow-up becomes several action items;
  // each shares the draft's PIC + due date (splitFollowUp handles the parsing).
  const pieces = splitFollowUp(draft?.description ?? followUp);
  if (pieces.length === 0) return [];

  const ids: number[] = [];
  for (const description of pieces) {
    const [ai] = await tx
      .insert(actionItems)
      .values({
        initiativeId,
        description,
        pic: draft?.pic ?? opts.actionItemPic ?? "Unassigned",
        dueDate: draft?.dueDate,
        sourceEntryId,
        createdBy: actorId,
      })
      .returning({ id: actionItems.id });
    ids.push(ai.id);
  }
  return ids;
}

/** Change an initiative's stage and log it to stage_changes. */
export async function changeStage(
  initiativeId: number,
  toStage: (typeof initiatives.$inferSelect)["stage"],
  actorId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ stage: initiatives.stage })
      .from(initiatives)
      .where(eq(initiatives.id, initiativeId))
      .limit(1);
    if (!current) throw new Error("Initiative not found");
    if (current.stage === toStage) return; // no-op, no log

    await tx
      .update(initiatives)
      .set({ stage: toStage, updatedAt: new Date() })
      .where(eq(initiatives.id, initiativeId));

    await tx.insert(stageChanges).values({
      initiativeId,
      fromStage: current.stage,
      toStage,
      changedBy: actorId,
    });
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type ListFilters = {
  region?: string[];
  segment?: string[];
  pillar?: string[];
  stage?: string[];
  category?: "Best Practice" | "Unlocking";
  /** v1.2 (item 12, D19): action-items-done bucket. "—" (0 items) excluded. */
  donePct?: "0" | "partial" | "100";
  q?: string;
  sort?: string; // column key
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type ListRow = {
  id: number;
  title: string;
  region: string;
  segment: string;
  pillar: string;
  stage: string;
  entryCount: number;
  hasUnlocking: boolean;
  hasBestPractice: boolean;
  lastEntryDate: string | null;
  // v1.2 (item 12): action-item completion. Denominator excludes Withdrawn/Cancelled.
  actionTotal: number;
  actionDone: number;
};

const SORTABLE: Record<string, ReturnType<typeof sql>> = {
  id: sql`initiatives.id`,
  title: sql`lower(initiatives.title)`,
  region: sql`initiatives.region::text`,
  segment: sql`initiatives.segment::text`,
  pillar: sql`initiatives.pillar::text`,
  stage: sql`initiatives.stage::text`,
};

/**
 * Filterable, sortable, searchable, paginated list. Search spans title +
 * description + entry detail (council: title-only search fails reuse, REQ page 4).
 */
export async function listInitiatives(
  filters: ListFilters,
): Promise<{ rows: ListRow[]; total: number }> {
  const conds = [];
  if (filters.region?.length)
    conds.push(inArray(initiatives.region, filters.region as never));
  if (filters.segment?.length)
    conds.push(inArray(initiatives.segment, filters.segment as never));
  if (filters.pillar?.length)
    conds.push(inArray(initiatives.pillar, filters.pillar as never));
  if (filters.stage?.length)
    conds.push(inArray(initiatives.stage, filters.stage as never));

  if (filters.q && filters.q.trim().length > 0) {
    const like = `%${filters.q.trim()}%`;
    conds.push(
      or(
        ilike(initiatives.title, like),
        ilike(initiatives.description, like),
        sql`EXISTS (SELECT 1 FROM entries e WHERE e.initiative_id = initiatives.id AND e.detail ILIKE ${like})`,
      )!,
    );
  }

  if (filters.category) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM entries e WHERE e.initiative_id = initiatives.id AND e.category = ${filters.category})`,
    );
  }

  if (filters.donePct) {
    const done = sql`(SELECT count(*) FROM action_items a WHERE a.initiative_id = initiatives.id AND a.status = 'Done')`;
    const total = sql`(SELECT count(*) FROM action_items a WHERE a.initiative_id = initiatives.id AND a.status <> 'Withdrawn/Cancelled')`;
    if (filters.donePct === "0") conds.push(sql`${total} > 0 AND ${done} = 0`);
    else if (filters.donePct === "100") conds.push(sql`${total} > 0 AND ${done} = ${total}`);
    else conds.push(sql`${total} > 0 AND ${done} > 0 AND ${done} < ${total}`);
  }

  const where = conds.length ? and(...conds) : undefined;

  const sortCol = SORTABLE[filters.sort ?? "id"] ?? SORTABLE.id;
  const orderBy = filters.dir === "desc" ? desc(sortCol) : asc(sortCol);

  // Guard against NaN/negative/huge values from crafted query strings
  // (Number("abc") is NaN, and NaN ?? 1 does NOT fall back — would emit
  // LIMIT NaN and error). Clamp to sane integers.
  const toInt = (v: number | undefined, fallback: number) =>
    Number.isFinite(v) ? Math.floor(v as number) : fallback;
  const page = Math.max(1, toInt(filters.page, 1));
  const pageSize = Math.min(200, Math.max(1, toInt(filters.pageSize, 50)));
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select({
      id: initiatives.id,
      title: initiatives.title,
      region: sql<string>`initiatives.region::text`,
      segment: sql<string>`initiatives.segment::text`,
      pillar: sql<string>`initiatives.pillar::text`,
      stage: sql<string>`initiatives.stage::text`,
      entryCount: sql<number>`(SELECT count(*)::int FROM entries e WHERE e.initiative_id = initiatives.id)`,
      hasUnlocking: sql<boolean>`EXISTS (SELECT 1 FROM entries e WHERE e.initiative_id = initiatives.id AND e.category = 'Unlocking')`,
      hasBestPractice: sql<boolean>`EXISTS (SELECT 1 FROM entries e WHERE e.initiative_id = initiatives.id AND e.category = 'Best Practice')`,
      lastEntryDate: sql<
        string | null
      >`(SELECT max(e.entry_date) FROM entries e WHERE e.initiative_id = initiatives.id)`,
      actionTotal: sql<number>`(SELECT count(*)::int FROM action_items a WHERE a.initiative_id = initiatives.id AND a.status <> 'Withdrawn/Cancelled')`,
      actionDone: sql<number>`(SELECT count(*)::int FROM action_items a WHERE a.initiative_id = initiatives.id AND a.status = 'Done')`,
    })
    .from(initiatives)
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(initiatives)
    .where(where);

  return { rows, total };
}

export type InitiativeDetail = {
  initiative: typeof initiatives.$inferSelect;
  entries: (typeof entries.$inferSelect)[];
  actionItems: (typeof actionItems.$inferSelect)[];
  stageChanges: (typeof stageChanges.$inferSelect)[];
};

export async function getInitiativeDetail(
  id: number,
): Promise<InitiativeDetail | null> {
  const [initiative] = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.id, id))
    .limit(1);
  if (!initiative) return null;

  const [entryRows, aiRows, scRows] = await Promise.all([
    db
      .select()
      .from(entries)
      .where(eq(entries.initiativeId, id))
      .orderBy(desc(entries.entryDate), desc(entries.id)),
    db
      .select()
      .from(actionItems)
      .where(eq(actionItems.initiativeId, id))
      .orderBy(asc(actionItems.id)),
    db
      .select()
      .from(stageChanges)
      .where(eq(stageChanges.initiativeId, id))
      .orderBy(desc(stageChanges.changedAt)),
  ]);

  return {
    initiative,
    entries: entryRows,
    actionItems: aiRows,
    stageChanges: scRows,
  };
}
