import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  getGuestDailyLimitSetting,
  getGuestMaxCharsSetting,
} from "@/lib/settings";

const COOKIE_NAME = "owngpt_guest";

export const getGuestDailyLimit = (): number => getGuestDailyLimitSetting();

export const getGuestMaxChars = (): number => getGuestMaxCharsSetting();

type GuestPayload = {
  count: number;
  day: string;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const getSecret = (): string => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set");
  }
  return secret;
};

const sign = (body: string): string =>
  createHmac("sha256", getSecret()).update(body).digest("base64url");

const encode = (payload: GuestPayload): string => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
};

const decode = (token: string): GuestPayload | null => {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = sign(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as GuestPayload;
    if (typeof payload.count !== "number" || !payload.day) return null;
    return payload;
  } catch {
    return null;
  }
};

export const getGuestUsage = async (): Promise<{
  used: number;
  limit: number;
  remaining: number;
}> => {
  const limit = getGuestDailyLimit();
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  const payload = raw ? decode(raw) : null;
  const day = todayKey();

  if (!payload || payload.day !== day) {
    return { used: 0, limit, remaining: limit };
  }

  const used = Math.max(0, payload.count);
  return { used, limit, remaining: Math.max(0, limit - used) };
};

export const consumeGuestMessage = async (): Promise<{
  ok: boolean;
  used: number;
  limit: number;
  remaining: number;
}> => {
  const limit = getGuestDailyLimit();
  const jar = await cookies();
  const day = todayKey();
  const raw = jar.get(COOKIE_NAME)?.value;
  const payload = raw ? decode(raw) : null;
  const usedBefore =
    payload && payload.day === day ? Math.max(0, payload.count) : 0;

  if (usedBefore >= limit) {
    return { ok: false, used: usedBefore, limit, remaining: 0 };
  }

  const used = usedBefore + 1;
  const token = encode({ count: used, day });
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return { ok: true, used, limit, remaining: Math.max(0, limit - used) };
};

/** Undo a failed guest turn so LLM outages don't burn the daily quota. */
export const refundGuestMessage = async (): Promise<{
  used: number;
  limit: number;
  remaining: number;
}> => {
  const limit = getGuestDailyLimit();
  const jar = await cookies();
  const day = todayKey();
  const raw = jar.get(COOKIE_NAME)?.value;
  const payload = raw ? decode(raw) : null;
  if (!payload || payload.day !== day || payload.count <= 0) {
    return { used: 0, limit, remaining: limit };
  }

  const used = Math.max(0, payload.count - 1);
  const token = encode({ count: used, day });
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return { used, limit, remaining: Math.max(0, limit - used) };
};
