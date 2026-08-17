import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import type { GuardrailsConfig } from "@/lib/guardrails";
import { resolveKnowledgeContext } from "@/lib/knowledge";
import { glossUserQuery } from "@/lib/query-gloss";
import {
  BUILTIN_BLOCKED_KEYWORDS,
  detectReplyLanguage,
  normalizeMultilangText,
  significantMultilangTokens,
  stemMultilangToken,
  tokenizeMultilang,
} from "@/lib/multilang";

const isApplied = (
  audience: "guest" | "user",
  config: GuardrailsConfig,
): boolean => {
  if (!config.enabled) return false;
  return audience === "guest" ? config.applyToGuests : config.applyToUsers;
};

export type GuardrailSeverity = "info" | "warn" | "block";

export type GuardrailLayer =
  | "master_switch"
  | "audience"
  | "language"
  | "keywords"
  | "prompt_injection"
  | "secrets"
  | "pii_patterns"
  | "knowledge";

export type GuardrailFinding = {
  layer: GuardrailLayer;
  severity: GuardrailSeverity;
  ruleId: string;
  title: string;
  detail: string;
  /** Short matched snippet (never full secrets) */
  matched?: string;
};

export type GuardrailInspection = {
  decision: "allow" | "block";
  audience: "guest" | "user";
  applied: boolean;
  detectedLanguage: { code: string; label: string };
  findings: GuardrailFinding[];
  layersRun: GuardrailLayer[];
  summary: string;
  refusal?: string;
  blockReason?: string;
  timingsMs: number;
  knowledge: {
    wouldInject: boolean;
    sourceCount: number;
    titles: string[];
  };
};

export type GuardrailEventRow = {
  id: string;
  audience: string;
  decision: string;
  username: string;
  user_id: string | null;
  prompt_preview: string;
  summary: string;
  findings_json: string;
  created_at: string;
};

const newId = () => randomBytes(12).toString("hex");

const normalizeLines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

/** Light de-obfuscation so `b0mb` / `h@ck` still hit keyword rules. */
export const deobfuscateForSafety = (text: string): string =>
  normalizeMultilangText(text)
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/!/g, "i");

const redactMatch = (value: string, max = 48): string => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
};

const INJECTION_PATTERNS: Array<{ id: string; re: RegExp; title: string }> = [
  {
    id: "ignore_instructions",
    re: /\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|system)\b.{0,20}\b(instructions?|rules?|prompt)\b/i,
    title: "Ignore previous instructions",
  },
  {
    id: "reveal_system",
    re: /\b(reveal|show|print|dump|repeat)\b.{0,30}\b(system\s*prompt|hidden\s*prompt|initial\s*instructions?)\b/i,
    title: "Reveal system prompt",
  },
  {
    id: "dan_jailbreak",
    re: /\b(dan\s*mode|do\s*anything\s*now|jailbreak|developer\s*mode|god\s*mode)\b/i,
    title: "Jailbreak / DAN-style request",
  },
  {
    id: "no_restrictions",
    re: /\b(no\s*restrictions|without\s*limits|bypass\s*(the\s*)?(filters?|guardrails?|safety)|disable\s*(safety|filters?|guardrails?))\b/i,
    title: "Bypass safety filters",
  },
  {
    id: "role_override",
    re: /\b(you\s*are\s*now|act\s*as\s*if\s*you\s*have\s*no|pretend\s*you\s*(are|have)\s*no)\b.{0,40}\b(restrictions?|rules?|ethics|guidelines)\b/i,
    title: "Role override to drop rules",
  },
  {
    id: "ru_ignore",
    re: /\b(игнорируй|забудь)\b.{0,30}\b(инструкции|правила|системн)/i,
    title: "Ignore instructions (RU)",
  },
  {
    id: "az_ignore",
    re: /\b(əvvəlki|evvelki|əvvəlki)\b.{0,20}\b(təlimat|telimat|qaydalar)/i,
    title: "Ignore instructions (AZ)",
  },
];

const SECRET_PATTERNS: Array<{ id: string; re: RegExp; title: string }> = [
  {
    id: "openai_sk",
    re: /\bsk-[A-Za-z0-9_-]{20,}\b/,
    title: "API secret key pattern",
  },
  {
    id: "aws_key",
    re: /\bAKIA[0-9A-Z]{16}\b/,
    title: "AWS access key pattern",
  },
  {
    id: "private_key",
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    title: "Private key block",
  },
  {
    id: "github_pat",
    re: /\bghp_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    title: "GitHub token pattern",
  },
  {
    id: "generic_bearer",
    re: /\b(api[_-]?key|secret[_-]?key|access[_-]?token)\b\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}/i,
    title: "Inline API key assignment",
  },
];

const PII_PATTERNS: Array<{ id: string; re: RegExp; title: string }> = [
  {
    id: "credit_card",
    re: /\b(?:\d[ -]*?){13,19}\b/,
    title: "Long digit sequence (possible card number)",
  },
  {
    id: "email_dump",
    re: /(?:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\s*){5,}/i,
    title: "Bulk email list",
  },
];

const findKeywordHit = (
  text: string,
  config: GuardrailsConfig,
): { keyword: string; via: string } | null => {
  const adminKeywords = normalizeLines(config.blockedKeywords);
  const keywords = [...new Set([...BUILTIN_BLOCKED_KEYWORDS, ...adminKeywords])];
  if (!keywords.length) return null;

  const variants = [normalizeMultilangText(text), deobfuscateForSafety(text)];
  const tokenSets = variants.map(
    (v) => new Set(tokenizeMultilang(v).map(stemMultilangToken)),
  );

  const sorted = [...keywords].sort((a, b) => b.length - a.length);

  for (const keyword of sorted) {
    const needle = normalizeMultilangText(keyword);
    if (!needle) continue;

    for (let i = 0; i < variants.length; i += 1) {
      const normalized = variants[i];
      const messageTokens = tokenSets[i];
      if (normalized.includes(needle)) {
        return {
          keyword,
          via: i === 0 ? "phrase" : "deobfuscated phrase",
        };
      }

      const parts = significantMultilangTokens(keyword);
      if (!parts.length) continue;

      if (parts.length >= 2) {
        if (parts.every((p) => messageTokens.has(p))) {
          return {
            keyword,
            via: i === 0 ? "token set" : "deobfuscated tokens",
          };
        }
        continue;
      }

      if (messageTokens.has(parts[0])) {
        return {
          keyword,
          via: i === 0 ? "token" : "deobfuscated token",
        };
      }
    }
  }

  return null;
};

export const inspectGuardrails = async (input: {
  text: string;
  audience: "guest" | "user";
  projectId?: string | null;
  config: GuardrailsConfig;
  model?: string;
}): Promise<GuardrailInspection> => {
  const started = Date.now();
  const config = input.config;
  const text = input.text ?? "";
  const lang = detectReplyLanguage(text);
  const findings: GuardrailFinding[] = [];
  const layersRun: GuardrailLayer[] = ["master_switch", "audience", "language"];
  const gloss = await glossUserQuery(text, { model: input.model });

  const applied = isApplied(input.audience, config);

  findings.push({
    layer: "master_switch",
    severity: "info",
    ruleId: "enabled",
    title: config.enabled ? "Guardrails enabled" : "Guardrails disabled",
    detail: config.enabled
      ? "Master switch is ON — safety layers may run."
      : "Master switch is OFF — only language pinning still applies in chat prep.",
  });

  findings.push({
    layer: "audience",
    severity: "info",
    ruleId: `audience_${input.audience}`,
    title: `Audience: ${input.audience}`,
    detail: applied
      ? `Rules apply to ${input.audience}s.`
      : `Rules are configured not to apply to ${input.audience}s.`,
  });

  findings.push({
    layer: "language",
    severity: "info",
    ruleId: `lang_${lang.code}`,
    title: `Detected reply language: ${lang.label}`,
    detail: gloss.usedLlm
      ? `Chat will pin REPLY LANGUAGE to ${lang.label} for this turn. Retrieval also searches translated EN/AZ/RU keywords.`
      : `Chat will pin REPLY LANGUAGE to ${lang.label} for this turn.`,
  });

  let decision: "allow" | "block" = "allow";
  let blockReason: string | undefined;
  let refusal: string | undefined;

  if (applied) {
    layersRun.push("keywords");
    const hit =
      findKeywordHit(text, config) ??
      (gloss.searchText ? findKeywordHit(gloss.searchText, config) : null);
    if (hit) {
      decision = "block";
      blockReason = hit.keyword;
      refusal = config.refusalMessage;
      findings.push({
        layer: "keywords",
        severity: "block",
        ruleId: "blocked_keyword",
        title: "Hard keyword / phrase block",
        detail: `Matched blocked term via ${hit.via}. Request will not reach the model.`,
        matched: redactMatch(hit.keyword),
      });
    } else {
      findings.push({
        layer: "keywords",
        severity: "info",
        ruleId: "keywords_clear",
        title: "Keyword scan clear",
        detail: `No hits in ${BUILTIN_BLOCKED_KEYWORDS.length} built-in + admin keyword list (incl. light de-obfuscation).`,
      });
    }

    if (config.detectPromptInjection !== false) {
      layersRun.push("prompt_injection");
      let injHit: (typeof INJECTION_PATTERNS)[number] | null = null;
      for (const p of INJECTION_PATTERNS) {
        if (p.re.test(text) || p.re.test(deobfuscateForSafety(text))) {
          injHit = p;
          break;
        }
      }
      if (injHit) {
        decision = "block";
        blockReason = blockReason || injHit.title;
        refusal = refusal || config.refusalMessage;
        findings.push({
          layer: "prompt_injection",
          severity: "block",
          ruleId: injHit.id,
          title: injHit.title,
          detail:
            "Prompt-injection / jailbreak pattern detected. The model is not called.",
          matched: redactMatch(injHit.title),
        });
      } else {
        findings.push({
          layer: "prompt_injection",
          severity: "info",
          ruleId: "injection_clear",
          title: "Prompt-injection scan clear",
          detail: `Checked ${INJECTION_PATTERNS.length} jailbreak / override patterns.`,
        });
      }
    }

    if (config.detectSecrets !== false) {
      layersRun.push("secrets");
      let secretHit: (typeof SECRET_PATTERNS)[number] | null = null;
      for (const p of SECRET_PATTERNS) {
        if (p.re.test(text)) {
          secretHit = p;
          break;
        }
      }
      if (secretHit) {
        decision = "block";
        blockReason = blockReason || secretHit.title;
        refusal = refusal || config.refusalMessage;
        findings.push({
          layer: "secrets",
          severity: "block",
          ruleId: secretHit.id,
          title: secretHit.title,
          detail:
            "Possible secret/credential detected in the message. Blocked to reduce leak risk in logs and model context.",
        });
      } else {
        findings.push({
          layer: "secrets",
          severity: "info",
          ruleId: "secrets_clear",
          title: "Secrets scan clear",
          detail: `Checked ${SECRET_PATTERNS.length} credential patterns.`,
        });
      }
    }

    if (config.detectPiiPatterns !== false) {
      layersRun.push("pii_patterns");
      let piiHit: (typeof PII_PATTERNS)[number] | null = null;
      for (const p of PII_PATTERNS) {
        if (p.re.test(text)) {
          // Credit-card pattern is noisy — only block if many digits clustered
          if (p.id === "credit_card") {
            const digits = (text.match(/\d/g) || []).length;
            if (digits < 13) continue;
          }
          piiHit = p;
          break;
        }
      }
      if (piiHit) {
        // Soft by default for PII: warn unless strict
        const severity: GuardrailSeverity =
          config.strictPii === true ? "block" : "warn";
        if (severity === "block") {
          decision = "block";
          blockReason = blockReason || piiHit.title;
          refusal = refusal || config.refusalMessage;
        }
        findings.push({
          layer: "pii_patterns",
          severity,
          ruleId: piiHit.id,
          title: piiHit.title,
          detail:
            severity === "block"
              ? "Strict PII mode: request blocked."
              : "Possible sensitive personal data pattern. Allowed, but flagged for review.",
        });
      } else {
        findings.push({
          layer: "pii_patterns",
          severity: "info",
          ruleId: "pii_clear",
          title: "PII pattern scan clear",
          detail: `Checked ${PII_PATTERNS.length} sensitive-data patterns.`,
        });
      }
    }
  }

  layersRun.push("knowledge");
  const knowledge = await resolveKnowledgeContext(
    text,
    input.audience,
    input.projectId,
    { model: input.model },
  );
  findings.push({
    layer: "knowledge",
    severity: "info",
    ruleId: knowledge.sources.length ? "knowledge_match" : "knowledge_none",
    title: knowledge.sources.length
      ? `Knowledge would inject ${knowledge.sources.length} doc(s)`
      : "No company knowledge injected",
    detail: knowledge.sources.length
      ? `Docs: ${knowledge.sources.map((s) => s.title).join(" · ")}`
      : "Query did not match company docs (or knowledge is off for this audience).",
  });

  const blockFindings = findings.filter((f) => f.severity === "block");
  const warnFindings = findings.filter((f) => f.severity === "warn");
  const summary =
    decision === "block"
      ? `BLOCKED — ${blockFindings.map((f) => f.title).join("; ") || blockReason}`
      : warnFindings.length
        ? `ALLOWED with ${warnFindings.length} warning(s)`
        : applied
          ? "ALLOWED — all hard layers clear"
          : "ALLOWED — guardrails not applied for this audience";

  return {
    decision,
    audience: input.audience,
    applied,
    detectedLanguage: lang,
    findings,
    layersRun: [...new Set(layersRun)],
    summary,
    refusal,
    blockReason,
    timingsMs: Date.now() - started,
    knowledge: {
      wouldInject: knowledge.sources.length > 0,
      sourceCount: knowledge.sources.length,
      titles: knowledge.sources.map((s) => s.title),
    },
  };
};

export const logGuardrailEvent = (input: {
  inspection: GuardrailInspection;
  username?: string | null;
  userId?: string | null;
  prompt: string;
  logEvents?: boolean;
}) => {
  if (input.logEvents === false) return;
  // Log blocks always; warns optionally; skip clean allows to reduce noise
  if (
    input.inspection.decision === "allow" &&
    !input.inspection.findings.some((f) => f.severity === "warn")
  ) {
    return;
  }

  const preview = input.prompt.replace(/\s+/g, " ").trim().slice(0, 240);
  getDb()
    .prepare(
      `INSERT INTO guardrail_events
       (id, audience, decision, username, user_id, prompt_preview, summary, findings_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      input.inspection.audience,
      input.inspection.decision,
      input.username || (input.inspection.audience === "guest" ? "guest" : "user"),
      input.userId ?? null,
      preview,
      input.inspection.summary.slice(0, 500),
      JSON.stringify(input.inspection.findings).slice(0, 12000),
    );
};

export const listGuardrailEvents = (limit = 40): GuardrailEventRow[] => {
  const safe = Math.max(1, Math.min(200, Math.floor(limit)));
  return getDb()
    .prepare(
      `SELECT * FROM guardrail_events
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(safe) as GuardrailEventRow[];
};
