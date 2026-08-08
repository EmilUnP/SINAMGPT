import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { markActive, setSessionCookie, verifyPassword } from "@/lib/auth";

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    const { username, password } = parsed.data;
    const user = getDb()
      .prepare(
        `SELECT id, username, password_hash, role, is_active
         FROM users WHERE username = ? COLLATE NOCASE`,
      )
      .get(username) as
      | {
          id: string;
          username: string;
          password_hash: string;
          role: string;
          is_active: number;
        }
      | undefined;

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    if (user.is_active !== 1) {
      return NextResponse.json(
        { error: "This account is disabled. Contact an admin." },
        { status: 403 },
      );
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    markActive(user.id);
    await setSessionCookie(user.id, user.username);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("login error", error);
    return NextResponse.json({ error: "Could not log in" }, { status: 500 });
  }
}
