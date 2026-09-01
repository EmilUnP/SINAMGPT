import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAppOrigin } from "@/lib/app-url";

describe("resolveAppOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers APP_URL when it is a valid origin", () => {
    vi.stubEnv("APP_URL", "http://localhost:3055/");
    const request = new Request("http://ignored.example/api/auth/forgot-password", {
      headers: { host: "evil.example" },
    });
    expect(resolveAppOrigin(request)).toBe("http://localhost:3055");
  });

  it("uses the request host in development", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request("http://127.0.0.1:3055/api/auth/forgot-password", {
      headers: { host: "127.0.0.1:3055" },
    });
    expect(resolveAppOrigin(request)).toBe("http://127.0.0.1:3055");
  });

  it("ignores forwarded hosts unless TRUST_PROXY=1", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("TRUST_PROXY", "");
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request("http://127.0.0.1:3055/api/auth/forgot-password", {
      headers: {
        host: "127.0.0.1:3055",
        "x-forwarded-host": "evil.example",
      },
    });
    expect(resolveAppOrigin(request)).toBe("http://127.0.0.1:3055");
  });
});
