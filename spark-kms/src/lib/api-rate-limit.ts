/**
 * Per-API-key sliding-window rate limiter: 60 requests/minute default
 * (requirements 14, REQ-X5). In-memory, single-instance — matches the login
 * limiter's constraints; swap for Redis if the app is horizontally scaled.
 */
const WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 60;

const hits = new Map<number, number[]>();

function prune(list: number[], now: number): number[] {
  return list.filter((t) => now - t < WINDOW_MS);
}

/**
 * Record one request for `keyId`. Returns whether it is allowed plus the
 * remaining budget in the current window. A blocked request is NOT counted.
 */
export function checkApiRateLimit(
  keyId: number,
  now: number = Date.now(),
  max: number = DEFAULT_MAX,
): { allowed: boolean; remaining: number; limit: number } {
  const list = prune(hits.get(keyId) ?? [], now);
  if (list.length >= max) {
    hits.set(keyId, list);
    return { allowed: false, remaining: 0, limit: max };
  }
  list.push(now);
  hits.set(keyId, list);
  return { allowed: true, remaining: max - list.length, limit: max };
}

/** Test-only: wipe all state. */
export function __resetApiRateLimiter(): void {
  hits.clear();
}
