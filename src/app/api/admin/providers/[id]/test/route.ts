import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pingProviderById } from "@/lib/llm";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const health = await pingProviderById(id);
    return NextResponse.json({ health });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not test provider";
    const status = message.includes("was not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
