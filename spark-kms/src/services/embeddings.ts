import { and, eq, or } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, initiativeEmbeddings, initiativeLinks } from "@/src/db/schema";

/**
 * AI-link similarity engine (Phase 9, graph-future-phases Part 2). Model-
 * AGNOSTIC by design: an `Embedder` turns initiative text into a vector, stored
 * as a float array. Similarity is brute-force cosine in memory — instant at our
 * scale (<3k initiatives). The real embedding model (open question G4) is the
 * only thing that plugs in later; everything here is testable with the stub.
 */

export type Embedder = {
  /** Identifier stored alongside each vector (so we can re-embed on model change). */
  id: string;
  embed(text: string): Promise<number[]>;
};

// ── Deterministic stub embedder (tests + local dev; NOT for production) ──────
const STUB_DIM = 64;
function bucket(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % STUB_DIM;
}

/**
 * A bag-of-tokens hash embedder: texts sharing words get similar vectors,
 * disjoint texts get near-orthogonal ones. Good enough to exercise the whole
 * pipeline; a real multilingual model replaces it via the Embedder interface.
 */
export const stubEmbedder: Embedder = {
  id: "stub-hash-v1",
  async embed(text: string): Promise<number[]> {
    const v = new Array(STUB_DIM).fill(0);
    for (const tok of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      v[bucket(tok)] += 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  },
};

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

function initiativeText(row: { title: string; description: string | null }): string {
  return [row.title, row.description].filter(Boolean).join("\n");
}

/** Embed one initiative (upsert). Returns the stored vector length. */
export async function embedInitiative(
  initiativeId: number,
  embedder: Embedder = stubEmbedder,
): Promise<number> {
  const [row] = await db
    .select({ title: initiatives.title, description: initiatives.description })
    .from(initiatives)
    .where(eq(initiatives.id, initiativeId))
    .limit(1);
  if (!row) throw new Error(`initiative ${initiativeId} not found`);
  const vec = await embedder.embed(initiativeText(row));
  await db
    .insert(initiativeEmbeddings)
    .values({ initiativeId, embedding: vec, model: embedder.id })
    .onConflictDoUpdate({
      target: initiativeEmbeddings.initiativeId,
      set: { embedding: vec, model: embedder.id, updatedAt: new Date() },
    });
  return vec.length;
}

/** Embed every initiative (backfill / re-embed on model change). */
export async function embedAll(embedder: Embedder = stubEmbedder): Promise<number> {
  const rows = await db.select({ id: initiatives.id }).from(initiatives);
  for (const r of rows) await embedInitiative(r.id, embedder);
  return rows.length;
}

export type SimilarCandidate = { initiativeId: number; score: number };

/**
 * Initiatives most similar to `initiativeId` by embedding cosine, excluding
 * itself and any already-explicitly-linked initiative. Above `threshold`,
 * top `limit`. These are SUGGESTIONS for human review — never auto-linked.
 */
export async function findSimilar(
  initiativeId: number,
  opts: { threshold?: number; limit?: number } = {},
): Promise<SimilarCandidate[]> {
  const threshold = opts.threshold ?? 0.5;
  const limit = opts.limit ?? 5;

  const rows = await db
    .select({ id: initiativeEmbeddings.initiativeId, embedding: initiativeEmbeddings.embedding })
    .from(initiativeEmbeddings);
  const target = rows.find((r) => r.id === initiativeId);
  if (!target) return [];

  // Exclude initiatives already explicitly linked (either direction).
  const links = await db
    .select({ src: initiativeLinks.srcId, dst: initiativeLinks.dstId })
    .from(initiativeLinks)
    .where(
      and(
        eq(initiativeLinks.type, "explicit"),
        or(eq(initiativeLinks.srcId, initiativeId), eq(initiativeLinks.dstId, initiativeId)),
      ),
    );
  const excluded = new Set<number>([initiativeId]);
  for (const l of links) excluded.add(l.src === initiativeId ? l.dst : l.src);

  const out: SimilarCandidate[] = [];
  for (const r of rows) {
    if (excluded.has(r.id)) continue;
    const score = cosine(target.embedding, r.embedding);
    if (score >= threshold) out.push({ initiativeId: r.id, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
