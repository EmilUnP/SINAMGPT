import type { ChatMessage } from "@/lib/llm";
import { normalizeResultUrl } from "./rank";

/**
 * One numbering for every web source in a turn. The final answer prompt, the
 * saved citations and the "[n]" links in the reply all come from this list,
 * so the number the model writes is the chip the reader clicks.
 */
export type WebSource = {
  ref: number;
  title: string;
  url: string;
  site: string;
  snippet: string;
  published?: string;
  content?: string;
};

export const MAX_WEB_SOURCES = 10;

type Row = {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
  published?: unknown;
  content?: unknown;
  page_text?: unknown;
  text?: unknown;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** web_fetch wraps its text in <web_page>; the SOURCES block carries that warning once. */
const unwrap = (value: string): string =>
  value
    .replace(/^<web_page[^>]*>\s*UNTRUSTED PAGE CONTENT[^\n]*\n?/, "")
    .replace(/\n?<\/web_page>\s*$/, "")
    .trim();

const siteOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export const collectWebSources = (
  messages: ChatMessage[],
  max = MAX_WEB_SOURCES,
): WebSource[] => {
  const byKey = new Map<string, WebSource>();
  const out: WebSource[] = [];
  const add = (row: Row) => {
    const url = text(row.url).trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) return;
    const key = normalizeResultUrl(url);
    const content = unwrap(text(row.content) || text(row.page_text) || text(row.text));
    const existing = byKey.get(key);
    if (existing) {
      // A later web_fetch of the same page brings the full text.
      if (content.length > (existing.content?.length ?? 0)) existing.content = content;
      return;
    }
    if (out.length >= max) return;
    const source: WebSource = {
      ref: out.length + 1,
      title: (text(row.title).trim() || url).slice(0, 200),
      url,
      site: siteOf(url),
      snippet: text(row.snippet).trim(),
      ...(text(row.published) ? { published: text(row.published) } : {}),
      ...(content ? { content } : {}),
    };
    byKey.set(key, source);
    out.push(source);
  };

  for (const message of messages) {
    if (message.role !== "tool" || !message.content) continue;
    if (message.toolName !== "web_search" && message.toolName !== "web_fetch") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.content) as unknown;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const body = parsed as Row & { results?: unknown };
    if (Array.isArray(body.results)) {
      for (const row of body.results) {
        if (row && typeof row === "object") add(row as Row);
      }
    } else if (typeof body.url === "string") {
      add(body);
    }
  }
  return out;
};
