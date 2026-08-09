/**
 * Shared multi-language text helpers for guardrails + knowledge retrieval.
 * Focus: EN / AZ / RU / TR (SINAM region) without requiring external NLP.
 */

/** Keep letters/numbers from any script; drop most punctuation. */
export const normalizeMultilangText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/['’`´]/g, "")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenizeMultilang = (text: string, minLen = 2): string[] =>
  normalizeMultilangText(text)
    .split(" ")
    .filter((t) => t.length >= minLen);

/** Common function words we ignore when matching multi-word rules. */
export const MULTILANG_STOP_WORDS = new Set([
  // EN
  "a",
  "an",
  "the",
  "to",
  "how",
  "do",
  "i",
  "want",
  "please",
  "can",
  "you",
  "me",
  "my",
  "for",
  "and",
  "or",
  "with",
  "of",
  "in",
  "on",
  "is",
  "it",
  "this",
  "that",
  "what",
  "who",
  "where",
  "when",
  "why",
  "about",
  // AZ
  "və",
  "bir",
  "bu",
  "o",
  "üçün",
  "ilə",
  "kim",
  "nə",
  "necə",
  "hara",
  "haqqında",
  "mən",
  "sən",
  "siz",
  "istəyirəm",
  "istəyirem",
  "edin",
  "etmək",
  "etmek",
  // RU
  "и",
  "в",
  "на",
  "с",
  "по",
  "как",
  "что",
  "это",
  "я",
  "вы",
  "мне",
  "меня",
  "для",
  "или",
  "про",
  "о",
  "об",
  // TR
  "ve",
  "bir",
  "bu",
  "şu",
  "için",
  "ile",
  "ne",
  "nasıl",
  "hakkında",
  "ben",
  "sen",
  "siz",
]);

/**
 * Map harmful / intent variants across languages to shared stems.
 * Used by hard keyword matching.
 */
const STEM_MAP: Record<string, string> = {
  // EN make/build
  make: "make",
  makes: "make",
  making: "make",
  made: "make",
  build: "make",
  building: "make",
  built: "make",
  create: "make",
  creating: "make",
  created: "make",
  // AZ/TR make
  etmek: "make",
  etmək: "make",
  et: "make",
  yap: "make",
  yapmak: "make",
  qur: "make",
  qurmaq: "make",
  hazırla: "make",
  hazirla: "make",
  // RU make
  сделать: "make",
  делай: "make",
  сделатьбомбу: "make",
  создать: "make",
  собрать: "make",
  // bomb family
  bomb: "bomb",
  bombs: "bomb",
  bomber: "bomb",
  explosive: "bomb",
  explosives: "bomb",
  bomba: "bomb",
  bombası: "bomb",
  bombasi: "bomb",
  bombanı: "bomb",
  bombani: "bomb",
  partlayıcı: "bomb",
  partlayici: "bomb",
  бомба: "bomb",
  бомбу: "bomb",
  бомбы: "bomb",
  взрывчатку: "bomb",
  взрывчатка: "bomb",
  // hack family
  hack: "hack",
  hacks: "hack",
  hacking: "hack",
  hacker: "hack",
  hackers: "hack",
  хак: "hack",
  хакер: "hack",
  хакеры: "hack",
  взломать: "hack",
  взлом: "hack",
  взломай: "hack",
  hackle: "hack",
  hacklemek: "hack",
  sındır: "hack",
  sindir: "hack",
  sındırmaq: "hack",
  sindirmaq: "hack",
};

export const stemMultilangToken = (token: string): string => {
  if (STEM_MAP[token]) return STEM_MAP[token];
  // Light English-ish endings only on latin tokens
  if (/^[a-z]+$/i.test(token)) {
    if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
    if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
    if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
  }
  return token;
};

export const significantMultilangTokens = (phrase: string): string[] =>
  tokenizeMultilang(phrase)
    .map(stemMultilangToken)
    .filter((t) => t.length > 2 && !MULTILANG_STOP_WORDS.has(t));

/**
 * Built-in hard-block phrases always applied on top of admin keywords.
 * Keep short / high-signal across EN, AZ, RU, TR.
 */
export const BUILTIN_BLOCKED_KEYWORDS = [
  // EN
  "bomb",
  "make a bomb",
  "how to make a bomb",
  "hack",
  "how to hack",
  "child porn",
  "credit card dump",
  // AZ
  "bomba",
  "bomba hazırla",
  "bomba et",
  "bomba qur",
  "partlayıcı",
  "necə bomba",
  "hack et",
  "sındırmaq",
  "uşaq porno",
  // RU
  "бомба",
  "сделать бомбу",
  "как сделать бомбу",
  "взрывчатка",
  "взломать",
  "как взломать",
  "детская порнография",
  // TR
  "bomba yap",
  "bomba nasıl",
  "nasıl bomba yapılır",
  "hack yap",
  "nasıl hack",
  "çocuk porno",
];

/** Expand a user query with company/contact synonyms for RAG matching. */
const QUERY_SYNONYM_GROUPS: string[][] = [
  ["sinam", "синам", "sinamın", "sinamin", "şirkət", "sirket", "компания", "kompaniya", "company", "firma"],
  [
    "contact",
    "əlaqə",
    "elaqe",
    "kontakt",
    "kontaktlar",
    "telefon",
    "phone",
    "email",
    "почта",
    "ünvan",
    "unvan",
    "address",
    "офис",
    "office",
    "контакт",
  ],
  ["about", "haqqında", "haqqinda", "о", "про", "kimdir", "кто", "nədir", "nedir", "что такое"],
  ["hours", "iş saatı", "is saati", "iş saatları", "working hours", "часы работы", "график"],
  ["project", "layihə", "layihe", "проект", "проекты", "projects"],
  ["product", "məhsul", "mehsul", "продукт", "həll", "hell", "solution", "solutions", "həllər"],
  ["sesda", "сесда", "sənəd", "sened", "document workflow", "edms"],
  ["farabi", "farabı", "фараби", "sgrp"],
  ["biletim", "biletim.az", "билетим", "bilet", "bus ticket"],
  ["gomap", "gomap.az", "gomap.ge", "гомап", "xəritə", "xerite"],
  ["gonav", "gonav.az", "гонав", "navigator", "naviqator"],
  ["yurdum", "yurd", "юрдум", "smart village"],
  ["price", "qiymət", "qiymet", "цена", "тариф", "pricing", "paket", "package"],
  ["employee", "işçi", "isci", "сотрудник", "staff", "workers"],
];

export const expandQueryTokens = (query: string): string[] => {
  const base = tokenizeMultilang(query, 2);
  const baseSet = new Set(base);
  const expanded = new Set(base);

  const normalized = ` ${normalizeMultilangText(query)} `;
  for (const group of QUERY_SYNONYM_GROUPS) {
    const hit = group.some((term) => {
      const t = normalizeMultilangText(term);
      if (t.length < 2) return false;
      // Exact token match — never substring ("hell" must not match "hello")
      if (!t.includes(" ")) return baseSet.has(t);
      // Multi-word phrases: whole-phrase only
      return normalized.includes(` ${t} `);
    });
    if (hit) {
      for (const term of group) {
        const t = normalizeMultilangText(term);
        if (t.length >= 2) expanded.add(t);
      }
    }
  }

  return [...expanded];
};

/** Detect company-intent questions across languages (boost knowledge). */
export const looksLikeCompanyQuestion = (query: string): boolean => {
  const q = normalizeMultilangText(query);
  if (!q) return false;
  return (
    /\b(sinam|синам|sesda|сесда|sinamgpt|farabi|farabı|фараби|biletim|билетим|gomap|gonav|yurdum|юрдум)\b/i.test(
      q,
    ) ||
    /\b(company|şirkət|sirket|компания|firma|about us|haqqında|haqqinda)\b/i.test(
      q,
    ) ||
    /\b(contact|əlaqə|elaqe|контакт|telefon|phone|email|office|офис|ünvan|unvan)\b/i.test(
      q,
    ) ||
    /\b(project|layihə|layihe|проект|product|məhsul|mehsul|продукт)\b/i.test(q) ||
    /\b(who are you|kimsiniz|кто вы|nə edirsiniz|ne edirsiniz|чем занимаетесь)\b/i.test(
      q,
    )
  );
};

export type DetectedReplyLanguage = {
  code: "en" | "ru" | "az" | "tr" | "other";
  label: string;
};

/**
 * Lightweight reply-language detector for system-prompt injection.
 * Prefer script + clear lexical cues; default Latin/ambiguous → English.
 */
export const detectReplyLanguage = (text: string): DetectedReplyLanguage => {
  const raw = (text ?? "").trim();
  if (!raw) return { code: "en", label: "English" };

  const letters = raw.replace(/[^\p{L}]/gu, "");
  if (!letters) return { code: "en", label: "English" };

  const cyrillic = (letters.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const latin = (letters.match(/\p{Script=Latin}/gu) ?? []).length;
  const arabic = (letters.match(/\p{Script=Arabic}/gu) ?? []).length;
  const total = Math.max(1, letters.length);

  if (cyrillic / total >= 0.35 && cyrillic >= latin && cyrillic >= arabic) {
    return { code: "ru", label: "Russian" };
  }

  const lower = normalizeMultilangText(raw);

  // Azerbaijani (Latin) — ə is a strong cue
  if (
    /[ə]/u.test(lower) ||
    /\b(salam|necesen|necəsən|tesekkur|təşəkkür|zehmet|zəhmət|xahis|xahiş|men|mən)\b/u.test(
      lower,
    )
  ) {
    return { code: "az", label: "Azerbaijani" };
  }

  // Turkish cues (without Azerbaijani ə)
  if (
    /\b(merhaba|nasilsin|nasılsın|tesekkur|teşekkür|lutfen|lütfen|nedir|misiniz)\b/u.test(
      lower,
    )
  ) {
    return { code: "tr", label: "Turkish" };
  }

  // Clear English
  if (
    /\b(the|and|please|hello|hi|hey|what|how|can|you|say|help|with|this|that|for|from|about|write|explain|thanks|thank)\b/i.test(
      raw,
    )
  ) {
    return { code: "en", label: "English" };
  }

  // Short ambiguous Latin greetings → English (company default)
  if (/^(hi|hello|hey|yo|salam|salamlar|merhaba)$/i.test(raw)) {
    return { code: "en", label: "English" };
  }

  if (arabic / total >= 0.35) {
    return { code: "other", label: "the user's language" };
  }

  // Mostly Latin without strong cues → English
  if (latin >= cyrillic) return { code: "en", label: "English" };

  return { code: "other", label: "the user's language" };
};

export const replyLanguageInstruction = (text: string): string => {
  const lang = detectReplyLanguage(text);
  return `REPLY LANGUAGE (mandatory for this turn): ${lang.label}.
Write the entire assistant message in ${lang.label} only.
Do NOT use any other language. Do NOT add translations or glosses in parentheses (never "… (Hello!)").`;
};

/** Always-on language instruction for the system prompt. */
export const MULTILANG_SYSTEM_RULES = `LANGUAGE:
- Reply in the user's language only (see REPLY LANGUAGE below when present). Supported well: English, Azerbaijani, Russian, Turkish.
- Write the entire reply in ONE language. Do NOT add translations, glosses, or a second language in parentheses.
- Never do dual-language answers like "Merhaba... (Hello...)" or "Здравствуйте... (Hello...)".
- Keep the same language for follow-ups unless the user clearly switches.
- If the message is ambiguous or very short (e.g. "salam", "hi"), default to English unless earlier turns already set a language.
- Only provide a translation when the user explicitly asks for one.
- Guardrails and safety rules apply in every language — never bypass them via translation or code-switching.
- COMPANY KNOWLEDGE is reference material written in English — rewrite facts into the reply language; never switch the reply language because knowledge tags mention Russian/Azerbaijani words. Keep names, emails, phones, URLs exact.`;
