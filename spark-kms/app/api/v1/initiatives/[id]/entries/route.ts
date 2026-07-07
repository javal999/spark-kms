import { type NextRequest } from "next/server";
import { withApiRoute } from "@/src/lib/api-auth";
import { opAddEntry } from "@/src/services/apiOps";

export const runtime = "nodejs";

/** POST /api/v1/initiatives/[id]/entries — append an entry (write scope). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return withApiRoute(req, async (auth) => {
    const raw = await req.json().catch(() => ({}));
    const result = await opAddEntry(auth, Number(id), raw);
    return { body: result, status: 201 };
  });
}
