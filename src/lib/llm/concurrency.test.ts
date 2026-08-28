import { afterEach, describe, expect, it } from "vitest";
import {
  resetProviderConcurrencyForTests,
  withProviderConcurrency,
} from "./concurrency";

describe("provider concurrency", () => {
  afterEach(() => {
    resetProviderConcurrencyForTests();
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
