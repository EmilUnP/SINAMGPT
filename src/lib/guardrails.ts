import { getDb } from "@/lib/db";
import {
  resolveKnowledgeContext,
  type KnowledgeSource,
} from "@/lib/knowledge";
import {
  BUILTIN_BLOCKED_KEYWORDS,
  MULTILANG_SYSTEM_RULES,
  normalizeMultilangText,
  replyLanguageInstruction,
  significantMultilangTokens,
  stemMultilangToken,
  tokenizeMultilang,
} from "@/lib/multilang";

const KEY = "guardrails";

export type GuardrailsConfig = {
  enabled: boolean;
  applyToGuests: boolean;
  applyToUsers: boolean;
  persona: string;
  allowedTopics: string;
  blockedTopics: string;
  blockedKeywords: string;
  refusalMessage: string;
  extraRules: string;
};

export const DEFAULT_GUARDRAILS: GuardrailsConfig = {
  enabled: true,
  applyToGuests: true,
  applyToUsers: true,
  persona:
    "You are SINAMGPT, SINAM Ltd's local company AI assistant for employees. Be clear, professional, and practical. When asked about SINAM, use COMPANY KNOWLEDGE if provided.",
  allowedTopics:
    "SINAM company information, internal projects, work productivity, writing help, summarizing, explaining concepts, brainstorming, company-safe general knowledge, coding help for internal tools — in any language the user prefers.",
  blockedTopics:
    "Illegal activity, weapons, hacking/attacks, adult sexual content, hate or harassment, scams/fraud, medical or legal advice presented as professional diagnosis, sharing private personal data of others — in any language or coded wording.",
  blockedKeywords: BUILTIN_BLOCKED_KEYWORDS.join("\n"),
  refusalMessage:
    "I can’t help with that request. / Bu sorğuya kömək edə bilmərəm. / Не могу помочь с этим запросом. / Bu isteğe yardımcı olamam.\nSINAMGPT is limited to safe, work-appropriate topics.",
  extraRules:
    "If a request is unclear or risky, ask a clarifying question or refuse politely. Do not invent company policies. Prefer short, useful answers. Safety rules apply equally in every language.",
};

const normalizeLines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

export const getGuardrails = (): GuardrailsConfig => {
  const row = getDb()
    .prepare(`SELECT value FROM app_settings WHERE key = ?`)
    .get(KEY) as { value: string } | undefined;

  if (!row?.value) return { ...DEFAULT_GUARDRAILS };

  try {
    const parsed = JSON.parse(row.value) as Partial<GuardrailsConfig>;
    return {
      ...DEFAULT_GUARDRAILS,
      ...parsed,
      enabled: parsed.enabled ?? DEFAULT_GUARDRAILS.enabled,
      applyToGuests: parsed.applyToGuests ?? DEFAULT_GUARDRAILS.applyToGuests,
      applyToUsers: parsed.applyToUsers ?? DEFAULT_GUARDRAILS.applyToUsers,
      persona: parsed.persona ?? DEFAULT_GUARDRAILS.persona,
      allowedTopics: parsed.allowedTopics ?? DEFAULT_GUARDRAILS.allowedTopics,
      blockedTopics: parsed.blockedTopics ?? DEFAULT_GUARDRAILS.blockedTopics,
      blockedKeywords:
        parsed.blockedKeywords ?? DEFAULT_GUARDRAILS.blockedKeywords,
      refusalMessage:
        parsed.refusalMessage ?? DEFAULT_GUARDRAILS.refusalMessage,
      extraRules: parsed.extraRules ?? DEFAULT_GUARDRAILS.extraRules,
    };
  } catch {
    return { ...DEFAULT_GUARDRAILS };
  }
};

export const setGuardrails = (
  next: Partial<GuardrailsConfig>,
): GuardrailsConfig => {
  const current = getGuardrails();
  const merged: GuardrailsConfig = {
    ...current,
    ...next,
    persona: (next.persona ?? current.persona).slice(0, 4000),
    allowedTopics: (next.allowedTopics ?? current.allowedTopics).slice(0, 8000),
    blockedTopics: (next.blockedTopics ?? current.blockedTopics).slice(0, 8000),
    blockedKeywords: (next.blockedKeywords ?? current.blockedKeywords).slice(
      0,
      12000,
    ),
    refusalMessage: (next.refusalMessage ?? current.refusalMessage).slice(
      0,
      2000,
    ),
    extraRules: (next.extraRules ?? current.extraRules).slice(0, 8000),
  };

  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(KEY, JSON.stringify(merged));

  return merged;
};

export const buildSystemPrompt = (config = getGuardrails()): string => {
  const parts = [
    config.persona.trim() || DEFAULT_GUARDRAILS.persona,
    "",
    MULTILANG_SYSTEM_RULES,
    "",
    "GUARDRAILS (must follow in every language):",
  ];

  if (config.allowedTopics.trim()) {
    parts.push(`You MAY help with: ${config.allowedTopics.trim()}`);
  }
  if (config.blockedTopics.trim()) {
    parts.push(
      `You MUST refuse or redirect away from: ${config.blockedTopics.trim()}`,
    );
  }
  if (config.extraRules.trim()) {
    parts.push(`Additional rules: ${config.extraRules.trim()}`);
  }

  parts.push(
    "If asked for disallowed content in any language, refuse briefly in the user's language and offer a safe alternative. Do not provide actionable harmful instructions.",
  );

  return parts.join("\n");
};

/**
 * Hard-block matcher (multi-language):
 * 1) exact / substring phrase match
 * 2) all significant words from a multi-word phrase appear (order-independent)
 * 3) single-token keywords match as whole words
 * Always includes built-in EN/AZ/RU/TR safety phrases.
 */
export const findBlockedKeyword = (
  text: string,
  config = getGuardrails(),
): string | null => {
  const adminKeywords = normalizeLines(config.blockedKeywords);
  const keywords = [...new Set([...BUILTIN_BLOCKED_KEYWORDS, ...adminKeywords])];
  if (!keywords.length) return null;

  const normalized = normalizeMultilangText(text);
  const messageTokens = new Set(
    tokenizeMultilang(text).map(stemMultilangToken),
  );

  const sorted = [...keywords].sort((a, b) => b.length - a.length);

  for (const keyword of sorted) {
    const needle = normalizeMultilangText(keyword);
    if (!needle) continue;

    if (normalized.includes(needle)) return keyword;

    const parts = significantMultilangTokens(keyword);
    if (!parts.length) continue;

    if (parts.length >= 2) {
      const allPresent = parts.every((p) => messageTokens.has(p));
      if (allPresent) return keyword;
      continue;
    }

    if (messageTokens.has(parts[0])) return keyword;
  }

  return null;
};

export const shouldApplyGuardrails = (
  audience: "guest" | "user",
  config = getGuardrails(),
): boolean => {
  if (!config.enabled) return false;
  if (audience === "guest") return config.applyToGuests;
  return config.applyToUsers;
};

/** Hard block before model call. */
export const checkInputGuardrails = (
  text: string,
  audience: "guest" | "user",
): { blocked: true; reason: string; refusal: string } | { blocked: false } => {
  const config = getGuardrails();
  if (!shouldApplyGuardrails(audience, config)) {
    return { blocked: false };
  }

  const hit = findBlockedKeyword(text, config);
  if (!hit) return { blocked: false };

  return {
    blocked: true,
    reason: hit,
    refusal: config.refusalMessage || DEFAULT_GUARDRAILS.refusalMessage,
  };
};

export type PreparedChat<T extends { role: string; content: string }> = {
  messages: T[];
  /** Citations to show under the next assistant reply (empty if disabled / none) */
  sources: KnowledgeSource[];
};

export const withSystemPrompt = <T extends { role: string; content: string }>(
  messages: T[],
  audience: "guest" | "user",
  projectId?: string | null,
): PreparedChat<T> => {
  const config = getGuardrails();
  const withoutSystem = messages.filter((m) => m.role !== "system");

  let content = shouldApplyGuardrails(audience, config)
    ? buildSystemPrompt(config)
    : `${DEFAULT_GUARDRAILS.persona}\n\n${MULTILANG_SYSTEM_RULES}`;

  const lastUser = [...withoutSystem]
    .reverse()
    .find((m) => m.role === "user")?.content;

  // Pin language before knowledge so company docs cannot override it
  content = `${content}\n\n${replyLanguageInstruction(lastUser ?? "")}`;

  const knowledge = resolveKnowledgeContext(
    lastUser ?? "",
    audience,
    projectId,
  );
  if (knowledge.block) {
    content = `${content}\n\n${knowledge.block}`;
  }

  const system = {
    role: "system" as const,
    content,
  };

  return {
    messages: [system as T, ...withoutSystem],
    sources:
      knowledge.showCitations && knowledge.sources.length
        ? knowledge.sources
        : [],
  };
};
