import { LAST_UPDATED_AT_CACHE_KEY } from "$/lib/db/constants";
import { formatTimeAgo } from "$/lib/utils";

type MetaLocals = {
  runtime: { env: { DB_CACHE?: KVNamespace; LAST_UPDATED_AT_TEST?: string } };
  lastDataUpdatedAtIso?: string | null;
};

export async function getLastUpdatedMeta(locals: unknown): Promise<{ ago: string | null; title: string }> {
  const meta = locals as MetaLocals;
  const testValue = meta.runtime.env.LAST_UPDATED_AT_TEST?.trim();
  if (testValue) {
    meta.lastDataUpdatedAtIso = testValue === "now" ? new Date().toISOString() : testValue;
  } else if (typeof meta.lastDataUpdatedAtIso === "undefined") {
    meta.lastDataUpdatedAtIso = await meta.runtime.env.DB_CACHE?.get(LAST_UPDATED_AT_CACHE_KEY) ?? null;
  }

  const iso = meta.lastDataUpdatedAtIso ?? null;
  return {
    ago: formatTimeAgo(iso),
    title: iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : ""
  };
}
