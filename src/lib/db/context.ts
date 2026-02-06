import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { CloudflareKvCache } from "$/lib/db/cache";

export interface DbEnv {
  DB: D1Database;
  DB_CACHE: KVNamespace;
}

export interface DbContext {
  db: D1Database;
  orm: DrizzleD1Database;
  kv: KVNamespace;
}

export function createDbContext(env: DbEnv): DbContext {
  const cache = new CloudflareKvCache(env.DB_CACHE);
  const orm = drizzle(env.DB, { cache });

  return {
    db: env.DB,
    orm,
    kv: env.DB_CACHE
  };
}
