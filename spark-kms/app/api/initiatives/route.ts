import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, requireViewer } from "@/src/lib/guards";
import { newInitiativeSchema } from "@/src/validation/entry";
import {
  createInitiative,
  listInitiatives,
} from "@/src/services/initiatives";
import { findDuplicateCandidates } from "@/src/services/duplicates";

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

const createSchema = z.object({
  ...newInitiativeSchema.shape,
  // Human-in-the-loop duplicate decision: the client must confirm "new" when
  // candidates exist, or the server returns them for the user to resolve.
  forceNew: z.boolean().default(false),
  createActionItem: z.boolean().default(false),
  actionItem: actionItemDraftSchema.optional(),
});

/** POST /api/initiatives — create a new initiative + first entry (admin). */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Validation failed", details: (err as z.ZodError).issues },
      { status: 400 },
    );
  }

  // Server-authoritative duplicate gate (REQ page 2 acceptance): if the caller
  // didn't force "new" and similar themes exist, hand them back for resolution.
  if (!body.forceNew) {
    const candidates = await findDuplicateCandidates(body.title);
    if (candidates.length > 0) {
      return NextResponse.json({ duplicates: candidates }, { status: 409 });
    }
  }

  const result = await createInitiative(body, gate.userId!, {
    createActionItem: body.createActionItem,
    actionItem: body.actionItem,
  });
  return NextResponse.json(result, { status: 201 });
}

/** GET /api/initiatives — filtered/sorted/paginated list (viewer). */
export async function GET(req: NextRequest) {
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;

  const sp = req.nextUrl.searchParams;
  const multi = (k: string) => {
    const v = sp.getAll(k).flatMap((s) => s.split(","));
    return v.filter(Boolean);
  };
  const category = sp.get("category");

  const { rows, total } = await listInitiatives({
    region: multi("region"),
    segment: multi("segment"),
    pillar: multi("pillar"),
    stage: multi("stage"),
    category:
      category === "Best Practice" || category === "Unlocking"
        ? category
        : undefined,
    q: sp.get("q") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
    page: Number(sp.get("page") ?? "1"),
    pageSize: Number(sp.get("pageSize") ?? "50"),
  });

  return NextResponse.json({ rows, total });
}
