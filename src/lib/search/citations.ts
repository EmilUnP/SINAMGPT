import type { ChatMessage } from "@/lib/llm";
import type { KnowledgeCitation } from "@/lib/types";

type SearchResultRow = {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
};

const asCitation = (
  url: string,
  title: string,
  seen: Set<string>,
): KnowledgeCitation | null => {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  if (seen.has(url)) return null;
  seen.add(url);
  return {
    id: url,
    title: title.trim() || url,
    category: "web",
    url,
  };
};

/** Collect public result URLs from web_search / web_fetch tool messages. */
export const citationsFromSearchMessages = (
  messages: ChatMessage[],
): KnowledgeCitation[] => {
  const seen = new Set<string>();
  const out: KnowledgeCitation[] = [];
  for (const message of messages) {
    if (message.role !== "tool" || !message.content) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.content) as unknown;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const body = parsed as {
      results?: unknown;
      url?: unknown;
      title?: unknown;
    };
    if (Array.isArray(body.results)) {
      for (const row of body.results as SearchResultRow[]) {
        const url = typeof row.url === "string" ? row.url : "";
        const title = typeof row.title === "string" ? row.title : url;
        const citation = asCitation(url, title, seen);
        if (citation) out.push(citation);
      }
    }
    if (typeof body.url === "string") {
      const citation = asCitation(
        body.url,
        typeof body.title === "string" ? body.title : body.url,
        seen,
      );
      if (citation) out.push(citation);
    }
  }
  return out.slice(0, 8);
};

export const mergeCitations = (
  knowledge: KnowledgeCitation[],
  web: KnowledgeCitation[],
): KnowledgeCitation[] => {
  const seen = new Set(knowledge.map((item) => item.id));
  const merged = [...knowledge];
  for (const item of web) {
    if (seen.has(item.id) || (item.url && seen.has(item.url))) continue;
    seen.add(item.id);
    if (item.url) seen.add(item.url);
    merged.push(item);
  }
  return merged.slice(0, 12);
};
