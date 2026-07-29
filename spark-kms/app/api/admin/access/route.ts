import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuper } from "@/src/lib/guards";
import {
  listAuthorized,
  upsertAuthorized,
  setActive,
  LastSuperError,
  AuthorizedUserNotFoundError,
} from "@/src/services/authorized-users";

export const runtime = "nodejs";

/** GET /api/admin/access — the SSO allow-list (super-admin only). */
export async function GET() {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json({ users: await listAuthorized() });
}

const roleSchema = z.enum(["viewer", "admin", "super"]);
const postSchema = z.object({
  email: z.string().trim().email(),
  role: roleSchema,
});

/** POST /api/admin/access — add an email or change its role (super-admin). */
export async function POST(req: NextRequest) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Validation failed", details: (err as z.ZodError).issues },
      { status: 400 },
    );
  }
  try {
    const user = await upsertAuthorized(body.email, body.role);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof LastSuperError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

const patchSchema = z.object({ id: z.number().int(), active: z.boolean() });

/** PATCH /api/admin/access — activate / deactivate an authorized user (super-admin). */
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
  try {
    const user = await setActive(body.id, body.active);
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof LastSuperError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof AuthorizedUserNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
