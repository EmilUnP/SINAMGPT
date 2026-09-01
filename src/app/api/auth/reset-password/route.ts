import { NextResponse } from "next/server";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/account-name";
import { hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { consumeResetToken } from "@/lib/password-reset";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  token: z.string().min(16).max(128),
  password: z
    .string()
    .min(PASSWORD_MIN, "password_min")
    .max(PASSWORD_MAX, "password_max"),
});

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const ipLimit = takeRateLimit(`reset:ip:${ip}`, 20, 60 * 60 * 1000);
    if (!ipLimit.ok) {
      return NextResponse.json(
        {
          error: "Too many reset attempts. Try again later.",
          code: "rate_limited",
        },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSec) },
        },
      );
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const passwordIssue = parsed.error.issues.find((issue) =>
        issue.path.includes("password"),
      );
      if (passwordIssue?.message === "password_min") {
        return NextResponse.json(
          {
            error: "Password must be at least 6 characters",
            code: "password_min",
          },
          { status: 400 },
        );
      }
      if (passwordIssue?.message === "password_max") {
        return NextResponse.json(
          {
            error: "Password is too long",
            code: "password_max",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: "This reset link is invalid or has expired.", code: "reset_invalid" },
        { status: 400 },
      );
    }

    const userId = consumeResetToken(parsed.data.token);
    if (!userId) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired.", code: "reset_invalid" },
        { status: 400 },
      );
    }

    const user = getDb()
      .prepare(`SELECT id, is_active FROM users WHERE id = ?`)
      .get(userId) as { id: string; is_active: number } | undefined;

    if (!user || user.is_active !== 1) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired.", code: "reset_invalid" },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);
    getDb()
      .prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
      .run(passwordHash, user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("reset-password error", error);
    return NextResponse.json(
      { error: "Could not update password", code: "reset_failed" },
      { status: 500 },
    );
  }
}
