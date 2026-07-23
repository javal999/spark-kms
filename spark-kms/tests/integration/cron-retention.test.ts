import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/retention/route";
import { resetAndSeed } from "@/tests/helpers/db";

function req(auth?: string) {
  return new NextRequest("http://localhost/api/cron/retention", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

describe("cron retention endpoint", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects without the secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await POST(req())).status).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await POST(req("Bearer wrong"))).status).toBe(401);
  });

  it("rejects when no CRON_SECRET is configured (fail-closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(req("Bearer anything"))).status).toBe(401);
  });

  it("runs retention with the correct secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.purged).toBe("number");
  });
});
