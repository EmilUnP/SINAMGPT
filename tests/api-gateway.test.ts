import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null as Database.Database | null }));
vi.mock("@/lib/db", async () => ({
  ...await vi.importActual<typeof import("@/lib/db")>("@/lib/db"),
  getDb: () => state.database!,
}));
vi.mock("@/lib/features", () => ({ isFeatureEnabled: () => true, FEATURE_DISABLED_ERROR: "Disabled" }));

import { ensureDatabaseSchema } from "@/lib/db";
import { createApiKey, revokeApiKey, setApiKeyEnabled, setApiGatewaySettings, listApiKeysForUser } from "@/lib/api-keys";
import { POST } from "@/app/api/v1/chat/completions/route";

let secret: string;
let keyId: string;
const model = "vllm:Qwen/Qwen3-8B";
const tools = [{ type: "function", function: { name: "read_file", description: "Read a file", parameters: {
  type: "object", properties: { path: { type: "string" } }, required: ["path"],
} } }];
const messages = [{ role: "user", content: "Read src/main.ts" }];

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-secret-only-never-production-1234");
  vi.stubEnv("VLLM_API_KEY", "test-upstream-key");
  vi.stubEnv("VLLM_TOOL_CALLING", "1");
  state.database = new Database(":memory:");
  ensureDatabaseSchema(state.database);
  state.database.exec(`
    INSERT INTO users (id, username, password_hash) VALUES ('alice', 'alice', 'test'), ('bob', 'bob', 'test');
    INSERT INTO models (name, backend, is_enabled, tools) VALUES ('${model}', 'vllm', 1, 1);
  `);
  const created = createApiKey("alice", "OpenCode");
  secret = created.secret;
  keyId = created.key.id;
});
afterEach(() => { state.database?.close(); state.database = null; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const request = (body: Record<string, unknown>, key = secret) => new Request("http://localhost/api/v1/chat/completions", {
  method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model, messages, ...body }),
});
const sse = (...chunks: unknown[]) => new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n");
const toolResponse = () => sse(
  { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "read_file", arguments: '{"pa' } }] } }] },
  { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"src/main.ts"}' } }] } }] },
  { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
  { choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } },
);

describe("developer gateway: real key, routing, adapter and usage with a simulated vLLM server", () => {
  it("completes a coding tool round trip without executing tools on the server", async () => {
    const upstream = vi.fn().mockResolvedValueOnce(toolResponse()).mockResolvedValueOnce(sse(
      { choices: [{ delta: { content: "File read successfully" }, finish_reason: "stop" }] },
    ));
    vi.stubGlobal("fetch", upstream);
    const first = await POST(request({ tools, tool_choice: "required", parallel_tool_calls: false }));
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result.choices[0]).toEqual({ index: 0, finish_reason: "tool_calls", message: {
      role: "assistant", content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: '{"path":"src/main.ts"}' } }],
    } });
    expect(result.usage).toEqual({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 });
    expect(upstream).toHaveBeenCalledTimes(1);
    const firstBody = JSON.parse(upstream.mock.calls[0][1].body);
    expect(firstBody).toMatchObject({ model: "Qwen/Qwen3-8B", tools, tool_choice: "required", parallel_tool_calls: false });
    expect(upstream.mock.calls[0][1].headers.Authorization).toBe("Bearer test-upstream-key");

    const second = await POST(request({ tools, messages: [...messages, result.choices[0].message,
      { role: "tool", tool_call_id: "call_1", content: "export const x = 1;" },
    ] }));
    expect(second.status).toBe(200);
    expect((await second.json()).choices[0].message.content).toBe("File read successfully");
    const forwarded = JSON.parse(upstream.mock.calls[1][1].body);
    expect(forwarded.messages[1].tool_calls[0].function.arguments).toBe('{"path":"src/main.ts"}');
    expect(forwarded.messages[2]).toMatchObject({ role: "tool", tool_call_id: "call_1", content: "export const x = 1;" });
    expect(state.database!.prepare("SELECT status, tokens_eval FROM api_usage_events ORDER BY rowid LIMIT 1").get()).toEqual({ status: "ok", tokens_eval: 20 });
  });

  it("streams indexed tool fragments, finish reason and a separate usage event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(toolResponse()));
    const response = await POST(request({ tools, stream: true, stream_options: { include_usage: true } }));
    const text = await response.text();
    const chunks = text.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
    const deltas = chunks.flatMap((chunk) => chunk.choices?.[0]?.delta.tool_calls ?? []);
    expect(deltas.map((d) => d.function.arguments).join("")).toBe('{"path":"src/main.ts"}');
    expect(deltas[0]).toMatchObject({ index: 0, id: "call_1", function: { name: "read_file" } });
    expect(chunks.at(-2).choices[0].finish_reason).toBe("tool_calls");
    expect(chunks.at(-1)).toMatchObject({ choices: [], usage: { total_tokens: 120 } });
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  it("preserves length finish reasons and structured output options", async () => {
    const upstream = vi.fn().mockResolvedValue(sse({ choices: [{ delta: { content: "partial" }, finish_reason: "length" }] }));
    vi.stubGlobal("fetch", upstream);
    const response = await POST(request({ response_format: { type: "json_object" }, stop: ["END"], seed: 3, presence_penalty: 0.2 }));
    expect((await response.json()).choices[0].finish_reason).toBe("length");
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toMatchObject({ response_format: { type: "json_object" }, stop: ["END"], seed: 3, presence_penalty: 0.2 });
  });

  it.each([false, true])("preserves upstream context errors before responding (stream=%s)", async (stream) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { message: "maximum context length exceeded" } }, { status: 400 })));
    const response = await POST(request({ stream }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("maximum context length");
  });

  it("reassembles interleaved parallel tool calls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse(
      { choices: [{ delta: { tool_calls: [
        { index: 1, id: "second", type: "function", function: { name: "read_file", arguments: '{"path":' } },
        { index: 0, id: "first", type: "function", function: { name: "read_file", arguments: '{"path":"a"}' } },
      ] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '"b"}' } }] }, finish_reason: "tool_calls" }] },
    )));
    const response = await POST(request({ tools }));
    const calls = (await response.json()).choices[0].message.tool_calls;
    expect(calls.map((c: { id: string }) => c.id)).toEqual(["first", "second"]);
    expect(calls.map((c: { function: { arguments: string } }) => JSON.parse(c.function.arguments).path)).toEqual(["a", "b"]);
  });

  it("closes a disconnected client's stream and cancels the upstream generation", async () => {
    const cancelled = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel: cancelled }))));
    const abort = new AbortController();
    const input = new Request(request({ stream: true }), { signal: abort.signal });
    const response = await POST(input);
    const reader = response.body!.getReader();
    await reader.read(); // Initial assistant role event.
    abort.abort();
    expect((await reader.read()).done).toBe(true);
    expect(cancelled).toHaveBeenCalled();
    expect(state.database!.prepare("SELECT status FROM api_usage_events").get()).toEqual({ status: "aborted" });
  });

  it.each(["disabled key", "revoked key", "disabled user", "wrong key"])("rejects %s before inference", async (kind) => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    if (kind === "disabled key") setApiKeyEnabled(keyId, false, "alice");
    if (kind === "revoked key") revokeApiKey(keyId, "alice");
    if (kind === "disabled user") state.database!.exec("UPDATE users SET is_active = 0 WHERE id = 'alice'");
    const response = await POST(request({}, kind === "wrong key" ? "sinam_invalid-key-value" : secret));
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("stores only key hashes and isolates key ownership", () => {
    const stored = state.database!.prepare("SELECT key_hash FROM api_keys WHERE id = ?").get(keyId) as { key_hash: string };
    expect(stored.key_hash).not.toContain(secret);
    expect(listApiKeysForUser("bob")).toEqual([]);
    expect(revokeApiKey(keyId, "bob")).toBeNull();
    expect(setApiKeyEnabled(keyId, false, "bob")).toBeNull();
    expect(listApiKeysForUser("alice")[0].isEnabled).toBe(true);
  });

  it("enforces gateway, model and tool-parser switches", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    setApiGatewaySettings({ enabled: false });
    expect((await POST(request({}))).status).toBe(503);
    setApiGatewaySettings({ enabled: true });
    state.database!.exec("UPDATE models SET is_enabled = 0");
    expect((await POST(request({}))).status).toBe(403);
    state.database!.exec("UPDATE models SET is_enabled = 1; UPDATE providers SET tools_enabled = 0");
    expect((await POST(request({ tools }))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("counts tool schemas toward the administrator's character limit", async () => {
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    setApiGatewaySettings({ maxChars: 500 });
    const response = await POST(request({ tools: [{ ...tools[0], function: { ...tools[0].function, description: "x".repeat(600) } }] }));
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects invalid tool history and unsupported multiple choices", async () => {
    expect((await POST(request({ messages: [{ role: "tool", content: "result", tool_call_id: "missing" }] }))).status).toBe(400);
    expect((await POST(request({ tools, tool_choice: { type: "function", function: { name: "missing" } } }))).status).toBe(400);
    expect((await POST(request({ n: 2 }))).status).toBe(400);
  });

  it("returns 429 and Retry-After when a key reaches its request limit", async () => {
    setApiGatewaySettings({ maxRequestsPerMinute: 1 });
    // Invalid requests also consume the request budget.
    await POST(request({ n: 2 }));
    const response = await POST(request({}));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
