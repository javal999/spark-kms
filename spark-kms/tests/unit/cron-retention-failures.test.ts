import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * The nightly retention job reports only an HTTP status to GitLab. Before this,
 * a failing rollup threw straight out of the route: a bare 500 in the job log
 * and nothing in /admin's error log to explain it — so the documented debug step
 * ("a 5xx means check the error log") led to an empty log.
 */

const h = vi.hoisted(() => ({ runRetention: vi.fn(), captureError: vi.fn() }));

vi.mock("@/src/services/usage-retention", () => ({ runRetention: h.runRetention }));
vi.mock("@/src/lib/error-log", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/error-log")>("@/src/lib/error-log");
  return { ...actual, captureError: h.captureError };
});

import { POST } from "@/app/api/cron/retention/route";

const SECRET = "s3cret-value";
const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/retention", {
    method: "POST",
    headers: auth === undefined ? {} : { authorization: auth },
  });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  h.runRetention.mockReset();
  h.captureError.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("cron retention endpoint — failures are visible", () => {
  it("a failing rollup returns 500 with a trace id and lands in the error log", async () => {
    h.runRetention.mockRejectedValue(new Error('relation "usage_daily" does not exist'));
    h.captureError.mockResolvedValue("err_cron1");

    const res = await POST(req(`Bearer ${SECRET}`));

    expect(res.status).toBe(500);
    expect((await res.json()).traceId).toBe("err_cron1");
    expect(h.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ route: "POST /api/cron/retention" }),
    );
  });

  it("still runs with the exact secret", async () => {
    h.runRetention.mockResolvedValue({ purged: 3 });
    const res = await POST(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, purged: 3 });
  });

  it("rejects near misses — any length, any case — with 401 and does no work", async () => {
    // A constant-time compare that feeds raw strings to timingSafeEqual throws on
    // a length mismatch; each of these must be a clean 401, not a crash.
    for (const auth of [
      "Bearer s",
      `Bearer ${SECRET}x`,
      "Bearer ",
      "",
      SECRET,
      `bearer ${SECRET}`,
      `Bearer  ${SECRET}`,
    ]) {
      expect((await POST(req(auth))).status, JSON.stringify(auth)).toBe(401);
    }
    expect((await POST(req())).status).toBe(401);
    expect(h.runRetention).not.toHaveBeenCalled();
  });
});
