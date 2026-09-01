import { afterEach, describe, expect, it, vi } from "vitest";
import { demoSleepHandler } from "@/lib/jobs/handlers/demo-sleep";

afterEach(() => {
  vi.useRealTimers();
});

describe("demo sleep job", () => {
  it("reports deterministic progress and completion", async () => {
    vi.useFakeTimers();
    const progress: number[] = [];
    const run = demoSleepHandler(
      { durationMs: 4_000, steps: 4 },
      {
        signal: new AbortController().signal,
        reportProgress: (value) => progress.push(value),
        isCancellationRequested: () => false,
      },
    );
    await vi.runAllTimersAsync();

    await expect(run).resolves.toEqual({ resultRef: "demo:sleep-complete" });
    expect(progress).toEqual([25, 50, 75, 100]);
  });

  it("stops before the next step when cancellation is requested", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const progress: number[] = [];
    const run = demoSleepHandler(
      { durationMs: 4_000, steps: 4 },
      {
        signal: new AbortController().signal,
        reportProgress: (value) => {
          progress.push(value);
          cancelled = true;
        },
        isCancellationRequested: () => cancelled,
      },
    );
    const assertion = expect(run).rejects.toMatchObject({ name: "AbortError" });
    await vi.runAllTimersAsync();
    await assertion;
    expect(progress).toEqual([25]);
  });

  it.skipIf(process.env.RUN_LONG_JOB_TEST !== "1")(
    "runs for four real minutes outside an HTTP request",
    async () => {
      const started = Date.now();
      await demoSleepHandler(
        { durationMs: 240_000, steps: 24 },
        {
          signal: new AbortController().signal,
          reportProgress: () => undefined,
          isCancellationRequested: () => false,
        },
      );
      expect(Date.now() - started).toBeGreaterThanOrEqual(239_000);
    },
    250_000,
  );
});
