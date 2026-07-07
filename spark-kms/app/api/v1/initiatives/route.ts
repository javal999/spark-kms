import { type NextRequest } from "next/server";
import { withApiRoute } from "@/src/lib/api-auth";
import { opCreateInitiative, opListInitiatives } from "@/src/services/apiOps";

export const runtime = "nodejs";

/** GET /api/v1/initiatives — filtered/sorted/paginated list (read scope). */
export async function GET(req: NextRequest) {
  return withApiRoute(req, async (ctx) => {
    const sp = req.nextUrl.searchParams;
    const multi = (k: string) => {
      const v = sp.getAll(k).flatMap((s) => s.split(","));
      const out = v.map((s) => s.trim()).filter(Boolean);
      return out.length ? out : undefined;
    };
    const num = (k: string) => {
      const v = sp.get(k);
      return v == null || v === "" ? undefined : Number(v);
    };
    const category = sp.get("category");

    const result = await opListInitiatives(ctx, {
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
      dir: sp.get("dir") === "desc" ? "desc" : undefined,
      page: num("page"),
      pageSize: num("pageSize"),
    });
    return { body: result };
  });
}

/**
 * POST /api/v1/initiatives — create an initiative + first entry (write scope),
 * or append to an existing one via `append_to`. Duplicate contract (REQ-X4):
 * without `force_new`/`append_to`, a fuzzy title match returns 409 + candidates.
 */
export async function POST(req: NextRequest) {
  return withApiRoute(req, async (ctx) => {
    const raw = await req.json().catch(() => ({}));
    const result = await opCreateInitiative(ctx, raw);
    return { body: result, status: 201 };
  });
}
