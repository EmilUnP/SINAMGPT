import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  setModelDisplayName,
  setModelEnabled,
  syncModelsFromOllama,
} from "@/lib/settings";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const models = await syncModelsFromOllama();
    return NextResponse.json({ models });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load models";
    return NextResponse.json({ error: message, models: [] }, { status: 503 });
  }
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    is_enabled: z.boolean().optional(),
    display_name: z.string().max(120).optional(),
  })
  .refine(
    (data) => data.is_enabled !== undefined || data.display_name !== undefined,
    { message: "Provide is_enabled and/or display_name" },
  );

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

  if (parsed.data.is_enabled !== undefined) {
    setModelEnabled(parsed.data.name, parsed.data.is_enabled);
  }
  if (parsed.data.display_name !== undefined) {
    setModelDisplayName(parsed.data.name, parsed.data.display_name);
  }

  try {
    const models = await syncModelsFromOllama();
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({
      models: [
        {
          name: parsed.data.name,
          size: 0,
          modified_at: "",
          is_enabled: parsed.data.is_enabled ?? true,
          display_name:
            parsed.data.display_name?.trim() || parsed.data.name,
        },
      ],
    });
  }
}
