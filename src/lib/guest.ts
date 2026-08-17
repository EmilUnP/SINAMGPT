import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
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

const normalizeIp = (ip: string | undefined): string => {
  const trimmed = (ip ?? "").trim().slice(0, 64);
  return trimmed || "unknown";
};

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

const getIpCount = (ip: string, day: string): number => {
  if (ip === "unknown") return 0;
  const row = getDb()
    .prepare(`SELECT count FROM guest_ip_usage WHERE ip = ? AND day = ?`)
    .get(ip, day) as { count: number } | undefined;
  return Math.max(0, row?.count ?? 0);
};

const setIpCount = (ip: string, day: string, count: number) => {
  if (ip === "unknown") return;
  getDb()
    .prepare(
      `INSERT INTO guest_ip_usage (ip, day, count)
       VALUES (?, ?, ?)
       ON CONFLICT(ip, day) DO UPDATE SET count = excluded.count`,
    )
    .run(ip, day, Math.max(0, count));
};

const cookieCount = async (day: string): Promise<number> => {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  const payload = raw ? decode(raw) : null;
  if (!payload || payload.day !== day) return 0;
  return Math.max(0, payload.count);
};

const writeCookie = async (count: number, day: string) => {
  const jar = await cookies();
  const token = encode({ count, day });
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
};

const usageFrom = (used: number, limit: number) => ({
  used,
  limit,
  remaining: Math.max(0, limit - used),
});

export const getGuestUsage = async (
  ip?: string,
): Promise<{
  used: number;
  limit: number;
  remaining: number;
}> => {
  const limit = getGuestDailyLimit();
  const day = todayKey();
  const used = Math.max(await cookieCount(day), getIpCount(normalizeIp(ip), day));
  return usageFrom(used, limit);
};

export const consumeGuestMessage = async (
  ip?: string,
): Promise<{
  ok: boolean;
  used: number;
  limit: number;
  remaining: number;
}> => {
  const limit = getGuestDailyLimit();
  const day = todayKey();
  const key = normalizeIp(ip);
  const usedBefore = Math.max(await cookieCount(day), getIpCount(key, day));

  if (usedBefore >= limit) {
    return { ok: false, ...usageFrom(usedBefore, limit) };
  }

  const used = usedBefore + 1;
  await writeCookie(used, day);
  setIpCount(key, day, used);
  return { ok: true, ...usageFrom(used, limit) };
};

/** Undo a failed guest turn so LLM outages don't burn the daily quota. */
export const refundGuestMessage = async (
  ip?: string,
): Promise<{
  used: number;
  limit: number;
  remaining: number;
}> => {
  const limit = getGuestDailyLimit();
  const day = todayKey();
  const key = normalizeIp(ip);
  const usedBefore = Math.max(await cookieCount(day), getIpCount(key, day));
  const used = Math.max(0, usedBefore - 1);
  await writeCookie(used, day);
  setIpCount(key, day, used);
  return usageFrom(used, limit);
};
