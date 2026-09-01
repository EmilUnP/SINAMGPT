import { afterAll, describe, expect, it, vi } from "vitest";
import {
  deleteProvider,
  getProviderConfig,
  listProviders,
  saveProvider,
} from "@/lib/providers";

const providerId = "phase0-smoke";

describe.skipIf(process.env.RUN_PROVIDER_INTEGRATION !== "1")(
  "provider registry integration",
  () => {
    vi.stubEnv("SESSION_SECRET", "phase-zero-provider-smoke-secret");

    afterAll(() => {
      if (getProviderConfig(providerId)) deleteProvider(providerId);
      vi.unstubAllEnvs();
    });

    it("creates, updates, redacts, and deletes a provider", () => {
      saveProvider({
        id: providerId,
        kind: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        enabled: false,
        apiKey: "temporary-smoke-key",
      });
      expect(listProviders()).toContainEqual(
        expect.objectContaining({
          id: providerId,
          enabled: false,
          hasApiKey: true,
        }),
      );
      expect(JSON.stringify(listProviders())).not.toContain("temporary-smoke-key");

      const updated = saveProvider({
        id: providerId,
        kind: "ollama",
        baseUrl: "http://localhost:11434",
        enabled: false,
        apiKey: null,
      });
      expect(updated).toMatchObject({
        baseUrl: "http://localhost:11434",
        hasApiKey: false,
      });

      deleteProvider(providerId);
      expect(getProviderConfig(providerId)).toBeNull();
    });
  },
);
