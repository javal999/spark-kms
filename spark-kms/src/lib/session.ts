import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/src/lib/session-config";

export type { Role, SessionData } from "@/src/lib/session-config";
export {
  VIEWER_TTL_SECONDS,
  ADMIN_TTL_SECONDS,
  SESSION_COOKIE,
  sessionOptions,
  isAdmin,
  isSuper,
} from "@/src/lib/session-config";

/**
 * Node-side session access (route handlers, server actions, server components).
 * Uses the async `cookies()` store from Next 16.
 */
export async function getSession(ttlSeconds?: number) {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions(ttlSeconds));
}

/** Read-only session for server components (does not need a ttl). */
export async function readSession(): Promise<SessionData> {
  const cookieStore = await cookies();
  const s = await getIronSession<SessionData>(cookieStore, sessionOptions());
  return {
    role: s.role,
    userId: s.userId,
    email: s.email,
    name: s.name,
    viewerEpoch: s.viewerEpoch,
  };
}
