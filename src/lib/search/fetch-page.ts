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

export const fetchPublicPage = async (
  rawUrl: string,
  options: {
    denyHosts: string[];
    maxChars: number;
    signal?: AbortSignal;
  },
): Promise<FetchedPage> => {
  const url = assertPublicHttpUrl(rawUrl, options.denyHosts);
  const response = await fetch(url, {
    method: "GET",
    headers: FETCH_HEADERS,
    redirect: "manual",
    signal: options.signal,
  });
  if (response.status >= 300 && response.status < 400) {
    throw new PublicUrlError("Redirects are not followed.");
  }
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
