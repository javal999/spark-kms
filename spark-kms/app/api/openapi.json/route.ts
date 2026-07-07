import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/src/lib/openapi";

export const runtime = "nodejs";

/**
 * GET /api/openapi.json — the OpenAPI 3.1 spec (REQ-X1). Public: it describes
 * the contract and contains no secrets. The bearer key is what actually gates
 * every endpoint it documents.
 */
export async function GET() {
  return NextResponse.json(buildOpenApiDocument(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
