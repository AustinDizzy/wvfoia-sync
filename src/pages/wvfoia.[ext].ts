import type { APIRoute } from "astro";

export const prerender = false;

interface ExportEnv {
  DB_EXPORTS: R2Bucket;
  TURNSTILE_SECRET_KEY?: string;
  R2_S3_ACCOUNT_ID?: string;
  R2_S3_ACCESS_KEY_ID?: string;
  R2_S3_SECRET_ACCESS_KEY?: string;
  R2_S3_BUCKET_NAME?: string;
}

const SQLITE_CONTENT_TYPE = "application/vnd.sqlite3";
const SQL_CONTENT_TYPE = "application/sql; charset=utf-8";
const DB_EXPORT_KEY = "wvfoia.db";
const SQL_EXPORT_KEY = "wvfoia.sql";
const DEFAULT_BUCKET_NAME = "wvfoia";
const SIGNED_URL_TTL_SECONDS = 120;
const EXPORT_ROBOTS_TAG = "noindex, nofollow, noarchive";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

type ExportTarget = {
  key: string;
  filename: string;
  contentType: string;
};

function resolveExportTarget(ext: string | undefined): ExportTarget | null {
  if (ext === "db" || ext === "sqlite") {
    return {
      key: DB_EXPORT_KEY,
      filename: DB_EXPORT_KEY,
      contentType: SQLITE_CONTENT_TYPE
    };
  }
  if (ext === "sql") {
    return {
      key: SQL_EXPORT_KEY,
      filename: SQL_EXPORT_KEY,
      contentType: SQL_CONTENT_TYPE
    };
  }
  return null;
}

function iso8601Basic(date: Date): { amzDate: string; dateStamp: string } {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return {
    amzDate: `${year}${month}${day}T${hours}${minutes}${seconds}Z`,
    dateStamp: `${year}${month}${day}`
  };
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalUri(bucket: string, key: string): string {
  const encodedKey = key.split("/").map((part) => encodeRfc3986(part)).join("/");
  return `/${encodeRfc3986(bucket)}/${encodedKey}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hex(new Uint8Array(digest));
}

async function hmacSha256Raw(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return new Uint8Array(signature);
}

async function createR2PresignedGetUrl(env: ExportEnv, target: ExportTarget): Promise<string | null> {
  const accountId = env.R2_S3_ACCOUNT_ID;
  const accessKeyId = env.R2_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_S3_SECRET_ACCESS_KEY;
  const bucketName = env.R2_S3_BUCKET_NAME ?? DEFAULT_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const now = new Date();
  const { amzDate, dateStamp } = iso8601Basic(now);
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const signedHeaders = "host";

  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(SIGNED_URL_TTL_SECONDS),
    "X-Amz-SignedHeaders": signedHeaders,
    "response-content-disposition": `attachment; filename=\"${target.filename}\"`,
    "response-content-type": target.contentType
  });

  const canonicalQuery = Array.from(query.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");

  const canonicalRequest = [
    "GET",
    canonicalUri(bucketName, target.key),
    canonicalQuery,
    `host:${host}`,
    "",
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256(canonicalRequest)
  ].join("\n");

  const kDate = await hmacSha256Raw(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  const kSigning = await hmacSha256Raw(kService, "aws4_request");
  const signature = hex(await hmacSha256Raw(kSigning, stringToSign));

  query.set("X-Amz-Signature", signature);
  return `https://${host}/${bucketName}/${target.key}?${query.toString()}`;
}

async function isTurnstileTokenValid(request: Request, secret: string, token: string): Promise<boolean> {
  const remoteIp = request.headers.get("cf-connecting-ip");
  const body = new URLSearchParams({
    secret,
    response: token
  });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) return false;
  const result = await response.json<{ success?: boolean }>();
  return result.success === true;
}

function blockedResponse(message: string, status = 403): Response {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": EXPORT_ROBOTS_TAG
    }
  });
}

export const GET: APIRoute = async (context) => {
  if (!resolveExportTarget(context.params.ext)) {
    return new Response(null, {
      status: 404,
      headers: {
        "x-robots-tag": EXPORT_ROBOTS_TAG
      }
    });
  }
  return blockedResponse("Verification required. Start this download from the homepage.", 403);
};

export const HEAD: APIRoute = async (context) => {
  if (!resolveExportTarget(context.params.ext)) {
    return new Response(null, {
      status: 404,
      headers: {
        "x-robots-tag": EXPORT_ROBOTS_TAG
      }
    });
  }
  return new Response(null, {
    status: 403,
    headers: {
      "cache-control": "no-store",
      "x-robots-tag": EXPORT_ROBOTS_TAG
    }
  });
};

export const POST: APIRoute = async (context) => {
  const ext = context.params.ext;
  const target = resolveExportTarget(ext);
  if (!target) {
    return blockedResponse("Not found.", 404);
  }

  const env = context.locals.runtime.env as unknown as ExportEnv;
  const secret = env.TURNSTILE_SECRET_KEY ?? (!import.meta.env.PROD ? TURNSTILE_TEST_SECRET_KEY : undefined);
  if (!secret) {
    return blockedResponse("Download verification is unavailable.", 503);
  }

  const formData = await context.request.formData();
  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || token.trim().length === 0) {
    return blockedResponse("Verification token is required.", 400);
  }

  const isValid = await isTurnstileTokenValid(context.request, secret, token);
  if (!isValid) {
    return blockedResponse("Verification failed. Please try again.", 403);
  }

  const object = await env.DB_EXPORTS.head(target.key);
  if (!object) {
    return blockedResponse("Export is not available right now.", 404);
  }

  const signedUrl = await createR2PresignedGetUrl(env, target);
  if (!signedUrl) {
    return blockedResponse("Signed download URL is not configured.", 503);
  }

  return new Response(null, {
    status: 303,
    headers: {
      location: signedUrl,
      "cache-control": "no-store",
      "x-robots-tag": EXPORT_ROBOTS_TAG
    }
  });
};
