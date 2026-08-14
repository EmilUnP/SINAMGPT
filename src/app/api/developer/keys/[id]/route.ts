import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { revokeApiKey, setApiKeyEnabled } from "@/lib/api-keys";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  revoke: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (parsed.data.revoke) {
    const key = revokeApiKey(id, user.id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  }

  if (typeof parsed.data.enabled === "boolean") {
    const key = setApiKeyEnabled(id, parsed.data.enabled, user.id);
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

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const key = revokeApiKey(id, user.id);
  if (!key) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }
  return NextResponse.json({ key });
}
