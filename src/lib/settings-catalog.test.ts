import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock, listModelsMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  listModelsMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: getDbMock,
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    listModels: listModelsMock,
    listModelsFromProvider: vi.fn(),
  };
});

import { getEnabledModels, listStoredModels } from "@/lib/settings";

const storedRows = [
  {
    name: "gemma3:4b",
    is_enabled: 1,
    display_name: "Gemma 3 4B",
    backend: "ollama",
    kind: "chat",
    vision: 1,
    tools: 0,
    audio: 0,
    tts: 0,
    video: 0,
    updated_at: "2026-08-29 00:00:00",
  },
  {
    name: "nomic-embed-text",
    is_enabled: 1,
    display_name: null,
    backend: "ollama",
    kind: "embedding",
    vision: 0,
    tools: 0,
    audio: 0,
    tts: 0,
    video: 0,
    updated_at: "2026-08-29 00:00:00",
  },
];

beforeEach(() => {
  listModelsMock.mockReset();
  listModelsMock.mockRejectedValue(new Error("provider offline"));
  getDbMock.mockReturnValue({
    prepare: (sql: string) => ({
      all: () => (sql.includes("FROM models") ? storedRows : []),
      get: () =>
        sql.includes("default_model") ? { value: "gemma3:4b" } : undefined,
      run: () => undefined,
    }),
    transaction: (fn: (rows: unknown) => void) => fn,
  });
});

describe("enabled model catalog", () => {
  it("serves chat models from SQLite without calling providers", async () => {
    const result = await getEnabledModels();
    expect(result.models.map((model) => model.name)).toEqual(["gemma3:4b"]);
    expect(result.defaultModel).toBe("gemma3:4b");
    expect(result.models[0]?.display_name).toBe("Gemma 3 4B");
  });

  it("keeps non-chat stored models off the picker", () => {
    expect(listStoredModels().map((model) => model.kind)).toEqual([
      "chat",
      "embedding",
    ]);
  });
});
