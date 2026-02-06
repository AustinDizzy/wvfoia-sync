type QueryPrimitive = string | number | boolean | null | undefined;
type QueryValue = QueryPrimitive | QueryPrimitive[];

export function href(path?: string): string;
export function href(path: string, query: Record<string, QueryValue>): string;
export function href(path = "", query?: Record<string, QueryValue>): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const url = `${base}${path.replace(/^\/+/, "")}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) appendQueryValue(params, key, item);
    } else {
      appendQueryValue(params, key, value);
    }
  }

  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

function appendQueryValue(params: URLSearchParams, key: string, value: QueryPrimitive): void {
  if (value === null || value === undefined) return;
  const serialized = String(value).trim();
  if (!serialized) return;
  params.append(key, serialized);
}
