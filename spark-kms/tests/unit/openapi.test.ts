import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { buildOpenApiDocument } from "@/src/lib/openapi";

/**
 * OpenAPI spec build + route-inventory match (task 5.4 CI check) and the 5.6
 * lockdown assertion (privileged operations never appear in the public spec).
 */

/** Walk app/api/v1 for route.ts files → OpenAPI path templates. */
function fsRouteInventory(): Set<string> {
  const root = join(process.cwd(), "app", "api", "v1");
  const out = new Set<string>();
  const walk = (dir: string, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        walk(join(dir, e.name), `${rel}/${e.name}`);
      } else if (e.name === "route.ts") {
        // [id] segment → {id}
        const path = ("/api/v1" + rel).replace(/\[([^\]]+)\]/g, "{$1}");
        out.add(path);
      }
    }
  };
  walk(root, "");
  return out;
}

describe("OpenAPI document", () => {
  const doc = buildOpenApiDocument();

  it("declares OpenAPI 3.1 with bearer security", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  it("every path is secured and every operation has responses", () => {
    for (const [p, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(
        methods as Record<string, { security?: unknown; responses?: object }>,
      )) {
        expect(op.security, `${method} ${p} missing security`).toBeDefined();
        expect(
          Object.keys(op.responses ?? {}).length,
          `${method} ${p} missing responses`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("matches the /api/v1 route inventory exactly", () => {
    const specPaths = new Set(
      Object.keys(doc.paths).filter((p) => p.startsWith("/api/v1")),
    );
    const fsPaths = fsRouteInventory();
    expect([...specPaths].sort()).toEqual([...fsPaths].sort());
  });

  it("request bodies are generated from the shared Zod validators", () => {
    const create = doc.components.schemas.CreateInitiativeRequest as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(create.required).toEqual(
      expect.arrayContaining([
        "title",
        "region",
        "segment",
        "pillar",
        "pic",
        "entryDate",
        "category",
        "detail",
      ]),
    );
    // Control fields are present but optional.
    expect(create.properties).toHaveProperty("append_to");
    expect(create.properties).toHaveProperty("force_new");
    expect(create.required).not.toContain("force_new");
  });

  it("never exposes privileged operations (REQ-X3 / task 5.6 lockdown)", () => {
    // The exposed surface is the set of documented paths — not prose. No
    // confirm / adjustment / manual-scoring / user / password route may appear.
    const paths = Object.keys(doc.paths);
    for (const p of paths) {
      expect(p.startsWith("/api/v1/")).toBe(true);
    }
    const joined = paths.join(" ").toLowerCase();
    for (const forbidden of [
      "confirm",
      "adjustment",
      "admin",
      "viewer-password",
      "users",
      "scoring",
      "nomination",
    ]) {
      expect(joined, `path references ${forbidden}`).not.toContain(forbidden);
    }
  });
});
