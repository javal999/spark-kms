import { NextResponse, type NextRequest } from "next/server";
import { verifyApiKey, type ApiKeyIdentity } from "@/src/services/apiKeys";
import { checkApiRateLimit } from "@/src/lib/api-rate-limit";
import {
  ApiDuplicateError,
  ApiScopeError,
  ApiValidationError,
  InitiativeNotFoundError,
  type ApiContext,
} from "@/src/services/apiOps";

/**
 * Bearer authentication + uniform error mapping for the `/api/v1/*` REST
 * surface (requirements 14). The proxy skips `/api`, so these routes are fully
 * self-gated here: every request must carry `Authorization: Bearer <key>`.
 */

function json(body: unknown, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Resolve the API key on a request. Returns the identity, or a NextResponse to
 * short-circuit with 401 (missing/invalid/revoked) or 429 (rate limited).
 */
export async function authenticateApiRequest(
  req: NextRequest,
): Promise<ApiKeyIdentity | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return json(
      { error: "Missing bearer token. Use: Authorization: Bearer <key>" },
      401,
    );
  }

  const identity = await verifyApiKey(match[1].trim());
  if (!identity) return json({ error: "Invalid or revoked API key" }, 401);

  const rl = checkApiRateLimit(identity.keyId);
  if (!rl.allowed) {
    return json({ error: "Rate limit exceeded (60 requests/minute)" }, 429, {
      "retry-after": "60",
    });
  }

  return identity;
}

/** Map an apiOps error to its HTTP response. Unknown errors rethrow → 500. */
export function mapApiError(err: unknown): NextResponse {
  if (err instanceof ApiScopeError) {
    return json({ error: err.message, required: err.required }, 403);
  }
  if (err instanceof ApiDuplicateError) {
    return json({ error: err.message, duplicates: err.candidates }, 409);
  }
  if (err instanceof ApiValidationError) {
    return json({ error: "Validation failed", details: err.issues }, 400);
  }
  if (err instanceof InitiativeNotFoundError) {
    return json({ error: err.message }, 404);
  }
  throw err;
}

/**
 * Wrap a `/api/v1` handler: authenticate, build the ApiContext, run the handler,
 * and translate typed errors to responses. The handler returns the success body
 * and status; auth/error plumbing lives here so routes stay thin.
 */
export async function withApiRoute(
  req: NextRequest,
  fn: (ctx: ApiContext) => Promise<{ body: unknown; status?: number }>,
): Promise<NextResponse> {
  const auth = await authenticateApiRequest(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { body, status } = await fn({
      scope: auth.scope,
      ownerUserId: auth.ownerUserId,
    });
    return NextResponse.json(body, { status: status ?? 200 });
  } catch (err) {
    return mapApiError(err);
  }
}
