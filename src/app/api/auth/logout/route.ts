import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

const safeNextPath = (value: string | null): string => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/login";
  return value;
};

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

/** Used by pages when the cookie is valid but the user no longer exists. */
export async function GET(request: Request) {
  await clearSessionCookie();
  const url = new URL(request.url);
  const dest = new URL(safeNextPath(url.searchParams.get("next")), url.origin);
  const res = NextResponse.redirect(dest);
  res.cookies.delete("owngpt_session");
  return res;
}
