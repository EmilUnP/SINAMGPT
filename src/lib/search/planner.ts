import { isInternalRewritePrompt } from "@/lib/multilang";
import type { ChatMessage } from "@/lib/llm";

/**
 * LLM query planning — the step Open WebUI and Perplexica run before every
 * search. Regex query building could not do it: it searched Baku for "bu gün
 * sumqayitda hava", pasted whole sentences ("…cədvəl kimi hava praqnozun
 * ver"), and hard-coded companies. A short JSON prompt to the chat model
 * resolves follow-ups ("and tomorrow?"), picks the place, drops format
 * instructions, and writes one English plus one local-language query.
 */

export type SearchTopic = "general" | "news";

export type SearchPlan = {
  queries: string[];
  topic: SearchTopic;
  source: "llm" | "heuristic";
};

export type PlannerComplete = (
  messages: ChatMessage[],
  options: { signal?: AbortSignal; timeoutMs: number },
) => Promise<string>;

const PLANNER_TIMEOUT_MS = 15_000;
const MAX_QUERIES = 3;
const MAX_QUERY_CHARS = 120;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Tuesday, 20 October 2026" — the model's sense of "today" is its training cutoff otherwise. */
export const describeDate = (now: Date): string =>
  `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

const plannerSystem = (now: Date, location: string): string => `You write web search queries. You never answer the question yourself.
Today is ${describeDate(now)}.${location ? `\nDefault location: ${location} — use it only when the question needs a place (weather, local news, prices, "near me") and names none.` : ""}

Read the conversation and write 1 to ${MAX_QUERIES} search engine queries that will find the answer to the user's LAST message.
Rules:
- Resolve follow-ups: replace "he", "it", "there", "that company", "and tomorrow?" with the real names, places and dates from earlier turns.
- Short keyword queries, 2 to 8 words. No full sentences, no polite words, no format requests (table, list, short, in Azerbaijani).
- Write one query in English. If the topic is local (Azerbaijan, a local person or company) or the user wrote in Azerbaijani or Russian, add one query in that language.
- Keep names of people, companies, products and places exactly as written. For names with special letters (ə ı ş ç ğ ö ü), the English query uses the Latin spelling (Talıbov → Talibov, Sumqayıt → Sumqayit).
- Weather: city + "weather forecast" (+ "today", "tomorrow" or "10 day" as asked). News, prices, rates, scores: add the month and year.
- "news": true when the user wants news or recent events, otherwise false.

Reply with JSON only, no other text:
{"queries": ["first query", "second query"], "news": false}`;

const transcript = (messages: ChatMessage[]): string => {
  const turns = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter((message) => message.content.trim() && !message.toolCalls?.length)
    .filter((message) => !(message.role === "user" && isInternalRewritePrompt(message.content)))
    .slice(-6);
  return turns
    .map((message, index) => {
      const last = index === turns.length - 1;
      const limit = message.role === "user" ? 600 : 300;
      const text = message.content.replace(/\s+/g, " ").trim().slice(0, limit);
      return `${message.role === "user" ? (last ? "User (LAST message)" : "User") : "Assistant"}: ${text}`;
    })
    .join("\n");
};

const cleanQuery = (value: unknown): string =>
  typeof value === "string"
    ? value
        .replace(/[\r\n\t]+/g, " ")
        // List markers ("1. ", "- ") but not a leading year ("2026 election").
        .replace(/^\s*(?:\d{1,2}[.)]|[-*•])\s+/, "")
        .replace(/^["'`«“\s]+|["'`»”\s,]+$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_QUERY_CHARS)
    : "";

/** Lowercased, unique, non-empty, at most `max`. */
export const uniqueQueries = (values: unknown[], max = MAX_QUERIES): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const query = cleanQuery(value);
    const key = query.toLowerCase();
    if (query.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= max) break;
  }
  return out;
};

/**
 * Lenient: small models wrap JSON in fences, add a preamble, or think out
 * loud first. Falls back to one query per line when there is no JSON.
 */
export const parsePlannerReply = (raw: string): { queries: string[]; news: boolean } | null => {
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/```(?:json)?/gi, " ")
    .trim();
  const objects = text.match(/\{[\s\S]*?\}/g) ?? [];
  for (const candidate of objects.reverse()) {
    try {
      const parsed = JSON.parse(candidate) as { queries?: unknown; news?: unknown };
      if (!Array.isArray(parsed.queries)) continue;
      const queries = uniqueQueries(parsed.queries);
      if (queries.length) return { queries, news: parsed.news === true };
    } catch {
      continue;
    }
  }
  const lines = uniqueQueries(
    text
      .split("\n")
      .filter((line) => !/[{}]|^(queries|news)\b/i.test(line.trim()))
      .filter((line) => line.trim().split(/\s+/).length <= 10),
  );
  return lines.length ? { queries: lines, news: false } : null;
};

export const planSearchQueries = async (
  messages: ChatMessage[],
  options: {
    complete?: PlannerComplete;
    fallback: () => SearchPlan;
    now?: Date;
    location?: string;
    signal?: AbortSignal;
  },
): Promise<SearchPlan> => {
  if (!options.complete) return options.fallback();
  const now = options.now ?? new Date();
  const conversation = transcript(messages);
  if (!conversation) return options.fallback();
  try {
    const reply = await options.complete(
      [
        { role: "system", content: plannerSystem(now, options.location ?? "") },
        { role: "user", content: conversation },
      ],
      { signal: options.signal, timeoutMs: PLANNER_TIMEOUT_MS },
    );
    const parsed = parsePlannerReply(reply);
    if (!parsed) return options.fallback();
    return {
      queries: parsed.queries,
      topic: parsed.news ? "news" : "general",
      source: "llm",
    };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return options.fallback();
  }
};
