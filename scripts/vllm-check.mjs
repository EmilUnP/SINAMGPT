#!/usr/bin/env node
/**
 * End-to-end app chat check against an already configured official vLLM provider.
 *
 * Configure the provider in Admin, then start official vLLM:
 *   start-vllm.bat
 * then:
 *   npm run test:vllm
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:3055").replace(
  /\/$/,
  "",
);
const VLLM_ID = process.env.VLLM_PROVIDER_ID || "vllm";

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};

loadEnvFile(path.join(root, ".env.local"));

const USERNAME =
  process.env.TEST_USERNAME || process.env.ADMIN_USERNAME || "admin";
const PASSWORD =
  process.env.TEST_PASSWORD || process.env.ADMIN_PASSWORD || "";

let cookieJar = "";

const mergeCookies = (res) => {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  const fallback = res.headers.get("set-cookie");
  const list = raw.length ? raw : fallback ? [fallback] : [];
  if (!list.length) return;
  const map = new Map();
  if (cookieJar) {
    for (const part of cookieJar.split("; ")) {
      const i = part.indexOf("=");
      if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
    }
  }
  for (const entry of list) {
    const pair = entry.split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1));
  }
  cookieJar = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
};

const api = async (method, pathname, body) => {
  const headers = { Accept: "application/json" };
  if (cookieJar) headers.Cookie = cookieJar;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  mergeCookies(res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json };
};

const readAssistant = async (body) => {
  const headers = {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  };
  if (cookieJar) headers.Cookie = cookieJar;
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  mergeCookies(res);
  if (!res.ok || !res.body) {
    const err = await res.text();
    throw new Error(err.slice(0, 300) || `Chat HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistant = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      let event = "message";
      const dataLines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      let data;
      try {
        data = JSON.parse(dataLines.join("\n"));
      } catch {
        continue;
      }
      if (event === "token" && typeof data.content === "string") {
        assistant += data.content;
      }
      if (event === "error") {
        throw new Error(data.error || "chat error");
      }
    }
  }
  return assistant.trim();
};

const fail = (message) => {
  console.error(`\n✗ ${message}\n`);
  process.exitCode = 1;
};

const main = async () => {
  console.log(`\nvLLM app chat check — ${BASE_URL}\n`);
  if (!PASSWORD) {
    fail("Set ADMIN_PASSWORD in .env.local");
    return;
  }

  const login = await api("POST", "/api/auth/login", {
    username: USERNAME,
    password: PASSWORD,
  });
  if (!login.res.ok || !login.json?.user) {
    fail(login.json?.error || "Could not sign in");
    return;
  }
  console.log(`  ✓ signed in as ${login.json.user.username}`);

  const providers = await api("GET", "/api/admin/providers");
  if (!providers.res.ok) {
    fail(providers.json?.error || "Could not list providers");
    return;
  }
  const existing = (providers.json.providers || []).find((p) => p.id === VLLM_ID);
  if (!existing?.enabled) {
    fail(`Configure and enable provider "${VLLM_ID}" in Admin > Providers first.`);
    return;
  }
  const VLLM_URL = existing.baseUrl;

  const ping = await api("POST", `/api/admin/providers/${VLLM_ID}/test`);
  if (!ping.json?.health?.ok) {
    fail(
      ping.json?.health?.error ||
        ping.json?.error ||
        `vLLM server is not running at ${VLLM_URL}. Start start-vllm.bat first.`,
    );
    return;
  }
  console.log(`  ✓ vLLM ping ${ping.json.health.latencyMs} ms`);

  const catalog = await api("GET", "/api/admin/models");
  if (!catalog.res.ok || !Array.isArray(catalog.json?.models)) {
    fail(catalog.json?.error || "Could not list models from the vLLM provider");
    return;
  }

  const pick = catalog.json.models.find(
    (m) => m.backend === VLLM_ID && m.kind === "chat" && m.is_enabled,
  );
  if (!pick) {
    fail(
      "No activated chat model from vLLM. Sync and Activate one in Admin first.",
    );
    return;
  }

  console.log(`  · asking ${pick.name} (vLLM)…`);
  const reply = await readAssistant({
    message: "Reply with exactly this sentence: SINAMGPT vLLM is working.",
    model: pick.name,
    mode: "send",
    locale: "en",
  });
  if (!reply) {
    fail("Model returned an empty reply");
    return;
  }
  console.log(`  ✓ ${pick.name} replied:\n\n${reply}\n`);
};

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
