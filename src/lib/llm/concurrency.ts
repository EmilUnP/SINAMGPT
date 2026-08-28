const inflight = new Map<string, number>();
const waiters = new Map<string, Array<() => void>>();

/** 0 or less means unlimited. In-process only — not shared across Node processes. */
export const withProviderConcurrency = async <T>(
  providerId: string,
  maxConcurrent: number,
  fn: () => Promise<T>,
): Promise<T> => {
  const limit = Math.max(0, Math.floor(maxConcurrent));
  if (limit <= 0) return fn();

  while ((inflight.get(providerId) ?? 0) >= limit) {
    await new Promise<void>((resolve) => {
      const queue = waiters.get(providerId) ?? [];
      queue.push(resolve);
      waiters.set(providerId, queue);
    });
  }

  inflight.set(providerId, (inflight.get(providerId) ?? 0) + 1);
  try {
    return await fn();
  } finally {
    inflight.set(providerId, Math.max(0, (inflight.get(providerId) ?? 1) - 1));
    const queue = waiters.get(providerId);
    const next = queue?.shift();
    if (queue && queue.length === 0) waiters.delete(providerId);
    next?.();
  }
};

export const resetProviderConcurrencyForTests = (): void => {
  inflight.clear();
  waiters.clear();
};
