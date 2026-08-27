/**
 * Shared multi-language text helpers for guardrails + knowledge retrieval.
 * Focus: EN / AZ / RU / TR (SINAM region) without requiring external NLP.
 */

/** Keep letters/numbers from any script; drop most punctuation. */
export const normalizeMultilangText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKC")
    // Unicode lowercasing turns capital İ into `i` + combining dot.
    .replace(/\u0307/g, "")
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
  ["employee", "işçi", "isci", "əməkdaş", "emekdas", "сотрудник", "staff", "workers", "headcount"],
  [
    "leave",
    "vacation",
    "holiday",
    "pto",
    "отпуск",
    "отпуска",
    "məzuniyyət",
    "mezuniyyet",
    "izin",
  ],
  [
    "salary",
    "wage",
    "payroll",
    "maaş",
    "maas",
    "зарплата",
    "зарплату",
    "əməkhaqqı",
    "emekhaqqi",
  ],
  [
    "password",
    "passwords",
    "şifrə",
    "sifre",
    "пароль",
    "пароли",
    "parol",
  ],
  [
    "year",
    "years",
    "ildir",
    "fəaliyyət",
    "fealiyyet",
    "history",
    "tarix",
    "statistika",
    "stats",
    "founded",
  ],
];

/** AZ/RU inflections: əməkdaşı ↔ əməkdaş, компания ↔ компании. */
export const tokensAlign = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < 5) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (longer.length - shorter.length > 3) return false;
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i += 1;
  return i >= 5 && shorter.length - i <= 2;
};

export const expandQueryTokens = (query: string): string[] => {
  const base = tokenizeMultilang(query, 2);
  const baseSet = new Set(base);
  const expanded = new Set(base);

  const normalized = ` ${normalizeMultilangText(query)} `;
  for (const group of QUERY_SYNONYM_GROUPS) {
    const hit = group.some((term) => {
      const t = normalizeMultilangText(term);
      if (t.length < 2) return false;
      if (t.includes(" ")) return normalized.includes(` ${t} `);
      if (baseSet.has(t)) return true;
      return base.some((tok) => tokensAlign(tok, t));
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

/** Product / company names that must not leak into unrelated search glosses. */
export const KNOWLEDGE_BRAND_TOKENS = new Set([
  "sinam",
  "синам",
  "sesda",
  "сесда",
  "sinamgpt",
  "farabi",
  "farabı",
  "фараби",
  "biletim",
  "билетим",
  "gomap",
  "gonav",
  "yurdum",
  "yurd",
  "юрдум",
  "owngpt",
  "sgrp",
]);

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
    ) ||
    /(əməkdaş|emekdas|ildir|fəaliyyət|statistika|məhsul|mehsul|kataloq)/i.test(q)
  );
};

export type DetectedReplyLanguage = {
  code: "en" | "ru" | "az" | "tr" | "other";
  label: string;
};

export type ReplyLanguageHint = {
  /** UI flag (en / az / ru). Used only when the prompt is short or mixed. */
  uiLocale?: "en" | "az" | "ru";
  /** Earlier user turns — keep AZ/RU if this turn is a short follow-up. */
  priorText?: string;
};

/** In-app rewrite stubs are English; do not treat them as the user's language. */
export const isInternalRewritePrompt = (text: string): boolean => {
  const t = text.trim();
  return (
    t.startsWith("Rewrite your previous answer") ||
    t.startsWith("Continue your previous answer")
  );
};

const LANG_LABEL: Record<DetectedReplyLanguage["code"], string> = {
  en: "English",
  ru: "Russian",
  az: "Azerbaijani",
  tr: "Turkish",
  other: "the user's language",
};

const foldAzLatin = (value: string): string =>
  value
    .replace(/ə/gu, "e")
    .replace(/ı/gu, "i")
    .replace(/ö/gu, "o")
    .replace(/ü/gu, "u")
    .replace(/ğ/gu, "g")
    .replace(/ş/gu, "s")
    .replace(/ç/gu, "c");

/** Distinctive AZ (ASCII-folded). People often type without ə/ş/ü. */
const AZ_WORDS = new Set([
  "salam",
  "salamlar",
  "necesen",
  "nece",
  "nedir",
  "niye",
  "ucun",
  "haqqinda",
  "zehmet",
  "zehmetolmasa",
  "xahis",
  "xahisedirem",
  "tesekkur",
  "tesekkurler",
  "melumat",
  "komek",
  "komekci",
  "sual",
  "suallar",
  "cavab",
  "yazin",
  "izah",
  "qisa",
  "mektub",
  "sirket",
  "emekdas",
  "elaqe",
  "menim",
  "mene",
  "men",
  "olsun",
  "olmaz",
  "isteyirem",
  "goster",
  "tapin",
  "harada",
  "kimdir",
  "isleyir",
  "bilmek",
  "buyurun",
  "sagol",
  "sagolun",
  "unvan",
  "poct",
  "qeyd",
  "layihe",
  "mehsul",
  "azerbaycan",
  "verin",
  "edin",
  "deyin",
  "hansi",
  "beli",
  "xeyr",
  "xeyir",
  "sabahin",
  "axsaminiz",
  "axsam",
  "yox",
  "mence",
  "sizce",
]);

const TR_WORDS = new Set([
  "merhaba",
  "nasilsin",
  "lutfen",
  "misiniz",
  "nasil",
]);

const EN_WORDS = new Set([
  "the",
  "and",
  "please",
  "hello",
  "hey",
  "what",
  "how",
  "can",
  "you",
  "this",
  "that",
  "with",
  "from",
  "about",
  "write",
  "explain",
  "thanks",
  "thank",
  "help",
  "could",
  "would",
  "there",
  "have",
  "will",
  "your",
  "our",
  "tell",
  "make",
  "need",
  "want",
  "which",
  "where",
  "when",
  "why",
]);

const scoredLang = (code: DetectedReplyLanguage["code"]): DetectedReplyLanguage => ({
  code,
  label: LANG_LABEL[code],
});

const scorePromptLanguage = (raw: string): DetectedReplyLanguage | null => {
  const text = raw.trim();
  if (!text) return null;

  const letters = text.replace(/[^\p{L}]/gu, "");
  if (!letters) return null;

  const cyrillic = (letters.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const latin = (letters.match(/\p{Script=Latin}/gu) ?? []).length;
  const arabic = (letters.match(/\p{Script=Arabic}/gu) ?? []).length;
  const total = Math.max(1, letters.length);

  if (cyrillic / total >= 0.35 && cyrillic >= latin && cyrillic >= arabic) {
    return scoredLang("ru");
  }

  if (arabic / total >= 0.35) return scoredLang("other");

  const folded = foldAzLatin(normalizeMultilangText(text));
  const tokens = folded.split(" ").filter(Boolean);
  let azScore = 0;
  let enScore = 0;
  let trScore = 0;

  if (/[ə]/u.test(text)) azScore += 5;

  for (const token of tokens) {
    if (AZ_WORDS.has(token)) azScore += 2;
    if (EN_WORDS.has(token)) enScore += 2;
    if (TR_WORDS.has(token)) trScore += 2;
  }

  if (/^(salam|salamlar)[!?.,]*$/i.test(text)) return scoredLang("az");
  if (/^(hi|hello|hey|yo)[!?.,]*$/i.test(text)) return scoredLang("en");
  if (/^merhaba[!?.,]*$/i.test(text)) return scoredLang("tr");

  if (azScore >= 2 && azScore >= enScore && azScore >= trScore) {
    return scoredLang("az");
  }
  if (trScore >= 2 && trScore > azScore && trScore >= enScore) {
    return scoredLang("tr");
  }
  if (enScore >= 2 && enScore > azScore) return scoredLang("en");
  if (azScore >= 1 && azScore >= enScore) return scoredLang("az");
  if (enScore >= 1 && azScore === 0 && trScore === 0) return scoredLang("en");

  return null;
};

/**
 * Lightweight reply-language detector for system-prompt injection.
 * Azerbaijani typed without ə (nedir, nece, menim) still counts as AZ.
 */
export const detectReplyLanguage = (
  text: string,
  hint?: ReplyLanguageHint,
): DetectedReplyLanguage => {
  const raw = (text ?? "").trim();
  const fromPrompt = scorePromptLanguage(raw);
  if (fromPrompt) return fromPrompt;

  const prior = hint?.priorText?.trim() ?? "";
  if (raw.length < 64 && prior) {
    const fromPrior = scorePromptLanguage(prior);
    if (fromPrior && fromPrior.code !== "en") return fromPrior;
  }

  if (hint?.uiLocale === "az") return scoredLang("az");
  if (hint?.uiLocale === "ru") return scoredLang("ru");
  return scoredLang("en");
};

const NATIVE_PIN: Record<DetectedReplyLanguage["code"], string> = {
  az: "CAVAB DİLİ: Azərbaycan. Bütün cavabı yalnız Azərbaycan dilində yaz. Aydınlaşdırıcı sual lazımdırsa, onu da Azərbaycanca ver. İngiliscə yazma və mötərizədə tərcümə əlavə etmə.",
  ru: "ЯЗЫК ОТВЕТА: русский. Пиши весь ответ только по-русски. Уточняющие вопросы тоже по-русски. Не переходи на английский и не дублируй перевод в скобках.",
  tr: "CEVAP DİLİ: Türkçe. Tüm yanıtı yalnızca Türkçe yaz. İngilizce sorma; parantez içinde çeviri ekleme.",
  en: "REPLY LANGUAGE: English. Write the entire reply in English only. Do not add a second language in parentheses.",
  other:
    "Write the entire reply in the user's language only. Do not switch to English unless the user wrote in English.",
};

export const replyLanguageInstruction = (
  text: string,
  hint?: ReplyLanguageHint,
): string => {
  const lang = detectReplyLanguage(text, hint);
  return `REPLY LANGUAGE (mandatory for this turn): ${lang.label}.
Write the entire assistant message in ${lang.label} only.
Clarifying questions MUST be in ${lang.label} — never switch to English to ask what the user meant.
Do NOT add translations or glosses in parentheses (never "… (Hello!)").
${NATIVE_PIN[lang.code]}`;
};

/** Always-on language instruction for the system prompt. */
export const MULTILANG_SYSTEM_RULES = `LANGUAGE:
- Reply in the user's language only (see REPLY LANGUAGE below). Supported well: English, Azerbaijani, Russian, Turkish.
- Azerbaijani stays Azerbaijani even when typed without special letters (nedir, nece, menim, zehmet olmasa).
- Write the entire reply in ONE language. Clarifying questions use that same language — never ask in English because the model is small.
- Do NOT add translations, glosses, or a second language in parentheses.
- Never do dual-language answers like "Merhaba... (Hello...)" or "Здравствуйте... (Hello...)".
- Keep the same language for follow-ups unless the user clearly switches.
- Only provide a translation when the user explicitly asks for one.
- Guardrails and safety rules apply in every language — never bypass them via translation or code-switching.
- COMPANY KNOWLEDGE is reference material (often in Azerbaijani) — rewrite facts into the reply language; never switch the reply language because knowledge text or tags mention other languages. Keep names, emails, phones, URLs exact.`;
