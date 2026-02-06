import { entries } from "$/lib/db/schema";
import type { DbContext } from "$/lib/db/context";
import type { Entry, EntrySearchOptions, HomeStats, LatestEntriesSnapshot, PageCursor, PaginatedResult } from "$/lib/types";
import { ENTRY_SORT_OPTIONS, diffDays } from "$/lib/utils";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { withQueryResultCache } from "$/lib/db/query-cache";
import { AGENCY_ENTRIES_CACHE_TTL_SECONDS } from "$/lib/db/constants";
import { correctedDateExpr, normalizeEntry, resolveAgencyAliases } from "$/lib/db/shared";

const FTS_TABLE_NAME = "entries_fts";

function buildFtsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  if (!terms.length) return null;
  return terms.map((term) => `${term}*`).join(" AND ");
}

function appendTextSearchFilter(where: Array<ReturnType<typeof sql>>, searchText: string): void {
  const ftsQuery = buildFtsQuery(searchText);
  if (!ftsQuery) return;
  where.push(sql`${entries.id} IN (SELECT rowid FROM ${sql.raw(FTS_TABLE_NAME)} WHERE ${sql.raw(FTS_TABLE_NAME)} MATCH ${ftsQuery})`);
}

function bindWhere(
  search: EntrySearchOptions,
  exactAgencyCandidates: string[] | null = null
): ReturnType<typeof and> | undefined {
  const where: Array<ReturnType<typeof sql>> = [];

  if (search.agency) {
    const candidates = [...new Set((exactAgencyCandidates ?? [search.agency]).map((value) => value.trim()).filter(Boolean))];
    if (candidates.length > 0) {
      const matches = candidates.map((candidate) => sql`${entries.agency} = ${candidate} COLLATE NOCASE`);
      where.push(sql`(${sql.join(matches, sql` OR `)})`);
    }
  }
  if (search.resolution.length > 0) {
    where.push(inArray(entries.resolution, search.resolution));
  }
  if (search.requestDateFrom) {
    const requestDate = correctedDateExpr("request_date");
    where.push(sql`${requestDate} >= ${search.requestDateFrom}`);
  }
  if (search.requestDateTo) {
    const requestDate = correctedDateExpr("request_date");
    where.push(sql`${requestDate} <= ${search.requestDateTo}`);
  }
  if (search.completionDateFrom) {
    const completionDate = correctedDateExpr("completion_date");
    where.push(sql`${completionDate} >= ${search.completionDateFrom}`);
  }
  if (search.completionDateTo) {
    const completionDate = correctedDateExpr("completion_date");
    where.push(sql`${completionDate} <= ${search.completionDateTo}`);
  }

  if (search.search) appendTextSearchFilter(where, search.search);
  return where.length > 0 ? and(...where) : undefined;
}

function getOrderBy(sort: string): ReturnType<typeof sql> {
  switch (sort) {
    case "newest_request": {
      const requestDate = correctedDateExpr("request_date");
      return sql`${requestDate} DESC`;
    }
    case "oldest_request": {
      const requestDate = correctedDateExpr("request_date");
      return sql`${requestDate} ASC`;
    }
    case "newest_completion": {
      const completionDate = correctedDateExpr("completion_date");
      return sql`${completionDate} DESC`;
    }
    case "highest_fee":
      return sql.raw(ENTRY_SORT_OPTIONS.highest_fee);
    case "newest_entry":
    default:
      return sql.raw(ENTRY_SORT_OPTIONS.newest_entry);
  }
}

export async function listEntries(
  ctx: DbContext,
  search: EntrySearchOptions,
  cursor: PageCursor,
  forcedAgency?: string
): Promise<PaginatedResult<Entry>> {
  const scoped: EntrySearchOptions = {
    ...search,
    agency: forcedAgency ?? search.agency
  };

  const exactCandidates = scoped.agency ? await resolveAgencyAliases(ctx, scoped.agency) : null;

  const computePage = async (): Promise<PaginatedResult<Entry>> => {
    const whereClause = bindWhere(scoped, exactCandidates);
    const countRows = await ctx.orm.select({ c: sql<number>`COUNT(*)` })
      .from(entries)
      .where(whereClause);
    const total = Number(countRows[0]?.c ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / cursor.pageSize));
    const page = Math.min(Math.max(1, cursor.page), totalPages);
    const offset = (page - 1) * cursor.pageSize;

    const orderBy = getOrderBy(scoped.sort);
    const rows = await ctx.orm.select()
      .from(entries)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(cursor.pageSize)
      .offset(offset);

    return {
      entries: rows.map((row) => normalizeEntry(row as unknown as Record<string, unknown>)),
      total,
      totalPages
    };
  };

  if (!forcedAgency) return computePage();

  return withQueryResultCache(
    ctx,
    "agency-list-entries",
    AGENCY_ENTRIES_CACHE_TTL_SECONDS,
    {
      scoped,
      cursor,
      exactCandidates,
      forcedAgency: forcedAgency ?? ""
    },
    computePage
  );
}

export async function getEntryById(ctx: DbContext, id: number): Promise<Entry | null> {
  const rows = await ctx.orm.select().from(entries).where(eq(entries.id, id)).limit(1);
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? normalizeEntry(row) : null;
}

export async function getLatestEntryId(ctx: DbContext): Promise<number> {
  const rows = await ctx.orm.select({ latest_id: sql<number>`COALESCE(MAX(${entries.id}), 0)` }).from(entries);
  return Number(rows[0]?.latest_id ?? 0);
}

export async function latestEntriesByLastReportedDate(ctx: DbContext): Promise<LatestEntriesSnapshot> {
  const latestRows = await ctx.orm.select({ latest_date: sql<string | null>`MAX(${entries.entry_date})` })
    .from(entries)
    .where(and(isNotNull(entries.entry_date), ne(entries.entry_date, "")));
  const latestDate = latestRows[0]?.latest_date ?? null;
  if (!latestDate) {
    return { date: null, entries: [] };
  }

  const rows = await ctx.orm.select()
    .from(entries)
    .where(eq(entries.entry_date, latestDate))
    .orderBy(sql`${entries.id} DESC`);

  return {
    date: latestDate,
    entries: rows.map((row) => normalizeEntry(row as unknown as Record<string, unknown>))
  };
}

export async function distinctResolutions(ctx: DbContext): Promise<string[]> {
  const rows = await ctx.orm.select({ resolution: entries.resolution })
    .from(entries)
    .where(isNotNull(entries.resolution))
    .groupBy(entries.resolution)
    .orderBy(entries.resolution);
  return rows.map((x) => x.resolution).filter(Boolean) as string[];
}

export async function resolutionCounts(ctx: DbContext): Promise<Record<string, number>> {
  const rows = await ctx.orm.select({
    resolution: entries.resolution,
    c: sql<number>`COUNT(*)`
  })
    .from(entries)
    .where(isNotNull(entries.resolution))
    .groupBy(entries.resolution)
    .orderBy(entries.resolution);
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!row.resolution) continue;
    out[row.resolution] = Number(row.c ?? 0);
  }
  return out;
}

export async function homeStats(ctx: DbContext): Promise<HomeStats> {
  const rows = await ctx.orm.select({
    request_date: entries.request_date,
    completion_date: entries.completion_date
  }).from(entries);
  const now = new Date();
  const t30 = new Date(now); t30.setDate(now.getDate() - 30);
  const t90 = new Date(now); t90.setDate(now.getDate() - 90);
  const t365 = new Date(now); t365.setDate(now.getDate() - 365);

  let total30d = 0;
  let total90d = 0;
  let total365d = 0;
  const allTimes: number[] = [];
  const times30: number[] = [];
  const times90: number[] = [];
  const times365: number[] = [];

  for (const row of rows) {
    const request = row.request_date ? new Date(row.request_date) : null;
    if (request && request >= t30) total30d++;
    if (request && request >= t90) total90d++;
    if (request && request >= t365) total365d++;

    const d = diffDays(row.request_date, row.completion_date);
    if (d >= 0) {
      allTimes.push(d);
      if (request && request >= t30) times30.push(d);
      if (request && request >= t90) times90.push(d);
      if (request && request >= t365) times365.push(d);
    }
  }

  const avg = (vals: number[]): number => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  return {
    totalAll: rows.length,
    total30d,
    total90d,
    total365d,
    avgAll: avg(allTimes),
    avg30d: avg(times30),
    avg90d: avg(times90),
    avg365d: avg(times365)
  };
}
