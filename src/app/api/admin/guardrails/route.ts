import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  DEFAULT_GUARDRAILS,
  getGuardrails,
  setGuardrails,
} from "@/lib/guardrails";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    guardrails: getGuardrails(),
    defaults: DEFAULT_GUARDRAILS,
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

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
  };

  if (body.action === "reset") {
    const guardrails = setGuardrails(DEFAULT_GUARDRAILS);
    return NextResponse.json({ guardrails });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
