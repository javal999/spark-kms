import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  jsonb,
  date,
  timestamp,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Drizzle schema — mirrors KMS-Tech-Architecture section 3 exactly.
 * Enum values are taken verbatim from requirements section 4.1 (D7 is final).
 * This file is the single source of truth for the DB shape.
 */

// ---------------------------------------------------------------------------
// Enums (Postgres native enums). Values EXACTLY per requirements 4.1.
// ---------------------------------------------------------------------------
export const regionEnum = pgEnum("region", [
  "Jakarta Greater",
  "Kalimantan",
  "Sumatera",
  "CJWJ",
  "EJBN",
]);

export const segmentEnum = pgEnum("segment", [
  "Halal PC",
  "Teen & ES",
  "Masstige",
  "All",
]);

export const pillarEnum = pgEnum("pillar", [
  "Social Buzz",
  "Personalized CRM",
  "Relevant Beauty Lifestyle",
  "Activated New Touchpoint",
  "Key Territory Execution",
  "CEE", // v1.2 (D10): CEE is now a pillar, not a score stream.
]);

export const entryCategoryEnum = pgEnum("entry_category", [
  "Best Practice",
  "Unlocking",
]);

export const stageEnum = pgEnum("stage", [
  "Idea",
  "Pilot",
  "Running",
  "Ready to Scale",
]);

export const actionStatusEnum = pgEnum("action_status", [
  "Not Started",
  "On Progress",
  "Done",
  "Withdrawn/Cancelled",
]);

// v1.2 (D11/D12): only `best_practice` and `presenter` are used. `presenter` is
// repurposed as the "Best Presenter of the Week" stream; `cee`/`cee_best` are
// retired (kept in the enum for the historical reversed rows, never re-summed).
export const scoreStreamEnum = pgEnum("score_stream", [
  "best_practice",
  "presenter",
  "cee",
  "cee_best",
]);

export const scoreReasonEnum = pgEnum("score_reason", [
  "new_initiative",
  "entry",
  "bp_of_week",
  "best_presenter", // v1.2 (D12): +2 Best Presenter of the Week
  "presentation", // retired v1.2 (kept for historical rows)
  "cee_participation", // retired v1.2
  "cee_best", // retired v1.2
  "adjustment",
  "reversal",
]);

export const batchStatusEnum = pgEnum("batch_status", [
  "previewed",
  "committed",
  "rejected",
]);

// Integration API key scope (requirements 14, REQ-X3). `write` implies `read`.
export const apiScopeEnum = pgEnum("api_scope", ["read", "write"]);

// What kind of record an edit_log row refers to.
export const editEntityEnum = pgEnum("edit_entity", [
  "initiative",
  "entry",
  "action_item",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isSuper: boolean("is_super").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Key/value app config: viewer_password_hash, dedup_threshold, template_version.
export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const initiatives = pgTable(
  "initiatives",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    region: regionEnum("region").notNull(),
    segment: segmentEnum("segment").notNull(),
    pillar: pillarEnum("pillar").notNull(),
    stage: stageEnum("stage").notNull().default("Idea"),
    pic: text("pic").notNull(),
    linkUrl: text("link_url"),
    tags: text("tags").array(),
    replicatedFrom: integer("replicated_from").references(
      (): AnyPgColumn => initiatives.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Trigram index on normalized title for pg_trgm duplicate detection (1.6).
    index("initiatives_title_trgm_idx").using(
      "gin",
      sql`lower(${t.title}) gin_trgm_ops`,
    ),
  ],
);

export const entries = pgTable(
  "entries",
  {
    id: serial("id").primaryKey(),
    initiativeId: integer("initiative_id")
      .notNull()
      .references(() => initiatives.id),
    entryDate: date("entry_date").notNull(),
    category: entryCategoryEnum("category").notNull(),
    detail: text("detail").notNull(),
    followUp: text("follow_up"),
    // Admin sets nominated=true; only super-admin confirm stamps confirmed_at
    // (REQ-A3). Confirmation is what scores +2 (bp_of_week), not the flag.
    bpOfWeekNominated: boolean("bp_of_week_nominated").notNull().default(false),
    bpOfWeekConfirmedAt: timestamp("bp_of_week_confirmed_at", {
      withTimezone: true,
    }),
    // v1.2 (D12): "Best Presenter of the Week" — auto-awards +2 when set.
    bestPresenter: boolean("best_presenter").notNull().default(false),
    linkUrl: text("link_url"),
    outcomeMetric: text("outcome_metric"),
    outcomeValue: text("outcome_value"),
    uploadBatchId: integer("upload_batch_id").references(
      () => uploadBatches.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
  },
  (t) => [index("entries_initiative_date_idx").on(t.initiativeId, t.entryDate)],
);

export const actionItems = pgTable("action_items", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id")
    .notNull()
    .references(() => initiatives.id),
  dueDate: date("due_date"),
  description: text("description").notNull(),
  pic: text("pic").notNull(),
  status: actionStatusEnum("status").notNull().default("Not Started"),
  sourceEntryId: integer("source_entry_id").references(() => entries.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stageChanges = pgTable("stage_changes", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id")
    .notNull()
    .references(() => initiatives.id),
  fromStage: stageEnum("from_stage").notNull(),
  toStage: stageEnum("to_stage").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  changedBy: integer("changed_by")
    .notNull()
    .references(() => users.id),
});

export const scoreEvents = pgTable(
  "score_events",
  {
    id: serial("id").primaryKey(),
    // Owning Area (region, segment), denormalized at event time (REQ-S4).
    region: regionEnum("region").notNull(),
    segment: segmentEnum("segment").notNull(),
    initiativeId: integer("initiative_id").references(() => initiatives.id),
    stream: scoreStreamEnum("stream").notNull(),
    points: integer("points").notNull(),
    // The date the point counts for; all weekly aggregation uses this.
    effectiveDate: date("effective_date").notNull(),
    reason: scoreReasonEnum("reason").notNull(),
    refId: integer("ref_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    index("score_events_area_idx").on(t.region, t.segment),
    index("score_events_effective_date_idx").on(t.effectiveDate),
    index("score_events_initiative_idx").on(t.initiativeId),
  ],
);

export const uploadBatches = pgTable(
  "upload_batches",
  {
    id: serial("id").primaryKey(),
    filename: text("filename").notNull(),
    fileHash: text("file_hash").notNull(),
    rowCount: integer("row_count").notNull(),
    status: batchStatusEnum("status").notNull().default("previewed"),
    uploadedBy: integer("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("upload_batches_file_hash_idx").on(t.fileHash)],
);

// Integration API keys (requirements 14, REQ-X2). The raw key is shown ONCE at
// creation; only its SHA-256 hash is stored. `prefix` is a short non-secret
// display fragment. `revokedAt`/`lastUsedAt` power the admin management + audit.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    prefix: text("prefix").notNull(),
    scope: apiScopeEnum("scope").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("api_keys_key_hash_idx").on(t.keyHash)],
);

// Admin edit audit trail. Every field an admin changes on an initiative, entry,
// or action item is recorded here (old → new value + who + when). Always scoped
// to the owning initiative so the whole edit history renders in one query.
// ADMIN-ONLY — never exposed to viewers.
export const editLog = pgTable(
  "edit_log",
  {
    id: serial("id").primaryKey(),
    initiativeId: integer("initiative_id")
      .notNull()
      .references(() => initiatives.id),
    entity: editEntityEnum("entity").notNull(),
    entityId: integer("entity_id").notNull(),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    editedBy: integer("edited_by")
      .notNull()
      .references(() => users.id),
    editedAt: timestamp("edited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("edit_log_initiative_idx").on(t.initiativeId)],
);

// PIC people directory (v1.2, D9). Names only — NOT login accounts. Drives the
// searchable PIC picker; grown by admin upload, by typing a new name on Submit,
// or from bulk upload. `initiatives.pic` stays free text (denormalized name).
export const people = pgTable(
  "people",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: integer("created_by").references(() => users.id),
  },
  (t) => [uniqueIndex("people_name_lower_idx").using("btree", sql`lower(${t.name})`)],
);

// Convenience type exports for services.
export type User = typeof users.$inferSelect;
export type Initiative = typeof initiatives.$inferSelect;
export type NewInitiative = typeof initiatives.$inferInsert;
export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type ActionItem = typeof actionItems.$inferSelect;
export type ScoreEvent = typeof scoreEvents.$inferSelect;
export type NewScoreEvent = typeof scoreEvents.$inferInsert;
