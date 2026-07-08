import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, requireViewer } from "@/src/lib/guards";
import { pillarSchema, stageSchema } from "@/src/validation/entry";
import {
  changeStage,
  getInitiativeDetail,
  InitiativeNotFoundError,
} from "@/src/services/initiatives";
import { updateInitiativeFields } from "@/src/services/edits";

export const runtime = "nodejs";

/** GET /api/initiatives/[id] — full detail (viewer). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;

  const { id } = await ctx.params;
  const detail = await getInitiativeDetail(Number(id));
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

const patchSchema = z.object({
  stage: stageSchema.optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  pillar: pillarSchema.optional(),
  pic: z.string().trim().min(1).optional(),
  linkUrl: z.string().trim().optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

/**
 * PATCH /api/initiatives/[id] — edit descriptive fields (admin). Stage goes
 * through changeStage (logs stage_changes); other fields go through
 * updateInitiativeFields, which writes the edit-log audit trail. Area
 * (region/segment) is intentionally NOT editable — it drives scoring.
 */
export async function PATCH(
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
    if (body.stage) {
      await changeStage(initiativeId, body.stage, gate.userId!);
    }
    const changed = await updateInitiativeFields(
      initiativeId,
      {
        title: body.title,
        description: body.description,
        pillar: body.pillar,
        pic: body.pic,
        linkUrl: body.linkUrl,
        tags: body.tags,
      },
      gate.userId!,
    );
    return NextResponse.json({ ok: true, changed });
  } catch (err) {
    if (err instanceof InitiativeNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
