import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, initiativeEmbeddings } from "@/src/db/schema";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { createExplicitLink } from "@/src/services/links";
import {
  stubEmbedder,
  cosine,
  embedInitiative,
  embedAll,
  findSimilar,
} from "@/src/services/embeddings";

async function ini(actor: number, title: string, description?: string): Promise<number> {
  const [row] = await db
    .insert(initiatives)
    .values({
      title,
      description: description ?? null,
      region: "Jakarta Greater",
      segment: "Masstige",
      pillar: "Social Buzz",
      stage: "Idea",
      pic: "P",
      createdBy: actor,
    })
    .returning({ id: initiatives.id });
  return row.id;
}

let actor: number, A: number, B: number, C: number;

describe("embeddings / AI-link similarity (Phase 9)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
    // A & B are about the same idea in different words; C is unrelated.
    A = await ini(actor, "Pop-up store activation", "temporary popup store retail activation event");
    B = await ini(actor, "Temporary popup retail store", "a short-lived popup store activation");
    C = await ini(actor, "CRM loyalty program", "customer database membership rewards points");
    await embedAll(stubEmbedder);
  });

  it("cosine is 1 for identical vectors and ~0 for orthogonal", async () => {
    const v = await stubEmbedder.embed("alpha beta gamma");
    expect(cosine(v, v)).toBeCloseTo(1, 5);
    const w = await stubEmbedder.embed("delta epsilon zeta");
    expect(cosine(v, w)).toBeLessThan(0.2);
  });

  it("findSimilar ranks the same-idea initiative above the unrelated one", async () => {
    const sims = await findSimilar(A, { threshold: 0.1, limit: 5 });
    expect(sims.length).toBeGreaterThan(0);
    expect(sims[0].initiativeId).toBe(B); // B is the closest to A
    const cScore = sims.find((s) => s.initiativeId === C)?.score ?? 0;
    const bScore = sims.find((s) => s.initiativeId === B)!.score;
    expect(bScore).toBeGreaterThan(cScore);
  });

  it("excludes already-explicitly-linked initiatives from suggestions", async () => {
    await createExplicitLink(A, B, actor);
    const sims = await findSimilar(A, { threshold: 0.1 });
    expect(sims.some((s) => s.initiativeId === B)).toBe(false); // already linked
  });

  it("re-embedding upserts (one row per initiative)", async () => {
    await embedInitiative(A, stubEmbedder);
    await embedInitiative(A, stubEmbedder);
    const rows = await db
      .select({ id: initiativeEmbeddings.initiativeId })
      .from(initiativeEmbeddings)
      .where(eq(initiativeEmbeddings.initiativeId, A));
    expect(rows).toHaveLength(1);
  });
});
