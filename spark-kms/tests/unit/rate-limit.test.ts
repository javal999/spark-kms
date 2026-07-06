import { describe, it, expect, beforeEach } from "vitest";
import {
  isRateLimited,
  recordFailure,
  clearFailures,
  __resetRateLimiter,
} from "@/src/lib/rate-limit";

describe("failed-login rate limiter (5 / 10min / IP)", () => {
  beforeEach(() => __resetRateLimiter());

  it("allows up to 5 failures, blocks the 6th", () => {
    const ip = "1.2.3.4";
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(ip, t0)).toBe(false);
      recordFailure(ip, t0);
    }
    expect(isRateLimited(ip, t0)).toBe(true);
  });

  it("returns remaining attempts", () => {
    const ip = "9.9.9.9";
    expect(recordFailure(ip, 0)).toBe(4);
    expect(recordFailure(ip, 0)).toBe(3);
  });

  it("clears failures on success", () => {
    const ip = "5.5.5.5";
    for (let i = 0; i < 5; i++) recordFailure(ip, 0);
    expect(isRateLimited(ip, 0)).toBe(true);
    clearFailures(ip);
    expect(isRateLimited(ip, 0)).toBe(false);
  });

  it("expires failures after the 10-minute window", () => {
    const ip = "7.7.7.7";
    const t0 = 0;
    for (let i = 0; i < 5; i++) recordFailure(ip, t0);
    expect(isRateLimited(ip, t0)).toBe(true);
    // 10 min + 1 ms later, all prior failures have aged out.
    expect(isRateLimited(ip, 10 * 60 * 1000 + 1)).toBe(false);
  });

  it("isolates IPs from each other", () => {
    for (let i = 0; i < 5; i++) recordFailure("a", 0);
    expect(isRateLimited("a", 0)).toBe(true);
    expect(isRateLimited("b", 0)).toBe(false);
  });
});
