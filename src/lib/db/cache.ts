import type { CacheConfig } from "drizzle-orm/cache/core/types";
import { Cache } from "drizzle-orm/cache/core";
import type { MutationOption } from "drizzle-orm/cache/core/cache";

const QUERY_PREFIX = "query:";
const TABLE_INDEX_PREFIX = "table:";
const TAG_INDEX_PREFIX = "tag:";

export class CloudflareKvCache extends Cache {
  constructor(private readonly kv: KVNamespace, private readonly prefix = "drizzle-cache:") {
    super();
  }

  override strategy(): "explicit" {
    return "explicit";
  }

  override async get(key: string): Promise<any[] | undefined> {
    const raw = await this.kv.get(this.queryKey(key), "text");
    if (!raw) return undefined;

    try {
      return JSON.parse(raw) as any[];
    } catch {
      return undefined;
    }
  }

  override async put(
    hashedQuery: string,
    response: any,
    tables: string[],
    isTag: boolean,
    config?: CacheConfig
  ): Promise<void> {
    const payload = JSON.stringify(response);
    const expirationTtl = ttlFromConfig(config);
    await this.kv.put(this.queryKey(hashedQuery), payload, expirationTtl ? { expirationTtl } : undefined);

    const indexWrites: Promise<void>[] = [];
    if (isTag) {
      indexWrites.push(this.appendToIndex(this.tagIndexKey(hashedQuery), hashedQuery));
    }

    for (const table of tables) {
      indexWrites.push(this.appendToIndex(this.tableIndexKey(table), hashedQuery));
    }

    await Promise.all(indexWrites);
  }

  override async onMutate(params: MutationOption): Promise<void> {
    const tags = toStringArray(params.tags);
    const tables = toStringArray(params.tables);

    const invalidateTasks: Promise<void>[] = [];
    for (const table of tables) {
      invalidateTasks.push(this.invalidateIndex(this.tableIndexKey(table)));
    }
    for (const tag of tags) {
      invalidateTasks.push(this.invalidateIndex(this.tagIndexKey(tag)));
    }

    await Promise.all(invalidateTasks);
  }

  private async appendToIndex(indexKey: string, cacheKey: string): Promise<void> {
    const raw = await this.kv.get(indexKey, "text");
    const existing = raw ? safeJsonArray(raw) : [];
    if (existing.includes(cacheKey)) return;
    existing.push(cacheKey);
    await this.kv.put(indexKey, JSON.stringify(existing));
  }

  private async invalidateIndex(indexKey: string): Promise<void> {
    const raw = await this.kv.get(indexKey, "text");
    if (!raw) return;

    const cacheKeys = safeJsonArray(raw);
    await Promise.all(cacheKeys.map((cacheKey) => this.kv.delete(this.queryKey(cacheKey))));
    await this.kv.delete(indexKey);
  }

  private queryKey(key: string): string {
    return `${this.prefix}${QUERY_PREFIX}${key}`;
  }

  private tableIndexKey(table: string): string {
    return `${this.prefix}${TABLE_INDEX_PREFIX}${table}`;
  }

  private tagIndexKey(tag: string): string {
    return `${this.prefix}${TAG_INDEX_PREFIX}${tag}`;
  }
}

function safeJsonArray(input: string): string[] {
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function toStringArray(input: MutationOption["tables"] | MutationOption["tags"]): string[] {
  if (!input) return [];

  const values = Array.isArray(input) ? input : [input];
  const out: string[] = [];

  for (const value of values) {
    if (typeof value === "string") {
      out.push(value);
      continue;
    }

    const maybeName = (value as { _?: { name?: unknown } })._?.name;
    if (typeof maybeName === "string") {
      out.push(maybeName);
    }
  }

  return out;
}

function ttlFromConfig(config?: CacheConfig): number | undefined {
  if (!config) return undefined;

  if (typeof config.ex === "number" && config.ex > 0) {
    return Math.ceil(config.ex);
  }

  if (typeof config.px === "number" && config.px > 0) {
    return Math.ceil(config.px / 1000);
  }

  const nowMs = Date.now();
  if (typeof config.exat === "number") {
    const ttl = config.exat - Math.floor(nowMs / 1000);
    return ttl > 0 ? ttl : undefined;
  }

  if (typeof config.pxat === "number") {
    const ttl = Math.ceil((config.pxat - nowMs) / 1000);
    return ttl > 0 ? ttl : undefined;
  }

  return undefined;
}
