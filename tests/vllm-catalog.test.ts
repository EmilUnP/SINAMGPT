import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null as Database.Database | null, live: vi.fn() }));
vi.mock("@/lib/db", async () => ({
  ...await vi.importActual<typeof import("@/lib/db")>("@/lib/db"),
  getDb: () => state.database!,
}));
vi.mock("@/lib/llm", async () => ({
  ...await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm"),
  listModelsFromProvider: state.live,
}));

import { ensureDatabaseSchema } from "@/lib/db";
import { isModelEnabled, listStoredModels, modelSupportsTools, resolveModelName, syncModelsFromProviders } from "@/lib/settings";

beforeEach(() => {
  state.database = new Database(":memory:");
  ensureDatabaseSchema(state.database);
  state.database.exec(`
    INSERT INTO providers (id, kind, base_url, enabled) VALUES ('old', 'ollama', 'http://old', 0);
    INSERT INTO models (name, backend, is_enabled, tools) VALUES
      ('Qwen/Qwen3-8B', 'old', 1, 1),
      ('vllm:Qwen/Qwen3-8B', 'vllm', 1, 1);
  `);
});
afterEach(() => { state.database?.close(); state.database = null; state.live.mockReset(); });

describe("vLLM catalog migration", () => {
  it("hides retired providers and resolves native ids to the active vLLM model", () => {
    expect(listStoredModels().map((m) => m.name)).toEqual(["vllm:Qwen/Qwen3-8B"]);
    expect(resolveModelName("Qwen/Qwen3-8B")).toBe("vllm:Qwen/Qwen3-8B");
    expect(isModelEnabled("vllm:Qwen/Qwen3-8B")).toBe(true);
    state.database!.exec("UPDATE providers SET enabled = 0 WHERE id = 'vllm'");
    expect(isModelEnabled("vllm:Qwen/Qwen3-8B")).toBe(false);
    expect(listStoredModels()).toEqual([]);
  });

  it("applies provider tool configuration immediately to cached model capabilities", () => {
    expect(modelSupportsTools("vllm:Qwen/Qwen3-8B")).toBe(false);
    expect(listStoredModels()[0].tools).toBe(false);
    state.database!.exec("UPDATE providers SET tools_enabled = 1 WHERE id = 'vllm'");
    expect(modelSupportsTools("vllm:Qwen/Qwen3-8B")).toBe(true);
    expect(modelSupportsTools("unknown-qwen3")).toBe(false);
  });

  it("retires stale models after a successful sync without changing activation for new models", async () => {
    state.live.mockResolvedValue([{ name: "vllm:Qwen/Qwen3-4B", backend: "vllm", kind: "chat", size: 0, modified_at: "" }]);
    const synced = await syncModelsFromProviders("vllm");
    expect(synced[0]).toMatchObject({ name: "vllm:Qwen/Qwen3-4B", is_enabled: false });
    expect(isModelEnabled("vllm:Qwen/Qwen3-8B")).toBe(false);
  });

  it("preserves the activated catalog when a provider is temporarily unreachable", async () => {
    state.live.mockRejectedValue(new Error("offline"));
    await expect(syncModelsFromProviders("vllm")).rejects.toThrow("offline");
    expect(isModelEnabled("vllm:Qwen/Qwen3-8B")).toBe(true);
  });
});
