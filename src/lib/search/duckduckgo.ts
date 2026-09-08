import type { SearchHit } from "./rank";

const decodeHref = (href: string): string | null => {
  const trimmed = href.trim();
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
    if (
      url.hostname.endsWith("duckduckgo.com") ||
      url.hostname === "html.duckduckgo.com"
    ) {
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

const decodeEntities = (value: string): string =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

const stripTags = (value: string): string =>
  decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

/** Parse DuckDuckGo HTML lite results. No network. */
export const parseDuckDuckGoHtml = (html: string): SearchHit[] => {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const linkRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html))) {
    const url = decodeHref(match[1] ?? "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = stripTags(match[2] ?? "") || url;
    const after = html.slice(match.index, match.index + 1200);
    const snippetMatch = after.match(
      /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span|div|td)>/i,
    );
    hits.push({
      title,
      url,
      snippet: snippetMatch ? stripTags(snippetMatch[1] ?? "") : "",
    });
    if (hits.length >= 20) break;
  }
  return hits;
};

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";

export const searchDuckDuckGo = async (
  query: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> => {
  const body = new URLSearchParams({ q: query.slice(0, 400) });
  const response = await fetch(DDG_HTML_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
      "user-agent":
        "Mozilla/5.0 (compatible; SINAMGPT-search/1.20; +https://localhost)",
    },
    body,
    signal,
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed (${response.status})`);
  }
  const html = await response.text();
  return parseDuckDuckGoHtml(html);
};
