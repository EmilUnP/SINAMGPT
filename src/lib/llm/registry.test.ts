import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProviderConfig } from "@/lib/llm/types";

const {
  completeOllamaChatMock,
  listOllamaModelsMock,
  pingOllamaMock,
  streamOllamaChatMock,
  listEnabledProviderConfigsMock,
  getProviderConfigMock,
  modelBackend,
} = vi.hoisted(() => ({
  completeOllamaChatMock: vi.fn(),
  listOllamaModelsMock: vi.fn(),
  pingOllamaMock: vi.fn(),
  streamOllamaChatMock: vi.fn(),
  listEnabledProviderConfigsMock: vi.fn(),
  getProviderConfigMock: vi.fn(),
  modelBackend: { value: "ollama" },
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    prepare: () => ({
      get: () => ({ backend: modelBackend.value }),
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

vi.mock("@/lib/llm/vllm", () => ({
  completeVllmChat: vi.fn(),
  isVllmEnabled: () => false,
  listVllmModels: vi.fn(),
  pingVllm: vi.fn(),
  streamVllmChat: vi.fn(),
}));

import {
  getEnabledBackends,
  listModels,
  streamChat,
} from "@/lib/llm";

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

describe("LLM provider registry routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelBackend.value = "ollama";
    listEnabledProviderConfigsMock.mockReturnValue([primary, gpu2]);
    getProviderConfigMock.mockImplementation((id: string) =>
      id === primary.id ? primary : id === gpu2.id ? gpu2 : null,
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

  it("rejects a model whose provider is disabled", async () => {
    modelBackend.value = "gpu-2";
    getProviderConfigMock.mockReturnValue({ ...gpu2, enabled: false });

    await expect(
      streamChat("gpu-2:gemma3:4b", [{ role: "user", content: "Hello" }]),
    ).rejects.toThrow('provider "gpu-2" is not enabled');
  });
});
