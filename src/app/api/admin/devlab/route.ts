import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  getApiGatewaySettings,
  listAllApiKeys,
  setApiGatewaySettings,
} from "@/lib/api-keys";
import {
  getApiUsageAnalytics,
  getPagedApiUsage,
  listActiveApiUsage,
} from "@/lib/api-usage";
import { FEATURE_DISABLED_ERROR, isFeatureEnabled } from "@/lib/features";

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  maxKeysPerUser: z.number().int().min(1).max(20).optional(),
  maxRequestsPerMinute: z.number().int().min(1).max(300).optional(),
  maxChars: z.number().int().min(500).max(32000).optional(),
  corsOrigins: z.array(z.string().trim().max(200)).max(40).optional(),
});

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isFeatureEnabled("devLab")) {
    return NextResponse.json({ error: FEATURE_DISABLED_ERROR }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "25");
  const statusRaw = searchParams.get("status");
  const status =
    statusRaw === "ok" ||
    statusRaw === "error" ||
    statusRaw === "aborted" ||
    statusRaw === "rejected"
      ? statusRaw
      : null;
  const model = searchParams.get("model")?.trim() || null;
  const username = searchParams.get("username")?.trim() || null;
  const apiKeyId = searchParams.get("keyId")?.trim() || null;

  const requests = getPagedApiUsage({
    page,
    limit,
    status,
    model,
    username,
    apiKeyId,
  });

  return NextResponse.json({
    settings: getApiGatewaySettings(),
    keys: listAllApiKeys(),
    live: listActiveApiUsage(),
    analytics: getApiUsageAnalytics(),
    requests,
  });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isFeatureEnabled("devLab")) {
    return NextResponse.json({ error: FEATURE_DISABLED_ERROR }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid settings" },
      { status: 400 },
    );
  }

  const settings = setApiGatewaySettings(parsed.data);
  return NextResponse.json({ settings });
}
