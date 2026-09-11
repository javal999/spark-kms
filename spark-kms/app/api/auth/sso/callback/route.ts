import { type NextRequest } from "next/server";
import { unsealData } from "iron-session";
import { flags } from "@/src/lib/flags";
import {
  ssoConfig,
  discover,
  exchangeCode,
  verifyIdToken,
  claimsToIdentity,
  sanitizeNext,
} from "@/src/lib/sso";
import {
  findByOidOrEmail,
  bindOid,
  recordLogin,
} from "@/src/services/authorized-users";
import {
  getSession,
  VIEWER_TTL_SECONDS,
  ADMIN_TTL_SECONDS,
} from "@/src/lib/session";
import { captureError } from "@/src/lib/error-log";
import { relativeRedirect } from "@/src/lib/redirect";
import { isRateLimited, recordFailure, clearFailures } from "@/src/lib/rate-limit";
import { SSO_FLOW_COOKIE } from "@/app/api/auth/sso/start/route";

export const runtime = "nodejs";

type Flow = { verifier: string; state: string; nonce: string; next: string };

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Redirect back to /login with a status param; always clears the flow cookie.
 * Relative on purpose: req.url is the container's bind address in production
 * (TRD-2026-009 E17). */
function backToLogin(params: Record<string, string>) {
  const res = relativeRedirect("/login", params);
  res.cookies.set(SSO_FLOW_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/** GET /api/auth/sso/callback — validate the Entra response and sign the user in. */
export async function GET(req: NextRequest) {
  if (!flags.sso) return relativeRedirect("/login");

  const ip = clientIp(req);
  if (isRateLimited(ip)) return backToLogin({ e: "rate" });

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return backToLogin({ e: "sso" }); // user cancelled / IdP error

  const code = sp.get("code");
  const state = sp.get("state");
  const sealed = req.cookies.get(SSO_FLOW_COOKIE)?.value;
  if (!code || !state || !sealed) return backToLogin({ e: "sso" });

  // Unseal + CSRF check: the state in the URL must match the sealed one.
  let flow: Flow | null = null;
  try {
    flow = (await unsealData<Flow>(sealed, {
      password: process.env.SESSION_SECRET!,
      ttl: 600,
    })) as Flow;
  } catch {
    flow = null;
  }
  if (!flow || !flow.state || flow.state !== state) {
    return backToLogin({ e: "sso" });
  }

  // Exchange code + validate the id_token (sig/iss/aud/exp/nonce).
  const cfg = ssoConfig();
  let identity;
  try {
    const disc = await discover(cfg);
    const { id_token } = await exchangeCode(disc, cfg, { code, verifier: flow.verifier });
    const claims = await verifyIdToken(disc, cfg, id_token, flow.nonce);
    identity = claimsToIdentity(claims);
  } catch (err) {
    const traceId = await captureError(err, { route: "GET /api/auth/sso/callback" });
    recordFailure(ip);
    return backToLogin({ e: "sso", ref: traceId });
  }

  // E3 — authorization: allow-list is the gate. Not found or inactive → no session.
  const authorized = await findByOidOrEmail(identity.oid, identity.email);
  if (!authorized || !authorized.active) {
    return backToLogin({ denied: "1" });
  }

  await bindOid(authorized.id, identity.oid);
  await recordLogin(authorized.id, identity.name);

  const ttl = authorized.role === "viewer" ? VIEWER_TTL_SECONDS : ADMIN_TTL_SECONDS;
  const session = await getSession(ttl);
  session.role = authorized.role;
  session.userId = authorized.id;
  session.email = authorized.email;
  session.name = identity.name;
  session.viewerEpoch = undefined; // SSO sessions aren't tied to the viewer-password epoch
  await session.save();
  clearFailures(ip);

  const res = relativeRedirect(sanitizeNext(flow.next));
  res.cookies.set(SSO_FLOW_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
