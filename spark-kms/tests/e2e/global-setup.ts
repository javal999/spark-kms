import { execSync } from "node:child_process";
import { config } from "dotenv";

/**
 * Playwright global setup: migrate + reset + seed the TEST database to a clean
 * seeded baseline (2 admins + viewer password). Runs the existing db:* scripts
 * via tsx (which resolves the `@/*` alias); an explicitly-passed DATABASE_URL
 * wins over the scripts' --env-file (Node's --env-file never overrides existing
 * process.env), so this only ever touches the test db.
 */
export default async function globalSetup() {
  config({ path: ".env" });
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL not set");

  const env = { ...process.env, DATABASE_URL: testUrl };
  const run = (script: string) =>
    execSync(`npm run ${script}`, { stdio: "inherit", env });

  run("db:migrate");
  run("db:reset");
  run("db:seed");
}
