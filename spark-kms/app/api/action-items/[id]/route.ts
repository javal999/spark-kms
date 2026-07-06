import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/guards";
import { actionStatusEnum } from "@/src/db/schema";
import { updateActionItemStatus } from "@/src/services/initiatives";

export const runtime = "nodejs";

const schema = z.object({ status: z.enum(actionStatusEnum.enumValues) });

/** PATCH /api/action-items/[id] — inline status update (admin). */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const actionItemId = Number(id);
  if (!Number.isInteger(actionItemId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  let status: (typeof actionStatusEnum.enumValues)[number];
  try {
    status = schema.parse(await req.json()).status;
  } catch {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await updateActionItemStatus(actionItemId, status);
  return NextResponse.json({ ok: true });
}
