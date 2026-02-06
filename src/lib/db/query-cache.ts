import type { DbContext } from "$/lib/db/context";

const QUERY_CACHE_KEY_PREFIX = "query-cache:";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

async function hashCacheKeyData(scope: string, keyData: Record<string, unknown>): Promise<string> {
  const input = `${scope}:${stableStringify(keyData)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function withQueryResultCache<T>(
  ctx: DbContext,
  scope: string,
  cacheTtlSeconds: number,
  keyData: Record<string, unknown>,
  compute: () => Promise<T>
): Promise<T> {
  const cacheKey = `${QUERY_CACHE_KEY_PREFIX}${scope}:${await hashCacheKeyData(scope, keyData)}`;
  const raw = await ctx.kv.get(cacheKey, "text");
  if (raw) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Ignore malformed payloads and refresh cache from source query.
    }
  }

  const result = await compute();
  await ctx.kv.put(cacheKey, JSON.stringify(result), { expirationTtl: cacheTtlSeconds });
  return result;
}
