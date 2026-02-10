import { parse, type HTMLElement } from "node-html-parser";
import { getLatestEntryId } from "$/lib/data";
import { LAST_UPDATED_AT_CACHE_KEY } from "$/lib/db/constants";
import type { DbContext } from "$/lib/db/context";
import type { Entry, SyncResult } from "$/lib/types";

const ENTRY_URL = "https://erls.wvsos.gov/FOIA_Entry/SearchedEntryDetails";
const DRIFT_TOLERANCE = 3;
const QUERY_CACHE_KEY_PREFIX = "query-cache:";
const DRIZZLE_CACHE_KEY_PREFIX = "drizzle-cache:";

const ENTRY_COLUMNS: Array<keyof Entry> = [
  "id",
  "agency",
  "organization",
  "first_name",
  "middle_name",
  "last_name",
  "request_date",
  "completion_date",
  "entry_date",
  "fee",
  "is_amended",
  "subject",
  "details",
  "resolution",
  "response"
];

const UPSERT_SQL = `
  INSERT INTO entries (${ENTRY_COLUMNS.join(", ")})
  VALUES (${ENTRY_COLUMNS.map(() => "?").join(", ")})
  ON CONFLICT(id) DO UPDATE SET
    agency = excluded.agency,
    organization = excluded.organization,
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    request_date = excluded.request_date,
    completion_date = excluded.completion_date,
    entry_date = excluded.entry_date,
    fee = excluded.fee,
    is_amended = excluded.is_amended,
    subject = excluded.subject,
    details = excluded.details,
    resolution = excluded.resolution,
    response = excluded.response
`;

function normalizeKey(input: string): string {
  return input
    .replace(/:/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (mmddyyyy) {
    const month = mmddyyyy[1].padStart(2, "0");
    const day = mmddyyyy[2].padStart(2, "0");
    const year = mmddyyyy[3];
    return `${year}-${month}-${day}`;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;

  return null;
}

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function parseEntry(html: string, id: number): Entry | null {
  const valuesByKey: Record<string, string> = {};

  const root = parse(html);
  const labels = root.querySelectorAll(".content-col-label .content-div-var strong");
  const data = root.querySelectorAll(".content-col-data .content-div-var");
  const pairCount = Math.min(labels.length, data.length);

  for (let i = 0; i < pairCount; i += 1) {
    const key = normalizeKey(cleanText(labels[i].text));
    if (!key) continue;
    valuesByKey[key] = cleanText(data[i].text);
  }

  const panels = root.querySelectorAll(".container-requestitems .panel-body");
  for (const panel of panels) {
    const labelNode = panel.querySelector("strong") as HTMLElement | null;
    const valueNode = panel.querySelector("p") as HTMLElement | null;
    const key = normalizeKey(cleanText(labelNode?.text));
    if (!key || !valueNode) continue;
    valuesByKey[key] = cleanText(valueNode.text);
  }

  const amendedFlag = valuesByKey.amended ? 1 : 0;
  const agency = valuesByKey.agency || "Unknown";

  if (!Object.keys(valuesByKey).length) {
    return null;
  }

  return {
    id,
    agency,
    organization: valuesByKey.organization || null,
    first_name: valuesByKey.first_name || null,
    middle_name: valuesByKey.middle_name || null,
    last_name: valuesByKey.last_name || null,
    request_date: normalizeDate(valuesByKey.request_date || null),
    completion_date: normalizeDate(valuesByKey.completion_date || null),
    entry_date: normalizeDate(valuesByKey.entry_date || null),
    fee: valuesByKey.fee || null,
    is_amended: amendedFlag,
    subject: valuesByKey.subject || null,
    details: valuesByKey.details || null,
    resolution: valuesByKey.resolution || null,
    response: valuesByKey.response || null
  };
}

async function fetchRemoteEntry(id: number): Promise<Entry | null> {
  const url = new URL(ENTRY_URL);
  url.searchParams.set("entryId", String(id));

  const response = await fetch(url.toString(), {
    method: "GET",
    redirect: "manual",
    headers: {
      "User-Agent": "wv-sync-worker/1.0 (+https://github.com/AustinDizzy/wvfoia-sync)"
    }
  });

  if (response.status === 301 || response.status === 302 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch entry ${id}. HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseEntry(html, id);
}

async function upsertEntry(db: D1Database, entry: Entry): Promise<void> {
  const values = ENTRY_COLUMNS.map((column) => entry[column]);
  await db.prepare(UPSERT_SQL).bind(...values).run();
}

async function deleteKvPrefix(kv: KVNamespace, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 });
    await Promise.all(page.keys.map((key) => kv.delete(key.name)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

async function flushQueryCaches(kv: KVNamespace): Promise<void> {
  await Promise.all([
    deleteKvPrefix(kv, QUERY_CACHE_KEY_PREFIX),
    deleteKvPrefix(kv, DRIZZLE_CACHE_KEY_PREFIX)
  ]);
}

export async function runSync(ctx: DbContext): Promise<SyncResult> {
  const latestInDb = await getLatestEntryId(ctx);
  const driftTolerance = DRIFT_TOLERANCE;

  let currentId = latestInDb + 1;
  const startFrom = currentId;
  let missingInARow = 0;
  let checked = 0;
  let added = 0;

  while (missingInARow < driftTolerance) {
    checked += 1;

    const entry = await fetchRemoteEntry(currentId);
    if (entry) {
      await upsertEntry(ctx.db, entry);
      added += 1;
      missingInARow = 0;
    } else {
      missingInARow += 1;
    }

    currentId += 1;
  }

  if (added > 0) await flushQueryCaches(ctx.kv);
  await ctx.kv.put(LAST_UPDATED_AT_CACHE_KEY, new Date().toISOString());

  return {
    added,
    checked,
    startFrom,
    lastCheckedId: currentId - 1,
    driftTolerance
  };
}
