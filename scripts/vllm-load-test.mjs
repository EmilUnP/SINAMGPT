#!/usr/bin/env node
// Run against a configured test deployment. Creates no users or provider settings.
// @next/env is CommonJS; Node 22 cannot import its names directly.
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { performance } from "node:perf_hooks";
loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const positive = (flag, fallback, cap) => {
  const index = args.indexOf(flag);
  const value = index < 0 ? fallback : Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > cap) throw new Error(`${flag} must be between 1 and ${cap}`);
  return value;
};

async function main() {
  const concurrency = positive("--concurrency", 4, 256);
  const requests = positive("--requests", 16, 10_000);
  const throughApp = args.includes("--app");
  const root = (throughApp ? process.env.BASE_URL || "http://127.0.0.1:3055" : process.env.VLLM_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const base = throughApp ? `${root}/api/v1` : root.endsWith("/v1") ? root : `${root}/v1`;
  const key = throughApp ? process.env.SINAMGPT_API_KEY : process.env.VLLM_API_KEY;
  if (throughApp && !key) throw new Error("Set SINAMGPT_API_KEY to an enabled Developer API key for --app.");
  const headers = { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) };
  const catalogResponse = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(10_000), redirect: "error" });
  if (!catalogResponse.ok) throw new Error(`Model discovery failed: HTTP ${catalogResponse.status}`);
  const catalog = await catalogResponse.json();
  const model = process.env.LOAD_TEST_MODEL || catalog.data?.[0]?.id;
  if (!model) throw new Error("No model available. Serve a model and activate it in the app if using --app.");

  let next = 0;
  const results = [];
  const started = performance.now();
  const worker = async () => {
    while (next < requests) {
      const index = next++;
      const at = performance.now();
      let ttft = null;
      let tokens = 0;
      let answer = "";
      let completed = false;
      try {
        const response = await fetch(`${base}/chat/completions`, {
          method: "POST", headers, redirect: "error", signal: AbortSignal.timeout(180_000),
          body: JSON.stringify({ model, messages: [{ role: "user", content: `Request ${index + 1}: Explain why the sky looks blue in two short sentences.` }], stream: true, stream_options: { include_usage: true }, max_tokens: 96, temperature: 0 }),
        });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const processLine = (line) => {
          if (!line.startsWith("data:")) return;
          const data = line.slice(5).trim();
          if (data === "[DONE]") { completed = true; return; }
          if (!data) return;
          const chunk = JSON.parse(data);
          if (chunk.error) throw new Error(chunk.error.message || String(chunk.error));
          const piece = chunk.choices?.[0]?.delta?.content;
          if (piece) { ttft ??= performance.now() - at; answer += piece; }
          if (chunk.choices?.[0]?.finish_reason) completed = true;
          tokens = chunk.usage?.completion_tokens ?? tokens;
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) processLine(line);
            if (done) { if (buffer) processLine(buffer); break; }
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        if (!completed || !answer.trim()) throw new Error("Incomplete or empty response");
        results.push({ ok: true, duration: performance.now() - at, ttft, tokens });
      } catch (error) {
        results.push({ ok: false, duration: performance.now() - at });
        console.error(`Request ${index + 1}: ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
  const seconds = (performance.now() - started) / 1000;
  const successes = results.filter((result) => result.ok);
  const percentile = (values, fraction) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]) : null;
  };
  console.log(JSON.stringify({
    path: throughApp ? "app Developer API" : "direct vLLM", model, concurrency, requests,
    succeeded: successes.length, failed: requests - successes.length,
    elapsedSeconds: Number(seconds.toFixed(2)), successfulRequestsPerSecond: Number((successes.length / seconds).toFixed(2)),
    latencyP50Ms: percentile(successes.map((r) => r.duration), 0.5), latencyP95Ms: percentile(successes.map((r) => r.duration), 0.95),
    ttftP95Ms: percentile(successes.map((r) => r.ttft), 0.95),
    completionTokensPerSecond: Number((successes.reduce((sum, r) => sum + r.tokens, 0) / seconds).toFixed(2)),
  }, null, 2));
  if (successes.length !== requests) process.exitCode = 1;
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
