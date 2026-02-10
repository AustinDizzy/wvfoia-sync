import type { Entry, EntrySearchOptions, PageCursor } from "$/lib/types";

export const ENTRY_SORT_OPTIONS: Record<string, string> = {
  newest_entry: "id DESC",
  newest_request: "request_date DESC",
  oldest_request: "request_date ASC",
  newest_completion: "completion_date DESC",
  highest_fee: "CAST(fee AS INTEGER) DESC"
};

export const ENTRY_SORT_CHOICES = [
  { value: "newest_entry", label: "newest entry" },
  { value: "newest_request", label: "newest request" },
  { value: "oldest_request", label: "oldest request" },
  { value: "newest_completion", label: "newest completion" },
  { value: "highest_fee", label: "highest fee" }
] as const;

const RESOLUTION_ORDER = ["granted", "granted in part", "exempted", "rejected", "other"] as const;

type ResolutionBucket = "granted" | "granted_in_part" | "exempted" | "rejected" | "other";

function normalizedResolution(resolution: string | null | undefined): string {
  const value = (resolution ?? "").trim().toLowerCase();
  return value || "other";
}

export function resolutionSortScore(resolution: string): number {
  const rank = RESOLUTION_ORDER.indexOf(normalizedResolution(resolution) as typeof RESOLUTION_ORDER[number]);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
}

export function resolutionBucketKey(resolution: string | null | undefined): ResolutionBucket {
  const normalized = normalizedResolution(resolution);
  if (normalized === "granted") return "granted";
  if (normalized === "granted in part") return "granted_in_part";
  if (normalized === "exempted") return "exempted";
  if (normalized === "rejected") return "rejected";
  return "other";
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s+|\/]/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function titlify(input: string, disableCapAcro = false): string {
  if (!disableCapAcro && !input.includes(" ") && !input.includes("-")) return input.toUpperCase();
  return input
    .replace(/-/g, " ")
    .replace(/'+/g, "'")
    .replace(/\b\w/g, (c, i, s) => (i && s[i - 1] === "'" ? c : c.toUpperCase()))
    .replace(/\b(?:'s|and|of|the|at|dba|for)\b/gi, (x, i) => (i === 0 ? x : x.toLowerCase()))
    .replace(/(-)+|(')+/g, (_, g1, g2) => g1 || g2);
}

function parseIntParam(value: string | null, fallback: number, min = 1): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed < min) return fallback;
  return parsed;
}

export function parseCursor(url: URL): PageCursor {
  return {
    page: parseIntParam(url.searchParams.get("page"), 1),
    pageSize: 50
  };
}

export function parseEntrySearchOptions(url: URL): EntrySearchOptions {
  const sort = (url.searchParams.get("sort") ?? "").trim();
  return {
    search: (url.searchParams.get("search") ?? "").trim(),
    agency: (url.searchParams.get("agency") ?? "").trim(),
    resolution: url.searchParams.getAll("resolution").filter(Boolean),
    requestDateFrom: url.searchParams.get("dateFrom") ?? "",
    requestDateTo: url.searchParams.get("dateTo") ?? "",
    completionDateFrom: url.searchParams.get("completionDateFrom") ?? "",
    completionDateTo: url.searchParams.get("completionDateTo") ?? "",
    sort: sort || "newest_entry"
  };
}

function parseDateLocal(value: string): Date | null {
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m = isoDay.exec(value);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const local = new Date(y, mo, d);
    if (!Number.isNaN(local.getTime())) return local;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function formatDate(value: string | null, short = false): string {
  if (!value) return "--";
  const parsed = parseDateLocal(value);
  if (!parsed) return "--";
  return parsed.toLocaleDateString("en-US", short
    ? { month: "short", day: "numeric", year: "numeric" }
    : { month: "long", day: "numeric", year: "numeric" });
}

export function formatCurrency(value: string | null): string {
  if (!value) return "--";
  const num = Number.parseFloat(value.replace(/[^0-9.-]+/g, ""));
  if (!Number.isFinite(num) || num === 0) return "--";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: num % 1 ? 2 : 0,
    maximumFractionDigits: 2
  });
}

export function formatRequestor(entry: Pick<Entry, "first_name" | "middle_name" | "last_name" | "organization">): string {
  const requestorName = [entry.first_name, entry.middle_name, entry.last_name].filter(Boolean).join(" ");
  return requestorName || entry.organization || "--";
}

export function diffDays(from: string | null, to: string | null): number {
  if (!from || !to) return -1;
  const fromDate = parseDateLocal(from);
  const toDate = parseDateLocal(to);
  if (!fromDate || !toDate) return -1;
  if (toDate.getFullYear() > new Date().getFullYear()) return -1;
  const raw = Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(raw)) return -1;
  return raw;
}

export function diffHuman(from: string | null, to: string | null): string {
  const total = diffDays(from, to);
  if (total < 0) return "--";
  if (total === 0) return "same day";

  const years = Math.floor(total / 365);
  const months = Math.floor((total % 365) / 30);
  const weeks = Math.floor(((total % 365) % 30) / 7);
  const days = ((total % 365) % 30) % 7;
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (weeks) parts.push(`${weeks} week${weeks === 1 ? "" : "s"}`);
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function fmtNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function buildPageNumbers(currentPage: number, totalPages: number, maxPages = 7): string[] {
  if (totalPages <= 1) return ["1"];
  const pages: string[] = ["1"];
  const slots = maxPages - 2;
  let start = Math.max(2, currentPage - Math.floor(slots / 2));
  let end = Math.min(totalPages - 1, start + slots - 1);
  start = Math.max(2, end - slots + 1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(String(i));
  if (end < totalPages - 1) pages.push("...");
  pages.push(String(totalPages));
  return pages;
}

export function formatTimeAgo(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const deltaMs = Date.now() - date.getTime();
  if (deltaMs < 60_000) return "just now";

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (deltaMs < hourMs) {
    const minutes = Math.floor(deltaMs / minuteMs);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (deltaMs < dayMs) {
    const hours = Math.floor(deltaMs / hourMs);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (deltaMs < monthMs) {
    const days = Math.floor(deltaMs / dayMs);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (deltaMs < yearMs) {
    const months = Math.floor(deltaMs / monthMs);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }

  const years = Math.floor(deltaMs / yearMs);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
