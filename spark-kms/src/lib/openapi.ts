import { z } from "zod";
import {
  newInitiativeSchema,
  entryInputSchema,
} from "@/src/validation/entry";

/**
 * OpenAPI 3.1 document for the SPARK KMS integration API (requirements 14,
 * REQ-X1). Request-body schemas are GENERATED from the same Zod validators the
 * runtime uses (via Zod v4's native `z.toJSONSchema`), so the contract can never
 * drift from validation. OpenAPI 3.1 uses JSON Schema draft-2020-12 as its
 * dialect, which is exactly what we emit.
 */

/** Zod → JSON Schema for an OpenAPI component (input shape, no `$schema`). */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const j = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
  }) as Record<string, unknown>;
  delete j.$schema;
  return j;
}

/** Body accepted by POST /api/v1/initiatives (create OR append via controls). */
const createInitiativeRequest = z.object({
  ...newInitiativeSchema.shape,
  force_new: z
    .boolean()
    .optional()
    .describe("Create anyway, skipping the duplicate check."),
  append_to: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Append the entry to this existing initiative id instead."),
});

const bearer = [{ bearerAuth: [] as string[] }];

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "SPARK KMS Integration API",
      version: "1.0.0",
      description:
        "Programmatic access to the SPARK Knowledge Management System. " +
        "Authenticate with a Bearer API key (Admin → API keys). `read` keys " +
        "may call every GET; `write` keys may additionally create initiatives " +
        "and append entries. A BP-of-week flag on a write is a NOMINATION only " +
        "— it never scores until a super-admin confirms it in the app. " +
        "Confirmation, manual point streams, adjustments, and user/password " +
        "management are never exposed over this API.",
    },
    servers: [{ url: "/", description: "This deployment" }],
    security: bearer,
    tags: [
      { name: "initiatives", description: "Initiative knowledge base" },
      { name: "scores", description: "Points, leaderboard, dashboard" },
    ],
    paths: {
      "/api/v1/initiatives": {
        get: {
          tags: ["initiatives"],
          summary: "List initiatives",
          description:
            "Filtered, sorted, paginated list. Search (`q`) spans title, " +
            "description, and entry detail. Requires read scope.",
          security: bearer,
          parameters: [
            queryParam("region", "Region filter (repeatable / comma-separated)"),
            queryParam("segment", "Segment filter"),
            queryParam("pillar", "Pillar filter"),
            queryParam("stage", "Stage filter"),
            queryParam("category", "Best Practice | Unlocking"),
            queryParam("q", "Full-text search across title/description/details"),
            queryParam("sort", "Sort column (id,title,region,segment,pillar,stage)"),
            queryParam("dir", "asc | desc"),
            queryParam("page", "1-based page", "integer"),
            queryParam("pageSize", "1–200 (default 50)", "integer"),
          ],
          responses: {
            "200": {
              description: "Paginated initiatives",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      rows: { type: "array", items: { type: "object" } },
                      total: { type: "integer" },
                    },
                    required: ["rows", "total"],
                  },
                },
              },
            },
            "401": errorResponse,
            "429": errorResponse,
          },
        },
        post: {
          tags: ["initiatives"],
          summary: "Create an initiative (or append via append_to)",
          description:
            "Creates a new initiative + first entry. Without `force_new` or " +
            "`append_to`, a fuzzy title match returns 409 with the top-3 " +
            "candidates; retry with `append_to: <id>` to append to an existing " +
            "initiative, or `force_new: true` to create anyway. Requires write scope.",
          security: bearer,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateInitiativeRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Created or appended",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WriteResult" },
                },
              },
            },
            "400": errorResponse,
            "401": errorResponse,
            "403": errorResponse,
            "409": {
              description: "Duplicate candidates found (retry with append_to/force_new)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DuplicateResponse" },
                },
              },
            },
            "429": errorResponse,
          },
        },
      },
      "/api/v1/initiatives/{id}": {
        get: {
          tags: ["initiatives"],
          summary: "Get an initiative with entries, action items, and points",
          security: bearer,
          parameters: [pathId()],
          responses: {
            "200": { description: "Initiative detail" },
            "401": errorResponse,
            "404": errorResponse,
          },
        },
      },
      "/api/v1/initiatives/{id}/entries": {
        post: {
          tags: ["initiatives"],
          summary: "Append an entry to an initiative",
          description:
            "Adds a progress entry. Scoring is identical to the web form " +
            "(+1 entry, day-capped). Requires write scope.",
          security: bearer,
          parameters: [pathId()],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AddEntryRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Entry appended",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WriteResult" },
                },
              },
            },
            "400": errorResponse,
            "401": errorResponse,
            "403": errorResponse,
            "404": errorResponse,
          },
        },
      },
      "/api/v1/dashboard": {
        get: {
          tags: ["scores"],
          summary: "Dashboard counters and distributions",
          security: bearer,
          responses: { "200": { description: "Dashboard stats" }, "401": errorResponse },
        },
      },
      "/api/v1/leaderboard": {
        get: {
          tags: ["scores"],
          summary: "Region×Segment area leaderboard",
          security: bearer,
          parameters: [queryParam("week", "Week key YYYY-Www (omit for all-time)")],
          responses: { "200": { description: "Ranked areas" }, "401": errorResponse },
        },
      },
      "/api/v1/top-initiatives": {
        get: {
          tags: ["scores"],
          summary: "Top initiatives by points",
          security: bearer,
          parameters: [
            queryParam("week", "Week key YYYY-Www (omit for all-time)"),
            queryParam("limit", "Max rows (1–100, default 10)", "integer"),
          ],
          responses: { "200": { description: "Ranked initiatives" }, "401": errorResponse },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "An API key from Admin → API keys, as `Bearer <key>`.",
        },
      },
      schemas: {
        CreateInitiativeRequest: jsonSchema(createInitiativeRequest),
        AddEntryRequest: jsonSchema(entryInputSchema),
        WriteResult: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["created", "appended"] },
            initiativeId: { type: "integer" },
            entryId: { type: "integer" },
          },
          required: ["mode", "initiativeId", "entryId"],
        },
        DuplicateCandidate: {
          type: "object",
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            region: { type: "string" },
            segment: { type: "string" },
            pic: { type: "string" },
            stage: { type: "string" },
            similarity: { type: "number" },
          },
          required: ["id", "title", "similarity"],
        },
        DuplicateResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
            duplicates: {
              type: "array",
              items: { $ref: "#/components/schemas/DuplicateCandidate" },
            },
          },
          required: ["error", "duplicates"],
        },
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
          required: ["error"],
        },
      },
    },
  };
}

function queryParam(name: string, description: string, type = "string") {
  return {
    name,
    in: "query",
    required: false,
    description,
    schema: { type },
  };
}

function pathId() {
  return {
    name: "id",
    in: "path",
    required: true,
    description: "Initiative id",
    schema: { type: "integer" },
  };
}
