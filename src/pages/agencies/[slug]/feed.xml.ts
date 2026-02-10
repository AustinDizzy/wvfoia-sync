import type { APIRoute } from "astro";
import { createDbContext } from "$/lib/db/context";
import { agencyBySlug, listEntries } from "$/lib/data";
import { href } from "$/lib/links";
import { buildRssDocument, parseFeedDate } from "$/lib/rss";
import type { EntrySearchOptions, PageCursor } from "$/lib/types";
import { formatDate } from "$/lib/utils";

export const prerender = false;

const FEED_CACHE_CONTROL = "public, max-age=120, s-maxage=300, stale-while-revalidate=86400";
const FEED_LIMIT = 100;

const FEED_SEARCH: EntrySearchOptions = {
  search: "",
  agency: "",
  resolution: [],
  requestDateFrom: "",
  requestDateTo: "",
  completionDateFrom: "",
  completionDateTo: "",
  sort: "newest_entry"
};

const FEED_CURSOR: PageCursor = {
  page: 1,
  pageSize: FEED_LIMIT
};

export const GET: APIRoute = async (context) => {
  const slug = decodeURIComponent(context.params.slug ?? "");
  const ctx = createDbContext(context.locals.runtime.env);
  const agency = await agencyBySlug(ctx, slug);
  if (!agency) {
    return new Response(null, { status: 404 });
  }

  const pageData = await listEntries(ctx, FEED_SEARCH, FEED_CURSOR, agency.name);
  const items = pageData.entries.map((entry) => {
    const entryUrl = new URL(href(`entries/${entry.id}`), context.request.url).toString();
    const requestDate = formatDate(entry.request_date, true);
    const completionDate = formatDate(entry.completion_date, true);
    return {
      title: `${entry.subject || "No subject"} (#${entry.id})`,
      link: entryUrl,
      guid: `agency-${agency.slug}-entry-${entry.id}`,
      description: `Request: ${requestDate}. Completed: ${completionDate}. Resolution: ${entry.resolution || "--"}.`,
      pubDate: parseFeedDate(entry.entry_date ?? entry.completion_date ?? entry.request_date)
    };
  });

  const xml = buildRssDocument({
    title: `${agency.name} - wvfoia entries`,
    link: new URL(href(`agencies/${agency.slug}`), context.request.url).toString(),
    description: `Newest WVFOIA entries for ${agency.name}.`,
    lastBuildDate: parseFeedDate(pageData.entries[0]?.entry_date ?? pageData.entries[0]?.completion_date ?? pageData.entries[0]?.request_date),
    items
  });

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": FEED_CACHE_CONTROL
    }
  });
};
