import type { JobHandler } from "../types";

type DemoSleepInput = {
  durationMs?: number;
  steps?: number;
};

const sleep = (durationMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, durationMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Job aborted", "AbortError"));
      },
      { once: true },
    );
  });

export const demoSleepHandler: JobHandler = async (rawInput, context) => {
  const input = (rawInput ?? {}) as DemoSleepInput;
  const durationMs = Math.max(
    1_000,
    Math.min(240_000, Math.floor(input.durationMs ?? 240_000)),
  );
  const steps = Math.max(1, Math.min(120, Math.floor(input.steps ?? 24)));
  const stepDuration = Math.max(1, Math.floor(durationMs / steps));

  for (let step = 1; step <= steps; step += 1) {
    if (context.signal.aborted || context.isCancellationRequested()) {
      throw new DOMException("Job cancelled", "AbortError");
    }
    await sleep(stepDuration, context.signal);
    context.reportProgress(
      Math.round((step / steps) * 100),
      `Step ${step}/${steps}`,
    );
  }

  return { resultRef: "demo:sleep-complete" };
};
