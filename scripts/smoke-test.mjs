#!/usr/bin/env node
/**
 * Simple app smoke test against a running SINAMGPT server.
 * Does not require Ollama. Provider pings are reported for every runtime
 * (Ollama, vLLM, OpenAI-compatible); unreachable runtimes are noted, not failed.
 *
 *   npm run test:smoke
 *   BASE_URL=http://127.0.0.1:3055 npm run test:smoke
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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
loadEnvFile(path.join(root, ".env"));

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:3055").replace(
  /\/$/,
  "",
);
const USERNAME =
  process.env.TEST_USERNAME || process.env.ADMIN_USERNAME || "admin";
const PASSWORD =
  process.env.TEST_PASSWORD || process.env.ADMIN_PASSWORD || "";

const results = [];
let cookieJar = "";

const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
};

const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
};

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

const request = async (method, pathname, { body, json = true } = {}) => {
  const headers = { Accept: json ? "application/json" : "text/html" };
  if (cookieJar) headers.Cookie = cookieJar;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  mergeCookies(res);
  const text = await res.text();
  let data = null;
  if (json && text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { res, text, data };
};

const checkPage = async (pathname) => {
  const { res } = await request("GET", pathname, { json: false });
  if (res.status === 200) pass(`page ${pathname}`);
  else fail(`page ${pathname}`, `HTTP ${res.status}`);
};

const main = async () => {
  console.log(`\nSINAMGPT smoke — ${BASE_URL}`);
  console.log("Pages, auth, forgot-password, and every provider (not only Ollama).\n");

  try {
    const { res } = await request("GET", "/", { json: false });
    if (res.status !== 200) {
      fail("app reachable", `HTTP ${res.status}`);
      printSummaryAndExit();
      return;
    }
    pass("app reachable");
  } catch (error) {
    fail(
      "app reachable",
      error instanceof Error ? error.message : "connection failed",
    );
    console.log("\nStart the app first: start.bat  or  npm run dev\n");
    printSummaryAndExit();
    return;
  }

  for (const page of [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/models",
  ]) {
    await checkPage(page);
  }

  {
    const { res, data } = await request("GET", "/api/settings");
    if (res.ok && data?.settings) pass("public settings");
    else fail("public settings", `HTTP ${res.status}`);
  }

  {
    const { res, data } = await request("GET", "/api/guest/models");
    if (res.ok && Array.isArray(data?.models)) {
      pass(
        "guest models",
        data.guestEnabled
          ? `${data.models.length} listed`
          : "guest chat off",
      );
    } else fail("guest models", `HTTP ${res.status}`);
  }

  {
    const { res } = await request("GET", "/api/auth/me");
    if (res.status === 401) pass("signed-out session");
    else fail("signed-out session", `HTTP ${res.status}`);
  }

  {
    const { res, data } = await request("POST", "/api/auth/forgot-password", {
      body: { username: "missing-user-xyz@example.com" },
    });
    if (res.status === 404 && data?.code === "user_not_found") {
      pass("forgot password — unknown account");
    } else {
      fail(
        "forgot password — unknown account",
        `HTTP ${res.status} ${data?.code || ""}`.trim(),
      );
    }
  }

  if (USERNAME && !USERNAME.includes("@")) {
    const { res, data } = await request("POST", "/api/auth/forgot-password", {
      body: { username: USERNAME },
    });
    if (res.status === 400 && data?.code === "reset_no_email") {
      pass("forgot password — username-only account");
    } else if (res.status === 404 && data?.code === "user_not_found") {
      pass("forgot password — username-only account", "user not seeded yet");
    } else {
      fail(
        "forgot password — username-only account",
        `HTTP ${res.status} ${data?.code || ""}`.trim(),
      );
    }
  }

  if (!PASSWORD) {
    fail("sign in", "Set ADMIN_PASSWORD or TEST_PASSWORD");
    printSummaryAndExit();
    return;
  }

  {
    const { res, data } = await request("POST", "/api/auth/login", {
      body: { username: USERNAME, password: PASSWORD },
    });
    if (res.ok && data?.user) pass("sign in", data.user.role);
    else {
      fail("sign in", data?.error || `HTTP ${res.status}`);
      printSummaryAndExit();
      return;
    }
  }

  {
    const { res, data } = await request("GET", "/api/auth/me");
    if (res.ok && data?.user?.username) pass("session", data.user.username);
    else fail("session", `HTTP ${res.status}`);
  }

  await checkPage("/chat");
  await checkPage("/admin");

  {
    const { res, data } = await request("GET", "/api/conversations");
    if (res.ok && Array.isArray(data?.conversations)) {
      pass("conversations", `${data.conversations.length} listed`);
    } else fail("conversations", `HTTP ${res.status}`);
  }

  {
    const { res, data } = await request("GET", "/api/projects");
    if (res.ok && Array.isArray(data?.projects)) {
      pass("projects", `${data.projects.length} listed`);
    } else fail("projects", `HTTP ${res.status}`);
  }

  {
    const { res, data } = await request("GET", "/api/admin/users");
    if (res.ok && Array.isArray(data?.users)) {
      pass("admin users", `${data.users.length} listed`);
    } else fail("admin users", `HTTP ${res.status}`);
  }

  {
    const { res, data } = await request("GET", "/api/admin/knowledge");
    if (res.ok && Array.isArray(data?.docs)) {
      pass("knowledge", `${data.docs.length} docs`);
    } else fail("knowledge", `HTTP ${res.status}`);
  }

  {
    const { res, data } = await request("GET", "/api/admin/providers");
    if (!res.ok || !Array.isArray(data?.providers)) {
      fail("providers", `HTTP ${res.status}`);
    } else {
      const kinds = [...new Set(data.providers.map((p) => p.kind))].join(", ");
      pass(
        "providers listed",
        `${data.providers.length} (${kinds || "none"})`,
      );
      for (const provider of data.providers) {
        const label = `${provider.kind}:${provider.id}`;
        if (!provider.enabled) {
          pass(`ping ${label}`, "disabled");
          continue;
        }
        const ping = await request(
          "POST",
          `/api/admin/providers/${encodeURIComponent(provider.id)}/test`,
        );
        const health = ping.data?.health;
        if (ping.res.ok && health?.ok) {
          pass(`ping ${label}`, `${health.latencyMs} ms`);
        } else {
          pass(
            `ping ${label}`,
            `unreachable (${health?.error || ping.data?.error || `HTTP ${ping.res.status}`})`,
          );
        }
      }
    }
  }

  {
    const { res, data } = await request("GET", "/api/models");
    if (res.ok && Array.isArray(data?.models)) {
      const byBackend = new Map();
      for (const model of data.models) {
        const key = model.backend || "unknown";
        byBackend.set(key, (byBackend.get(key) || 0) + 1);
      }
      const breakdown = [...byBackend.entries()]
        .map(([id, count]) => `${id}:${count}`)
        .join(", ");
      pass(
        "activated models",
        breakdown || "none activated yet",
      );
    } else if (res.status === 503) {
      pass(
        "activated models",
        data?.error || "no runtime answered (app still OK)",
      );
    } else fail("activated models", `HTTP ${res.status}`);
  }

  await request("POST", "/api/auth/logout");
  {
    const { res } = await request("GET", "/api/auth/me");
    if (res.status === 401) pass("sign out");
    else fail("sign out", `HTTP ${res.status}`);
  }

  printSummaryAndExit();
};

function printSummaryAndExit() {
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\nSummary: ${ok} passed, ${bad} failed (${results.length} checks)`);
  if (bad) {
    console.log("Failed:");
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("App checks passed. Chat/Ollama is optional for this smoke.\n");
  }
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exitCode = 1;
});
