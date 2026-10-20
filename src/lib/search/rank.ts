import { searchStems } from "./passages";
import { hostMatchesDeny } from "./ssrf";

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  /** ISO day the engine says the page was published, when it says. */
  published?: string;
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

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|yclid|mc_[a-z]+|ref|ref_src)$/i;

/**
 * Two queries routinely return the same page as `www.x.com/a/` and
 * `x.com/a?utm_source=…`; without this they fill two of five slots.
 */
export const normalizeResultUrl = (raw: string): string => {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}${url.search}`;
  } catch {
    return raw.trim();
  }
};

const overlapScore = (queryStems: string[], text: string): number => {
  if (!queryStems.length) return 0;
  const hay = new Set(searchStems(text));
  let hits = 0;
  for (const token of queryStems) {
    if (hay.has(token)) hits += 1;
  }
  return hits / queryStems.length;
};

/** Standard Reciprocal Rank Fusion constant. */
const RRF_K = 60;
/**
 * Engine order is the main signal — the engine knows authority and freshness;
 * word overlap only breaks near-ties and sinks off-topic hits.
 */
const OVERLAP_WEIGHT = 0.15;

/**
 * Fuse one result list per query (Reciprocal Rank Fusion, as Open WebUI and
 * Perplexica do), drop deny-list and junk hosts, and dedupe by normalised URL.
 * A page that several queries agree on rises to the top.
 */
export const rankSearchHits = (
  queries: string | string[],
  lists: SearchHit[] | SearchHit[][],
  denyHosts: string[] = [],
): SearchHit[] => {
  const queryList = (Array.isArray(queries) ? queries : [queries]).filter(Boolean);
  const resultLists = (
    lists.length && Array.isArray(lists[0]) ? lists : [lists]
  ) as SearchHit[][];
  const queryStems = queryList.map((query) => [...new Set(searchStems(query))]);

  const merged = new Map<string, { hit: SearchHit; fused: number; first: number }>();
  let order = 0;
  for (const list of resultLists) {
    const seenInList = new Set<string>();
    list.forEach((hit, rank) => {
      const url = hit.url.trim();
      if (!url) return;
      const key = normalizeResultUrl(url);
      if (seenInList.has(key)) return;
      seenInList.add(key);
      if (isJunkHost(hostOf(url), denyHosts)) return;
      const contribution = (RRF_K + 1) / (RRF_K + rank + 1);
      const existing = merged.get(key);
      if (existing) {
        existing.fused += contribution;
        // Keep the richest snippet and any date one engine knew.
        if (hit.snippet.length > existing.hit.snippet.length) {
          existing.hit = { ...existing.hit, snippet: hit.snippet };
        }
        if (!existing.hit.published && hit.published) {
          existing.hit = { ...existing.hit, published: hit.published };
        }
        return;
      }
      merged.set(key, { hit: { ...hit, url }, fused: contribution, first: order });
      order += 1;
    });
  }

  const scored = [...merged.values()].map(({ hit, fused, first }) => {
    const host = hostOf(hit.url);
    const title = hit.title.trim() || host || hit.url;
    const snippet = hit.snippet.trim();
    const overlap = Math.max(
      0,
      ...queryStems.map(
        (stems) =>
          overlapScore(stems, `${title} ${snippet}`) * 2 +
          overlapScore(stems, host.replace(/\./g, " ")),
      ),
    );
    return {
      hit: {
        title: title.slice(0, 200),
        url: hit.url,
        snippet: snippet.slice(0, 400),
        ...(hit.published ? { published: hit.published } : {}),
      },
      score: fused + overlap * OVERLAP_WEIGHT,
      first,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.first - b.first);
  return scored.map(({ hit }) => hit);
};
