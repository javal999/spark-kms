import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuper } from "@/src/lib/guards";
import { createApiKey, listApiKeys } from "@/src/services/apiKeys";

export const runtime = "nodejs";

/** GET /api/admin/api-keys — list all keys (super-admin). Never returns hashes. */
export async function GET() {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json({ keys: await listApiKeys() });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scope: z.enum(["read", "write"]),
});

/**
 * POST /api/admin/api-keys — mint a new key (super-admin). The raw secret is
 * returned exactly once in this response and never again.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuper();
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

  const created = await createApiKey(body.name, body.scope, gate.userId!);
  return NextResponse.json(created, { status: 201 });
}
