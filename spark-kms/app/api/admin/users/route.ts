import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSuper } from "@/src/lib/guards";
import { listAdmins, createAdmin } from "@/src/services/admin";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json({ users: await listAdmins() });
}

const createSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
  password: z.string().min(8),
  isSuper: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const gate = await requireSuper();
  if (gate instanceof NextResponse) return gate;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Email, name, and an 8+ char password are required" },
      { status: 400 },
    );
  }

  try {
    const { id } = await createAdmin(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    // Unique email violation.
    if (String((err as { code?: string }).code) === "23505") {
      return NextResponse.json({ error: "That email already exists" }, { status: 409 });
    }
    throw err;
  }
}
