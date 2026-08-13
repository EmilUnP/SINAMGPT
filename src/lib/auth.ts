import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { SessionPayload, User } from "./types";
import { getDb, touchUserActivity } from "./db";

const COOKIE_NAME = "owngpt_session";
const SESSION_DAYS = 14;

const USER_SELECT = `id, username, role, is_active, created_at, last_active_at`;

const getSecret = (): string => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 chars) in .env.local");
  }
  return secret;
};

const sign = (payload: string): string => {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
};

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10);
};

export const verifyPassword = async (
  password: string,
  hash: string,
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const createSessionToken = (
  userId: string,
  username: string,
  role: User["role"] = "user",
): string => {
  const payload: SessionPayload = {
    userId,
    username,
    role,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body);
  return `${body}.${signature}`;
};

export const parseSessionToken = (token: string): SessionPayload | null => {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;

    const expected = sign(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;

    if (!payload.userId || !payload.username || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
};

export const setSessionCookie = async (
  userId: string,
  username: string,
  role: User["role"] = "user",
): Promise<void> => {
  const token = createSessionToken(userId, username, role);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
};

export const clearSessionCookie = async (): Promise<void> => {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
};

export const getSession = async (): Promise<SessionPayload | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return parseSessionToken(token);
};

export const getCurrentUser = async (): Promise<User | null> => {
  const session = await getSession();
  if (!session) return null;

  const row = getDb()
    .prepare(`SELECT ${USER_SELECT} FROM users WHERE id = ?`)
    .get(session.userId) as User | undefined;

  // Stale cookie after DB reset / deleted user — clear it or /chat↔/login loops.
  if (!row || row.is_active !== 1) {
    await clearSessionCookie();
    return null;
  }
  return row;
};

export const requireAdmin = async (): Promise<User | null> => {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
};

export const markActive = (userId: string) => {
  touchUserActivity(userId);
};

export const newId = (): string => randomBytes(16).toString("hex");
