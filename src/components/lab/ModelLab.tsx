"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  FlaskConical,
  Play,
  Shield,
  Square,
  Trash2,
} from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import {
  AdminPanelCard,
  AdminStatCard,
  AdminStatGrid,
  adminBtnGhost,
  adminBtnPrimary,
  adminFieldClass,
} from "@/components/admin/AdminChrome";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useTranslations } from "@/components/LocaleProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  LAB_SUITES,
  looksLikeRefusal,
  type LabCase,
  type LabCaseId,
  type LabSuiteId,
} from "@/lib/lab";
import type { MessageKey } from "@/messages";
import type { User } from "@/lib/types";

type Props = { admin: User };

type ModelRow = { name: string; display_name?: string | null };

type LabRow = {
  id: LabCaseId;
  status: "queued" | "running" | "pass" | "fail";
  expect: LabCase["expect"];
  prompt: string;
  reply: string;
  blocked: boolean;
  ttftMs: number | null;
  totalMs: number | null;
  error?: string;
};

const parseSseChunk = (raw: string) => {
  const lines = raw.split("\n");
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  return { event, data: JSON.parse(dataLines.join("\n")) as unknown };
};

const CASE_LABEL: Record<LabCaseId, MessageKey> = {
  greetingEn: "lab.case.greetingEn",
  greetingAz: "lab.case.greetingAz",
  company: "lab.case.company",
  sesda: "lab.case.sesda",
  email: "lab.case.email",
  refuseSalary: "lab.case.refuseSalary",
  summarize: "lab.case.summarize",
  code: "lab.case.code",
  checklist: "lab.case.checklist",
  followup: "lab.case.followup",
};

const formatMs = (ms: number | null) =>
  ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

export const ModelLab = ({ admin }: Props) => {
  const t = useTranslations();
  const [models, setModels] = useState<ModelRow[]>([]);
  const [model, setModel] = useState("");
  const [suite, setSuite] = useState<LabSuiteId>("quick");
  const [keepChat, setKeepChat] = useState(false);
  const [rows, setRows] = useState<LabRow[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [loadError, setLoadError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = (await res.json()) as {
        models?: ModelRow[];
        defaultModel?: string;
        error?: string;
      };
      if (!res.ok) {
        setLoadError(data.error || t("lab.loadFailed"));
        return;
      }
      const list = data.models ?? [];
      setModels(list);
      setModel((prev) => prev || data.defaultModel || list[0]?.name || "");
      setLoadError(list.length ? "" : t("lab.noModels"));
    } catch {
      setLoadError(t("lab.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const runOne = async (
    test: LabCase,
    conversationId: string | null,
    signal: AbortSignal,
  ) => {
    const started = performance.now();
    let ttftMs: number | null = null;
    let reply = "";
    let nextConversationId = conversationId;

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        message: test.prompt,
        model,
        mode: "send",
        ...(conversationId ? { conversationId } : {}),
      }),
    });

    if (res.status === 422) {
      const data = (await res.json().catch(() => ({}))) as {
        blocked?: boolean;
        error?: string;
      };
      return {
        conversationId: nextConversationId,
        blocked: Boolean(data.blocked),
        reply: data.error || "",
        ttftMs: null,
        totalMs: Math.round(performance.now() - started),
        error: data.blocked ? undefined : data.error,
      };
    }

    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || t("lab.chatFailed"));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const parsed = parseSseChunk(part);
        if (!parsed) continue;
        if (parsed.event === "meta") {
          const meta = parsed.data as { conversationId?: string };
          if (meta.conversationId) nextConversationId = meta.conversationId;
        }
        if (parsed.event === "token") {
          const token = (parsed.data as { content?: string }).content || "";
          if (ttftMs == null) ttftMs = Math.round(performance.now() - started);
          reply += token;
        }
        if (parsed.event === "done") {
          const doneData = parsed.data as {
            assistantMessage?: { content?: string };
          };
          if (doneData.assistantMessage?.content) {
            reply = doneData.assistantMessage.content;
          }
        }
        if (parsed.event === "error") {
          const err = parsed.data as { error?: string };
          throw new Error(err.error || t("lab.chatFailed"));
        }
      }
    }

    return {
      conversationId: nextConversationId,
      blocked: false,
      reply,
      ttftMs,
      totalMs: Math.round(performance.now() - started),
    };
  };

  const judge = (test: LabCase, result: Awaited<ReturnType<typeof runOne>>) => {
    if (test.expect === "refuse") {
      return result.blocked || looksLikeRefusal(result.reply);
    }
    if (result.blocked) return false;
    return result.reply.trim().length > 0;
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleRun = async () => {
    if (!model || isRunning) return;
    const cases = LAB_SUITES[suite];
    setRows(
      cases.map((item) => ({
        id: item.id,
        status: "queued",
        expect: item.expect,
        prompt: item.prompt,
        reply: "",
        blocked: false,
        ttftMs: null,
        totalMs: null,
      })),
    );
    setIsRunning(true);
    conversationIdRef.current = null;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for (let i = 0; i < cases.length; i += 1) {
        if (controller.signal.aborted) break;
        const test = cases[i];
        if (!test) continue;
        setRows((prev) =>
          prev.map((row, idx) =>
            idx === i ? { ...row, status: "running" } : row,
          ),
        );
        try {
          const result = await runOne(
            test,
            conversationIdRef.current,
            controller.signal,
          );
          if (result.conversationId) {
            conversationIdRef.current = result.conversationId;
          }
          const ok = judge(test, result);
          setRows((prev) =>
            prev.map((row, idx) =>
              idx === i
                ? {
                    ...row,
                    status: ok ? "pass" : "fail",
                    reply: result.reply,
                    blocked: result.blocked,
                    ttftMs: result.ttftMs,
                    totalMs: result.totalMs,
                    error: result.error,
                  }
                : row,
            ),
          );
        } catch (err) {
          if (controller.signal.aborted) break;
          setRows((prev) =>
            prev.map((row, idx) =>
              idx === i
                ? {
                    ...row,
                    status: "fail",
                    error:
                      err instanceof Error ? err.message : t("lab.chatFailed"),
                    totalMs: 0,
                  }
                : row,
            ),
          );
        }
      }

      if (!keepChat && conversationIdRef.current) {
        await fetch(`/api/conversations/${conversationIdRef.current}`, {
          method: "DELETE",
        }).catch(() => undefined);
        conversationIdRef.current = null;
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const summary = useMemo(() => {
    const done = rows.filter(
      (row) => row.status === "pass" || row.status === "fail",
    );
    const passed = done.filter((row) => row.status === "pass").length;
    const totals = done
      .map((row) => row.totalMs)
      .filter((ms): ms is number => ms != null && ms > 0);
    const ttfts = done
      .map((row) => row.ttftMs)
      .filter((ms): ms is number => ms != null);
    const avg = (list: number[]) =>
      list.length
        ? Math.round(list.reduce((sum, n) => sum + n, 0) / list.length)
        : null;
    return {
      passed,
      failed: done.filter((row) => row.status === "fail").length,
      avgTotal: avg(totals),
      avgTtft: avg(ttfts),
    };
  }, [rows]);

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--admin-fg)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 10% 0%, rgba(37,99,235,0.16), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 10%, rgba(14,165,233,0.1), transparent 50%)",
        }}
      />

      <header className="relative z-10 border-b border-[var(--admin-border)] bg-[var(--bg-elevated)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--admin-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--admin-fg)]"
            >
              <ArrowLeft size={16} />
              {t("lab.backToChat")}
            </Link>
            <div className="flex items-center gap-2.5">
              <Image
                src={sinamLogo}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-full"
                style={{ width: "auto", height: "auto" }}
                priority
              />
              <div>
                <div className="flex items-center gap-2">
                  <FlaskConical size={16} className="text-[var(--accent)]" />
                  <h1 className="text-lg font-semibold tracking-tight">
                    {t("lab.title")}
                  </h1>
                  <span className="status-pill status-info">{t("lab.badge")}</span>
                </div>
                <p className="text-xs text-[var(--admin-muted)]">
                  {admin.username} · SINAMGPT
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle size="sm" />
            <ThemeToggle size="sm" />
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--admin-border)] px-3 py-2 text-sm text-[var(--admin-fg)] transition hover:bg-[var(--hover)]"
            >
              <Shield size={14} />
              {t("lab.admin")}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-5 px-4 py-6">
        <AdminPanelCard className="px-4 py-4">
          <p className="text-sm leading-relaxed text-[var(--admin-muted)]">
            {t("lab.description")}
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-xs font-medium text-[var(--admin-muted)]">
              {t("lab.model")}
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isRunning}
                className={adminFieldClass}
              >
                {models.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.display_name || item.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="block text-xs font-medium text-[var(--admin-muted)]">
              {t("lab.suite")}
              <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["quick", "lab.suiteQuick", "lab.suiteQuickHint"],
                    ["workplace", "lab.suiteWorkplace", "lab.suiteWorkplaceHint"],
                    ["stress", "lab.suiteStress", "lab.suiteStressHint"],
                  ] as const
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setSuite(id)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      suite === id
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--admin-fg)]"
                        : "border-[var(--admin-border)] bg-[var(--admin-surface-soft)] text-[var(--admin-fg)]"
                    }`}
                  >
                    <span className="block text-sm font-semibold">
                      {t(label)}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-normal text-[var(--admin-muted)]">
                      {t(hint)}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-[var(--admin-fg)]">
            <input
              type="checkbox"
              checked={keepChat}
              onChange={(e) => setKeepChat(e.target.checked)}
              disabled={isRunning}
            />
            {t("lab.keepChat")}
          </label>

          {loadError ? (
            <p className="mt-3 text-sm text-[var(--status-bad-fg)]">{loadError}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isRunning || !model}
              onClick={() => void handleRun()}
              className={adminBtnPrimary}
            >
              <Play size={14} />
              {isRunning ? t("lab.running") : t("lab.run")}
            </button>
            {isRunning ? (
              <button type="button" onClick={handleStop} className={adminBtnGhost}>
                <Square size={14} />
                {t("lab.stop")}
              </button>
            ) : null}
            {rows.length && !isRunning ? (
              <button
                type="button"
                onClick={() => setRows([])}
                className={adminBtnGhost}
              >
                <Trash2 size={14} />
                {t("lab.clear")}
              </button>
            ) : null}
          </div>
        </AdminPanelCard>

        {rows.length ? (
          <>
            <AdminStatGrid>
              <AdminStatCard
                label={t("lab.passed")}
                value={summary.passed}
                tone="ok"
              />
              <AdminStatCard
                label={t("lab.failed")}
                value={summary.failed}
                tone={summary.failed ? "bad" : "default"}
              />
              <AdminStatCard
                label={t("lab.ttft")}
                value={formatMs(summary.avgTtft)}
                hint={t("lab.avgHint")}
              />
              <AdminStatCard
                label={t("lab.total")}
                value={formatMs(summary.avgTotal)}
                hint={t("lab.avgHint")}
              />
            </AdminStatGrid>

            <AdminPanelCard>
              <ul className="divide-y divide-[var(--admin-border)]">
                {rows.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--admin-fg)]">
                          {t(CASE_LABEL[row.id])}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                          {row.prompt}
                        </p>
                      </div>
                      <span
                        className={`status-pill ${
                          row.status === "pass"
                            ? "status-ok"
                            : row.status === "fail"
                              ? "status-bad"
                              : row.status === "running"
                                ? "status-info"
                                : "status-neutral"
                        }`}
                      >
                        {row.status === "pass"
                          ? t("lab.pass")
                          : row.status === "fail"
                            ? t("lab.fail")
                            : row.status === "running"
                              ? t("lab.running")
                              : t("lab.queued")}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--admin-muted)]">
                      {t("lab.ttft")} {formatMs(row.ttftMs)} · {t("lab.total")}{" "}
                      {formatMs(row.totalMs)}
                      {row.blocked ? ` · ${t("lab.blocked")}` : ""}
                    </p>
                    {row.error ? (
                      <p className="mt-1 text-xs text-[var(--status-bad-fg)]">
                        {row.error}
                      </p>
                    ) : null}
                    {row.reply ? (
                      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--admin-surface-soft)] px-3 py-2 text-[12px] leading-relaxed text-[var(--admin-fg)]">
                        {row.reply}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </AdminPanelCard>
          </>
        ) : null}
      </main>
    </div>
  );
};
