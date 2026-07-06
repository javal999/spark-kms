import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/guards";
import { entryInputSchema } from "@/src/validation/entry";
import {
  appendEntry,
  InitiativeNotFoundError,
} from "@/src/services/initiatives";

export const runtime = "nodejs";

const actionItemDraftSchema = z.object({
  description: z.string().trim().min(1),
  pic: z.string().trim().min(1),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const appendSchema = z.object({
  ...entryInputSchema.shape,
  createActionItem: z.boolean().default(false),
  actionItem: actionItemDraftSchema.optional(),
});

/** POST /api/initiatives/[id]/entries — append an entry (admin). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const initiativeId = Number(id);
  if (!Number.isInteger(initiativeId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  let body: z.infer<typeof appendSchema>;
  try {
    body = appendSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Validation failed", details: (err as z.ZodError).issues },
      { status: 400 },
    );
  }

  try {
    const result = await appendEntry(initiativeId, body, gate.userId!, {
      createActionItem: body.createActionItem,
      actionItem: body.actionItem,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof InitiativeNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
