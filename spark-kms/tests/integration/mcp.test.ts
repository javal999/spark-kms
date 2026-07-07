import { describe, it, expect, beforeEach } from "vitest";
import { mcpTools } from "@/src/services/mcpTools";
import { createApiKey, verifyApiKey } from "@/src/services/apiKeys";
import { ApiScopeError, type ApiContext } from "@/src/services/apiOps";
import { resetAndSeed, getSuperAdminId } from "@/tests/helpers/db";

/**
 * Gate 5 smoke — the MCP tool surface. We resolve an ApiContext from a REAL
 * verified API key (exactly what the /api/mcp auth layer does) and drive the
 * same tool `run` functions the route registers, proving search_initiatives and
 * add_entry work end-to-end and that scopes carry through the MCP layer.
 */

const tool = (name: string) => {
  const t = mcpTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
};

async function ctxFromKey(scope: "read" | "write"): Promise<ApiContext> {
  const created = await createApiKey(`mcp-${scope}`, scope, await getSuperAdminId());
  const identity = await verifyApiKey(created.key);
  if (!identity) throw new Error("key did not verify");
  return { scope: identity.scope, ownerUserId: identity.ownerUserId };
}

describe("MCP tools (Gate 5 smoke)", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });

  it("registers exactly the 7 required tools", () => {
    expect(new Set(mcpTools.map((t) => t.name))).toEqual(
      new Set([
        "search_initiatives",
        "get_initiative",
        "get_top_initiatives",
        "get_leaderboard",
        "get_dashboard_summary",
        "create_initiative",
        "add_entry",
      ]),
    );
  });

  it("create_initiative → search_initiatives → add_entry with a write key", async () => {
    const ctx = await ctxFromKey("write");

    const created = (await tool("create_initiative").run(ctx, {
      title: "MCP smoke initiative",
      region: "EJBN",
      segment: "Teen & ES",
      pillar: "Social Buzz",
      pic: "QA",
      entryDate: "2026-07-01",
      category: "Best Practice",
      detail: "created via MCP tool",
      force_new: true,
    })) as { mode: string; initiativeId: number };
    expect(created.mode).toBe("created");

    const found = (await tool("search_initiatives").run(ctx, {
      q: "MCP smoke",
    })) as { total: number; rows: { id: number }[] };
    expect(found.total).toBe(1);
    expect(found.rows[0].id).toBe(created.initiativeId);

    const appended = (await tool("add_entry").run(ctx, {
      initiativeId: created.initiativeId,
      entryDate: "2026-07-03",
      category: "Unlocking",
      detail: "appended via MCP tool",
    })) as { mode: string; entryId: number };
    expect(appended.mode).toBe("appended");
    expect(appended.entryId).toBeGreaterThan(0);
  });

  it("a read key cannot call the write tools (scope carries through MCP)", async () => {
    const ctx = await ctxFromKey("read");
    await expect(
      tool("create_initiative").run(ctx, {
        title: "nope",
        region: "EJBN",
        segment: "All",
        pillar: "Social Buzz",
        pic: "QA",
        entryDate: "2026-07-01",
        category: "Best Practice",
        detail: "x",
        force_new: true,
      }),
    ).rejects.toBeInstanceOf(ApiScopeError);

    // ...but read tools work fine.
    const dash = (await tool("get_dashboard_summary").run(ctx, {})) as {
      total: number;
    };
    expect(dash.total).toBe(0);
  });
});
