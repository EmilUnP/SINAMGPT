import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPagedApiUsage } from "@/lib/usage/api";
import { FEATURE_DISABLED_ERROR, isFeatureEnabled } from "@/lib/features";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isFeatureEnabled("developerApi")) {
    return NextResponse.json({ error: FEATURE_DISABLED_ERROR }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Number(searchParams.get("limit") || "25");
  const status = searchParams.get("status") as
    | "ok"
    | "error"
    | "aborted"
    | "rejected"
    | null;

  const result = getPagedApiUsage({
    page,
    limit,
    userId: user.id,
    status:
      status === "ok" ||
      status === "error" ||
      status === "aborted" ||
      status === "rejected"
        ? status
        : null,
  });

  return NextResponse.json(result);
}
