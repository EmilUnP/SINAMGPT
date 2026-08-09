/** Simple in-process rate limiter (fine for single-node LAN deploy). */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Occasional cleanup so the map doesn't grow forever. */
const maybePrune = () => {
  if (buckets.size < 500) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
};

export const takeRateLimit = (
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } => {
  maybePrune();
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (cur.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
    };
  }
  cur.count += 1;
  return { ok: true, retryAfterSec: 0 };
};

export const clientIp = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
};
