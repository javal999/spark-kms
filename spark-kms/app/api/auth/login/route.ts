import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  verifyAdminCredentials,
  verifyViewerPassword,
  getViewerEpoch,
} from "@/src/services/auth";
import {
  getSession,
  ADMIN_TTL_SECONDS,
  VIEWER_TTL_SECONDS,
} from "@/src/lib/session";
import { isRateLimited, recordFailure, clearFailures } from "@/src/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().trim().email().optional(),
  password: z.string().min(1),
});

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Admin path when an email is supplied; viewer shared-password path otherwise.
  if (parsed.email) {
    const admin = await verifyAdminCredentials(parsed.email, parsed.password);
    if (!admin) {
      recordFailure(ip);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const session = await getSession(ADMIN_TTL_SECONDS);
    session.role = admin.isSuper ? "super" : "admin";
    session.userId = admin.id;
    session.email = admin.email;
    session.name = admin.name;
    await session.save();
    clearFailures(ip);
    return NextResponse.json({ role: session.role, name: admin.name });
  }

  const ok = await verifyViewerPassword(parsed.password);
  if (!ok) {
    recordFailure(ip);
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const session = await getSession(VIEWER_TTL_SECONDS);
  session.role = "viewer";
  session.userId = undefined;
  session.email = undefined;
  session.name = undefined;
  session.viewerEpoch = await getViewerEpoch();
  await session.save();
  clearFailures(ip);
  return NextResponse.json({ role: "viewer" });
}
