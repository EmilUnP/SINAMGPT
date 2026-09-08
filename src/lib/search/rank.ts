import { hostMatchesDeny } from "./ssrf";

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const JUNK_HOSTS = [
  "pinterest.com",
  "pinimg.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
];

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

export const isJunkHost = (hostname: string, extraDeny: string[] = []): boolean => {
  const host = hostname.toLowerCase();
  if (!host) return true;
  if (JUNK_HOSTS.some((junk) => hostMatchesDeny(host, junk))) return true;
  return extraDeny.some((entry) => hostMatchesDeny(host, entry));
};

const overlapScore = (queryTokens: string[], text: string): number => {
  if (!queryTokens.length) return 0;
  const hay = new Set(tokenize(text));
  let hits = 0;
  for (const token of queryTokens) {
    if (hay.has(token)) hits += 1;
  }
  return hits / queryTokens.length;
};

/** Rank by title/query overlap, drop deny-list and junk hosts. */
export const rankSearchHits = (
  query: string,
  hits: SearchHit[],
  denyHosts: string[] = [],
): SearchHit[] => {
  const queryTokens = tokenize(query);
  const seen = new Set<string>();
  const scored: Array<SearchHit & { score: number }> = [];

  for (const hit of hits) {
    const url = hit.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const host = hostOf(url);
    if (isJunkHost(host, denyHosts)) continue;
    const title = hit.title.trim() || host || url;
    const snippet = hit.snippet.trim();
    const score =
      overlapScore(queryTokens, `${title} ${snippet}`) * 2 +
      overlapScore(queryTokens, host.replace(/\./g, " "));
    scored.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 400), score });
  }

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return scored.map(({ score: _score, ...hit }) => hit);
};
