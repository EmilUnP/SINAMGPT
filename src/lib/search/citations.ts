import type { ChatMessage } from "@/lib/llm";
import type { KnowledgeCitation } from "@/lib/types";
import { collectWebSources } from "./sources";

/** Collect public result URLs from web_search / web_fetch tool messages. */
export const citationsFromSearchMessages = (
  messages: ChatMessage[],
): KnowledgeCitation[] =>
  collectWebSources(messages).map((source) => ({
    id: source.url,
    title: source.title,
    category: "web",
    url: source.url,
    // The number the model was told to cite; the reply's "[n]" links use it.
    ref: source.ref,
  }));

/** Room for a full knowledge pack plus every numbered web source. */
const MAX_CITATIONS = 16;

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
  // Web sources go last, so trimming the tail would break "[n]" numbering:
  // trim knowledge first when the list is too long.
  const overflow = merged.length - MAX_CITATIONS;
  if (overflow <= 0) return merged;
  const webCount = merged.length - knowledge.length;
  return [
    ...knowledge.slice(0, Math.max(0, knowledge.length - overflow)),
    ...merged.slice(knowledge.length, knowledge.length + webCount),
  ].slice(0, MAX_CITATIONS);
};
