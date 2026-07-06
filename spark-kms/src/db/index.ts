import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazy Drizzle client. The connection (and the DATABASE_URL check) is deferred
 * until the FIRST query — so importing `db` never requires the env var. This
 * matters for `next build`, which imports route modules to collect metadata
 * with no database available. Cached on globalThis so dev hot-reload and the
 * per-request module graph reuse one pool.
 */
const globalForDb = globalThis as unknown as {
  __sparkSql?: ReturnType<typeof postgres>;
  __sparkDb?: PostgresJsDatabase<typeof schema>;
};

function initDb(): PostgresJsDatabase<typeof schema> {
  if (globalForDb.__sparkDb) return globalForDb.__sparkDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const client =
    globalForDb.__sparkSql ?? postgres(connectionString, { max: 10 });
  const instance = drizzle(client, { schema });
  globalForDb.__sparkSql = client;
  globalForDb.__sparkDb = instance;
  return instance;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = initDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Db = PostgresJsDatabase<typeof schema>;
export { schema };
