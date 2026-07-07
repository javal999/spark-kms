import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { verifyApiKey, type ApiScope } from "@/src/services/apiKeys";
import { checkApiRateLimit } from "@/src/lib/api-rate-limit";
import {
  ApiDuplicateError,
  ApiScopeError,
  ApiValidationError,
  InitiativeNotFoundError,
  type ApiContext,
} from "@/src/services/apiOps";
import { mcpTools } from "@/src/services/mcpTools";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * MCP server over streamable HTTP at /api/mcp (requirements 14, REQ-X6/X7/X8).
 *
 * The tools (defined in src/services/mcpTools.ts) are a thin surface over the
 * same `apiOps` layer the REST API uses, so authentication (Bearer API key),
 * scopes, the 409 duplicate contract, and scoring behave identically to
 * `/api/v1`. Confirmation / manual streams / adjustments / user + password
 * management are intentionally NOT exposed as tools (REQ-X3 / task 5.6).
 */

/** Pull our ApiContext out of the authenticated MCP request. */
function ctxFrom(extra: { authInfo?: AuthInfo }): ApiContext {
  const info = extra.authInfo?.extra as
    | { ownerUserId: number; scope: ApiScope }
    | undefined;
  if (!info) throw new Error("Unauthenticated MCP request");
  return { scope: info.scope, ownerUserId: info.ownerUserId };
}

/** Run a tool body: JSON-encode success, translate typed errors to text. */
async function runTool(run: () => Promise<unknown>) {
  try {
    const data = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: describeError(err) }],
      isError: true,
    };
  }
}

function describeError(err: unknown): string {
  if (err instanceof ApiScopeError) {
    return `Permission denied: this API key lacks '${err.required}' scope.`;
  }
  if (err instanceof ApiDuplicateError) {
    return (
      "Similar initiatives already exist. To append to one, call create_initiative " +
      "again with append_to set to its id; to create a new one anyway, set " +
      "force_new: true. Candidates: " +
      JSON.stringify(err.candidates)
    );
  }
  if (err instanceof ApiValidationError) {
    return "Validation failed: " + JSON.stringify(err.issues);
  }
  if (err instanceof InitiativeNotFoundError) return err.message;
  return "Unexpected error: " + (err as Error).message;
}

const initServer = (server: McpServer) => {
  for (const t of mcpTools) {
    server.tool(t.name, t.description, t.inputSchema, (args, extra) =>
      runTool(() => t.run(ctxFrom(extra), args as Record<string, unknown>)),
    );
  }
};

const handler = createMcpHandler(
  initServer,
  { serverInfo: { name: "SPARK KMS", version: "1.0.0" } },
  { basePath: "/api", disableSse: true },
);

/** Verify the Bearer API key and enforce the per-key rate limit. */
async function verifyToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const identity = await verifyApiKey(bearerToken);
  if (!identity) return undefined;
  if (!checkApiRateLimit(identity.keyId).allowed) return undefined;
  return {
    token: bearerToken,
    clientId: `spark-key-${identity.keyId}`,
    scopes: [identity.scope],
    extra: {
      ownerUserId: identity.ownerUserId,
      scope: identity.scope,
      keyId: identity.keyId,
    },
  };
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
