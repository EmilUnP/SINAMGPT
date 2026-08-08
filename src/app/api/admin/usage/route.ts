import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getPagedUsage,
  getUsageAnalytics,
  listActiveUsage,
  pingOllama,
} from "@/lib/usage";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "25");

  const [ollama, analytics, recentPage] = await Promise.all([
    pingOllama(),
    Promise.resolve(getUsageAnalytics()),
    Promise.resolve(getPagedUsage(page, limit)),
  ]);

  return NextResponse.json({
    live: listActiveUsage(),
    recent: recentPage.rows,
    recentPage: {
      page: recentPage.page,
      limit: recentPage.limit,
      total: recentPage.total,
      totalPages: recentPage.totalPages,
    },
    analytics,
    ollama,
    serverTime: new Date().toISOString(),
  });
}
