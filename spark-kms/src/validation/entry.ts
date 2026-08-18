import { z } from "zod";
import {
  regionEnum,
  segmentEnum,
  pillarEnum,
  entryCategoryEnum,
  stageEnum,
} from "@/src/db/schema";

/**
 * Single validation pipeline shared by the Submit form API and the Excel row
 * parser (REQ-U6). Enum options are pulled straight from the Drizzle pgEnums so
 * they can never drift from the database.
 *
 * Values with no enum mapping intentionally FAIL here — the import normalizer
 * fixes spellings/case upstream, but truly unmapped values must error per row at
 * dry-run (REQ-U8, D5). Note that the two historical examples the requirements
 * used are now valid: CEE became a pillar (D10) and Sulawesi a region (D22).
 */

export const regionSchema = z.enum(regionEnum.enumValues);
export const segmentSchema = z.enum(segmentEnum.enumValues);
export const pillarSchema = z.enum(pillarEnum.enumValues);
export const categorySchema = z.enum(entryCategoryEnum.enumValues);
export const stageSchema = z.enum(stageEnum.enumValues);

const trimmed = z.string().trim();
const requiredText = trimmed.min(1);
// `.optional()` LAST so the object key stays optional in the inferred type
// (a trailing .transform would make the key required-but-maybe-undefined).
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** Strict "YYYY-MM-DD" that must be a real calendar date (rejects 2026-02-30). */
export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    );
  }, "Not a valid calendar date");

/**
 * Entry (a.k.a. progress update). Since v1.2 (D14) `bpOfWeekNominated` is no
 * longer a nomination: ticking it auto-awards +2 at submit with no super-admin
 * confirmation, capped 1/Area/week.
 *
 * `bestPresenter` was removed by D25. The schema is not strict, so a stale
 * caller still sending the key has it stripped rather than rejected — it simply
 * scores nothing.
 */
export const entryInputSchema = z.object({
  entryDate: isoDateSchema,
  category: categorySchema,
  detail: requiredText,
  followUp: optionalText,
  bpOfWeekNominated: z.boolean().default(false),
  linkUrl: optionalText,
});

export type EntryInput = z.infer<typeof entryInputSchema>;

/** Initiative core fields (the topic/tema). Stage defaults to Idea. */
export const initiativeInputSchema = z.object({
  title: requiredText,
  description: optionalText,
  region: regionSchema,
  segment: segmentSchema,
  pillar: pillarSchema,
  stage: stageSchema.default("Idea"),
  pic: requiredText,
  linkUrl: optionalText,
  tags: z.array(trimmed.min(1)).optional(),
});

export type InitiativeInput = z.infer<typeof initiativeInputSchema>;

/**
 * New initiative + its first entry, in one payload. Used by the Submit "new"
 * branch and by each Excel row that creates a topic. `linkUrl` on a row maps to
 * the entry link (template "Link File"); the initiative link is form-only.
 */
export const newInitiativeSchema = initiativeInputSchema
  .extend(entryInputSchema.shape)
  .strip();

export type NewInitiativeInput = z.infer<typeof newInitiativeSchema>;

/**
 * Excel upload row — same shared field validators (REQ-U6), but `pillar` is
 * optional here because it's only required for NEW topics (append rows may
 * leave it blank). The commit step enforces pillar when a row resolves to
 * "create new".
 */
export const uploadRowSchema = initiativeInputSchema
  .extend(entryInputSchema.shape)
  .extend({ pillar: pillarSchema.optional() });

export type UploadRowInput = z.infer<typeof uploadRowSchema>;

/**
 * Soft warning helper (not a hard validation): entry_date more than 30 days
 * before "now" gets a warning at input/preview (requirements 5.1, D2). Future
 * dates are not stale.
 */
export function isStaleEntryDate(
  entryDate: string,
  now: Date = new Date(),
): boolean {
  const [y, m, d] = entryDate.split("-").map(Number);
  const entryMs = Date.UTC(y, m - 1, d);
  const ageDays = (now.getTime() - entryMs) / (24 * 60 * 60 * 1000);
  return ageDays > 30;
}
