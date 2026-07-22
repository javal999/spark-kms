import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { initiatives, initiativeLinks } from "@/src/db/schema";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";
import { embedAll, stubEmbedder } from "@/src/services/embeddings";
import { forwardLinks, backlinks } from "@/src/services/links";
import {
  generateSuggestions,
  listSuggestions,
  confirmSuggestion,
  dismissSuggestion,
} from "@/src/services/suggestions";

async function ini(actor: number, title: string, description: string): Promise<number> {
  const [row] = await db
    .insert(initiatives)
    .values({
      title,
      description,
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

async function countType(type: "derived_similar" | "explicit"): Promise<number> {
  const rows = await db.select().from(initiativeLinks).where(eq(initiativeLinks.type, type));
  return rows.length;
}

let actor: number, A: number, B: number, C: number;

describe("AI link suggestions (Phase 9)", () => {
  beforeEach(async () => {
    await resetAndSeed();
    actor = await getSuperAdminId();
    A = await ini(actor, "Pop-up store activation", "temporary popup store retail activation");
    B = await ini(actor, "Temporary popup retail store", "short-lived popup store activation event");
    C = await ini(actor, "CRM loyalty program", "customer database membership rewards");
    await embedAll(stubEmbedder);
  });

  it("generates derived_similar suggestions for similar pairs, idempotently", async () => {
    const { created } = await generateSuggestions({ threshold: 0.15 });
    expect(created).toBeGreaterThan(0);
    // A↔B should be suggested; C is unrelated.
    const sugs = await listSuggestions(A);
    expect(sugs.some((s) => s.otherId === B)).toBe(true);
    expect(sugs.some((s) => s.otherId === C)).toBe(false);
    // Idempotent: a second pass adds nothing.
    const again = await generateSuggestions({ threshold: 0.15 });
    expect(again.created).toBe(0);
  });

  it("confirming a suggestion promotes it to an explicit link and removes the suggestion", async () => {
    await generateSuggestions({ threshold: 0.15 });
    const [sug] = await listSuggestions(A);
    await confirmSuggestion(sug.edgeId, actor);

    // The suggestion is gone; an explicit edge now connects A and B.
    expect((await listSuggestions(A)).some((s) => s.edgeId === sug.edgeId)).toBe(false);
    const linked = [...(await forwardLinks(A)), ...(await backlinks(A))];
    expect(linked).toContain(B);
    expect(await countType("derived_similar")).toBe(0);
  });

  it("does not re-suggest an already-explicitly-linked pair", async () => {
    await generateSuggestions({ threshold: 0.15 });
    const [sug] = await listSuggestions(A);
    await confirmSuggestion(sug.edgeId, actor);
    const { created } = await generateSuggestions({ threshold: 0.15 });
    // A↔B is now explicit → excluded; no new A↔B suggestion.
    const reSug = await listSuggestions(A);
    expect(reSug.some((s) => s.otherId === B)).toBe(false);
    expect(created).toBe(0);
  });

  it("dismissing a suggestion deletes it without creating a link", async () => {
    await generateSuggestions({ threshold: 0.15 });
    const [sug] = await listSuggestions(A);
    await dismissSuggestion(sug.edgeId);
    expect(await countType("derived_similar")).toBe(0);
    expect(await countType("explicit")).toBe(0);
  });
});
