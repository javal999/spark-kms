import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness probe for App Runner / load balancers — always 200, no auth, no DB. */
export function GET() {
  return NextResponse.json({ ok: true });
}
