import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser, getSession } from "@/lib/auth";

const safeNextPath = (value: string | null): string => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/login";
  return value;
};

const redirectNext = (request: Request) => {
  const url = new URL(request.url);
  return NextResponse.redirect(
    new URL(safeNextPath(url.searchParams.get("next")), url.origin),
  );
};

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

/** Clears a leftover cookie after DB reset / deleted user. Valid sessions stay put (no GET logout CSRF). */
export async function GET(request: Request) {
  const session = await getSession();
  const user = await getCurrentUser();
  if (!session || user) {
    return redirectNext(request);
  }

  await clearSessionCookie();
  const res = redirectNext(request);
  res.cookies.delete("owngpt_session");
  return res;
};
