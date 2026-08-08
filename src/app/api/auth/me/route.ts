import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      created_at: user.created_at,
      last_active_at: user.last_active_at,
    },
  });
}
