import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getProviderConfig, listProviders, saveProvider } from "@/lib/providers";

const createSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  kind: z.literal("ollama"),
  baseUrl: z.string().trim().min(1).max(2048),
  enabled: z.boolean().optional(),
  apiKey: z.string().trim().min(1).max(512).optional(),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ providers: listProviders() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid provider" },
      { status: 400 },
    );
  }
  if (parsed.data.id === "ollama") {
    return NextResponse.json(
      { error: "The default Ollama provider already exists." },
      { status: 409 },
    );
  }
  if (getProviderConfig(parsed.data.id)) {
    return NextResponse.json({ error: "Provider already exists." }, { status: 409 });
  }

  try {
    const provider = saveProvider(parsed.data);
    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save provider" },
      { status: 400 },
    );
  }
}
