import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, takeRateLimit } from "@/lib/rate-limit";

describe("rate limit helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores forwarded client IPs unless TRUST_PROXY=1", () => {
    vi.stubEnv("TRUST_PROXY", "");
    const request = new Request("http://localhost/api/chat", {
      headers: { "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9" },
    });
    expect(clientIp(request)).toBe("unknown");
  });

  it("uses the first forwarded IP when the proxy is trusted", () => {
    vi.stubEnv("TRUST_PROXY", "1");
    const request = new Request("http://localhost/api/chat", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(clientIp(request)).toBe("203.0.113.9");
  });

  it("enforces a window and reports retry-after", () => {
    const first = takeRateLimit("unit-test-window", 1, 60_000);
    const second = takeRateLimit("unit-test-window", 1, 60_000);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.retryAfterSec).toBeGreaterThan(0);
  });
});
