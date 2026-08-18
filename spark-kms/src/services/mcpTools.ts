import { z } from "zod";
import {
  regionEnum,
  segmentEnum,
  pillarEnum,
  stageEnum,
  entryCategoryEnum,
} from "@/src/db/schema";
import {
  opAddEntry,
  opCreateInitiative,
  opDashboard,
  opGetInitiative,
  opLeaderboard,
  opListInitiatives,
  opTopInitiatives,
  type ApiContext,
} from "@/src/services/apiOps";

/**
 * The 7 MCP tools (requirements 14, REQ-X6), defined once as data so both the
 * `/api/mcp` route and the test suite use the identical registration. Each tool
 * is a thin wrapper over the shared `apiOps` layer, so it enforces the same
 * scopes + 409 duplicate contract + scoring as `/api/v1` (REQ-X7 parity).
 *
 * `inputSchema` is a plain ZodRawShape (no transforms) so the MCP SDK can emit
 * a clean JSON Schema for `tools/list`. Real validation still happens inside
 * apiOps against the shared Zod validators.
 */

const zRegion = z.enum(regionEnum.enumValues);
const zSegment = z.enum(segmentEnum.enumValues);
const zPillar = z.enum(pillarEnum.enumValues);
const zStage = z.enum(stageEnum.enumValues);
const zCategory = z.enum(entryCategoryEnum.enumValues);
const zIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Entry date in YYYY-MM-DD (Asia/Jakarta). Backdating is allowed.");
const zWeekKey = z.string().regex(/^\d{4}-W\d{2}$/).optional();

export type McpTool = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  run: (ctx: ApiContext, args: Record<string, unknown>) => Promise<unknown>;
};

export const mcpTools: McpTool[] = [
  {
    name: "search_initiatives",
    description:
      "Search the SPARK initiative knowledge base. `q` matches across title, " +
      "description, and progress-entry detail. Filters are ANDed; each list " +
      "filter ORs its values. Returns { rows, total }.",
    inputSchema: {
      q: z.string().optional().describe("Free-text query"),
      region: z.array(zRegion).optional(),
      segment: z.array(zSegment).optional(),
      pillar: z.array(zPillar).optional(),
      stage: z.array(zStage).optional(),
      category: zCategory.optional(),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(200).optional(),
    },
    run: (ctx, args) => opListInitiatives(ctx, args),
  },
  {
    name: "get_initiative",
    description:
      "Fetch one initiative by id with its full entry timeline, action items, " +
      "stage history, and per-stream point totals.",
    inputSchema: { id: z.number().int().positive() },
    run: (ctx, args) => opGetInitiative(ctx, args.id as number),
  },
  {
    name: "get_top_initiatives",
    description:
      "Initiatives ranked by total points. Omit `week` for all-time; pass a " +
      "week key like '2026-W27' to restrict to one Monday-based Jakarta week.",
    inputSchema: {
      week: zWeekKey,
      limit: z.number().int().positive().max(100).optional(),
    },
    run: (ctx, args) =>
      opTopInitiatives(ctx, args.week as string | undefined, args.limit as number | undefined),
  },
  {
    name: "get_leaderboard",
    description:
      "The Region×Segment area leaderboard with per-stream points " +
      "(best_practice = the weekly Best Practice award; presenter = the " +
      "Contribution stream, everything else) and total, ranked. Omit " +
      "`week` for all-time.",
    inputSchema: { week: zWeekKey },
    run: (ctx, args) => opLeaderboard(ctx, args.week as string | undefined),
  },
  {
    name: "get_dashboard_summary",
    description:
      "High-level counters: total initiatives, new this week, and " +
      "distributions by stage, pillar, region, and segment.",
    inputSchema: {},
    run: (ctx) => opDashboard(ctx),
  },
  {
    name: "create_initiative",
    description:
      "Create a new initiative plus its first progress entry (requires a write " +
      "key). Scores +1 new-initiative and +1 entry, exactly like the web form. " +
      "A bpOfWeekNominated flag is only a NOMINATION — it scores nothing until a " +
      "super-admin confirms it in the app. If a similar title already exists and " +
      "you pass neither append_to nor force_new, the call fails with the top " +
      "candidates; retry with append_to: <id> to append instead, or " +
      "force_new: true to create anyway.",
    inputSchema: {
      title: z.string().min(1),
      description: z.string().optional(),
      region: zRegion,
      segment: zSegment,
      pillar: zPillar,
      stage: zStage.optional(),
      pic: z.string().min(1).describe("Person in charge"),
      entryDate: zIsoDate,
      category: zCategory,
      detail: z.string().min(1).describe("The progress-entry body"),
      followUp: z.string().optional(),
      linkUrl: z.string().optional(),
      bpOfWeekNominated: z.boolean().optional(),
      force_new: z.boolean().optional(),
      append_to: z.number().int().positive().optional(),
    },
    run: (ctx, args) => opCreateInitiative(ctx, args),
  },
  {
    name: "add_entry",
    description:
      "Append a progress entry to an existing initiative (requires a write key). " +
      "Scores +1 entry, day-capped, attributed to the initiative's area.",
    inputSchema: {
      initiativeId: z.number().int().positive(),
      entryDate: zIsoDate,
      category: zCategory,
      detail: z.string().min(1),
      followUp: z.string().optional(),
      linkUrl: z.string().optional(),
      bpOfWeekNominated: z.boolean().optional(),
    },
    run: (ctx, args) => opAddEntry(ctx, args.initiativeId as number, args),
  },
];
