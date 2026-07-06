import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app; a parent lockfile exists in the repo,
  // and Next would otherwise infer the wrong root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
