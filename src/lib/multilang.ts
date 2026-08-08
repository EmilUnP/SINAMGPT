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
  ["sesda", "сесда"],
  ["price", "qiymət", "qiymet", "цена", "тариф", "pricing", "paket", "package"],
  ["employee", "işçi", "isci", "сотрудник", "staff", "workers"],
];

export const expandQueryTokens = (query: string): string[] => {
  const base = tokenizeMultilang(query, 2);
  const expanded = new Set(base);

  const normalized = normalizeMultilangText(query);
  for (const group of QUERY_SYNONYM_GROUPS) {
    const hit = group.some(
      (term) =>
        normalized.includes(normalizeMultilangText(term)) ||
        base.includes(normalizeMultilangText(term)),
    );
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
    /\b(sinam|синам|sesda|сесда|sinamgpt)\b/i.test(q) ||
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

/** Always-on language instruction for the system prompt. */
export const MULTILANG_SYSTEM_RULES = `LANGUAGE:
- Detect the user's language from their latest message and reply in THAT language only (Azerbaijani, Russian, English, Turkish, or others).
- Write the entire reply in one language. Do NOT add translations, glosses, or English in parentheses.
- Never do dual-language answers like "Merhaba... (Hello...)" or "Здравствуйте... (Hello...)".
- Keep the same language for follow-ups unless the user clearly switches.
- If the message is ambiguous or very short (e.g. "salam", "hi"), default to English unless earlier turns already set a language.
- Only provide a translation when the user explicitly asks for one.
- Guardrails and safety rules apply in every language — never bypass them via translation or code-switching.
- When using COMPANY KNOWLEDGE, rewrite the facts in the user's single reply language; keep names, emails, phones, URLs exact.`;
