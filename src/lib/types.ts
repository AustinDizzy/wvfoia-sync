import type { InferSelectModel } from "drizzle-orm";
import { entries } from "$/lib/db/schema";

export type Entry = InferSelectModel<typeof entries>;

export interface PaginatedResult<T> {
  entries: T[];
  total: number;
  totalPages: number;
}

export interface LatestEntriesSnapshot {
  date: string | null;
  entries: Entry[];
}

export interface PageCursor {
  page: number;
  pageSize: number;
}

export interface EntrySearchOptions {
  search: string;
  agency: string;
  resolution: string[];
  requestDateFrom: string;
  requestDateTo: string;
  completionDateFrom: string;
  completionDateTo: string;
  sort: string;
}

export interface AgencyStats {
  name: string;
  slug: string;
  requests: number;
  avgResponseTime: number;
  requests30d: number;
  requests90d: number;
  requests365d: number;
  avgResponseTime30d: number;
  avgResponseTime90d: number;
  avgResponseTime365d: number;
  resolutions: Record<string, number>;
}

export interface HomeStats {
  totalAll: number;
  total30d: number;
  total90d: number;
  total365d: number;
  avgAll: number;
  avg30d: number;
  avg90d: number;
  avg365d: number;
}

export interface ResolutionTimelinePoint {
  date: string;
  granted: number;
  granted_in_part: number;
  exempted: number;
  rejected: number;
  other: number;
}

export interface SyncResult {
  added: number;
  checked: number;
  startFrom: number;
  lastCheckedId: number;
  driftTolerance: number;
}
