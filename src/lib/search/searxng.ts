import type { SearchHit } from "./rank";

type SearxngResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
};

type SearxngResponse = {
  results?: unknown;
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
    hits.push({
      title:
        typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim().slice(0, 200)
          : url,
      url,
      snippet:
        typeof raw.content === "string" ? raw.content.trim().slice(0, 400) : "",
    });
    if (hits.length >= 20) break;
  }
  return hits;
};

export const searchSearxng = async (
  baseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> => {
  const endpoint = new URL("/search", `${baseUrl.replace(/\/+$/, "")}/`);
  endpoint.searchParams.set("q", query.slice(0, 400));
  endpoint.searchParams.set("format", "json");
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("SearXNG redirected; refusing to follow.");
  }
  if (!response.ok) {
    throw new Error(`SearXNG search failed (${response.status})`);
  }
  const payload = (await response.json()) as unknown;
  return parseSearxngJson(payload);
};
