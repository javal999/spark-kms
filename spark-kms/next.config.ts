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
};

export default nextConfig;
