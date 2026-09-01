import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ACCOUNT_NAME_MAX,
  type AccountNameIssue,
} from "@/lib/account-name";
import { resolveAppOrigin } from "@/lib/app-url";
import { requestPasswordReset } from "@/lib/password-reset";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  username: z.string().trim().min(1).max(ACCOUNT_NAME_MAX + 8),
});

const ISSUE_RESPONSE: Record<
  AccountNameIssue,
  { code: string; error: string }
> = {
  empty: {
    code: "username_required",
    error: "Enter a username or email address",
  },
  min: {
    code: "username_min",
    error: "Username must be at least 3 characters",
  },
  max: {
    code: "username_max",
    error: "Username is too long",
  },
  chars: {
    code: "username_chars",
    error: "Use letters, numbers, . _ - only",
  },
  email: {
    code: "username_email",
    error: "Enter a valid email address",
  },
};

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const ipLimit = takeRateLimit(`forgot:ip:${ip}`, 8, 60 * 60 * 1000);
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
      return NextResponse.json(
        { error: "Enter a username or email address", code: "username_required" },
        { status: 400 },
      );
    }

    const { username } = parsed.data;
    const userLimit = takeRateLimit(
      `forgot:user:${username.toLowerCase()}`,
      5,
      60 * 60 * 1000,
    );
    if (!userLimit.ok) {
      return NextResponse.json(
        {
          error: "Too many reset attempts. Try again later.",
          code: "rate_limited",
        },
        {
          status: 429,
          headers: { "Retry-After": String(userLimit.retryAfterSec) },
        },
      );
    }

    const result = requestPasswordReset(username, resolveAppOrigin(request));

    if (result.status === "invalid") {
      return NextResponse.json(ISSUE_RESPONSE[result.issue], { status: 400 });
    }

    if (result.status === "not_found") {
      return NextResponse.json(
        {
          error: "No account matches that username or email.",
          code: "user_not_found",
        },
        { status: 404 },
      );
    }

    if (result.status === "no_email") {
      return NextResponse.json(
        {
          error:
            "This account has no email. Ask an admin to reset the password.",
          code: "reset_no_email",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      resetUrl: result.resetUrl,
    });
  } catch (error) {
    console.error("forgot-password error", error);
    return NextResponse.json(
      { error: "Could not create the reset link", code: "reset_failed" },
      { status: 500 },
    );
  }
}
