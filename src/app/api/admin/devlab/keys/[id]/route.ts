import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { revokeApiKey, setApiKeyEnabled } from "@/lib/api-keys";
import { FEATURE_DISABLED_ERROR, isFeatureEnabled } from "@/lib/features";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  revoke: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isFeatureEnabled("devLab")) {
    return NextResponse.json({ error: FEATURE_DISABLED_ERROR }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (parsed.data.revoke) {
    const key = revokeApiKey(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  }

  if (typeof parsed.data.enabled === "boolean") {
    const key = setApiKeyEnabled(id, parsed.data.enabled);
    if (!key) {
      return NextResponse.json(
        { error: "Key not found or already revoked" },
        { status: 404 },
      );
    }
    return NextResponse.json({ key });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
