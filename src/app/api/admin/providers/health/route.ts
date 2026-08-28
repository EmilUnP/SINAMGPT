import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pingProvider } from "@/lib/llm";
import { getProviderConfig, listProviders } from "@/lib/providers";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const health = await Promise.all(
    listProviders().map(async (summary) => {
      const config = getProviderConfig(summary.id);
      if (!config) {
        return {
          backend: summary.id,
          ok: false,
          latencyMs: 0,
          error: "Provider not found.",
          baseUrl: summary.baseUrl,
        };
      }
      return pingProvider(config);
    }),
  );

  return NextResponse.json({ health });
}
