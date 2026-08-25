import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { clearApiUsageLogs } from "@/lib/api-usage";
import {
  clearUsageLogs,
  getPagedUsage,
  getUsageAnalytics,
  listActiveUsage,
  parseUsageSourceFilter,
  pingLlm,
} from "@/lib/usage";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "25");
  const overview = searchParams.get("overview") === "1";
  const source = parseUsageSourceFilter(searchParams.get("source"));

  const [llm, analytics, recentPage] = await Promise.all([
    pingLlm(),
    Promise.resolve(getUsageAnalytics()),
    overview
      ? Promise.resolve(null)
      : Promise.resolve(getPagedUsage(page, limit, source)),
  ]);

  return NextResponse.json({
    live: listActiveUsage(source),
    recent: recentPage?.rows ?? [],
    recentPage: recentPage
      ? {
          page: recentPage.page,
          limit: recentPage.limit,
          total: recentPage.total,
          totalPages: recentPage.totalPages,
        }
      : undefined,
    analytics,
    /** Primary / best available backend (compat) */
    ollama: {
      ok: llm.ok,
      latencyMs: llm.latencyMs,
      error: llm.error,
      backend: llm.backend,
      baseUrl: llm.baseUrl,
    },
    backends: llm.backends,
    serverTime: new Date().toISOString(),
  });
}

export async function DELETE() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chat = clearUsageLogs();
  const api = clearApiUsageLogs();
  return NextResponse.json({ ok: true, deleted: { chat, api } });
}
