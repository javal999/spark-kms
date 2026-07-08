import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/src/lib/guards";
import { categorySchema } from "@/src/validation/entry";
import {
  updateEntryFields,
  entryBelongsToInitiative,
  EntryNotFoundError,
} from "@/src/services/edits";

export const runtime = "nodejs";

const patchSchema = z.object({
  detail: z.string().trim().min(1).optional(),
  followUp: z.string().trim().optional(),
  category: categorySchema.optional(),
  linkUrl: z.string().trim().optional(),
});

/**
 * PATCH /api/initiatives/[id]/entries/[entryId] — edit an entry's descriptive
 * fields (admin). The entry date is intentionally NOT editable — it decides
 * which week the point counts for. All changes are recorded in the edit log.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; entryId: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { id, entryId } = await ctx.params;
  const initiativeId = Number(id);
  const eid = Number(entryId);
  if (!Number.isInteger(initiativeId) || !Number.isInteger(eid)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  if (!(await entryBelongsToInitiative(eid, initiativeId))) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Validation failed", details: (err as z.ZodError).issues },
      { status: 400 },
    );
  }

  try {
    const changed = await updateEntryFields(eid, body, gate.userId!);
    return NextResponse.json({ ok: true, changed });
  } catch (err) {
    if (err instanceof EntryNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
