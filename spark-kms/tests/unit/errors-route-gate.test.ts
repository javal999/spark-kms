import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * D30: GET /api/admin/errors is super-admin only.
 *
 * It shipped with requireAdmin while the rulebook on /guide listed the error log
 * as super-only and every sibling /api/admin/* route used requireSuper. The one
 * deliberate exception is /api/admin/adjustment (D24). proxy.ts cannot cover
 * this: its matcher excludes /api, so the super-only /admin PAGE gate never
 * applied to the API and the route's own guard was the entire perimeter.
 *
 * The exposure was the response body — listRecentErrors returns raw `message`
 * and `stack`, and Postgres errors routinely echo query text and parameter
 * values, so any regional admin could read fragments of another area's data.
 */
const { getSession, getUserAccess } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserAccess: vi.fn(),
}));

vi.mock("@/src/lib/session", () => ({ getSession }));
vi.mock("@/src/services/authorized-users", () => ({ getUserAccess }));

import { requireSuper } from "@/src/lib/guards";

beforeEach(() => {
  getSession.mockReset();
  getUserAccess.mockReset();
});

const ROUTE = path.join(process.cwd(), "app/api/admin/errors/route.ts");

describe("error log route gate (D30)", () => {
  it("the route calls requireSuper, not requireAdmin", () => {
    const source = readFileSync(ROUTE, "utf8");
    expect(source).toContain("requireSuper");
    expect(source).not.toContain("requireAdmin");
  });

  it("allows a super-admin", async () => {
    getSession.mockResolvedValue({ role: "super", userId: 1 });
    getUserAccess.mockResolvedValue({ active: true, role: "super" });
    expect(await requireSuper()).not.toBeInstanceOf(NextResponse);
  });

  it("blocks a plain admin with 403", async () => {
    getSession.mockResolvedValue({ role: "admin", userId: 7 });
    getUserAccess.mockResolvedValue({ active: true, role: "admin" });
    const res = await requireSuper();
    expect((res as NextResponse).status).toBe(403);
  });

  it("blocks a super whose live DB role was revoked", async () => {
    getSession.mockResolvedValue({ role: "super", userId: 1 });
    getUserAccess.mockResolvedValue({ active: false, role: "super" });
    const res = await requireSuper();
    expect((res as NextResponse).status).toBe(403);
  });

  it("blocks an unauthenticated request with 401", async () => {
    getSession.mockResolvedValue({});
    const res = await requireSuper();
    expect((res as NextResponse).status).toBe(401);
  });
});

describe("every /api/admin route is super-only except the D24 adjustment", () => {
  it("no route silently drops to requireAdmin again", () => {
    const dir = path.join(process.cwd(), "app/api/admin");
    const offenders: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(dir, entry.name, "route.ts");
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      // D24 deliberately opened manual adjustments to any admin.
      if (entry.name === "adjustment") continue;
      if (source.includes("requireAdmin")) offenders.push(entry.name);
    }
    expect(offenders).toEqual([]);
  });
});
