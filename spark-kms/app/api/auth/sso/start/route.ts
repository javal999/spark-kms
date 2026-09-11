import { NextResponse, type NextRequest } from "next/server";
import { sealData } from "iron-session";
import { flags } from "@/src/lib/flags";
import { relativeRedirect } from "@/src/lib/redirect";
import {
  ssoConfig,
  discover,
  makePkce,
  randomToken,
  sanitizeNext,
  buildAuthUrl,
} from "@/src/lib/sso";

export const runtime = "nodejs";

/** Short-lived sealed cookie carrying the PKCE verifier + state + nonce + next. */
export const SSO_FLOW_COOKIE = "spark_sso_flow";
const FLOW_TTL = 600; // 10 min to complete sign-in

/** GET /api/auth/sso/start — begin the Entra auth-code+PKCE flow. */
export async function GET(req: NextRequest) {
  if (!flags.sso) return relativeRedirect("/login");

  const cfg = ssoConfig(); // throws SsoConfigError if env missing
  const disc = await discover(cfg);
  const { verifier, challenge } = makePkce();
  const state = randomToken();
  const nonce = randomToken();
  const next = sanitizeNext(req.nextUrl.searchParams.get("next"));

  const sealed = await sealData(
    { verifier, state, nonce, next },
    { password: process.env.SESSION_SECRET!, ttl: FLOW_TTL },
  );

  const res = NextResponse.redirect(buildAuthUrl(disc, cfg, { state, nonce, challenge }));
  res.cookies.set(SSO_FLOW_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: FLOW_TTL,
  });
  return res;
}
