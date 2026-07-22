import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/src/lib/guards";
import { flags } from "@/src/lib/flags";
import { deriveActorHash } from "@/src/services/usage";
import {
  topPages,
  topClicks,
  usageTrend,
  ownFrequency,
  type DayRange,
} from "@/src/services/usage-dashboard";

export const runtime = "nodejs";

function defaultRange(): DayRange {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return { start: d(start), end: d(end) };
}

/**
 * GET /api/dashboard/usage (T13) — the four owner questions. Admin/super only,
 * flag-gated. The "own frequency" series is keyed to the CALLER's actor hash,
 * derived from the session — the client cannot request another person's data.
 */
export async function GET(req: NextRequest) {
  if (!flags.tracking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const sp = req.nextUrl.searchParams;
  const def = defaultRange();
  const range: DayRange = {
    start: sp.get("start") ?? def.start,
    end: sp.get("end") ?? def.end,
  };

  // Own frequency is ALWAYS the caller's own hash — never a client-supplied id.
  const actorHash = deriveActorHash(`u:${gate.userId}`);

  const [pages, clicks, trend, own] = await Promise.all([
    topPages(range),
    topClicks(range),
    usageTrend(range),
    ownFrequency(actorHash, range),
  ]);
  return NextResponse.json({ range, topPages: pages, topClicks: clicks, trend, own });
}
