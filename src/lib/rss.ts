type RssItem = {
  title: string;
  link: string;
  guid?: string;
  description?: string;
  pubDate?: Date | null;
};

type RssChannel = {
  title: string;
  link: string;
  description: string;
  language?: string;
  lastBuildDate?: Date | null;
  items: RssItem[];
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function maybeTag(tag: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<${tag}>${escapeXml(value)}</${tag}>`;
}

export function parseFeedDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (dayMatch) {
    const year = Number(dayMatch[1]);
    const month = Number(dayMatch[2]) - 1;
    const day = Number(dayMatch[3]);
    return new Date(Date.UTC(year, month, day, 12, 0, 0));
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildRssDocument(channel: RssChannel): string {
  const channelParts = [
    `<title>${escapeXml(channel.title)}</title>`,
    `<link>${escapeXml(channel.link)}</link>`,
    `<description>${escapeXml(channel.description)}</description>`,
    maybeTag("language", channel.language ?? "en-us"),
    maybeTag("lastBuildDate", channel.lastBuildDate ? channel.lastBuildDate.toUTCString() : null)
  ];

  const items = channel.items.map((item) => {
    return `<item>${[
      `<title>${escapeXml(item.title)}</title>`,
      `<link>${escapeXml(item.link)}</link>`,
      `<guid isPermaLink="false">${escapeXml(item.guid ?? item.link)}</guid>`,
      maybeTag("description", item.description),
      maybeTag("pubDate", item.pubDate ? item.pubDate.toUTCString() : null)
    ].join("")}</item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>${channelParts.join("")}${items.join("")}</channel></rss>`;
}
