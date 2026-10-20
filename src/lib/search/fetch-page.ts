import { PublicUrlError, assertPublicHttpUrl } from "./ssrf";
import { htmlToText, wrapWebPage } from "./extract";
import { readHtmlPage } from "./readable";

/** Wikipedia articles run 400 KB+; the old 250 KB cap cut them mid-body. */
const MAX_HTML_BYTES = 2_000_000;

/**
 * A browser-shaped agent. Many news and weather sites answer a bot-looking
 * agent with 403 or a consent wall, which left the model with snippets only.
 */
export const FETCH_HEADERS = {
  accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.8,az;q=0.7,ru;q=0.6",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
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

const readCappedBytes = async (
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> => {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
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
  return concatBytes(chunks);
};

const charsetOf = (contentType: string, head: Uint8Array): string => {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  // <meta charset> must sit in the first 1024 bytes per the HTML spec.
  const sniff = new TextDecoder("latin1").decode(head.slice(0, 2048));
  const fromMeta =
    sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    sniff.match(/<\?xml[^>]+encoding=["']([\w-]+)/i)?.[1];
  return (fromMeta ?? "utf-8").toLowerCase();
};

/**
 * Russian and Azerbaijani sites still serve windows-1251; decoding those as
 * UTF-8 turned the whole page into replacement characters.
 */
export const decodeBody = (bytes: Uint8Array, contentType: string): string => {
  const charset = charsetOf(contentType, bytes);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
};

export type FetchedPage = {
  url: string;
  title: string;
  text: string;
  wrapped: string;
  published?: string;
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
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Fetch failed (${response.status})`);
  }
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const isPlain = contentType.includes("text/plain");
  if (
    contentType &&
    !contentType.includes("html") &&
    !isPlain &&
    !contentType.includes("xml")
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Only HTML or text pages can be fetched.");
  }
  const body = decodeBody(
    await readCappedBytes(response, MAX_HTML_BYTES),
    contentType,
  );
  const maxChars = Math.max(0, Math.floor(options.maxChars));
  const page = isPlain
    ? { title: "", text: body.replace(/\s+\n/g, "\n").trim().slice(0, maxChars) }
    : await readHtmlPage(body, url, maxChars);
  const text = page.text || htmlToText(body, maxChars);
  const published = "published" in page ? page.published : undefined;
  return {
    url,
    title: (page.title || url).slice(0, 200),
    text,
    wrapped: wrapWebPage(url, text),
    ...(published ? { published } : {}),
  };
};
