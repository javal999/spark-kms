import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "./index";

config({ path: ".env" });

/**
 * Truncates all data tables (keeps schema + migrations) and restarts identity
 * sequences. Used by integration tests to get a clean slate between files, and
 * available as `npm run db:reset` for local dev.
 */
export async function truncateAll() {
  await db.execute(sql`
    TRUNCATE TABLE
      initiative_links, usage_events, usage_daily,
      score_events, stage_changes, action_items, entries, edit_log,
      upload_batches, api_keys, people, initiatives, users, app_config
    RESTART IDENTITY CASCADE
  `);
}

async function main() {
  await truncateAll();
  console.log("All tables truncated.");
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("reset.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
