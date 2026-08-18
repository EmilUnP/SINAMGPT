import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  createApiKey,
  getApiGatewaySettings,
  listApiKeysForUser,
} from "@/lib/api-keys";
import { FEATURE_DISABLED_ERROR, isFeatureEnabled } from "@/lib/features";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFeatureEnabled("developerApi")) {
    return NextResponse.json({ error: FEATURE_DISABLED_ERROR }, { status: 403 });
  }
  const settings = getApiGatewaySettings();
  return NextResponse.json({
    keys: listApiKeysForUser(user.id),
    settings: {
      enabled: settings.enabled,
      maxKeysPerUser: settings.maxKeysPerUser,
      maxRequestsPerMinute: settings.maxRequestsPerMinute,
      maxChars: settings.maxChars,
    },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFeatureEnabled("developerApi")) {
    return NextResponse.json({ error: FEATURE_DISABLED_ERROR }, { status: 403 });
  }

  const settings = getApiGatewaySettings();
  if (!settings.enabled) {
    return NextResponse.json(
      { error: "API gateway is disabled by admin." },
      { status: 403 },
    );
  }

  let name = "API key";
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    name = parsed.data.name || "API key";
  } catch {
    // empty body is fine
  }

  try {
    const created = createApiKey(user.id, name);
    return NextResponse.json({
      key: created.key,
      secret: created.secret,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create key";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
