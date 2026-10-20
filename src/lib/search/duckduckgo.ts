import { decodeEntities } from "./extract";
import { FETCH_HEADERS } from "./fetch-page";
import type { SearchHit } from "./rank";

const decodeHref = (href: string): string | null => {
  const trimmed = decodeEntities(href.trim());
  if (!trimmed) return null;
  try {
    const absolute = trimmed.startsWith("//")
      ? `https:${trimmed}`
      : trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://html.duckduckgo.com${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
    const url = new URL(absolute);
    const uddg = url.searchParams.get("uddg");
    if (uddg) {
      const decoded = decodeURIComponent(uddg);
      if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
        return decoded;
      }
    }
    // Ads and internal links point back at duckduckgo.com (y.js, etc.).
    if (url.hostname.endsWith("duckduckgo.com")) {
      return null;
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
};

/** DuckDuckGo double-encodes some snippets (`&amp;quot;`), so decode twice. */
const stripTags = (value: string): string =>
  decodeEntities(decodeEntities(value.replace(/<[^>]+>/g, " ")))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Parse a results page by anchors: each result spans from its title link to
 * the next one. A fixed look-ahead window used to cut off before the snippet
 * (it sits ~1 200 characters after the link), so every snippet came back
 * empty and the model saw titles only.
 */
const parseByAnchors = (
  html: string,
  linkRe: RegExp,
  snippetRe: RegExp,
): SearchHit[] => {
  const anchors: Array<{ index: number; end: number; href: string; title: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html))) {
    anchors.push({
      index: match.index,
      end: match.index + match[0].length,
      href: match[1] ?? "",
      title: match[2] ?? "",
    });
  }
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  anchors.forEach((anchor, position) => {
    if (hits.length >= 20) return;
    const url = decodeHref(anchor.href);
    if (!url || seen.has(url)) return;
    seen.add(url);
    const next = anchors[position + 1]?.index ?? anchor.end + 6_000;
    const block = html.slice(anchor.end, next);
    const snippet = block.match(snippetRe)?.[1] ?? "";
    hits.push({
      title: stripTags(anchor.title) || url,
      url,
      snippet: stripTags(snippet).slice(0, 400),
    });
  });
  return hits;
};

/** Parse DuckDuckGo HTML results. No network. */
export const parseDuckDuckGoHtml = (html: string): SearchHit[] =>
  parseByAnchors(
    html,
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span|div|td)>/i,
  );

/** Parse the DuckDuckGo lite page, the fallback when the HTML page throttles. */
export const parseDuckDuckGoLite = (html: string): SearchHit[] =>
  parseByAnchors(
    html,
    /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    /class=["'][^"']*result-snippet[^"']*["'][^>]*>([\s\S]*?)<\/td>/i,
  );

/** DuckDuckGo answers bursts with a bot check page instead of results. */
export const isDuckDuckGoChallenge = (html: string): boolean =>
  /anomaly-modal|bots use DuckDuckGo too|challenge-form/i.test(html);

const ENDPOINTS = [
  { url: "https://html.duckduckgo.com/html/", parse: parseDuckDuckGoHtml },
  { url: "https://lite.duckduckgo.com/lite/", parse: parseDuckDuckGoLite },
];

export const searchDuckDuckGo = async (
  query: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> => {
  const body = new URLSearchParams({ q: query.slice(0, 400) }).toString();
  let lastError = "DuckDuckGo search failed";
  for (const endpoint of ENDPOINTS) {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        ...FETCH_HEADERS,
        "content-type": "application/x-www-form-urlencoded",
        accept: "text/html",
      },
      body,
      signal,
      redirect: "follow",
    });
    const html = await response.text();
    // 202 with a challenge page is how DuckDuckGo rate-limits.
    if (!response.ok || response.status === 202 || isDuckDuckGoChallenge(html)) {
      lastError = `DuckDuckGo search was throttled (${response.status})`;
      continue;
    }
    const hits = endpoint.parse(html);
    if (hits.length) return hits;
    lastError = "DuckDuckGo returned no results";
  }
  // "No results" is a valid answer; only throttling is an error worth showing.
  if (lastError === "DuckDuckGo returned no results") return [];
  throw new Error(lastError);
};
