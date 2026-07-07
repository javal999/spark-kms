import { NextResponse, type NextRequest } from "next/server";
import { requireSuper } from "@/src/lib/guards";
import { revokeApiKey } from "@/src/services/apiKeys";

export const runtime = "nodejs";

/** DELETE /api/admin/api-keys/[id] — revoke a key (super-admin). Idempotent. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const keyId = Number(id);
  if (!Number.isInteger(keyId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const revoked = await revokeApiKey(keyId);
  return NextResponse.json({ revoked });
}
