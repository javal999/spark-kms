import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { config } from "dotenv";
import path from "node:path";

// Tests read TEST_DATABASE_URL; fall back to a dedicated test db so we never
// touch the dev database.
config({ path: ".env" });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Integration tests share one Postgres test db; run serially to avoid
    // cross-file row contention.
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
    },
  },
});
