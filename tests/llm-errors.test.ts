import { describe, expect, it } from "vitest";
import { isUnreachableError } from "@/lib/llm/errors";

describe("isUnreachableError", () => {
  it("treats fetch failures as unreachable", () => {
    expect(isUnreachableError(new TypeError("fetch failed"))).toBe(true);
  });

  it("does not retry user cancels or HTTP-style errors", () => {
    const abort = new Error("Stopped");
    abort.name = "AbortError";
    expect(isUnreachableError(abort)).toBe(false);
    expect(isUnreachableError(new Error("HTTP 400: bad request"))).toBe(false);
  });
});
