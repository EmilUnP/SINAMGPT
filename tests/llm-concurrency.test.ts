import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetProviderConcurrencyForTests,
  withProviderConcurrency,
} from "@/lib/llm/concurrency";

describe("provider concurrency", () => {
  afterEach(() => {
    resetProviderConcurrencyForTests();
    vi.unstubAllEnvs();
  });

  it("holds a stream slot until EOF and allows independent providers to proceed", async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    const first = await withProviderConcurrency("gpu", 1, async () => new Response(new ReadableStream<Uint8Array>({ start(c) { upstream = c; } })));
    const secondFn = vi.fn(async () => "second");
    const second = withProviderConcurrency("gpu", 1, secondFn);
    expect(await withProviderConcurrency("other", 1, async () => "other")).toBe("other");
    expect(secondFn).not.toHaveBeenCalled();
    upstream.enqueue(new TextEncoder().encode("hello"));
    upstream.close();
    expect(await first.text()).toBe("hello");
    expect(await second).toBe("second");
  });

  it("removes aborted queued requests and releases cancelled stream slots", async () => {
    const first = await withProviderConcurrency("gpu", 1, async () => new Response(new ReadableStream()));
    const abort = new AbortController();
    const neverRun = vi.fn(async () => "wrong");
    const queued = withProviderConcurrency("gpu", 1, neverRun, abort.signal);
    abort.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    const next = withProviderConcurrency("gpu", 1, async () => "next");
    await first.body!.cancel();
    expect(await next).toBe("next");
    expect(neverRun).not.toHaveBeenCalled();
  });

  it("bounds the queue and times out waiting requests", async () => {
    vi.stubEnv("LLM_MAX_QUEUE", "1");
    vi.stubEnv("LLM_QUEUE_TIMEOUT_MS", "20");
    const first = await withProviderConcurrency("gpu", 1, async () => new Response(new ReadableStream()));
    const queued = withProviderConcurrency("gpu", 1, async () => "queued");
    await expect(withProviderConcurrency("gpu", 1, async () => "overflow")).rejects.toThrow("queue is full");
    await expect(queued).rejects.toThrow("Queue wait timed out");
    await first.body!.cancel();
    expect(await withProviderConcurrency("gpu", 1, async () => "ok")).toBe("ok");
  });

  it("releases a running stream on client abort even without another read", async () => {
    const abort = new AbortController();
    const cancelled = vi.fn();
    const first = await withProviderConcurrency("gpu", 1, async () => new Response(new ReadableStream({ cancel: cancelled })), abort.signal);
    const next = withProviderConcurrency("gpu", 1, async () => "next");
    abort.abort();
    expect(await next).toBe("next");
    await expect(first.text()).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("caps in-flight work per provider", async () => {
    let running = 0;
    let peak = 0;
    const job = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
    };

    await Promise.all([
      withProviderConcurrency("gpu", 1, job),
      withProviderConcurrency("gpu", 1, job),
      withProviderConcurrency("gpu", 1, job),
    ]);

    expect(peak).toBe(1);
  });

  it("treats 0 as unlimited", async () => {
    let running = 0;
    let peak = 0;
    const job = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 15));
      running -= 1;
    };

    await Promise.all([
      withProviderConcurrency("gpu", 0, job),
      withProviderConcurrency("gpu", 0, job),
      withProviderConcurrency("gpu", 0, job),
    ]);

    expect(peak).toBe(3);
  });
});
