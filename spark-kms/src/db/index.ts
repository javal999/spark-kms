import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Single Drizzle client over postgres.js. Cached on globalThis so Next's dev
 * hot-reload doesn't open a new pool on every change.
 */
const globalForDb = globalThis as unknown as {
  __sparkSql?: ReturnType<typeof postgres>;
};

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const sql =
  globalForDb.__sparkSql ?? postgres(connectionString, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__sparkSql = sql;
}

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { schema };
