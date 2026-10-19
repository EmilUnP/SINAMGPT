#!/usr/bin/env node
// Live acceptance test: uses an existing user's key, creates no users/settings,
// and simulates a harmless client tool. It never runs shell or filesystem tools.
import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
loadEnvConfig(process.cwd());

const root = (process.env.BASE_URL || "http://127.0.0.1:3055").replace(/\/+$/, "");
const base = `${root}/api/v1`;
const key = process.env.SINAMGPT_API_KEY;
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };

async function completion(body) {
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST", headers, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  if (!body.stream) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map();
  let content = "", buffer = "", reason = "", doneEvent = false, usage;
  const line = (raw) => {
    if (!raw.startsWith("data:")) return;
    const data = raw.slice(5).trim();
    if (data === "[DONE]") { doneEvent = true; return; }
    if (!data) return;
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error(chunk.error.message || "Stream error");
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) reason = choice.finish_reason;
    content += choice?.delta?.content ?? "";
    for (const delta of choice?.delta?.tool_calls ?? []) {
      const call = calls.get(delta.index) ?? { id: "", type: "function", function: { name: "", arguments: "" } };
      if (delta.id) call.id = delta.id;
      call.function.name += delta.function?.name ?? "";
      call.function.arguments += delta.function?.arguments ?? "";
      calls.set(delta.index, call);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for (const raw of lines) line(raw);
      if (done) { if (buffer) line(buffer); break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!doneEvent || !reason) throw new Error("Incomplete SSE response");
  if (!usage) throw new Error("Requested stream usage was missing");
  return { choices: [{ finish_reason: reason, message: {
    role: "assistant", content: content || null, ...(calls.size ? { tool_calls: [...calls.values()] } : {}),
  } }], usage };
}

async function main() {
  if (!key) throw new Error("Set SINAMGPT_API_KEY to an existing Developer key. Set BASE_URL to the app's HTTPS origin.");
  const invalid = await fetch(`${base}/models`, { headers: { Authorization: "Bearer sinam_invalid-test-key" }, redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (invalid.status !== 401) throw new Error(`Expected 401 for invalid key, received ${invalid.status}. Enable Developer API first.`);
  const catalogRes = await fetch(`${base}/models`, { headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!catalogRes.ok) throw new Error(`Model discovery HTTP ${catalogRes.status}`);
  const catalog = await catalogRes.json();
  const model = process.env.TEST_API_MODEL || catalog.data?.find((m) => m.tools)?.id;
  if (!model) throw new Error("Activate a tool-capable model and enable its provider tool parser.");
  console.log(`Testing ${model} through ${base}`);
  const tools = [{ type: "function", function: { name: "gateway_probe", description: "Return a verification code", parameters: {
    type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false,
  } } }];
  for (const stream of [false, true]) {
    const messages = [{ role: "user", content: 'Call gateway_probe with value "check", then report its verification_code verbatim.' }];
    const common = { model, stream, ...(stream ? { stream_options: { include_usage: true } } : {}), max_tokens: 512, temperature: 0 };
    const first = await completion({ ...common, messages, tools, tool_choice: { type: "function", function: { name: "gateway_probe" } }, parallel_tool_calls: false });
    const choice = first.choices?.[0];
    const call = choice?.message?.tool_calls?.[0];
    if (choice?.finish_reason !== "tool_calls" || !call?.id || call.function.name !== "gateway_probe") throw new Error("Model did not return a valid tool call");
    if (JSON.parse(call.function.arguments).value !== "check") throw new Error("Model returned incorrect tool arguments");
    const code = `SINAM-${randomBytes(4).toString("hex")}`;
    const final = await completion({ ...common, tools, tool_choice: "none", messages: [
      ...messages, choice.message, { role: "tool", tool_call_id: call.id, content: JSON.stringify({ verification_code: code }) },
    ] });
    if (!final.choices?.[0]?.message?.content?.includes(code)) throw new Error("Final answer did not use the client tool result");
    console.log(`PASS ${stream ? "streaming" : "non-streaming"}: tool arguments, call ID, result round trip, usage and final answer`);
  }
  console.log("PASS invalid-key rejection and activated-model discovery. Check Developer > My requests for recorded usage.");
}
main().catch((error) => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
