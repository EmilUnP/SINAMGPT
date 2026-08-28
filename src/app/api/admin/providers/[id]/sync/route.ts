import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getProviderConfig } from "@/lib/providers";
import { syncModelsFromProviders } from "@/lib/settings";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!getProviderConfig(id)) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }

  try {
    const models = await syncModelsFromProviders(id);
    return NextResponse.json({
      models: models.filter((model) => model.backend === id),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not sync models",
      },
      { status: 400 },
    );
  }
}
