import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * Task 2 (admin archive): the archive/restore route is gated by requireAdmin.
 * Prove it lets an admin through and blocks a viewer with 403 — and that it
 * re-checks the LIVE DB role (a cookie that still says "admin" is rejected once
 * the DB role is downgraded/deactivated).
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

describe("requireAdmin (archive gate)", () => {
  it("allows an active admin (live DB role confirmed)", async () => {
    getSession.mockResolvedValue({ role: "admin", userId: 5 });
    getUserAccess.mockResolvedValue({ active: true, role: "admin" });
    const res = await requireAdmin();
    expect(res).not.toBeInstanceOf(NextResponse);
    expect((res as { role: string }).role).toBe("admin");
  });

  it("allows a super (super is admin+)", async () => {
    getSession.mockResolvedValue({ role: "super", userId: 1 });
    getUserAccess.mockResolvedValue({ active: true, role: "super" });
    expect(await requireAdmin()).not.toBeInstanceOf(NextResponse);
  });

  it("denies a viewer with 403", async () => {
    getSession.mockResolvedValue({ role: "viewer" });
    const res = await requireAdmin();
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(403);
  });

  it("denies an unauthenticated request with 401", async () => {
    getSession.mockResolvedValue({});
    const res = await requireAdmin();
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
  });

  it("denies a cookie-admin whose live DB role was revoked", async () => {
    getSession.mockResolvedValue({ role: "admin", userId: 5 });
    getUserAccess.mockResolvedValue({ active: true, role: "viewer" });
    const res = await requireAdmin();
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(403);
  });
});
