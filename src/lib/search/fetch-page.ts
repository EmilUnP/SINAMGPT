import { PublicUrlError, assertPublicHttpUrl } from "./ssrf";
import { extractTitle, htmlToText, wrapWebPage } from "./extract";

const MAX_HTML_BYTES = 250_000;
const FETCH_HEADERS = {
  accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
  "user-agent":
    "Mozilla/5.0 (compatible; SINAMGPT-search/1.20; +https://localhost)",
};

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

const readCappedText = async (
  response: Response,
  maxBytes: number,
): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.slice(0, Math.max(0, maxBytes - total)));
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(concatBytes(chunks));
};

export type FetchedPage = {
  url: string;
  title: string;
  text: string;
  wrapped: string;
};

/** http→https and www canonicalisation are normal; blanket-rejecting 3xx made most fetches fail. */
const MAX_REDIRECTS = 4;

/**
 * Follow redirects by hand so every hop is re-validated. `redirect: "follow"`
 * would let a public URL bounce to the LAN with no second check; refusing all
 * redirects instead loses most real pages. Re-checking each Location is both.
 */
const fetchFollowingPublicRedirects = async (
  startUrl: string,
  denyHosts: string[],
  signal?: AbortSignal,
): Promise<{ response: Response; url: string }> => {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(url, {
      method: "GET",
      headers: FETCH_HEADERS,
      redirect: "manual",
      signal,
    });
    if (response.status < 300 || response.status >= 400) {
      return { response, url };
    }
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location) {
      throw new Error(`Fetch failed (${response.status} with no location)`);
    }
    // Relative targets are legal; resolve before re-validating.
    let next: string;
    try {
      next = new URL(location, url).href;
    } catch {
      throw new PublicUrlError("Redirect target is invalid.");
    }
    url = assertPublicHttpUrl(next, denyHosts);
  }
  throw new PublicUrlError("Too many redirects.");
};

export const fetchPublicPage = async (
  rawUrl: string,
  options: {
    denyHosts: string[];
    maxChars: number;
    signal?: AbortSignal;
  },
): Promise<FetchedPage> => {
  const startUrl = assertPublicHttpUrl(rawUrl, options.denyHosts);
  const { response, url } = await fetchFollowingPublicRedirects(
    startUrl,
    options.denyHosts,
    options.signal,
  );
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status})`);
  }
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (
    contentType &&
    !contentType.includes("html") &&
    !contentType.includes("text/plain") &&
    !contentType.includes("xml")
  ) {
    throw new Error("Only HTML or text pages can be fetched.");
  }
  const html = await readCappedText(response, MAX_HTML_BYTES);
  const title = extractTitle(html) || url;
  const text = htmlToText(html, options.maxChars);
  return {
    url,
    title: title.slice(0, 200),
    text,
    wrapped: wrapWebPage(url, text),
  };
};
