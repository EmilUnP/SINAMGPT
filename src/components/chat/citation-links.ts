import type { KnowledgeCitation } from "@/lib/types";

/** Marks a link the renderer should draw as a citation badge. */
export const CITATION_TITLE_PREFIX = "cite:";

/** Web sources by the number the model was told to cite. */
export const citationUrls = (
  sources: KnowledgeCitation[] | null | undefined,
): Map<number, string> => {
  const refs = new Map<number, string>();
  for (const source of sources ?? []) {
    if (source.category !== "web" || !source.ref || !source.url) continue;
    try {
      // `href` percent-encodes spaces and quotes that would break the
      // Markdown link this URL is spliced into.
      const url = new URL(source.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      refs.set(source.ref, url.href);
    } catch {
      continue;
    }
  }
  return refs;
};

/** `[1, 2]` and `[1][2]` both become one badge per number. */
const CITATION_RE = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\](?![(:])/g;

const escapeTitle = (value: string): string => value.replace(/"/g, "");

const linkOutsideCode = (text: string, refs: Map<number, string>): string =>
  text.replace(CITATION_RE, (match, list: string) => {
    const numbers = list.split(",").map((part) => Number.parseInt(part.trim(), 10));
    if (!numbers.every((n) => refs.has(n))) return match;
    return numbers
      .map((n) => `[${n}](${refs.get(n)} "${escapeTitle(`${CITATION_TITLE_PREFIX}${n}`)}")`)
      .join("");
  });

/**
 * Turn "[2]" in an answer into a link to web source 2. Only numbers that
 * exist become links, and code (fenced or inline) is left alone, so array
 * indexes like `items[0]` stay text.
 */
export const linkCitations = (
  content: string,
  refs: Map<number, string>,
): string => {
  if (!refs.size || !content.includes("[")) return content;
  return content
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, index) => (index % 2 === 1 ? part : linkOutsideCode(part, refs)))
    .join("");
};
