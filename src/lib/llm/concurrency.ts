import { ModelBusyError } from "./errors";

type Waiter = { grant: () => void };
type Pool = { active: number; queue: Waiter[] };
const pools = new Map<string, Pool>();

const positiveEnv = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

const acquire = async (id: string, limit: number, signal?: AbortSignal): Promise<() => void> => {
  signal?.throwIfAborted();
  const pool = pools.get(id) ?? { active: 0, queue: [] };
  pools.set(id, pool);
  if (pool.active >= limit || pool.queue.length) {
    if (pool.queue.length >= positiveEnv("LLM_MAX_QUEUE", 256)) {
      throw new ModelBusyError(`Provider "${id}" is busy. Request queue is full; please retry shortly.`);
    }
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      const remove = (error: unknown) => {
        const index = pool.queue.indexOf(waiter);
        if (index < 0) return;
        pool.queue.splice(index, 1);
        cleanup();
        reject(error);
      };
      const abort = () => remove(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      const waiter: Waiter = { grant: () => { cleanup(); resolve(); } };
      const timer = setTimeout(() => remove(new ModelBusyError(`Provider "${id}" is busy. Queue wait timed out; please retry.`)), positiveEnv("LLM_QUEUE_TIMEOUT_MS", 30_000));
      pool.queue.push(waiter);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
    // The releasing request transfers its slot directly to this waiter.
  } else {
    pool.active += 1;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = pool.queue.shift();
    if (next) next.grant();
    else {
      pool.active -= 1;
      if (pool.active === 0) pools.delete(id);
    }
  };
};

/** In-process admission control. Streaming responses own their slot until EOF/cancel/error. */
export const withProviderConcurrency = async <T>(
  providerId: string,
  maxConcurrent: number,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  signal?.throwIfAborted();
  const limit = Number.isFinite(maxConcurrent) ? Math.max(0, Math.floor(maxConcurrent)) : 0;
  if (limit === 0) return fn();
  const release = await acquire(providerId, limit, signal);
  let streaming = false;
  try {
    signal?.throwIfAborted();
    const result = await fn();
    if (!(result instanceof Response) || !result.body) return result;
    const reader = result.body.getReader();
    let finished = false;
    let output: ReadableStreamDefaultController<Uint8Array>;
    const finish = () => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", abort);
      release();
    };
    const abort = () => {
      if (finished) return;
      finish();
      output.error(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      void reader.cancel(signal?.reason).catch(() => undefined);
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        output = controller;
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
      },
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (finished) return;
          if (done) { finish(); controller.close(); }
          else controller.enqueue(value);
        } catch (error) {
          if (!finished) { finish(); controller.error(error); }
        }
      },
      async cancel(reason) {
        finish();
        await reader.cancel(reason).catch(() => undefined);
      },
    }, { highWaterMark: 0 });
    streaming = true;
    return new Response(body, { status: result.status, statusText: result.statusText, headers: result.headers }) as T;
  } finally {
    if (!streaming) release();
  }
};

export const resetProviderConcurrencyForTests = (): void => { pools.clear(); };
