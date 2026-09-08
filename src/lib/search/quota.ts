import { getDb } from "@/lib/db";

const utcDay = (): string => new Date().toISOString().slice(0, 10);

export type SearchQuotaResult =
  | { ok: true; remaining: number }
  | { ok: false; remaining: 0 };

/** Per-user daily cap. `dailyLimit` 0 means unlimited. */
export const takeSearchQuota = (
  userId: string,
  dailyLimit: number,
): SearchQuotaResult => {
  const id = userId.trim();
  if (!id) return { ok: false, remaining: 0 };
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) {
    return { ok: true, remaining: Number.POSITIVE_INFINITY };
  }
  const limit = Math.max(1, Math.min(500, Math.floor(dailyLimit)));
  const day = utcDay();
  const db = getDb();
  const tx = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT count FROM search_quota WHERE user_id = ? AND day = ?`,
      )
      .get(id, day) as { count: number } | undefined;
    const current = row?.count ?? 0;
    if (current >= limit) {
      return { ok: false as const, remaining: 0 as const };
    }
    db.prepare(
      `INSERT INTO search_quota (user_id, day, count)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`,
    ).run(id, day);
    return { ok: true as const, remaining: limit - current - 1 };
  });
  return tx();
};
