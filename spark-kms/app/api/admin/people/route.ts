import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuper } from "@/src/lib/guards";
import {
  listPeople,
  bulkUpsertNames,
  setPersonActive,
} from "@/src/services/people";

export const runtime = "nodejs";

/** GET /api/admin/people — full directory (active + inactive), super-admin. */
export async function GET() {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json({ people: await listPeople() });
}

const schema = z.object({ names: z.array(z.string().trim()).max(5000) });

/** POST /api/admin/people — bulk-add names to the directory (super-admin). */
export async function POST(req: NextRequest) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Validation failed", details: (err as z.ZodError).issues },
      { status: 400 },
    );
  }
  const result = await bulkUpsertNames(body.names, gate.userId!);
  return NextResponse.json(result, { status: 201 });
}

const patchSchema = z.object({ id: z.number().int(), active: z.boolean() });

/** PATCH /api/admin/people — activate/deactivate a directory name (super-admin). */
export async function PATCH(req: NextRequest) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Validation failed", details: (err as z.ZodError).issues },
      { status: 400 },
    );
  }
  await setPersonActive(body.id, body.active);
  return NextResponse.json({ ok: true });
}
