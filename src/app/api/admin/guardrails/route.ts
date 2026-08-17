import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { listGuardrailEvents } from "@/lib/guardrail-engine";
import {
  DEFAULT_GUARDRAILS,
  DEFAULT_POLICY_SUGGESTIONS,
  getGuardrails,
  getPolicySuggestions,
  setGuardrails,
  setPolicySuggestions,
  type PolicySuggestions,
} from "@/lib/guardrails";
import { BUILTIN_BLOCKED_KEYWORDS } from "@/lib/multilang";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const eventsRaw = searchParams.get("events");
  const eventsLimit = Number(eventsRaw ?? "30");
  const events =
    eventsRaw === "0"
      ? []
      : listGuardrailEvents(
          Number.isFinite(eventsLimit) && eventsLimit > 0 ? eventsLimit : 30,
        );

  return NextResponse.json({
    guardrails: getGuardrails(),
    defaults: DEFAULT_GUARDRAILS,
    suggestions: getPolicySuggestions(),
    suggestionDefaults: DEFAULT_POLICY_SUGGESTIONS,
    builtinKeywordCount: BUILTIN_BLOCKED_KEYWORDS.length,
    events,
  });
}

const suggestionListSchema = z.array(z.string().max(200)).max(100);

const suggestionsSchema = z.object({
  allowedTopics: suggestionListSchema.optional(),
  blockedTopics: suggestionListSchema.optional(),
  keywords: suggestionListSchema.optional(),
  personaSnippets: suggestionListSchema.optional(),
  extraRuleSnippets: suggestionListSchema.optional(),
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  applyToGuests: z.boolean().optional(),
  applyToUsers: z.boolean().optional(),
  persona: z.string().max(4000).optional(),
  allowedTopics: z.string().max(8000).optional(),
  blockedTopics: z.string().max(8000).optional(),
  blockedKeywords: z.string().max(8000).optional(),
  refusalMessage: z.string().max(2000).optional(),
  extraRules: z.string().max(8000).optional(),
  detectPromptInjection: z.boolean().optional(),
  detectSecrets: z.boolean().optional(),
  detectPiiPatterns: z.boolean().optional(),
  strictPii: z.boolean().optional(),
  logEvents: z.boolean().optional(),
  suggestions: suggestionsSchema.optional(),
});

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { suggestions: nextSuggestions, ...policy } = parsed.data;
  const guardrails = setGuardrails(policy);
  const stored = getPolicySuggestions();
  const suggestions = setPolicySuggestions({
    allowedTopics: [
      ...(nextSuggestions?.allowedTopics ?? stored.allowedTopics),
      ...guardrails.allowedTopics.split("\n"),
    ],
    blockedTopics: [
      ...(nextSuggestions?.blockedTopics ?? stored.blockedTopics),
      ...guardrails.blockedTopics.split("\n"),
    ],
    keywords: [
      ...(nextSuggestions?.keywords ?? stored.keywords),
      ...guardrails.blockedKeywords.split("\n"),
    ],
    personaSnippets:
      nextSuggestions?.personaSnippets ?? stored.personaSnippets,
    extraRuleSnippets:
      nextSuggestions?.extraRuleSnippets ?? stored.extraRuleSnippets,
  });
  return NextResponse.json({ guardrails, suggestions });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  if (body?.action === "reset") {
    const guardrails = setGuardrails(DEFAULT_GUARDRAILS);
    return NextResponse.json({ guardrails });
  }

  if (body?.action === "reset_suggestions") {
    const suggestions = setPolicySuggestions({
      ...DEFAULT_POLICY_SUGGESTIONS,
    });
    return NextResponse.json({ suggestions });
  }

  if (body?.action === "suggestions") {
    const parsed = suggestionsSchema.safeParse(body.suggestions ?? body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid suggestions" },
        { status: 400 },
      );
    }
    const suggestions = setPolicySuggestions(
      parsed.data as Partial<PolicySuggestions>,
    );
    return NextResponse.json({ suggestions });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
