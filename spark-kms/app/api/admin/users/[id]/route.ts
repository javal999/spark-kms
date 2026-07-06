import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuper } from "@/src/lib/guards";
import { setUserActive } from "@/src/services/admin";

export const runtime = "nodejs";

const schema = z.object({ active: z.boolean() });

/** PATCH /api/admin/users/[id] — activate/deactivate an admin (super only). */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  // Don't let a super-admin lock themselves out.
  if (userId === gate.userId) {
    return NextResponse.json({ error: "You can't deactivate yourself" }, { status: 400 });
  }

  let active: boolean;
  try {
    active = schema.parse(await req.json()).active;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await setUserActive(userId, active);
  return NextResponse.json({ ok: true });
}
