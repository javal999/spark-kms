import { type NextRequest } from "next/server";
import { withApiRoute } from "@/src/lib/api-auth";
import { opGetInitiative } from "@/src/services/apiOps";

export const runtime = "nodejs";

/** GET /api/v1/initiatives/[id] — full detail + per-stream points (read scope). */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return withApiRoute(req, async (auth) => {
    const result = await opGetInitiative(auth, Number(id));
    return { body: result };
  });
}
