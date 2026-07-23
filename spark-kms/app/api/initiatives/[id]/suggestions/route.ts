import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, requireViewer } from "@/src/lib/guards";
import { flags } from "@/src/lib/flags";
import {
  listSuggestions,
  confirmSuggestion,
  dismissSuggestion,
  SuggestionNotFoundError,
} from "@/src/services/suggestions";

export const runtime = "nodejs";

/** GET — pending AI suggestions for this initiative (viewer, flag-gated). */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!flags.graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await requireViewer();
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  return NextResponse.json({ suggestions: await listSuggestions(Number(id)) });
}

const bodySchema = z.object({
  edgeId: z.number().int().positive(),
  action: z.enum(["confirm", "dismiss"]),
});

/** POST — confirm (→ explicit link) or dismiss a suggestion (admin, flag-gated). */
export async function POST(req: NextRequest) {
  if (!flags.graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    if (body.action === "confirm") await confirmSuggestion(body.edgeId, gate.userId!);
    else await dismissSuggestion(body.edgeId);
  } catch (err) {
    if (err instanceof SuggestionNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
}
