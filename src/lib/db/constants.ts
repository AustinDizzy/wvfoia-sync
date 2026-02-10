export const DRIZZLE_AGENCY_STATS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
export const AGENCIES_PAGE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
export const AGENCY_TIMELINE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
export const AGENCY_ENTRIES_CACHE_TTL_SECONDS = 60 * 60 * 24 * 3;
export const AGENCY_ALIASES_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
export const LAST_UPDATED_AT_CACHE_KEY = "meta:last_updated_at";

export const AGENCY_METRIC_KEYS = [
  "requests",
  "requests30d",
  "requests90d",
  "requests365d",
  "responseCount",
  "responseDaysSum",
  "responseCount30d",
  "responseDaysSum30d",
  "responseCount90d",
  "responseDaysSum90d",
  "responseCount365d",
  "responseDaysSum365d"
] as const;

export type MetricAccumulatorKey = typeof AGENCY_METRIC_KEYS[number];
