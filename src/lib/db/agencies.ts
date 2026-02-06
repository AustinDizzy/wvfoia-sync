import { entries } from "$/lib/db/schema";
import type { DbContext } from "$/lib/db/context";
import type { AgencyStats, PageCursor, PaginatedResult, ResolutionTimelinePoint } from "$/lib/types";
import { resolutionBucketKey } from "$/lib/utils";
import { and, isNotNull, ne, sql } from "drizzle-orm";
import { withQueryResultCache } from "$/lib/db/query-cache";
import {
  AGENCIES_PAGE_CACHE_TTL_SECONDS,
  AGENCY_METRIC_KEYS,
  AGENCY_TIMELINE_CACHE_TTL_SECONDS,
  DRIZZLE_AGENCY_STATS_CACHE_TTL_SECONDS,
  type MetricAccumulatorKey
} from "$/lib/db/constants";
import {
  agencyIdentity,
  avgFromParts,
  candidateAgencyWhere,
  resolveAgencyAliases
} from "$/lib/db/shared";

type AgencyStatsBucket = {
  name: string;
  slug: string;
  resolutions: Record<string, number>;
} & Record<MetricAccumulatorKey, number>;

const ZERO_AGENCY_METRICS = Object.freeze(
  Object.fromEntries(AGENCY_METRIC_KEYS.map((key) => [key, 0])) as Record<MetricAccumulatorKey, number>
);

const AGENCY_SORTERS: Record<string, (a: AgencyStats, b: AgencyStats) => number> = {
  most_requests: (a, b) => b.requests - a.requests,
  least_requests: (a, b) => a.requests - b.requests,
  highest_response_time: (a, b) => b.avgResponseTime - a.avgResponseTime,
  lowest_response_time: (a, b) => a.avgResponseTime - b.avgResponseTime
};

function createAgencyBucket(name: string, slug: string): AgencyStatsBucket {
  return {
    name,
    slug,
    ...ZERO_AGENCY_METRICS,
    resolutions: {}
  };
}

function accumulateAgencyMetrics(bucket: AgencyStatsBucket, row: Record<MetricAccumulatorKey, unknown>): void {
  for (const key of AGENCY_METRIC_KEYS) {
    bucket[key] += Number(row[key] ?? 0);
  }
}

async function computeAgencyStats(ctx: DbContext): Promise<AgencyStats[]> {
  const requestCountSql = (days: number) =>
    sql<number>`SUM(CASE WHEN ${entries.request_date} >= date('now', '-' || ${days} || ' day') THEN 1 ELSE 0 END)`;
  const responseCountSql = (days?: number) => {
    if (days === undefined) {
      return sql<number>`SUM(CASE WHEN ${entries.request_date} IS NOT NULL AND ${entries.completion_date} IS NOT NULL AND julianday(${entries.completion_date}) >= julianday(${entries.request_date}) THEN 1 ELSE 0 END)`;
    }
    return sql<number>`SUM(CASE WHEN ${entries.request_date} >= date('now', '-' || ${days} || ' day') AND ${entries.completion_date} IS NOT NULL AND julianday(${entries.completion_date}) >= julianday(${entries.request_date}) THEN 1 ELSE 0 END)`;
  };
  const responseDaysSumSql = (days?: number) => {
    if (days === undefined) {
      return sql<number>`SUM(CASE WHEN ${entries.request_date} IS NOT NULL AND ${entries.completion_date} IS NOT NULL AND julianday(${entries.completion_date}) >= julianday(${entries.request_date}) THEN (julianday(${entries.completion_date}) - julianday(${entries.request_date})) ELSE 0 END)`;
    }
    return sql<number>`SUM(CASE WHEN ${entries.request_date} >= date('now', '-' || ${days} || ' day') AND ${entries.completion_date} IS NOT NULL AND julianday(${entries.completion_date}) >= julianday(${entries.request_date}) THEN (julianday(${entries.completion_date}) - julianday(${entries.request_date})) ELSE 0 END)`;
  };

  const metricsRows = await ctx.orm.select({
    agency: entries.agency,
    requests: sql<number>`COUNT(*)`,
    requests30d: requestCountSql(30),
    requests90d: requestCountSql(90),
    requests365d: requestCountSql(365),
    responseCount: responseCountSql(),
    responseDaysSum: responseDaysSumSql(),
    responseCount30d: responseCountSql(30),
    responseDaysSum30d: responseDaysSumSql(30),
    responseCount90d: responseCountSql(90),
    responseDaysSum90d: responseDaysSumSql(90),
    responseCount365d: responseCountSql(365),
    responseDaysSum365d: responseDaysSumSql(365)
  }).from(entries).groupBy(entries.agency).$withCache({
    tag: "agency_stats_metrics",
    autoInvalidate: true,
    config: {
      ex: DRIZZLE_AGENCY_STATS_CACHE_TTL_SECONDS
    }
  });

  const resolutionRows = await ctx.orm.select({
    agency: entries.agency,
    resolution: entries.resolution,
    c: sql<number>`COUNT(*)`
  }).from(entries).where(
    and(
      isNotNull(entries.resolution),
      ne(entries.resolution, "")
    )
  ).groupBy(entries.agency, entries.resolution).$withCache({
    tag: "agency_stats_resolutions",
    autoInvalidate: true,
    config: {
      ex: DRIZZLE_AGENCY_STATS_CACHE_TTL_SECONDS
    }
  });

  const map = new Map<string, AgencyStatsBucket>();

  for (const row of metricsRows) {
    const { name, slug } = agencyIdentity(String(row.agency ?? ""));
    const bucket = map.get(slug) ?? createAgencyBucket(name, slug);
    accumulateAgencyMetrics(bucket, row as unknown as Record<MetricAccumulatorKey, unknown>);
    map.set(slug, bucket);
  }

  for (const row of resolutionRows) {
    if (!row.resolution) continue;
    const { name, slug } = agencyIdentity(row.agency);
    const bucket = map.get(slug) ?? createAgencyBucket(name, slug);
    bucket.resolutions[row.resolution] = (bucket.resolutions[row.resolution] ?? 0) + Number(row.c ?? 0);
    map.set(slug, bucket);
  }

  return [...map.values()].map((bucket) => {
    return {
      name: bucket.name,
      slug: bucket.slug,
      requests: bucket.requests,
      avgResponseTime: avgFromParts(bucket.responseDaysSum, bucket.responseCount),
      requests30d: bucket.requests30d,
      requests90d: bucket.requests90d,
      requests365d: bucket.requests365d,
      avgResponseTime30d: avgFromParts(bucket.responseDaysSum30d, bucket.responseCount30d),
      avgResponseTime90d: avgFromParts(bucket.responseDaysSum90d, bucket.responseCount90d),
      avgResponseTime365d: avgFromParts(bucket.responseDaysSum365d, bucket.responseCount365d),
      resolutions: bucket.resolutions
    };
  });
}

export async function agencyStats(ctx: DbContext): Promise<AgencyStats[]> {
  return computeAgencyStats(ctx);
}

export async function agenciesPage(
  ctx: DbContext,
  search: string,
  sort: string,
  cursor: PageCursor
): Promise<PaginatedResult<AgencyStats>> {
  return withQueryResultCache(
    ctx,
    "agencies-page",
    AGENCIES_PAGE_CACHE_TTL_SECONDS,
    { search, sort, cursor },
    async () => {
      const stats = await agencyStats(ctx);
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      const filtered = stats.filter((agency) => {
        if (!terms.length) return true;
        const text = `${agency.name} ${agency.slug}`.toLowerCase();
        return terms.every((t) => text.includes(t));
      });
      filtered.sort(AGENCY_SORTERS[sort] ?? AGENCY_SORTERS.most_requests);

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / cursor.pageSize));
      const page = Math.min(Math.max(1, cursor.page), totalPages);
      const start = (page - 1) * cursor.pageSize;

      return {
        entries: filtered.slice(start, start + cursor.pageSize),
        total,
        totalPages
      };
    }
  );
}

export async function agencyBySlug(ctx: DbContext, slug: string): Promise<AgencyStats | null> {
  const all = await agencyStats(ctx);
  return all.find((x) => x.slug === slug || x.name === slug) ?? null;
}

export async function agencyResolutionTimeline(
  ctx: DbContext,
  agencyName: string,
  days: number | null = 180
): Promise<ResolutionTimelinePoint[]> {
  return withQueryResultCache(
    ctx,
    "agency-resolution-timeline",
    AGENCY_TIMELINE_CACHE_TTL_SECONDS,
    { agencyName, days },
    async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const nowIso = now.toISOString().slice(0, 10);

      const candidates = await resolveAgencyAliases(ctx, agencyName);
      if (!candidates.length) return [];
      const candidateWhere = candidateAgencyWhere(candidates);
      let startIso = nowIso;

      if (typeof days === "number") {
        const start = new Date(now);
        start.setDate(now.getDate() - days);
        startIso = start.toISOString().slice(0, 10);
      } else {
        const minRows = await ctx.orm.select({
          min_completion_date: sql<string | null>`MIN(${entries.completion_date})`
        })
          .from(entries)
          .where(and(
            isNotNull(entries.completion_date),
            sql`${entries.completion_date} <= ${nowIso}`,
            candidateWhere
          ));
        const minRow = minRows[0];

        if (minRow?.min_completion_date && minRow.min_completion_date <= nowIso) {
          startIso = minRow.min_completion_date;
        }
      }

      const rows = await ctx.orm.select({
        completion_date: entries.completion_date,
        resolution: entries.resolution,
        c: sql<number>`COUNT(*)`
      })
        .from(entries)
        .where(and(
          isNotNull(entries.completion_date),
          sql`${entries.completion_date} <= ${nowIso}`,
          sql`${entries.completion_date} >= ${startIso}`,
          candidateWhere
        ))
        .groupBy(entries.completion_date, entries.resolution);

      const map = new Map<string, { granted: number; granted_in_part: number; exempted: number; rejected: number; other: number }>();
      for (const row of rows) {
        if (!row.completion_date) continue;
        const d = row.completion_date;
        const bucket = map.get(d) ?? { granted: 0, granted_in_part: 0, exempted: 0, rejected: 0, other: 0 };
        const key = resolutionBucketKey(row.resolution);
        const count = Number(row.c ?? 0);
        bucket[key] += count;
        map.set(d, bucket);
      }

      const result: ResolutionTimelinePoint[] = [];
      const dateCursor = new Date(startIso);
      while (dateCursor <= now) {
        const d = dateCursor.toISOString().slice(0, 10);
        const counts = map.get(d) ?? { granted: 0, granted_in_part: 0, exempted: 0, rejected: 0, other: 0 };
        result.push({ date: d, ...counts });
        dateCursor.setDate(dateCursor.getDate() + 1);
      }
      return result;
    }
  );
}
