import { completeChat } from "@/lib/llm";
import { normalizeMultilangText } from "@/lib/multilang";
import { getDefaultModelSetting } from "@/lib/settings";

export type QueryGloss = {
  /** Extra EN/AZ/RU search terms to union with the original prompt. */
  searchText: string;
  usedLlm: boolean;
  category?: "company" | "product" | "faq" | "other" | "none";
};

const EMPTY: QueryGloss = { searchText: "", usedLlm: false, category: "none" };

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const GLOSS_TIMEOUT_MS = 2500;

const cache = new Map<string, { at: number; value: QueryGloss }>();
const inflight = new Map<string, Promise<QueryGloss>>();

const GLOSS_SYSTEM = `You turn a user message into search keywords for a company knowledge base and safety keyword scan.
The knowledge docs and admin block-lists may be in English, Azerbaijani, or Russian — not necessarily the user's language.

Output EXACTLY four lines, nothing else:
EN: comma-separated English search keywords
AZ: comma-separated Azerbaijani search keywords
RU: comma-separated Russian search keywords
CAT: one of company, product, faq, other, none

Rules:
- Translate the user's intent into keywords (not a full sentence).
- Keep product/company names as written (SINAM, SESDA, Farabi, Biletim, GoMap, GoNav, YURDUM).
- Include HR/policy words when relevant (leave, vacation, salary, password, contact, office).
- CAT = product for a named product; company for about/contact/employees; faq for how-to/policy; none for greetings or unrelated chat.
- If the message is only a greeting or empty small talk, output:
EN:
AZ:
RU:
CAT: none
- No quotes, no markdown, no extra lines.`;

const GREETING_RE =
  /^(hi|hello|hey|yo|salam|salamlar|merhaba|привет|здравствуйте|здрасте)[.!?]*$/i;

const shouldGloss = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false;
  if (trimmed === "[image]") return false;
  if (GREETING_RE.test(trimmed)) return false;
  return true;
};

const cacheKey = (text: string): string =>
  normalizeMultilangText(text).slice(0, 400);

const parseGloss = (
  raw: string,
): { searchText: string; category: QueryGloss["category"] } => {
  const lines = raw.replace(/```[\s\S]*?```/g, " ").split(/\n+/);
  const keywords: string[] = [];
  let category: QueryGloss["category"] = "none";
  for (const line of lines) {
    const cat = line.match(/^CAT\s*:\s*(company|product|faq|other|none)\b/i);
    if (cat) {
      category = cat[1].toLowerCase() as QueryGloss["category"];
      continue;
    }
    const cleaned = line.replace(/^(EN|AZ|RU|TR)\s*:\s*/i, "").trim();
    if (cleaned) keywords.push(cleaned);
  }
  return {
    searchText: normalizeMultilangText(keywords.join(" ")),
    category,
  };
};

const remember = (key: string, value: QueryGloss): QueryGloss => {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  return value;
};

/**
 * Query-side translation for RAG + guardrail keywords.
 * Docs stay in whatever language they were written; we expand the prompt
 * into EN / AZ / RU search terms so a Russian question can hit English docs.
 */
export const glossUserQuery = async (
  text: string,
  opts?: { model?: string },
): Promise<QueryGloss> => {
  const query = (text ?? "").trim();
  if (!shouldGloss(query)) return EMPTY;

  const key = cacheKey(query);
  if (!key) return EMPTY;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<QueryGloss> => {
    const model = (opts?.model || getDefaultModelSetting()).trim();
    if (!model) return EMPTY;

    try {
      const raw = await completeChat(
        model,
        [
          { role: "system", content: GLOSS_SYSTEM },
          { role: "user", content: query.slice(0, 2000) },
        ],
        {
          temperature: 0,
          numPredict: 96,
          timeoutMs: GLOSS_TIMEOUT_MS,
        },
      );
      const parsed = parseGloss(raw);
      return remember(key, {
        searchText: parsed.searchText,
        usedLlm: Boolean(parsed.searchText) || parsed.category !== "none",
        category: parsed.category,
      });
    } catch {
      return EMPTY;
    }
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
};

export const retrievalQuery = (original: string, gloss: QueryGloss): string => {
  if (!gloss.searchText) return original;
  return `${original}\n${gloss.searchText}`;
};
