import type { SearchHit } from "./rank";

type SearxngResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  publishedDate?: unknown;
};

type SearxngResponse = {
  results?: unknown;
};

const isoDay = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : undefined;
};

/** Parse SearXNG `format=json` payload. No network. */
export const parseSearxngJson = (payload: unknown): SearchHit[] => {
  const data = payload as SearxngResponse;
  if (!Array.isArray(data?.results)) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const raw of data.results as SearxngResult[]) {
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!url || seen.has(url)) continue;
    if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
    seen.add(url);
    const published = isoDay(raw.publishedDate);
    hits.push({
      title:
        typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim().slice(0, 200)
          : url,
      url,
      snippet:
        typeof raw.content === "string" ? raw.content.trim().slice(0, 400) : "",
      ...(published ? { published } : {}),
    });
    if (hits.length >= 20) break;
  }
  return hits;
};

export type SearxngOptions = {
  /** "news" asks SearXNG's news engines, which carry dates. */
  category?: "general" | "news";
  signal?: AbortSignal;
};

export const searchSearxng = async (
  baseUrl: string,
  query: string,
  options: SearxngOptions = {},
): Promise<SearchHit[]> => {
  const endpoint = new URL("/search", `${baseUrl.replace(/\/+$/, "")}/`);
  endpoint.searchParams.set("q", query.slice(0, 400));
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("safesearch", "1");
  if (options.category === "news") endpoint.searchParams.set("categories", "news");
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: options.signal,
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("SearXNG redirected; refusing to follow.");
  }
  if (response.status === 403) {
    // The stock settings.yml only allows HTML output.
    throw new Error('SearXNG refused JSON (403). Add "json" to search.formats in its settings.yml.');
  }
  if (!response.ok) {
    throw new Error(`SearXNG search failed (${response.status})`);
  }
  const payload = (await response.json()) as unknown;
  return parseSearxngJson(payload);
};
