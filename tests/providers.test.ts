import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: () => {
    throw new Error("Encryption tests must not access SQLite");
  },
}));

import {
  assertProviderCanDelete,
  assertRemoteProviderAcknowledged,
  decryptProviderApiKey,
  encryptProviderApiKey,
  normalizeProviderBaseUrl,
  normalizeProviderId,
  parseProviderKind,
} from "@/lib/providers";
import { providerUrlIsRemote } from "@/lib/provider-url";

describe("provider API-key encryption", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a key with authenticated encryption", () => {
    vi.stubEnv("SESSION_SECRET", "a-test-secret-that-is-not-stored-with-data");
    const apiKey = "provider-secret-value";
    const encrypted = encryptProviderApiKey(apiKey);

    expect(encrypted).toMatch(/^v1\.[^.]+\.[^.]+\.[^.]+$/);
    expect(encrypted).not.toContain(apiKey);
    expect(decryptProviderApiKey(encrypted)).toBe(apiKey);
  });

  it("rejects tampered ciphertext", () => {
    vi.stubEnv("SESSION_SECRET", "correct-secret");
    const encrypted = encryptProviderApiKey("provider-secret-value");
    const tampered = `${encrypted.slice(0, -1)}${
      encrypted.endsWith("A") ? "B" : "A"
    }`;

    expect(() => decryptProviderApiKey(tampered)).toThrow(
      "could not be decrypted",
    );
  });

  it("rejects encryption when no provider or session secret is set", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("PROVIDER_KEY_SECRET", "");
    expect(() => encryptProviderApiKey("provider-secret-value")).toThrow(
      "PROVIDER_KEY_SECRET or SESSION_SECRET is required",
    );
  });

  it("prefers PROVIDER_KEY_SECRET over SESSION_SECRET", () => {
    vi.stubEnv("SESSION_SECRET", "session-secret-value");
    vi.stubEnv("PROVIDER_KEY_SECRET", "provider-secret-value");
    const encrypted = encryptProviderApiKey("provider-secret-value");
    expect(decryptProviderApiKey(encrypted)).toBe("provider-secret-value");

    vi.stubEnv("PROVIDER_KEY_SECRET", "");
    expect(() => decryptProviderApiKey(encrypted)).toThrow(
      "could not be decrypted",
    );
  });
});

describe("provider configuration validation", () => {
  it("normalizes safe LAN provider values", () => {
    expect(normalizeProviderId(" gpu-2 ")).toBe("gpu-2");
    expect(normalizeProviderBaseUrl("http://10.0.0.22:11434/")).toBe(
      "http://10.0.0.22:11434",
    );
  });

  it.each([
    "ftp://10.0.0.22/models",
    "http://user:pass@10.0.0.22",
    "http://10.0.0.22/?token=secret",
    "http://169.254.169.254/latest/meta-data",
    "http://2852039166/latest/meta-data",
    "http://[::ffff:169.254.169.254]/latest/meta-data",
    "http://[fe80::1]/metadata",
  ])("rejects unsafe provider URL %s", (url) => {
    expect(() => normalizeProviderBaseUrl(url)).toThrow();
  });

  it("parses supported provider kinds", () => {
    expect(parseProviderKind("ollama")).toBe("ollama");
    expect(parseProviderKind("vllm")).toBe("vllm");
    expect(parseProviderKind("openai")).toBe("openai");
    expect(parseProviderKind("anthropic")).toBeNull();
  });

  it("classifies LAN URLs as local and public hosts as remote", () => {
    expect(providerUrlIsRemote("http://10.0.0.22:11434")).toBe(false);
    expect(providerUrlIsRemote("http://127.0.0.1:8000")).toBe(false);
    expect(providerUrlIsRemote("http://192.168.1.9:1234")).toBe(false);
    expect(providerUrlIsRemote("https://api.openai.com/v1")).toBe(true);
    expect(() =>
      assertRemoteProviderAcknowledged("https://api.openai.com/v1", false),
    ).toThrow("not on your LAN");
    expect(() =>
      assertRemoteProviderAcknowledged("https://api.openai.com/v1", true),
    ).not.toThrow();
    expect(() =>
      assertRemoteProviderAcknowledged("http://10.0.0.22:8000"),
    ).not.toThrow();
  });

  it("protects the default and referenced providers from deletion", () => {
    expect(() =>
      assertProviderCanDelete({
        id: "ollama",
        modelCount: 0,
        isEnabled: true,
        enabledProviderCount: 2,
      }),
    ).toThrow("cannot be deleted");
    expect(() =>
      assertProviderCanDelete({
        id: "gpu-2",
        modelCount: 1,
        isEnabled: true,
        enabledProviderCount: 2,
      }),
    ).toThrow("models before deleting");
  });
});
