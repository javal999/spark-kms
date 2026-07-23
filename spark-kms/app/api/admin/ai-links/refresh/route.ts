import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/guards";
import { flags } from "@/src/lib/flags";
import { embedAll, getEmbedder } from "@/src/services/embeddings";
import { generateSuggestions } from "@/src/services/suggestions";

export const runtime = "nodejs";
export const maxDuration = 300; // embedding the corpus can take a while

/**
 * POST /api/admin/ai-links/refresh (Phase 9) — embed every initiative with the
 * configured embedder, then (re)generate similarity suggestions. Admin-gated,
 * flag-gated. Uses the cloud embedder when OPENROUTER_API_KEY is set (costs
 * per initiative), else the offline stub. Synchronous — fine at our scale.
 */
export async function POST() {
  if (!flags.graph) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const embedder = getEmbedder();
  const embedded = await embedAll(embedder);
  const { created } = await generateSuggestions();
  return NextResponse.json({ embedded, model: embedder.id, suggestionsCreated: created });
}
