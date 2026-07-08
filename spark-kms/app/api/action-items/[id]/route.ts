import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/guards";
import { actionStatusEnum } from "@/src/db/schema";
import {
  updateActionItemFields,
  ActionItemNotFoundError,
} from "@/src/services/edits";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(actionStatusEnum.enumValues).optional(),
  description: z.string().trim().min(1).optional(),
  pic: z.string().trim().min(1).optional(),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * PATCH /api/action-items/[id] — inline status update or field edit (admin).
 * All changes are recorded in the edit log.
 */
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

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Validation failed", details: (err as z.ZodError).issues },
      { status: 400 },
    );
  }

  try {
    const changed = await updateActionItemFields(actionItemId, body, gate.userId!);
    return NextResponse.json({ ok: true, changed });
  } catch (err) {
    if (err instanceof ActionItemNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
