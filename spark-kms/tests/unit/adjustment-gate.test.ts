import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * D24: manual score adjustments are open to any admin, not super-admins only
 * (this supersedes REQ-S3's "super-admin only" clause). Prove the route gate
 * lets an admin through, still blocks a viewer, and still re-checks the live DB
 * role — a cookie that says "admin" after the account was downgraded is no
 * longer good enough.
 *
 * The perimeter is two-layer: proxy.ts allows /adjustments for admin+, and the
 * route handler calls requireAdmin() again.
 */
const { getSession, getUserAccess } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserAccess: vi.fn(),
}));

vi.mock("@/src/lib/session", () => ({ getSession }));
vi.mock("@/src/services/authorized-users", () => ({ getUserAccess }));

import { requireAdmin } from "@/src/lib/guards";

beforeEach(() => {
  getSession.mockReset();
  getUserAccess.mockReset();
});

describe("adjustment gate (D24)", () => {
  it("allows a plain admin to post an adjustment", async () => {
    getSession.mockResolvedValue({ role: "admin", userId: 7 });
    getUserAccess.mockResolvedValue({ active: true, role: "admin" });
    const res = await requireAdmin();
    expect(res).not.toBeInstanceOf(NextResponse);
    expect((res as { userId: number }).userId).toBe(7);
  });

  it("still allows a super-admin", async () => {
    getSession.mockResolvedValue({ role: "super", userId: 1 });
    getUserAccess.mockResolvedValue({ active: true, role: "super" });
    expect(await requireAdmin()).not.toBeInstanceOf(NextResponse);
  });

  it("blocks a viewer with 403", async () => {
    getSession.mockResolvedValue({ role: "viewer" });
    const res = await requireAdmin();
    expect((res as NextResponse).status).toBe(403);
  });

  it("blocks an admin whose live DB role was revoked", async () => {
    getSession.mockResolvedValue({ role: "admin", userId: 7 });
    getUserAccess.mockResolvedValue({ active: false, role: "admin" });
    const res = await requireAdmin();
    expect((res as NextResponse).status).toBe(403);
  });

  it("blocks an unauthenticated request with 401", async () => {
    getSession.mockResolvedValue({});
    const res = await requireAdmin();
    expect((res as NextResponse).status).toBe(401);
  });
});
