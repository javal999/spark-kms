import type { SessionOptions } from "iron-session";

/**
 * Edge-safe session config: no `next/headers` import, so it can be used from the
 * proxy (Edge runtime) as well as Node route handlers.
 */

export type Role = "viewer" | "admin" | "super";

export interface SessionData {
  role?: Role;
  userId?: number;
  email?: string;
  name?: string;
  /** Viewer-password rotation epoch sealed at login; stale = logged out (REQ-A1). */
  viewerEpoch?: number;
}

// Sessions: 30 days viewers, 7 days admins (REQ-A4).
export const VIEWER_TTL_SECONDS = 30 * 24 * 60 * 60;
export const ADMIN_TTL_SECONDS = 7 * 24 * 60 * 60;

export const SESSION_COOKIE = "spark_session";

export function sessionOptions(ttlSeconds?: number): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 chars");
  }
  return {
    password,
    cookieName: SESSION_COOKIE,
    ttl: ttlSeconds,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ttlSeconds,
    },
  };
}

export function isAdmin(role: Role | undefined): boolean {
  return role === "admin" || role === "super";
}

export function isSuper(role: Role | undefined): boolean {
  return role === "super";
}
