import { agencyNameCandidates, applyCorrections, getDateCorrections, normalizeAgencyName } from "$/lib/corrections";
import { entries } from "$/lib/db/schema";
import type { DbContext } from "$/lib/db/context";
import type { Entry } from "$/lib/types";
import { slugify, titlify } from "$/lib/utils";
import { and, isNotNull, ne, sql } from "drizzle-orm";
import { AGENCY_ALIASES_CACHE_TTL_SECONDS } from "$/lib/db/constants";
import { withQueryResultCache } from "$/lib/db/query-cache";

export function avgFromParts(sum: number, count: number): number {
  return count ? sum / count : 0;
}

export function agencyIdentity(rawAgency: string): { name: string; slug: string } {
  const canonicalAgency = normalizeAgencyName(rawAgency);
  const name = titlify(canonicalAgency);
  const slug = slugify(name);
  return { name, slug };
}

export function normalizeEntry(row: Record<string, unknown>): Entry {
  return applyCorrections(row as unknown as Entry);
}

export async function resolveAgencyAliases(ctx: DbContext, agency: string): Promise<string[]> {
  return withQueryResultCache(
    ctx,
    "agency-aliases",
    AGENCY_ALIASES_CACHE_TTL_SECONDS,
    { agency },
    async () => {
      const seed = [...new Set([...agencyNameCandidates(agency), agency].map((value) => value.trim()).filter(Boolean))];
      if (!seed.length) return [];

      const matches = seed.map((candidate) => sql`${entries.agency} = ${candidate} COLLATE NOCASE`);
      const rows = await ctx.orm.select({ agency: entries.agency })
        .from(entries)
        .where(and(
          isNotNull(entries.agency),
          ne(entries.agency, ""),
          sql`(${sql.join(matches, sql` OR `)})`
        ))
        .groupBy(entries.agency)
        .orderBy(entries.agency);

      return [...new Set([...seed, ...rows.map((row) => row.agency).filter(Boolean)])];
    }
  );
}

export function candidateAgencyWhere(candidates: string[]): ReturnType<typeof sql> {
  return sql`(${sql.join(candidates.map((candidate) => sql`${entries.agency} = ${candidate} COLLATE NOCASE`), sql` OR `)})`;
}

export function correctedDateExpr(column: "request_date" | "completion_date"): ReturnType<typeof sql> {
  const overrides = getDateCorrections().filter((entry) => column === "request_date" ? entry.requestDate : entry.completionDate);
  const columnExpr = column === "request_date" ? entries.request_date : entries.completion_date;
  if (!overrides.length) return sql`${columnExpr}`;

  const parts: Array<ReturnType<typeof sql>> = [sql`CASE ${entries.id}`];
  for (const entry of overrides) {
    parts.push(sql`WHEN ${entry.id} THEN ${column === "request_date" ? entry.requestDate : entry.completionDate}`);
  }
  parts.push(sql`ELSE ${columnExpr} END`);
  return sql`(${sql.join(parts, sql` `)})`;
}
