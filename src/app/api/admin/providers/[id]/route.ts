import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  deleteProvider,
  getProviderConfig,
  listProviders,
  saveProvider,
} from "@/lib/providers";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    kind: z.enum(["ollama", "vllm", "openai"]).optional(),
    baseUrl: z.string().trim().min(1).max(2048).optional(),
    enabled: z.boolean().optional(),
    apiKey: z
      .union([z.string().trim().min(1).max(512), z.null()])
      .optional(),
    fallbackId: z.string().trim().min(1).max(64).nullable().optional(),
    maxConcurrent: z.number().int().min(0).max(10_000).optional(),
    acknowledgeRemote: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.kind !== undefined ||
      value.baseUrl !== undefined ||
      value.enabled !== undefined ||
      value.apiKey !== undefined ||
      value.fallbackId !== undefined ||
      value.maxConcurrent !== undefined,
    { message: "Nothing to update" },
  );

export async function PATCH(request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const current = getProviderConfig(id);
  if (!current) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid provider update" },
      { status: 400 },
    );
  }

  try {
    const provider = saveProvider({
      id,
      kind: parsed.data.kind ?? current.kind,
      baseUrl: parsed.data.baseUrl ?? current.baseUrl,
      enabled: parsed.data.enabled ?? current.enabled,
      ...(parsed.data.apiKey !== undefined
        ? { apiKey: parsed.data.apiKey }
        : {}),
      ...(parsed.data.fallbackId !== undefined
        ? { fallbackId: parsed.data.fallbackId }
        : {}),
      ...(parsed.data.maxConcurrent !== undefined
        ? { maxConcurrent: parsed.data.maxConcurrent }
        : {}),
      acknowledgeRemote: parsed.data.acknowledgeRemote,
    });
    return NextResponse.json({ provider });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update provider" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    deleteProvider(id);
    return NextResponse.json({ providers: listProviders() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not delete provider";
    const status = message === "Provider not found." ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
