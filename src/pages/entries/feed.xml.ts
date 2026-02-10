import type { APIRoute } from "astro";
import { createDbContext } from "$/lib/db/context";
import { latestEntriesByLastReportedDate } from "$/lib/data";
import { href } from "$/lib/links";
import { buildRssDocument, parseFeedDate } from "$/lib/rss";
import { formatDate } from "$/lib/utils";

export const prerender = false;

const FEED_CACHE_CONTROL = "public, max-age=120, s-maxage=300, stale-while-revalidate=86400";
const FEED_LIMIT = 200;

export const GET: APIRoute = async (context) => {
  const ctx = createDbContext(context.locals.runtime.env);
  const snapshot = await latestEntriesByLastReportedDate(ctx);
  const items = snapshot.entries.slice(0, FEED_LIMIT).map((entry) => {
    const entryUrl = new URL(href(`entries/${entry.id}`), context.request.url).toString();
    const requestDate = formatDate(entry.request_date, true);
    const completionDate = formatDate(entry.completion_date, true);
    return {
      title: `${entry.agency} | ${entry.subject || "No subject"} (#${entry.id})`,
      link: entryUrl,
      guid: `entry-${entry.id}`,
      description: `Request: ${requestDate}. Completed: ${completionDate}. Resolution: ${entry.resolution || "--"}.`,
      pubDate: parseFeedDate(entry.entry_date ?? entry.completion_date ?? entry.request_date)
    };
  });

  const latestDate = snapshot.date ? formatDate(snapshot.date) : "none";
  const xml = buildRssDocument({
    title: "wvfoia latest entries",
    link: new URL(href(), context.request.url).toString(),
    description: `Latest WVFOIA entries from the most recently reported date (${latestDate}).`,
    lastBuildDate: parseFeedDate(snapshot.date),
    items
  });

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": FEED_CACHE_CONTROL
    }
  });
};
