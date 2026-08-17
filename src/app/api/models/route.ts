import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEnabledModels } from "@/lib/settings";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { models, defaultModel } =
      await getEnabledModels();
    return NextResponse.json({
      models,
      defaultModel,
      unlimited: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load models";
    return NextResponse.json({ error: message, models: [] }, { status: 503 });
  }
}
