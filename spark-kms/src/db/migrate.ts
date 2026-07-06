import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

config({ path: ".env" });

/**
 * Applies all generated migrations. Ensures the pg_trgm extension exists first
 * (the initiatives trigram index depends on it) so a fresh database migrates
 * cleanly without a manual step.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = postgres(url, { max: 1 });
  await client`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  const dbc = drizzle(client);
  await migrate(dbc, { migrationsFolder: "./src/db/migrations" });
  await client.end();
  console.log("Migrations applied to", url.replace(/:\/\/.*@/, "://***@"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
