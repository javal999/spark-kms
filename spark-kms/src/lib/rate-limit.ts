/**
 * In-memory failed-login limiter: 5 failed attempts per IP per 10 minutes
 * (REQ-A5). Single-instance only — acceptable for an internal app on one Vercel
 * region; swap for Redis/Upstash if the app is ever horizontally scaled.
 *
 * Only FAILED attempts count; a success clears the counter for that IP.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

const attempts = new Map<string, number[]>();

function prune(list: number[], now: number): number[] {
  return list.filter((t) => now - t < WINDOW_MS);
}

/** True if this IP is currently over the failure limit. */
export function isRateLimited(ip: string, now: number = Date.now()): boolean {
  const list = prune(attempts.get(ip) ?? [], now);
  attempts.set(ip, list);
  return list.length >= MAX_FAILURES;
}

/** Record a failed attempt; returns remaining attempts before lockout. */
export function recordFailure(ip: string, now: number = Date.now()): number {
  const list = prune(attempts.get(ip) ?? [], now);
  list.push(now);
  attempts.set(ip, list);
  return Math.max(0, MAX_FAILURES - list.length);
}

/** Clear an IP's failures after a successful login. */
export function clearFailures(ip: string): void {
  attempts.delete(ip);
}

/** Test-only: wipe all state. */
export function __resetRateLimiter(): void {
  attempts.clear();
}
