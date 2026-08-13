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
  const eventsLimit = Number(searchParams.get("events") || "0");

  return NextResponse.json({
    guardrails: getGuardrails(),
    defaults: DEFAULT_GUARDRAILS,
    suggestions: getPolicySuggestions(),
    suggestionDefaults: DEFAULT_POLICY_SUGGESTIONS,
    builtinKeywordCount: BUILTIN_BLOCKED_KEYWORDS.length,
    events:
      eventsLimit > 0
        ? listGuardrailEvents(eventsLimit)
        : listGuardrailEvents(30),
  });
}

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

  const guardrails = setGuardrails(parsed.data);
  return NextResponse.json({ guardrails });
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
    const suggestionsSchema = z.object({
      allowedTopics: z.array(z.string().max(200)).max(40).optional(),
      blockedTopics: z.array(z.string().max(200)).max(40).optional(),
      keywords: z.array(z.string().max(200)).max(40).optional(),
      personaSnippets: z.array(z.string().max(200)).max(40).optional(),
      extraRuleSnippets: z.array(z.string().max(200)).max(40).optional(),
    });
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
