import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "owngpt_session";

const base64UrlToBytes = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const bytesToBase64Url = (bytes: ArrayBuffer): string => {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
};

const parseSession = async (token: string, secret: string) => {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signed = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body),
    );
    const expected = bytesToBase64Url(signed);

    if (!timingSafeEqual(signature, expected)) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(body)),
    ) as { exp?: number };

    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.SESSION_SECRET || "";
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token && secret ? await parseSession(token, secret) : null;

  if (pathname.startsWith("/chat") || pathname.startsWith("/admin")) {
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname === "/register") {
    if (session) {
      const url = request.nextUrl.clone();
      url.pathname = "/chat";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/admin/:path*", "/login", "/register"],
};
