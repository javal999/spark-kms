import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env" });

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Resolve the `@/*` path alias in global-setup and specs.
  tsconfig: "./tsconfig.json",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Boot the app against the TEST database (migrated + seeded in global-setup).
  webServer: {
    command: `next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "",
      NODE_ENV: "development",
    },
  },
});
