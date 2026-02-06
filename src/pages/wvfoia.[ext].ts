import type { APIRoute } from "astro";

export const prerender = false;

interface ExportEnv {
  DB_EXPORTS: R2Bucket;
}

const SQLITE_CONTENT_TYPE = "application/vnd.sqlite3";
const DEFAULT_EXPORT_KEY = "wvfoia.db";
const EXPORT_ROBOTS_TAG = "noindex, nofollow, noarchive";

async function createDbExportResponse(context: Parameters<APIRoute>[0]): Promise<Response> {
  const env = context.locals.runtime.env as unknown as ExportEnv;
  const object = await env.DB_EXPORTS.get(DEFAULT_EXPORT_KEY);
  if (!object) {
    return new Response("Database export is not available right now.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": EXPORT_ROBOTS_TAG
      }
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", headers.get("content-type") || SQLITE_CONTENT_TYPE);
  headers.set("content-length", String(object.size));
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=300");
  headers.set("content-disposition", `attachment; filename=\"${DEFAULT_EXPORT_KEY}\"`);
  headers.set("x-robots-tag", EXPORT_ROBOTS_TAG);
  return new Response(object.body, { headers });
}

function isAllowedExt(ext: string | undefined): boolean {
  return ext === "db" || ext === "sqlite";
}

export const GET: APIRoute = async (context) => {
  const ext = context.params.ext;
  if (!isAllowedExt(ext)) {
    return new Response(null, {
      status: 404,
      headers: {
        "x-robots-tag": EXPORT_ROBOTS_TAG
      }
    });
  }
  return createDbExportResponse(context);
};

export const HEAD: APIRoute = async (context) => {
  const ext = context.params.ext;
  if (!isAllowedExt(ext)) {
    return new Response(null, {
      status: 404,
      headers: {
        "x-robots-tag": EXPORT_ROBOTS_TAG
      }
    });
  }
  const response = await createDbExportResponse(context);
  return new Response(null, {
    status: response.status,
    headers: response.headers
  });
};
