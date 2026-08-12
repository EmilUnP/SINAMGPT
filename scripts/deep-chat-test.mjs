#!/usr/bin/env node
/**
 * Deep chat smoke test against a running SINAMGPT server.
 *
 * Prerequisites:
 *   npm run dev   (or npm start after build)
 *   Ollama/vLLM with at least one enabled model
 *
 * Usage:
 *   npm run test:chat
 *   npm run test:chat -- --quick
 *   BASE_URL=http://127.0.0.1:3055 npm run test:chat
 *
 * Credentials default to ADMIN_* from .env.local (or env vars).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const args = new Set(process.argv.slice(2));
const QUICK = args.has("--quick") || args.has("-q");
const VERBOSE = args.has("--verbose") || args.has("-v");

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
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
const USERNAME = process.env.TEST_USERNAME || process.env.ADMIN_USERNAME || "admin";
const PASSWORD =
  process.env.TEST_PASSWORD || process.env.ADMIN_PASSWORD || "AdminChangeMe123!";

const CYRILLIC_RE = /\p{Script=Cyrillic}/gu;

const results = [];
let cookieJar = "";

const log = (...parts) => {
  if (VERBOSE) console.log("  ·", ...parts);
};

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

const api = async (method, pathname, { body, expectJson = true } = {}) => {
  const headers = { Accept: "application/json" };
  if (cookieJar) headers.Cookie = cookieJar;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  mergeCookies(res);
  const text = await res.text();
  let json = null;
  if (expectJson && text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { res, text, json };
};

const readSseChat = async (body, { timeoutMs = 120_000 } = {}) => {
  const headers = {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  };
  if (cookieJar) headers.Cookie = cookieJar;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    mergeCookies(res);

    if (!res.ok || !res.body) {
      const errText = await res.text();
      let errJson = null;
      try {
        errJson = JSON.parse(errText);
      } catch {
        /* ignore */
      }
      throw new Error(
        errJson?.error || `Chat HTTP ${res.status}: ${errText.slice(0, 200)}`,
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let event = "message";
    let dataLines = [];
    let assistant = "";
    let conversationId = null;
    let sources = [];
    let donePayload = null;
    let errorEvent = null;

    const flush = () => {
      if (!dataLines.length) {
        event = "message";
        return;
      }
      const raw = dataLines.join("\n");
      dataLines = [];
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        event = "message";
        return;
      }

      if (event === "meta") {
        conversationId = data.conversationId ?? conversationId;
        if (Array.isArray(data.sources)) sources = data.sources;
      } else if (event === "token") {
        assistant += data.content || "";
      } else if (event === "done") {
        donePayload = data;
        if (data.assistantMessage?.content) {
          assistant = data.assistantMessage.content;
        }
        if (Array.isArray(data.assistantMessage?.sources)) {
          sources = data.assistantMessage.sources;
        }
      } else if (event === "error") {
        errorEvent = data.error || "Stream error";
      }
      event = "message";
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          flush();
          event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        } else if (line.trim() === "") {
          flush();
        }
      }
    }
    flush();

    if (errorEvent) throw new Error(errorEvent);
    return { conversationId, assistant, sources, donePayload };
  } finally {
    clearTimeout(timer);
  }
};

const cyrillicRatio = (text) => {
  const letters = (text || "").replace(/[^\p{L}]/gu, "");
  if (!letters.length) return 0;
  const cyr = (letters.match(CYRILLIC_RE) || []).length;
  return cyr / letters.length;
};

const looksDualLanguage = (text) =>
  /\([^)]*[A-Za-z]{3,}[^)]*\)/.test(text || "") && cyrillicRatio(text) > 0.15;

async function main() {
  console.log(`\nSINAMGPT deep chat test`);
  console.log(`  target: ${BASE_URL}`);
  console.log(`  user:   ${USERNAME}`);
  console.log(`  mode:   ${QUICK ? "quick" : "full"}\n`);

  // 0) Server up
  try {
    const health = await fetch(`${BASE_URL}/login`, { method: "GET" });
    if (!health.ok && health.status >= 500) {
      fail("server reachable", `HTTP ${health.status}`);
      throw new Error("stop");
    }
    pass("server reachable", `HTTP ${health.status}`);
  } catch (err) {
    fail(
      "server reachable",
      `${err.message}. Start the app with: npm run dev`,
    );
    printSummaryAndExit();
    return;
  }

  // 1) Login
  {
    const { res, json } = await api("POST", "/api/auth/login", {
      body: { username: USERNAME, password: PASSWORD },
    });
    if (!res.ok || !json?.user) {
      fail("login", json?.error || `HTTP ${res.status}`);
      printSummaryAndExit();
      return;
    }
    if (!cookieJar.includes("owngpt_session")) {
      fail("login session cookie", "owngpt_session missing from Set-Cookie");
    } else {
      pass("login", `as ${json.user.username} (${json.user.role})`);
    }
  }

  // 2) Models
  let model = "";
  {
    const { res, json } = await api("GET", "/api/models");
    if (!res.ok || !Array.isArray(json?.models) || !json.models.length) {
      fail(
        "models available",
        json?.error || "No models — start Ollama/vLLM and enable one in Admin",
      );
      printSummaryAndExit();
      return;
    }
    model = json.defaultModel || json.fastModel || json.models[0].name;
    pass(
      "models available",
      `${json.models.length} model(s); using ${model}` +
        (json.fastModel || json.smartModel
          ? ` (fast=${json.fastModel || "—"}, smart=${json.smartModel || "—"})`
          : ""),
    );
  }

  // 3) Conversations list
  {
    const { res, json } = await api("GET", "/api/conversations");
    if (!res.ok || !Array.isArray(json?.conversations)) {
      fail("list conversations", json?.error || `HTTP ${res.status}`);
    } else {
      pass("list conversations", `${json.conversations.length} chat(s)`);
    }
  }

  // 4) English chat stream + language check
  let conversationId = null;
  {
    const prompt =
      "Say hello in one short friendly English sentence, then ask how you can help. Reply in English only.";
    try {
      const out = await readSseChat({
        message: prompt,
        model,
        mode: "send",
      });
      conversationId = out.conversationId;
      if (!conversationId) {
        fail("chat stream (English)", "missing conversationId in meta");
      } else if (!out.assistant.trim()) {
        fail("chat stream (English)", "empty assistant reply");
      } else {
        const ratio = cyrillicRatio(out.assistant);
        const dual = looksDualLanguage(out.assistant);
        log("reply:", out.assistant.slice(0, 180).replace(/\s+/g, " "));
        pass(
          "chat stream (English)",
          `${out.assistant.length} chars · cyrillic=${(ratio * 100).toFixed(0)}%`,
        );
        if (ratio > 0.2 || dual) {
          fail(
            "reply language English",
            dual
              ? "looks like dual-language / parenthetical translation"
              : `too much Cyrillic (${(ratio * 100).toFixed(0)}%)`,
          );
        } else {
          pass("reply language English");
        }
        // Greeting should usually not cite company knowledge
        if (out.sources?.length) {
          fail(
            "greeting without forced citations",
            `got ${out.sources.length} source(s): ${out.sources.map((s) => s.title).join(", ")}`,
          );
        } else {
          pass("greeting without forced citations");
        }
      }
    } catch (err) {
      fail("chat stream (English)", err.message);
      printSummaryAndExit();
      return;
    }
  }

  // 5) Company question → expect knowledge / citations (soft)
  if (!QUICK && conversationId) {
    try {
      const out = await readSseChat({
        conversationId,
        message: "What is SINAM? Answer briefly in English.",
        model,
        mode: "send",
      });
      log("company reply:", out.assistant.slice(0, 200).replace(/\s+/g, " "));
      pass(
        "company question stream",
        `${out.assistant.length} chars` +
          (out.sources?.length
            ? ` · ${out.sources.length} citation(s)`
            : " · no citations"),
      );
      if (out.sources?.length) {
        pass(
          "knowledge citations present",
          out.sources.map((s) => s.title).join(" · "),
        );
      } else {
        // Soft: knowledge may be disabled in admin
        fail(
          "knowledge citations present",
          "no sources — enable Knowledge in Admin or seed SINAM pack",
        );
      }
      if (cyrillicRatio(out.assistant) > 0.25) {
        fail("company reply stays English", "reply drifted into Cyrillic");
      } else {
        pass("company reply stays English");
      }
    } catch (err) {
      fail("company question stream", err.message);
    }
  }

  // 6) Projects CRUD + limit awareness
  let projectId = null;
  if (!QUICK) {
    const list = await api("GET", "/api/projects");
    if (!list.res.ok) {
      fail("list projects", list.json?.error || `HTTP ${list.res.status}`);
    } else {
      pass(
        "list projects",
        `${list.json.projects?.length ?? 0}/${list.json.limit ?? "?"} used`,
      );
    }

    const name = `test-${Date.now().toString(36)}`;
    const created = await api("POST", "/api/projects", { body: { name } });
    if (!created.res.ok || !created.json?.project) {
      if (
        created.res.status === 400 &&
        /up to \d+ projects/i.test(created.json?.error || "")
      ) {
        pass("create project (limit enforced)", created.json.error);
      } else {
        fail("create project", created.json?.error || `HTTP ${created.res.status}`);
      }
    } else {
      projectId = created.json.project.id;
      pass("create project", name);

      const renamed = await api("PATCH", `/api/projects/${projectId}`, {
        body: { name: `${name}-renamed` },
      });
      if (!renamed.res.ok) {
        fail("rename project", renamed.json?.error || `HTTP ${renamed.res.status}`);
      } else {
        pass("rename project");
      }

      if (conversationId) {
        const moved = await api("PATCH", `/api/conversations/${conversationId}`, {
          body: { project_id: projectId },
        });
        if (!moved.res.ok || moved.json?.conversation?.project_id !== projectId) {
          fail(
            "assign chat to project",
            moved.json?.error || "project_id not set",
          );
        } else {
          pass("assign chat to project");
        }

        const cleared = await api(
          "PATCH",
          `/api/conversations/${conversationId}`,
          { body: { project_id: null } },
        );
        if (!cleared.res.ok) {
          fail("unassign chat project", cleared.json?.error);
        } else {
          pass("unassign chat project");
        }
      }

      const deleted = await api("DELETE", `/api/projects/${projectId}`);
      if (!deleted.res.ok) {
        fail("delete project", deleted.json?.error || `HTTP ${deleted.res.status}`);
      } else {
        pass("delete project");
        projectId = null;
      }
    }
  }

  // 7) Share create / open / revoke
  if (!QUICK && conversationId) {
    const share = await api("POST", `/api/conversations/${conversationId}/share`);
    const token = share.json?.share_token;
    if (!share.res.ok || !token) {
      fail("create share link", share.json?.error || `HTTP ${share.res.status}`);
    } else {
      pass("create share link", token.slice(0, 8) + "…");

      const shared = await api("GET", `/api/share/${token}`);
      if (!shared.res.ok || !shared.json?.conversation) {
        fail("open shared chat (auth)", shared.json?.error || `HTTP ${shared.res.status}`);
      } else {
        pass(
          "open shared chat (auth)",
          shared.json.conversation.title || shared.json.conversation.id,
        );
      }

      const revoked = await api(
        "DELETE",
        `/api/conversations/${conversationId}/share`,
      );
      if (!revoked.res.ok) {
        fail("revoke share link", revoked.json?.error);
      } else {
        const again = await api("GET", `/api/share/${token}`);
        if (again.res.status === 404) {
          pass("revoke share link");
        } else {
          fail("revoke share link", `still readable (HTTP ${again.res.status})`);
        }
      }
    }
  }

  // 8) Rewrite shorter
  if (!QUICK && conversationId) {
    try {
      const out = await readSseChat({
        conversationId,
        model,
        mode: "rewrite",
        rewrite: "shorter",
      });
      if (!out.assistant.trim()) {
        fail("rewrite shorter", "empty reply");
      } else {
        pass("rewrite shorter", `${out.assistant.length} chars`);
      }
    } catch (err) {
      fail("rewrite shorter", err.message);
    }
  }

  // 9) Reload conversation
  if (conversationId) {
    const { res, json } = await api("GET", `/api/conversations/${conversationId}`);
    if (!res.ok || !Array.isArray(json?.messages)) {
      fail("reload conversation", json?.error || `HTTP ${res.status}`);
    } else {
      const roles = json.messages.map((m) => m.role).join(",");
      pass(
        "reload conversation",
        `${json.messages.length} message(s) [${roles}]`,
      );
    }
  }

  // Cleanup leftover test project
  if (projectId) {
    await api("DELETE", `/api/projects/${projectId}`);
  }

  printSummaryAndExit();
}

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
    console.log("All checks passed.\n");
  }
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exitCode = 1;
});
