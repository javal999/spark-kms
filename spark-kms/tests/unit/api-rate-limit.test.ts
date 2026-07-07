import { describe, it, expect, beforeEach } from "vitest";
import {
  checkApiRateLimit,
  __resetApiRateLimiter,
} from "@/src/lib/api-rate-limit";

/**
 * Per-key sliding-window limiter (REQ-X5): 60 req/min. Uses an injected clock
 * (no real time) so the window logic is deterministic.
 */
describe("api rate limiter", () => {
  beforeEach(() => __resetApiRateLimiter());

  it("allows exactly 60 requests then blocks the 61st in the same minute", () => {
    const t = 1_000_000;
    for (let i = 0; i < 60; i++) {
      expect(checkApiRateLimit(1, t).allowed).toBe(true);
    }
    const over = checkApiRateLimit(1, t);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("decrements the remaining budget", () => {
    const t = 5_000_000;
    expect(checkApiRateLimit(7, t).remaining).toBe(59);
    expect(checkApiRateLimit(7, t).remaining).toBe(58);
  });

  it("frees budget once requests age out of the 60s window", () => {
    const t = 2_000_000;
    for (let i = 0; i < 60; i++) checkApiRateLimit(2, t);
    expect(checkApiRateLimit(2, t).allowed).toBe(false);
    // 61 seconds later the window has slid past all prior hits.
    expect(checkApiRateLimit(2, t + 61_000).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const t = 9_000_000;
    for (let i = 0; i < 60; i++) checkApiRateLimit(10, t);
    expect(checkApiRateLimit(10, t).allowed).toBe(false);
    expect(checkApiRateLimit(11, t).allowed).toBe(true);
  });
});
