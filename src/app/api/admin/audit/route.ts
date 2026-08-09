import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAuditEvents } from "@/lib/audit";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || "80");
  const category = searchParams.get("category");

  return NextResponse.json({
    events: listAuditEvents({
      limit: Number.isFinite(limit) ? limit : 80,
      category,
    }),
  });
}
