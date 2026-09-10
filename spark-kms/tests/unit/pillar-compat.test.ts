import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  PILLARS,
  PILLAR_INPUT_VALUES,
  LEGACY_PILLAR_SPELLINGS,
  canonicalPillar,
  canonicalPillars,
} from "@/src/lib/enums";
import { pillarSchema, initiativeInputSchema } from "@/src/validation/entry";
import { buildOpenApiDocument } from "@/src/lib/openapi";

/**
 * D32 renamed the sixth pillar from `CEE` to `Core Excellence Execution`. The
 * abbreviation stays valid INPUT on every path we do not control the caller of
 * — partner REST filters, MCP tools, shared filter links, and upload templates
 * already in circulation — while never surviving as a stored value.
 */
describe("pillar legacy-spelling compatibility (D32)", () => {
  describe("canonicalPillar", () => {
    it("resolves the legacy abbreviation to the stored name", () => {
      expect(canonicalPillar("CEE")).toBe("Core Excellence Execution");
    });

    it("is trimmed and case-insensitive", () => {
      for (const v of ["cee", " CEE ", "  Cee", "cEe  "]) {
        expect(canonicalPillar(v)).toBe("Core Excellence Execution");
      }
    });

    it("returns every canonical pillar unchanged", () => {
      for (const p of PILLARS) expect(canonicalPillar(p)).toBe(p);
    });

    it("returns an unknown value UNCHANGED so it still fails as itself", () => {
      // If this swallowed unknown values, an off-enum pillar would surface as a
      // confusing type error instead of `"Radical Synergy" is not a valid pillar`.
      expect(canonicalPillar("Radical Synergy")).toBe("Radical Synergy");
      expect(canonicalPillar("")).toBe("");
    });

    it("passes non-strings through untouched", () => {
      expect(canonicalPillar(undefined)).toBeUndefined();
      expect(canonicalPillar(null)).toBeNull();
      expect(canonicalPillar(7)).toBe(7);
    });

    it("canonicalPillars maps a filter list and leaves non-arrays alone", () => {
      expect(canonicalPillars(["CEE", "Social Buzz"])).toEqual([
        "Core Excellence Execution",
        "Social Buzz",
      ]);
      expect(canonicalPillars(undefined)).toBeUndefined();
    });
  });

  describe("write paths", () => {
    it("pillarSchema accepts the legacy spelling and yields the stored name", () => {
      expect(pillarSchema.parse("CEE")).toBe("Core Excellence Execution");
      expect(pillarSchema.parse("Core Excellence Execution")).toBe(
        "Core Excellence Execution",
      );
    });

    it("pillarSchema still rejects a genuinely off-enum pillar", () => {
      expect(pillarSchema.safeParse("Radical Synergy").success).toBe(false);
    });

    it("no legacy spelling collides with a canonical value", () => {
      for (const legacy of Object.keys(LEGACY_PILLAR_SPELLINGS)) {
        expect(PILLARS).not.toContain(legacy);
      }
    });

    it("every legacy spelling maps to a real pillar", () => {
      for (const target of Object.values(LEGACY_PILLAR_SPELLINGS)) {
        expect(PILLARS).toContain(target);
      }
    });

    it("a create body using CEE stores the canonical value", () => {
      const parsed = initiativeInputSchema.safeParse({
        title: "Pop-up in Bali",
        region: "Sumatera",
        segment: "Masstige",
        pillar: "CEE",
        pic: "Tester",
      });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.pillar).toBe("Core Excellence Execution");
    });
  });

  describe("published OpenAPI contract", () => {
    const doc = buildOpenApiDocument() as unknown as {
      components: { schemas: Record<string, { required?: string[]; properties?: Record<string, { enum?: string[] }> }> };
    };
    const create = doc.components.schemas.CreateInitiativeRequest;

    it("still marks pillar as required", () => {
      // Regression: wrapping pillarSchema in `z.preprocess` erased the input
      // type, silently dropping `pillar` from `required` in the partner-facing
      // spec. An enum + transform keeps the field introspectable.
      expect(create.required).toContain("pillar");
    });

    it("lists every accepted spelling, canonical and legacy", () => {
      expect(create.properties?.pillar?.enum).toEqual([...PILLAR_INPUT_VALUES]);
      expect(create.properties?.pillar?.enum).toContain("CEE");
      expect(create.properties?.pillar?.enum).toContain(
        "Core Excellence Execution",
      );
    });
  });

  describe("MCP tool boundary", () => {
    it("the shared zod pillar validator accepts CEE from an MCP client", () => {
      // MCP tools build their input schemas from the same enum values; a strict
      // z.enum here would reject the legacy spelling at the tool boundary,
      // before it could ever reach the normalizing filter.
      const zPillar = z
        .enum(PILLAR_INPUT_VALUES)
        .transform((v) => canonicalPillar(v));
      expect(zPillar.parse("CEE")).toBe("Core Excellence Execution");
      expect(zPillar.safeParse("Radical Synergy").success).toBe(false);
    });
  });
});
