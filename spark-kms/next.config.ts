import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Minimal self-contained server bundle for the Docker/App Runner image.
  output: "standalone",
  // Pin the workspace/tracing root to this app; a parent lockfile exists in the
  // repo, and Next would otherwise infer the wrong root (and over-trace files).
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
  // Do NOT set `skipProxyUrlNormalize` (or the deprecated
  // `skipMiddlewareUrlNormalize`). `proxy.ts` builds an absolute redirect from
  // `req.nextUrl`, and behind the Lightsail proxy that origin is the container's
  // bind address. Every gated page redirect is correct only because Next strips
  // the origin from a same-origin redirect, and that rewrite is gated on this
  // option — turning it on sends the whole page auth perimeter to
  // `http://0.0.0.0:8080/login`, which is TRD-2026-009 E17 all over again.
  // `tests/unit/sso-redirects.test.ts` fails if either option appears here.
};

export default nextConfig;
