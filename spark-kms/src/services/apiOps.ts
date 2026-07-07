import { z } from "zod";
import {
  entryInputSchema,
  newInitiativeSchema,
} from "@/src/validation/entry";
import {
  appendEntry,
  createInitiative,
  getInitiativeDetail,
  listInitiatives,
  InitiativeNotFoundError,
  type ListFilters,
} from "@/src/services/initiatives";
import {
  findDuplicateCandidates,
  type DuplicateCandidate,
} from "@/src/services/duplicates";
import {
  areaLeaderboard,
  dashboardStats,
  initiativeStreamTotals,
  topInitiatives,
} from "@/src/services/scores";
import type { ApiScope } from "@/src/services/apiKeys";

/**
 * Integration API operations layer (requirements 14). This is the SINGLE code
 * path shared by the REST surface (`/api/v1/*`) and the MCP server (`/api/mcp`),
 * so both enforce the same scopes, run the same Zod validation + scoring, and
 * honor the same 409 duplicate contract by construction (REQ-X7 parity). No
 * logic is duplicated per surface — the surfaces only translate transport.
 *
 * Ops re-export the existing Phase 1–2 services untouched; scoring still flows
 * exclusively through scoring.ts. created_by is always the key's owner user
 * (REQ-X5 audit). Never exposed here: BP confirmation, manual streams,
 * adjustments, user management, password rotation (REQ-X3 / task 5.6).
 */

export type ApiContext = { scope: ApiScope; ownerUserId: number };

/** Caller lacks the scope required for an operation → HTTP 403. */
export class ApiScopeError extends Error {
  constructor(public required: ApiScope) {
    super(`This operation requires '${required}' scope`);
    this.name = "ApiScopeError";
  }
}

/** Duplicate gate hit → HTTP 409 with top-3 candidates (REQ-X4). */
export class ApiDuplicateError extends Error {
  constructor(public candidates: DuplicateCandidate[]) {
    super("Similar initiatives already exist");
    this.name = "ApiDuplicateError";
  }
}

/** Zod validation failed → HTTP 400 with issues. */
export class ApiValidationError extends Error {
  constructor(public issues: z.ZodIssue[]) {
    super("Validation failed");
    this.name = "ApiValidationError";
  }
}

export { InitiativeNotFoundError };

function assertScope(ctx: ApiContext, required: ApiScope): void {
  // 'write' keys may read; 'read' keys may not write.
  if (required === "write" && ctx.scope !== "write") {
    throw new ApiScopeError("write");
  }
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiValidationError(r.error.issues);
  return r.data;
}

// ---------------------------------------------------------------------------
// Read operations (require 'read' — satisfied by any active key).
// ---------------------------------------------------------------------------

const weekKeySchema = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, "weekKey must be YYYY-Www")
  .optional();

export const apiListSchema = z.object({
  region: z.array(z.string()).optional(),
  segment: z.array(z.string()).optional(),
  pillar: z.array(z.string()).optional(),
  stage: z.array(z.string()).optional(),
  category: z.enum(["Best Practice", "Unlocking"]).optional(),
  q: z.string().optional(),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});

export async function opListInitiatives(ctx: ApiContext, raw: unknown) {
  assertScope(ctx, "read");
  const f = parse(apiListSchema, raw ?? {});
  return listInitiatives(f as ListFilters);
}

export async function opGetInitiative(ctx: ApiContext, id: number) {
  assertScope(ctx, "read");
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiValidationError([]);
  }
  const detail = await getInitiativeDetail(id);
  if (!detail) throw new InitiativeNotFoundError(id);
  const points = await initiativeStreamTotals(id);
  return { ...detail, points };
}

export async function opDashboard(ctx: ApiContext) {
  assertScope(ctx, "read");
  return dashboardStats();
}

export async function opLeaderboard(ctx: ApiContext, weekKey?: string) {
  assertScope(ctx, "read");
  const wk = parse(weekKeySchema, weekKey);
  return areaLeaderboard(wk);
}

export async function opTopInitiatives(
  ctx: ApiContext,
  weekKey?: string,
  limit?: number,
) {
  assertScope(ctx, "read");
  const wk = parse(weekKeySchema, weekKey);
  const lim = parse(z.number().int().positive().max(100).optional(), limit);
  return topInitiatives(wk, lim ?? 10);
}

// ---------------------------------------------------------------------------
// Write operations (require 'write').
// ---------------------------------------------------------------------------

/** Machine duplicate-contract controls (REQ-X4). */
const writeControlSchema = z.object({
  force_new: z.boolean().default(false),
  append_to: z.number().int().positive().optional(),
});

export type WriteResult = {
  mode: "created" | "appended";
  initiativeId: number;
  entryId: number;
};

/**
 * Create a new initiative (+ first entry), OR — when `append_to` is given —
 * append an entry to that existing initiative. Without `append_to`/`force_new`,
 * a fuzzy-title match throws ApiDuplicateError (→409) so the caller can retry
 * with one of the two controls. All scoring runs through the same services as
 * the web form, so points are identical (Gate 5 parity).
 */
export async function opCreateInitiative(
  ctx: ApiContext,
  raw: unknown,
): Promise<WriteResult> {
  assertScope(ctx, "write");
  const ctrl = parse(writeControlSchema, raw ?? {});

  if (ctrl.append_to != null) {
    const entry = parse(entryInputSchema, raw);
    const res = await appendEntry(ctrl.append_to, entry, ctx.ownerUserId);
    return { mode: "appended", initiativeId: ctrl.append_to, entryId: res.entryId };
  }

  const input = parse(newInitiativeSchema, raw);
  if (!ctrl.force_new) {
    const candidates = await findDuplicateCandidates(input.title);
    if (candidates.length > 0) throw new ApiDuplicateError(candidates);
  }
  const res = await createInitiative(input, ctx.ownerUserId);
  return { mode: "created", initiativeId: res.initiativeId, entryId: res.entryId };
}

/** Append an entry to a known initiative id (the /entries surface). */
export async function opAddEntry(
  ctx: ApiContext,
  initiativeId: number,
  raw: unknown,
): Promise<WriteResult> {
  assertScope(ctx, "write");
  if (!Number.isInteger(initiativeId) || initiativeId <= 0) {
    throw new ApiValidationError([]);
  }
  const entry = parse(entryInputSchema, raw);
  const res = await appendEntry(initiativeId, entry, ctx.ownerUserId);
  return { mode: "appended", initiativeId, entryId: res.entryId };
}
