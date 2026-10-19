import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProviderConfig } from "@/lib/llm/types";

const {
  listOpenAiCompatModelsMock,
  streamOpenAiCompatChatMock,
  listEnabledProviderConfigsMock,
  getProviderConfigMock,
  modelBackend,
  catalogNames,
} = vi.hoisted(() => ({
  listOpenAiCompatModelsMock: vi.fn(),
  streamOpenAiCompatChatMock: vi.fn(),
  listEnabledProviderConfigsMock: vi.fn(),
  getProviderConfigMock: vi.fn(),
  modelBackend: { value: "vllm" },
  catalogNames: { value: new Set<string>(["vllm:gemma3:4b"]) },
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      get: (name?: string) => {
        if (sql.includes("SELECT 1")) {
          return name && catalogNames.value.has(name) ? { ok: 1 } : undefined;
        }
        return { backend: modelBackend.value };
      },
    }),
  }),
}));

vi.mock("@/lib/providers", () => ({
  listEnabledProviderConfigs: listEnabledProviderConfigsMock,
  getProviderConfig: getProviderConfigMock,
}));

vi.mock("@/lib/llm/openai-compat", () => ({
  completeOpenAiCompatChat: vi.fn(),
  completeOpenAiCompatToolChat: vi.fn(),
  listOpenAiCompatModels: listOpenAiCompatModelsMock,
  pingOpenAiCompat: vi.fn(),
  streamOpenAiCompatChat: streamOpenAiCompatChatMock,
}));

import { getEnabledBackends, listModels, streamChat } from "@/lib/llm";

const primary: LlmProviderConfig = {
  id: "vllm",
  kind: "vllm",
  baseUrl: "http://127.0.0.1:8000",
  enabled: true,
};

const gpu2: LlmProviderConfig = {
  id: "gpu-2",
  kind: "vllm",
  baseUrl: "http://10.0.0.22:8000",
  enabled: true,
};

const studio: LlmProviderConfig = {
  id: "studio",
  kind: "openai",
  baseUrl: "http://127.0.0.1:1234",
  enabled: true,
};

describe("LLM provider registry routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelBackend.value = "vllm";
    catalogNames.value = new Set(["vllm:gemma3:4b"]);
    listEnabledProviderConfigsMock.mockReturnValue([primary, gpu2]);
    getProviderConfigMock.mockImplementation((id: string) =>
      id === primary.id ? primary : id === gpu2.id ? gpu2 : id === studio.id ? studio : null,
    );
    listOpenAiCompatModelsMock.mockImplementation(
      async (provider: LlmProviderConfig) => [
        {
          name: provider.id === "studio" ? "llama-3" : "gemma3:4b",
          size: 0,
          modified_at: "2026-01-01T00:00:00.000Z",
          backend: provider.id,
          kind: "chat",
        },
      ],
    );
  });

  it("returns every enabled provider id", () => {
    expect(getEnabledBackends()).toEqual(["vllm", "gpu-2"]);
  });

  it("qualifies model names from all providers", async () => {
    const models = await listModels();
    expect(models.map((model) => [model.name, model.backend])).toEqual([
      ["gpu-2:gemma3:4b", "gpu-2"],
      ["vllm:gemma3:4b", "vllm"],
    ]);
  });

  it("lists OpenAI-compatible models with a qualified name", async () => {
    listEnabledProviderConfigsMock.mockReturnValue([primary, studio]);
    const models = await listModels();
    expect(models.map((model) => [model.name, model.backend])).toEqual([
      ["studio:llama-3", "studio"],
      ["vllm:gemma3:4b", "vllm"],
    ]);
  });

  it("routes a qualified model to its stored provider", async () => {
    modelBackend.value = "gpu-2";
    const response = new Response("stream");
    streamOpenAiCompatChatMock.mockResolvedValue(response);

    await expect(
      streamChat("gpu-2:gemma3:4b", [{ role: "user", content: "Hello" }]),
    ).resolves.toBe(response);
    expect(streamOpenAiCompatChatMock).toHaveBeenCalledWith(
      gpu2,
      "gemma3:4b",
      [{ role: "user", content: "Hello" }],
      undefined,
    );
  });

  it("routes openai kind through the shared adapter", async () => {
    modelBackend.value = "studio";
    const response = new Response("stream");
    streamOpenAiCompatChatMock.mockResolvedValue(response);

    await expect(
      streamChat("studio:llama-3", [{ role: "user", content: "Hello" }]),
    ).resolves.toBe(response);
    expect(streamOpenAiCompatChatMock).toHaveBeenCalledWith(
      studio,
      "llama-3",
      [{ role: "user", content: "Hello" }],
      undefined,
    );
  });

  it("rejects a model whose provider is disabled", async () => {
    modelBackend.value = "gpu-2";
    getProviderConfigMock.mockReturnValue({ ...gpu2, enabled: false });

    await expect(
      streamChat("gpu-2:gemma3:4b", [{ role: "user", content: "Hello" }]),
    ).rejects.toThrow('provider "gpu-2" is not enabled');
  });

  it("retries once on the fallback provider when the primary is unreachable", async () => {
    modelBackend.value = "gpu-2";
    const fallbackGpu: LlmProviderConfig = {
      ...gpu2,
      fallbackId: "vllm",
    };
    getProviderConfigMock.mockImplementation((id: string) =>
      id === "gpu-2" ? fallbackGpu : id === "vllm" ? primary : null,
    );
    streamOpenAiCompatChatMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("ok"));

    await streamChat("gpu-2:gemma3:4b", [{ role: "user", content: "Hello" }]);

    expect(streamOpenAiCompatChatMock).toHaveBeenCalledTimes(2);
    expect(streamOpenAiCompatChatMock.mock.calls[1][0]).toEqual(primary);
    expect(streamOpenAiCompatChatMock.mock.calls[1][1]).toBe("gemma3:4b");
  });

  it("fails clearly when the fallback does not have the model", async () => {
    modelBackend.value = "gpu-2";
    catalogNames.value = new Set();
    const fallbackGpu: LlmProviderConfig = {
      ...gpu2,
      fallbackId: "vllm",
    };
    getProviderConfigMock.mockImplementation((id: string) =>
      id === "gpu-2" ? fallbackGpu : id === "vllm" ? primary : null,
    );
    streamOpenAiCompatChatMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      streamChat("gpu-2:gemma3:4b", [{ role: "user", content: "Hello" }]),
    ).rejects.toThrow('fallback "vllm" does not have model "gemma3:4b"');
  });
});
