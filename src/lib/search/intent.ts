import { isInternalRewritePrompt } from "@/lib/multilang";
import type { ChatMessage, LlmToolCall } from "@/lib/llm";

/** Instruct the model that live web tools exist. Injected only when search is on. */
export const SEARCH_SYSTEM_RULES = `INTERNET SEARCH (be proactive — do not wait to be told "search"):
You have tools web_search and web_fetch. Prefer calling web_search yourself whenever the answer needs the public web.

Always search (call web_search) when the user asks about:
- a person you are not sure of (kimdir / kimdi / who is / haqqında məlumat / tell me about …)
- company leadership (rəhbər, director, CEO, founder) — even if COMPANY KNOWLEDGE exists but does not name them
- weather, news, prices, sports, dates, or anything that changes
- facts outside COMPANY KNOWLEDGE
- or clearly wants the internet

Do NOT ask "should I search?" and do NOT require the user to say "internetdə axtar".
If company knowledge is empty, weak, or does not contain the specific name/fact, call web_search — do not stop at "məlumatlarda yoxdur".

How to search:
1) Infer intent from the conversation (including the previous user turn if this turn is only "search online").
2) Call web_search with a short keyword query (names, company, role) — never paste the full chat sentence; never write tool names in your reply instead of calling the tool.
3) Read the results. If they are empty, off-topic, or do not contain the fact asked for, call web_search AGAIN with different keywords (try the name alone, add the city or company, or drop words). You may search up to 3 times.
4) Use web_fetch on a result URL when the snippet looks right but is too short.
5) Answer from tool results and cite URLs. If after searching you still have nothing solid, say so plainly instead of inventing details.

Forbidden: claiming you cannot search; describing web_search/web_fetch without calling them; answering "no internal data" / "verilən məlumatlarda yoxdur" when a web search would help.`;

/** Reminder injected right before the final answer when search tools already ran. */
export const POST_SEARCH_ANSWER_RULES = `CRITICAL: web_search / web_fetch already ran. Their tool messages above are live source data.
Answer the user's last question using that data now.
Do NOT refuse. Do NOT say you lack real-time or internet access.
Summarize the useful facts and cite URLs.
If sources conflict or lack detail, say that briefly — still answer from what they contain.`;

const MODEL_SKIPPED_SEARCH_RE =
  /cannot search|can't search|do not have (access|information|data)|don't have (access|information|specific)|no (specific )?information|only (use )?(my )?database|internal data|company knowledge|use external|birbaşa .+ bilmirəm|məlumat(?:ım|im) yoxdur|veril[əe]n m[əe]lumat|m[əe]n[əe] veril|spesifik .+ (bar[əe]d[əe]|yox)|daxili (məlumat|baz)|нет (данных|информации)|не могу (искать|найти|предоставить)|только .+ баз|provided (to me|information|materials)|in (the )?(information|materials|docs) (provided|given)/i;

/**
 * Append a hard reminder so small models stop claiming "no real-time access"
 * after they already received search tool results.
 */
export const withPostSearchAnswerHint = (
  messages: ChatMessage[],
): ChatMessage[] => {
  const hasSearchTool = messages.some(
    (message) =>
      message.role === "tool" &&
      (message.toolName === "web_search" || message.toolName === "web_fetch"),
  );
  if (!hasSearchTool) return messages;
  return [
    ...messages,
    {
      role: "system",
      content: POST_SEARCH_ANSWER_RULES,
    },
  ];
};

const WEATHER_RE =
  /\b(weather|forecast|temperature|°[cf]|celsius|fahrenheit)\b|\bhava\b|hava\s*proqnoz|погод|прогноз\s+погод/i;

const NEWS_RE =
  /\b(news|headline|breaking)\b|xəb[əe]r|xeber|новост/i;

const PERSON_RE =
  /\b(who\s+is|who\s+was|who's|biography|bio\s+of|tell\s+me\s+about|information\s+about|info\s+(?:on|about)|what\s+do\s+you\s+know\s+about)\b|\bkimdi(?:r)?\b|\bkidir\b|kim\s+olub|haqq[ıi]nda(?:\s+m[əe]lumat(?:\s+ver)?)?|bar[əe]d[əe]|m[əe]lumat\s+ver|кто\s+так(?:ой|ая)|кто\s+это|расскажи\s+о|информаци[яи]\s+о/i;

/** Company leadership / executive questions (often missing from local knowledge packs). */
const ORG_LEADER_RE =
  /\b(ceo|cfo|cto|coo|founder|co-founder|director|president|chairman|chairwoman|managing\s+director|general\s+director|owner)\b|r[əe]hb[əe]r(?:i|inin|liy)?|direktor|t[əe]sis[çc]i|s[əe]dr(?:i)?|baş\s*direktor|гендиректор|директор|основатель|руководитель|руководств/i;

const EXPLICIT_SEARCH_RE =
  /\b(search\s+(the\s+)?(web|internet|online)|google\s+(it|him|her|them|this)|look\s+(it\s+)?up\s+online)\b|internetd[eə]\s*axtar|axtar\s*(internet|google|onlayn)|в\s*интернете|найди\s*в\s*интернете|поиск\s*в\s*интернете|поищи\s*в\s*сети/i;

const LIVE_QUERY_RE =
  /\b(weather|forecast|news|headline|breaking|stock|ticker|scoreboard|kickoff)\b|hava\s*proqnoz|\bhava\b|xəb[əe]r|xeber|погод|прогноз|новост|курс[ауе]?\b|exchange\s+rate|dollar\s+kurs|bu\s+g[uü]n\s+hava|today'?s\s+(weather|news)|right\s+now|real[\s-]?time/i;

export const looksLikeLiveWebQuery = (text: string): boolean => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3 || cleaned.length > 400) return false;
  if (isInternalRewritePrompt(cleaned)) return false;
  return (
    LIVE_QUERY_RE.test(cleaned) ||
    PERSON_RE.test(cleaned) ||
    ORG_LEADER_RE.test(cleaned) ||
    EXPLICIT_SEARCH_RE.test(cleaned)
  );
};

/** Short follow-ups like "internetdə axtar" with no topic of their own. */
export const isBareSearchCommand = (text: string): boolean => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3 || cleaned.length > 80) return false;
  if (!EXPLICIT_SEARCH_RE.test(cleaned)) return false;
  if (PERSON_RE.test(cleaned) || WEATHER_RE.test(cleaned) || NEWS_RE.test(cleaned) || ORG_LEADER_RE.test(cleaned)) {
    return false;
  }
  return cleaned.split(/\s+/).length <= 8;
};

/**
 * Topic to search: last user text, or previous question when they only said "search online".
 */
export const resolveSearchSeed = (messages: ChatMessage[]): string | null => {
  const users = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.replace(/\s+/g, " ").trim())
    .filter((text) => text && !isInternalRewritePrompt(text));
  if (!users.length) return null;

  const last = users.at(-1)!;
  if (isBareSearchCommand(last)) {
    for (let i = users.length - 2; i >= 0; i -= 1) {
      const prior = users[i]!;
      if (!isBareSearchCommand(prior)) return prior;
    }
    return null;
  }

  if (looksLikeLiveWebQuery(last)) return last;
  return null;
};

const todayStamp = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Turn a casual live question into a search-engine query.
 * Small models often search the raw user sentence and get old / unrelated pages.
 */
export const buildLiveSearchQuery = (text: string): string => {
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 400);
  const date = todayStamp();

  if (WEATHER_RE.test(cleaned)) {
    const hasPlace =
      /\b(baku|bak[ıi]|absheron|abşeron|azerbaijan|azərbaycan|sumqay[ıi]t|ganja|gəncə|moscow|москв|istanbul|london)\b/i.test(
        cleaned,
      );
    if (hasPlace) {
      return `weather forecast today ${date} ${cleaned}`.slice(0, 400);
    }
    return `Baku Absheron weather forecast today ${date} temperature`.slice(
      0,
      400,
    );
  }

  if (NEWS_RE.test(cleaned)) {
    return `Azerbaijan latest news today ${date}`.slice(0, 400);
  }

  if (ORG_LEADER_RE.test(cleaned) || PERSON_RE.test(cleaned)) {
    if (ORG_LEADER_RE.test(cleaned) && /\bsinam\b/i.test(cleaned)) {
      return "SINAM Azerbaijan CEO director founder rəhbər";
    }
    const name = cleaned
      .replace(PERSON_RE, " ")
      .replace(ORG_LEADER_RE, " ")
      .replace(
        /\b(haqq[ıi]nda|bar[əe]d[əe]|m[əe]lumat(?:\s+ver)?|şirk[əe]t(?:inin)?|company(?:'s)?|please|pls)\b/gi,
        " ",
      )
      .replace(/[?؟!.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (ORG_LEADER_RE.test(cleaned) && name) {
      return `${name} CEO director founder`.slice(0, 400);
    }
    return (name || cleaned).slice(0, 400);
  }

  if (looksLikeLiveWebQuery(cleaned)) {
    return `${cleaned} today ${date}`.slice(0, 400);
  }

  return cleaned;
};

/**
 * High-confidence intents: search immediately so small models cannot hide behind
 * weak COMPANY KNOWLEDGE (e.g. "rəhbər kimdi?" → docs without a name).
 */
export const shouldPreemptWebSearch = (text: string): boolean => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3 || cleaned.length > 400) return false;
  if (isInternalRewritePrompt(cleaned)) return false;
  return (
    PERSON_RE.test(cleaned) ||
    ORG_LEADER_RE.test(cleaned) ||
    WEATHER_RE.test(cleaned) ||
    NEWS_RE.test(cleaned) ||
    EXPLICIT_SEARCH_RE.test(cleaned) ||
    isBareSearchCommand(cleaned)
  );
};

const forcedWebSearch = (seed: string): LlmToolCall[] => [
  {
    id: "forced-web-search",
    name: "web_search",
    arguments: {
      query: buildLiveSearchQuery(seed),
    },
  },
];

/**
 * Force web_search:
 * - before the model, for people / leadership / weather / news / explicit search
 * - after the model, if it skipped tools or dodged with "no internal data"
 */
export const recoverLiveSearchCalls = (
  messages: ChatMessage[],
  modelContent: string,
): LlmToolCall[] => {
  if (messages.some((message) => message.toolName === "web_search")) return [];
  const seed = resolveSearchSeed(messages);
  if (!seed) return [];

  const replied = modelContent.replace(/\s+/g, " ").trim();

  // Pre-model: do not let company RAG answer "I don't know the director"
  if (!replied) {
    if (!shouldPreemptWebSearch(seed)) return [];
    return forcedWebSearch(seed);
  }

  const needsWeb =
    looksLikeLiveWebQuery(seed) || MODEL_SKIPPED_SEARCH_RE.test(replied);
  const weakKnowledgeDodge =
    /veril[əe]n m[əe]lumat|company knowledge|provided (to me|information)|spesifik|r[əe]hb[əe]r/i.test(
      replied,
    ) && looksLikeLiveWebQuery(seed);
  if (!needsWeb && !weakKnowledgeDodge) return [];

  return forcedWebSearch(seed);
};

const MAX_TOOL_SNIPPET = 320;
const MAX_TOOL_PAGE_TEXT = 1_800;
const MAX_TOOL_RESULTS = 5;

/**
 * Shrink web_search / web_fetch payloads before the final model answer.
 * Huge page dumps make tiny local models hang until the 5‑minute route timeout.
 */
export const compactToolMessagesForModel = (
  messages: ChatMessage[],
): ChatMessage[] =>
  messages.map((message) => {
    if (message.role !== "tool" || !message.content) return message;
    try {
      const parsed = JSON.parse(message.content) as Record<string, unknown>;
      if (message.toolName === "web_search" && Array.isArray(parsed.results)) {
        parsed.results = parsed.results
          .slice(0, MAX_TOOL_RESULTS)
          .map((row) => {
            const item =
              row && typeof row === "object"
                ? (row as Record<string, unknown>)
                : {};
            const next: Record<string, unknown> = {
              title: String(item.title ?? "").slice(0, 200),
              url: String(item.url ?? "").slice(0, 2048),
              snippet: String(item.snippet ?? "").slice(0, MAX_TOOL_SNIPPET),
            };
            if (typeof item.page_text === "string" && item.page_text.trim()) {
              next.page_text = item.page_text.slice(0, MAX_TOOL_PAGE_TEXT);
            }
            return next;
          });
        return { ...message, content: JSON.stringify(parsed) };
      }
      if (message.toolName === "web_fetch" && typeof parsed.text === "string") {
        return {
          ...message,
          content: JSON.stringify({
            url: String(parsed.url ?? "").slice(0, 2048),
            title: String(parsed.title ?? "").slice(0, 200),
            text: parsed.text.slice(0, MAX_TOOL_PAGE_TEXT),
          }),
        };
      }
    } catch {
      if (message.content.length > 8_000) {
        return { ...message, content: message.content.slice(0, 8_000) };
      }
    }
    return message;
  });
