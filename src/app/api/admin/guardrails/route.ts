import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { listGuardrailEvents } from "@/lib/guardrail-engine";
import {
  DEFAULT_GUARDRAILS,
  checkInputGuardrails,
  getGuardrails,
  setGuardrails,
} from "@/lib/guardrails";

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

const inspectSchema = z.object({
  action: z.literal("inspect"),
  message: z.string().trim().min(1).max(8000),
  audience: z.enum(["guest", "user"]).default("user"),
  projectId: z.string().trim().min(1).max(64).nullable().optional(),
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

  if (body?.action === "inspect") {
    const parsed = inspectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid inspect input" },
        { status: 400 },
      );
    }
    const result = checkInputGuardrails(parsed.data.message, parsed.data.audience, {
      projectId: parsed.data.projectId,
      username: admin.username,
      userId: admin.id,
      log: false, // dry-run does not pollute the event log
    });
    return NextResponse.json({
      blocked: result.blocked,
      reason: result.blocked ? result.reason : null,
      refusal: result.blocked ? result.refusal : null,
      inspection: result.inspection,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
