import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProviderConfig } from "@/lib/llm/types";

const {
  completeOllamaChatMock,
  listOllamaModelsMock,
  pingOllamaMock,
  streamOllamaChatMock,
  listOpenAiCompatModelsMock,
  streamOpenAiCompatChatMock,
  listEnabledProviderConfigsMock,
  getProviderConfigMock,
  modelBackend,
  catalogNames,
} = vi.hoisted(() => ({
  completeOllamaChatMock: vi.fn(),
  listOllamaModelsMock: vi.fn(),
  pingOllamaMock: vi.fn(),
  streamOllamaChatMock: vi.fn(),
  listOpenAiCompatModelsMock: vi.fn(),
  streamOpenAiCompatChatMock: vi.fn(),
  listEnabledProviderConfigsMock: vi.fn(),
  getProviderConfigMock: vi.fn(),
  modelBackend: { value: "ollama" },
  catalogNames: { value: new Set<string>(["gemma3:4b"]) },
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

vi.mock("@/lib/llm/ollama", () => ({
  completeOllamaChat: completeOllamaChatMock,
  listOllamaModels: listOllamaModelsMock,
  pingOllama: pingOllamaMock,
  streamOllamaChat: streamOllamaChatMock,
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
  id: "ollama",
  kind: "ollama",
  baseUrl: "http://127.0.0.1:11434",
  enabled: true,
};

const gpu2: LlmProviderConfig = {
  id: "gpu-2",
  kind: "ollama",
  baseUrl: "http://10.0.0.22:11434",
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
    modelBackend.value = "ollama";
    catalogNames.value = new Set(["gemma3:4b"]);
    listEnabledProviderConfigsMock.mockReturnValue([primary, gpu2]);
    getProviderConfigMock.mockImplementation((id: string) =>
      id === primary.id ? primary : id === gpu2.id ? gpu2 : id === studio.id ? studio : null,
    );
    listOllamaModelsMock.mockImplementation(
      async (provider: LlmProviderConfig) => [
        {
          name: "gemma3:4b",
          size: 1,
          modified_at: "2026-01-01T00:00:00.000Z",
          backend: provider.id,
          kind: "chat",
        },
      ],
    );
    listOpenAiCompatModelsMock.mockImplementation(
      async (provider: LlmProviderConfig) => [
        {
          name: "llama-3",
          size: 0,
          modified_at: "2026-01-01T00:00:00.000Z",
          backend: provider.id,
          kind: "chat",
        },
      ],
    );
  });

  it("returns every enabled provider id", () => {
    expect(getEnabledBackends()).toEqual(["ollama", "gpu-2"]);
  });

  it("keeps primary model names stable and qualifies additional providers", async () => {
    const models = await listModels();
    expect(models.map((model) => [model.name, model.backend])).toEqual([
      ["gemma3:4b", "ollama"],
      ["gpu-2:gemma3:4b", "gpu-2"],
    ]);
  });

  it("lists OpenAI-compatible models with a qualified name", async () => {
    listEnabledProviderConfigsMock.mockReturnValue([primary, studio]);
    const models = await listModels();
    expect(models.map((model) => [model.name, model.backend])).toEqual([
      ["gemma3:4b", "ollama"],
      ["studio:llama-3", "studio"],
    ]);
  });

  it("routes a qualified model to its stored provider", async () => {
    modelBackend.value = "gpu-2";
    const response = new Response("stream");
    streamOllamaChatMock.mockResolvedValue(response);

    await expect(
      streamChat("gpu-2:gemma3:4b", [{ role: "user", content: "Hello" }]),
    ).resolves.toBe(response);
    expect(streamOllamaChatMock).toHaveBeenCalledWith(
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
      fallbackId: "ollama",
    };
    getProviderConfigMock.mockImplementation((id: string) =>
      id === "gpu-2" ? fallbackGpu : id === "ollama" ? primary : null,
    );
    streamOllamaChatMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("ok"));

    await streamChat("gpu-2:gemma3:4b", [{ role: "user", content: "Hello" }]);

    expect(streamOllamaChatMock).toHaveBeenCalledTimes(2);
    expect(streamOllamaChatMock.mock.calls[1][0]).toEqual(primary);
    expect(streamOllamaChatMock.mock.calls[1][1]).toBe("gemma3:4b");
  });

  it("fails clearly when the fallback does not have the model", async () => {
    modelBackend.value = "gpu-2";
    catalogNames.value = new Set();
    const fallbackGpu: LlmProviderConfig = {
      ...gpu2,
      fallbackId: "ollama",
    };
    getProviderConfigMock.mockImplementation((id: string) =>
      id === "gpu-2" ? fallbackGpu : id === "ollama" ? primary : null,
    );
    streamOllamaChatMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      streamChat("gpu-2:gemma3:4b", [{ role: "user", content: "Hello" }]),
    ).rejects.toThrow('fallback "ollama" does not have model "gemma3:4b"');
  });
});
