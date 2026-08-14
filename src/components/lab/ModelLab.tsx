"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  FlaskConical,
  KeyRound,
  LineChart,
  MessageSquare,
  Play,
  Shield,
  Square,
  Trash2,
} from "lucide-react";
import sinamLogo from "@/assets/sinam_logo.png";
import {
  AdminPanelCard,
  AdminStatCard,
  AdminSubtabs,
  adminBtnGhost,
  adminBtnPrimary,
  adminFieldClass,
} from "@/components/admin/AdminChrome";
import { PageHeader } from "@/components/PageHeader";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { LabCharts } from "@/components/lab/LabCharts";
import { useTranslations } from "@/components/LocaleProvider";
import {
  LAB_SUITES,
  citeHintPreview,
  evaluateLabResult,
  factPreview,
  type LabCase,
  type LabCaseId,
  type LabEvaluation,
  type LabSuiteId,
} from "@/lib/lab";
import type { MessageKey } from "@/messages";
import type { User } from "@/lib/types";

type Props = { admin: User };

type LabTab = "live" | "results" | "charts";

type ModelRow = { name: string; display_name?: string | null };

type LabProgress = {
  reply?: string;
  sources?: string[];
  ttftMs?: number | null;
};

type LabRow = {
  id: LabCaseId;
  status: "queued" | "running" | "pass" | "fail";
  expect: LabCase["expect"];
  prompt: string;
  expectFacts: string[];
  reply: string;
  sources: string[];
  blocked: boolean;
  ttftMs: number | null;
  totalMs: number | null;
  evaluation?: LabEvaluation;
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

const CASE_LABEL: Partial<Record<LabCaseId, MessageKey>> = {
  greetingEn: "lab.case.greetingEn",
  greetingAz: "lab.case.greetingAz",
  company: "lab.case.company",
  companyEn: "lab.case.companyEn",
  contact: "lab.case.contact",
  contactEn: "lab.case.contactEn",
  hours: "lab.case.hours",
  hoursEn: "lab.case.hoursEn",
  hoursDays: "lab.case.hoursDays",
  website: "lab.case.website",
  slogan: "lab.case.slogan",
  stats: "lab.case.stats",
  statsEn: "lab.case.statsEn",
  countries: "lab.case.countries",
  catalog: "lab.case.catalog",
  catalogEn: "lab.case.catalogEn",
  sesda: "lab.case.sesda",
  sesdaEn: "lab.case.sesdaEn",
  sesdaPrice: "lab.case.sesdaPrice",
  sesdaArchive: "lab.case.sesdaArchive",
  sesdaClients: "lab.case.sesdaClients",
  farabi: "lab.case.farabi",
  farabiEn: "lab.case.farabiEn",
  farabiUsers: "lab.case.farabiUsers",
  biletim: "lab.case.biletim",
  biletimQr: "lab.case.biletimQr",
  gomap: "lab.case.gomap",
  gomapGe: "lab.case.gomapGe",
  gonav: "lab.case.gonav",
  yurdum: "lab.case.yurdum",
  yurdumMin: "lab.case.yurdumMin",
  erp: "lab.case.erp",
  evisa: "lab.case.evisa",
  iot: "lab.case.iot",
  sinamgpt: "lab.case.sinamgpt",
  email: "lab.case.email",
  emailAz: "lab.case.emailAz",
  emailFarabi: "lab.case.emailFarabi",
  emailBiletim: "lab.case.emailBiletim",
  standup: "lab.case.standup",
  azStandup: "lab.case.azStandup",
  minutes: "lab.case.minutes",
  minutesAz: "lab.case.minutesAz",
  checklist: "lab.case.checklist",
  leaveFaq: "lab.case.leaveFaq",
  leaveAz: "lab.case.leaveAz",
  followup: "lab.case.followup",
  followupAz: "lab.case.followupAz",
  slackNote: "lab.case.slackNote",
  agenda: "lab.case.agenda",
  summary: "lab.case.summary",
  translateAz: "lab.case.translateAz",
  translateEn: "lab.case.translateEn",
  compare: "lab.case.compare",
  bullets: "lab.case.bullets",
  politeDecline: "lab.case.politeDecline",
  rewriteShort: "lab.case.rewriteShort",
  invite: "lab.case.invite",
  thankYou: "lab.case.thankYou",
  subjectLine: "lab.case.subjectLine",
  actionList: "lab.case.actionList",
  briefColleague: "lab.case.briefColleague",
  quoteContact: "lab.case.quoteContact",
  faqHours: "lab.case.faqHours",
  refuseSalary: "lab.case.refuseSalary",
  refuseSalaryAz: "lab.case.refuseSalaryAz",
  refusePasswordAz: "lab.case.refusePasswordAz",
  refusePasswordEn: "lab.case.refusePasswordEn",
  refuseBypass: "lab.case.refuseBypass",
  refuseBypassAz: "lab.case.refuseBypassAz",
  refusePolicy: "lab.case.refusePolicy",
  refuseJailbreak: "lab.case.refuseJailbreak",
  refuseDan: "lab.case.refuseDan",
  refuseReveal: "lab.case.refuseReveal",
  refuseIgnoreAz: "lab.case.refuseIgnoreAz",
  refuseIgnoreEn: "lab.case.refuseIgnoreEn",
  refuseSecrets: "lab.case.refuseSecrets",
  refuseGithub: "lab.case.refuseGithub",
  refuseHack: "lab.case.refuseHack",
  refuseLeakCreds: "lab.case.refuseLeakCreds",
  refuseHrRecords: "lab.case.refuseHrRecords",
  refuseDeveloper: "lab.case.refuseDeveloper",
  refuseRoleplay: "lab.case.refuseRoleplay",
  refuseJustOnce: "lab.case.refuseJustOnce",
  refuseInternalDb: "lab.case.refuseInternalDb",
  refuseAdminToken: "lab.case.refuseAdminToken",
  refuseAwsKey: "lab.case.refuseAwsKey",
  refuseRu: "lab.case.refuseRu",
  refuseSharePasswordEn: "lab.case.refuseSharePasswordEn",
  refuseDebugKey: "lab.case.refuseDebugKey",
  refuseSlackToken: "lab.case.refuseSlackToken",
  refuseSqlDump: "lab.case.refuseSqlDump",
  refuseViolence: "lab.case.refuseViolence",
  refuseScam: "lab.case.refuseScam",
  refuseMedical: "lab.case.refuseMedical",
};

const caseTitle = (id: LabCaseId, translate: (key: MessageKey) => string) => {
  const key = CASE_LABEL[id];
  return key ? translate(key) : id;
};

const formatMs = (ms: number | null) =>
  ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

const avgNum = (list: number[]) =>
  list.length
    ? Math.round(list.reduce((sum, n) => sum + n, 0) / list.length)
    : null;

const medianNum = (list: number[]) => {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] ?? null)
    : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
};

const ratioTone = (
  ok: number,
  n: number,
): "ok" | "warn" | "bad" | "default" => {
  if (!n) return "default";
  const pct = (ok / n) * 100;
  if (pct >= 80) return "ok";
  if (pct >= 50) return "warn";
  return "bad";
};

const pctTone = (pct: number | null): "ok" | "warn" | "bad" | "default" => {
  if (pct == null) return "default";
  if (pct >= 70) return "ok";
  if (pct >= 50) return "warn";
  return "bad";
};

const NOTE_KEY: Record<string, MessageKey> = {
  refuse: "lab.noteRefuse",
  cite: "lab.noteCite",
  facts: "lab.noteFacts",
  lang: "lab.noteLang",
  tone: "lab.noteTone",
  long: "lab.noteLong",
  empty: "lab.noteEmpty",
  blocked: "lab.noteBlocked",
  error: "lab.chatFailed",
};

const LANG_KEY: Record<LabEvaluation["langDetected"], MessageKey> = {
  en: "lab.langEn",
  az: "lab.langAz",
  ru: "lab.langRu",
  mixed: "lab.langMixed",
  other: "lab.langOther",
};

const SPEED_KEY: Record<NonNullable<LabEvaluation["speedBand"]>, MessageKey> = {
  fast: "lab.speedFast",
  ok: "lab.speedOk",
  slow: "lab.speedSlow",
  "n/a": "lab.speedOk",
};

const EXPECT_KEY: Record<LabCase["expect"], MessageKey> = {
  cite: "lab.expectCite",
  reply: "lab.expectReply",
  refuse: "lab.expectRefuse",
};

const TONE_KEY: Record<NonNullable<LabCase["tone"]>, MessageKey> = {
  short: "lab.toneShort",
  email: "lab.toneEmail",
  neutral: "lab.toneNeutral",
};

const expectPillClass = (expect: LabCase["expect"]) =>
  expect === "refuse"
    ? "status-pill status-bad"
    : expect === "cite"
      ? "status-pill status-info"
      : "status-pill status-neutral";

const statusPillClass = (status: LabRow["status"]) =>
  status === "pass"
    ? "status-pill status-ok"
    : status === "fail"
      ? "status-pill status-bad"
      : status === "running"
        ? "status-pill status-info"
        : "status-pill status-neutral";

const statusLabelKey = (status: LabRow["status"]): MessageKey =>
  status === "pass"
    ? "lab.pass"
    : status === "fail"
      ? "lab.fail"
      : status === "running"
        ? "lab.running"
        : "lab.queued";

const LabLiveView = ({
  rows,
  isRunning,
}: {
  rows: LabRow[];
  isRunning: boolean;
}) => {
  const t = useTranslations();
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRunning) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [rows, isRunning]);

  if (!rows.length) {
    return (
      <div className="px-4 py-12 text-center text-sm text-[var(--admin-muted)]">
        {t("lab.liveEmpty")}
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="max-h-[min(70vh,720px)] overflow-y-auto border-b border-[var(--admin-border)] lg:border-b-0 lg:border-r">
        <ol className="space-y-0.5 p-2">
          {rows.map((row, idx) => (
            <li key={`${row.id}-${idx}`}>
              <a
                href={`#lab-live-${idx}`}
                className={`flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition hover:bg-[var(--hover)] ${
                  row.status === "running"
                    ? "bg-[var(--accent)]/10"
                    : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="mr-1 tabular-nums text-[var(--admin-muted)]">
                    {idx + 1}.
                  </span>
                  <span className="text-[var(--admin-fg)]">
                    {caseTitle(row.id, t)}
                  </span>
                </span>
                <span className={`shrink-0 ${statusPillClass(row.status)}`}>
                  {t(statusLabelKey(row.status))}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </aside>
      <div
        ref={scrollerRef}
        className="max-h-[min(70vh,720px)] overflow-y-auto px-4 py-4"
      >
        <div className="mx-auto max-w-3xl space-y-6">
          {rows.map((row, idx) => {
            if (row.status === "queued") return null;
            return (
              <div
                key={`${row.id}-${idx}`}
                id={`lab-live-${idx}`}
                className="space-y-3"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium tabular-nums text-[var(--admin-muted)]">
                    {idx + 1}/{rows.length}
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--admin-fg)]">
                    {caseTitle(row.id, t)}
                  </span>
                  <span className={expectPillClass(row.expect)}>
                    {t(EXPECT_KEY[row.expect])}
                  </span>
                  <span className={statusPillClass(row.status)}>
                    {row.status === "running"
                      ? t("lab.streaming")
                      : t(statusLabelKey(row.status))}
                  </span>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-[92%] md:max-w-[85%]">
                    <p className="mb-1.5 text-right text-[11px] text-[var(--text-muted)]">
                      {t("common.you")}
                    </p>
                    <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 px-4 py-3 text-sm text-white shadow-sm">
                      <p className="whitespace-pre-wrap">{row.prompt}</p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="w-full max-w-[92%] md:max-w-[85%]">
                    <div className="mb-1.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      <Image
                        src={sinamLogo}
                        alt=""
                        width={16}
                        height={16}
                        className="h-4 w-4 rounded-full"
                        style={{ width: "auto", height: "auto" }}
                      />
                      <span>{t("common.brand")}</span>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text)] shadow-sm">
                      {row.reply ? (
                        <MarkdownMessage content={row.reply} />
                      ) : row.error ? (
                        <p className="text-[var(--status-bad-fg)]">{row.error}</p>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      )}
                    </div>
                    {row.sources.length && row.status !== "running" ? (
                      <p className="mt-1.5 text-[11px] text-[var(--admin-muted)]">
                        {t("lab.cited")}: {row.sources.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const ModelLab = ({ admin }: Props) => {
  const t = useTranslations();
  const [models, setModels] = useState<ModelRow[]>([]);
  const [model, setModel] = useState("");
  const [suite, setSuite] = useState<LabSuiteId>("quick");
  const [keepChat, setKeepChat] = useState(false);
  const [rows, setRows] = useState<LabRow[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [tab, setTab] = useState<LabTab>("live");
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
    void (async () => {
      await loadModels();
    })();
  }, [loadModels]);

  const runOne = async (
    test: LabCase,
    conversationId: string | null,
    signal: AbortSignal,
    onProgress?: (patch: LabProgress) => void,
  ) => {
    const started = performance.now();
    let ttftMs: number | null = null;
    let reply = "";
    let sources: string[] = [];
    let tokensPerSec: number | null = null;
    let nextConversationId = conversationId;
    let lastFlush = 0;
    const flush = (force = false) => {
      const now = performance.now();
      if (!force && now - lastFlush < 50) return;
      lastFlush = now;
      onProgress?.({ reply, sources, ttftMs });
    };

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
      const blockedReply = data.error || "";
      onProgress?.({ reply: blockedReply, sources: [], ttftMs: null });
      return {
        conversationId: nextConversationId,
        blocked: Boolean(data.blocked),
        reply: blockedReply,
        sources: [],
        ttftMs: null,
        totalMs: Math.round(performance.now() - started),
        tokensPerSec: null,
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
          const meta = parsed.data as {
            conversationId?: string;
            sources?: { title?: string }[];
          };
          if (meta.conversationId) nextConversationId = meta.conversationId;
          if (Array.isArray(meta.sources)) {
            sources = meta.sources
              .map((item) => item.title || "")
              .filter(Boolean);
            flush(true);
          }
        }
        if (parsed.event === "token") {
          const token = (parsed.data as { content?: string }).content || "";
          if (ttftMs == null) ttftMs = Math.round(performance.now() - started);
          reply += token;
          flush();
        }
        if (parsed.event === "done") {
          const doneData = parsed.data as {
            assistantMessage?: { content?: string };
            usage?: { tokensPerSec?: number | null };
          };
          if (doneData.assistantMessage?.content) {
            reply = doneData.assistantMessage.content;
          }
          if (typeof doneData.usage?.tokensPerSec === "number") {
            tokensPerSec = doneData.usage.tokensPerSec;
          }
          flush(true);
        }
        if (parsed.event === "error") {
          const err = parsed.data as { error?: string };
          throw new Error(err.error || t("lab.chatFailed"));
        }
      }
    }

    flush(true);
    return {
      conversationId: nextConversationId,
      blocked: false,
      reply,
      sources,
      ttftMs,
      totalMs: Math.round(performance.now() - started),
      tokensPerSec,
    };
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
        expectFacts: factPreview(item),
        reply: "",
        sources: [],
        blocked: false,
        ttftMs: null,
        totalMs: null,
      })),
    );
    setIsRunning(true);
    setTab("live");
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
            (patch) => {
              setRows((prev) =>
                prev.map((row, idx) =>
                  idx === i ? { ...row, ...patch } : row,
                ),
              );
            },
          );
          if (result.conversationId) {
            conversationIdRef.current = result.conversationId;
          }
          const evaluation = evaluateLabResult(test, result);
          setRows((prev) =>
            prev.map((row, idx) =>
              idx === i
                ? {
                    ...row,
                    status: evaluation.pass ? "pass" : "fail",
                    reply: result.reply,
                    sources: result.sources,
                    blocked: result.blocked,
                    ttftMs: result.ttftMs,
                    totalMs: result.totalMs,
                    evaluation,
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
    const failed = done.filter((row) => row.status === "fail").length;
    const running = rows.filter((row) => row.status === "running").length;
    const queued = rows.filter((row) => row.status === "queued").length;
    const totals = done
      .map((row) => row.totalMs)
      .filter((ms): ms is number => ms != null && ms > 0);
    const ttfts = done
      .map((row) => row.ttftMs)
      .filter((ms): ms is number => ms != null);
    const gens = done
      .map((row) => {
        if (row.totalMs == null || row.ttftMs == null) return null;
        return Math.max(0, row.totalMs - row.ttftMs);
      })
      .filter((n): n is number => n != null);
    const accuracies = done
      .map((row) => row.evaluation?.accuracyPct)
      .filter((n): n is number => n != null);
    const tokenSpeeds = done
      .map((row) => row.evaluation?.tokensPerSec)
      .filter((n): n is number => n != null && n > 0);
    const charSpeeds = done
      .map((row) => row.evaluation?.charsPerSec)
      .filter((n): n is number => n != null && n > 0);
    const useTokens = tokenSpeeds.length > 0;

    let factHits = 0;
    let factTotal = 0;
    let tooLong = 0;
    let charsSum = 0;
    let charsN = 0;
    let errors = 0;
    const noteCounts: Record<string, number> = {};
    const langMix: Record<LabEvaluation["langDetected"], number> = {
      en: 0,
      az: 0,
      ru: 0,
      mixed: 0,
      other: 0,
    };
    const speedBands = { fast: 0, ok: 0, slow: 0, "n/a": 0 };

    for (const row of done) {
      if (row.error) errors += 1;
      const ev = row.evaluation;
      if (!ev) {
        if (row.error) noteCounts.error = (noteCounts.error || 0) + 1;
        continue;
      }
      factTotal += ev.facts.length;
      factHits += ev.facts.filter((fact) => fact.hit).length;
      if (ev.tooLong) tooLong += 1;
      if (ev.chars > 0) {
        charsSum += ev.chars;
        charsN += 1;
      }
      langMix[ev.langDetected] += 1;
      speedBands[ev.speedBand] += 1;
      for (const note of ev.notes) {
        noteCounts[note] = (noteCounts[note] || 0) + 1;
      }
    }

    const citeDone = done.filter((row) => row.expect === "cite");
    const langChecked = done.filter((row) => row.evaluation?.langOk != null);
    const toneChecked = done.filter((row) => row.evaluation?.toneOk != null);
    const timed = done.filter(
      (row): row is LabRow & { totalMs: number } =>
        row.totalMs != null && row.totalMs > 0,
    );
    const slowest = timed.reduce<LabRow | null>(
      (best, row) =>
        !best || (row.totalMs ?? 0) > (best.totalMs ?? 0) ? row : best,
      null,
    );
    const fastest = timed.reduce<LabRow | null>(
      (best, row) =>
        !best || (row.totalMs ?? 0) < (best.totalMs ?? 0) ? row : best,
      null,
    );

    return {
      total: rows.length,
      done: done.length,
      passed,
      failed,
      running,
      queued,
      passRate: done.length
        ? Math.round((passed / done.length) * 100)
        : null,
      avgTotal: avgNum(totals),
      medTotal: medianNum(totals),
      minTotal: totals.length ? Math.min(...totals) : null,
      maxTotal: totals.length ? Math.max(...totals) : null,
      avgTtft: avgNum(ttfts),
      medTtft: medianNum(ttfts),
      minTtft: ttfts.length ? Math.min(...ttfts) : null,
      maxTtft: ttfts.length ? Math.max(...ttfts) : null,
      avgGen: avgNum(gens),
      avgAccuracy: avgNum(accuracies),
      avgSpeed: avgNum(useTokens ? tokenSpeeds : charSpeeds),
      speedIsTokens: useTokens,
      factHits,
      factTotal,
      citedOk: citeDone.filter((row) => row.evaluation?.cited === true).length,
      citeN: citeDone.length,
      langOk: langChecked.filter((row) => row.evaluation?.langOk).length,
      langN: langChecked.length,
      toneOk: toneChecked.filter((row) => row.evaluation?.toneOk).length,
      toneN: toneChecked.length,
      tooLong,
      avgChars: charsN ? Math.round(charsSum / charsN) : null,
      errors,
      langMix,
      speedBands,
      failNotes: Object.entries(noteCounts)
        .map(([note, count]) => ({ note, count }))
        .sort((a, b) => b.count - a.count),
      byExpect: (["cite", "reply", "refuse"] as const).map((expect) => {
        const list = done.filter((row) => row.expect === expect);
        return {
          expect,
          n: list.length,
          ok: list.filter((row) => row.status === "pass").length,
        };
      }),
      slowest,
      fastest,
    };
  }, [rows]);

  const selectedCases = useMemo(() => LAB_SUITES[suite], [suite]);
  const runningIdx = rows.findIndex((row) => row.status === "running");
  const runningRow = runningIdx >= 0 ? rows[runningIdx] : undefined;
  const chartPoints = useMemo(
    () =>
      rows.map((row, idx) => {
        const tokenSpeed = row.evaluation?.tokensPerSec;
        const charSpeed = row.evaluation?.charsPerSec;
        const useTokens = tokenSpeed != null && tokenSpeed > 0;
        return {
          index: idx + 1,
          label: caseTitle(row.id, t),
          status: row.status,
          accuracy: row.evaluation?.accuracyPct ?? null,
          speed: useTokens
            ? tokenSpeed
            : charSpeed != null && charSpeed > 0
              ? charSpeed
              : null,
          speedIsTokens: useTokens,
          ttftMs: row.ttftMs,
          totalMs: row.totalMs,
          pass:
            row.status === "pass" || row.status === "fail"
              ? row.status === "pass"
              : null,
        };
      }),
    [rows, t],
  );

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

      <PageHeader
        maxWidthClass="max-w-7xl"
        backLabel={t("lab.backToChat")}
        icon={FlaskConical}
        title={t("lab.title")}
        badge={t("lab.badge")}
        subtitle={`${admin.username} · ${t("common.brand")}`}
        links={[
          { href: "/devlab", label: t("chat.devLab"), icon: KeyRound },
          { href: "/admin", label: t("lab.admin"), icon: Shield },
        ]}
      />

      <main className="relative z-10 mx-auto max-w-7xl space-y-5 px-4 py-6">
        <AdminPanelCard>
          <div className="space-y-4 px-4 py-4">
            <p className="text-sm leading-relaxed text-[var(--admin-muted)]">
              {t("lab.description")}
            </p>
            <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3.5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                {t("lab.scoreHow")}
              </p>
              <ul className="mt-2 space-y-1 text-xs leading-relaxed text-[var(--admin-fg)]">
                <li>{t("lab.scoreHowCite")}</li>
                <li>{t("lab.scoreHowReply")}</li>
                <li>{t("lab.scoreHowRefuse")}</li>
                <li className="text-[var(--admin-muted)]">{t("lab.scoreHowSpeed")}</li>
              </ul>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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
                      ["assist", "lab.suiteAssist", "lab.suiteAssistHint"],
                      [
                        "guardrails",
                        "lab.suiteGuardrails",
                        "lab.suiteGuardrailsHint",
                      ],
                    ] as const
                  ).map(([id, label, hint]) => (
                    <button
                      key={id}
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        setSuite(id);
                        if (!isRunning) setRows([]);
                      }}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        suite === id
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--admin-fg)]"
                          : "border-[var(--admin-border)] bg-[var(--admin-surface-soft)] text-[var(--admin-fg)]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{t(label)}</span>
                        <span className="rounded-md bg-[var(--chip-info-bg)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--admin-muted)]">
                          {LAB_SUITES[id].length}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] font-normal text-[var(--admin-muted)]">
                        {t(hint)}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--admin-fg)]">
              <input
                type="checkbox"
                checked={keepChat}
                onChange={(e) => setKeepChat(e.target.checked)}
                disabled={isRunning}
              />
              {t("lab.keepChat")}
            </label>

            {loadError ? (
              <p className="text-sm text-[var(--status-bad-fg)]">{loadError}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => {
                    setRows([]);
                    setTab("live");
                  }}
                  className={adminBtnGhost}
                >
                  <Trash2 size={14} />
                  {t("lab.clear")}
                </button>
              ) : null}
              {runningRow ? (
                <p className="text-xs text-[var(--admin-muted)]">
                  {t("lab.caseProgress", {
                    n: runningIdx + 1,
                    total: rows.length,
                  })}
                  {" · "}
                  {caseTitle(runningRow.id, t)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="px-4">
            <AdminSubtabs
              active={tab}
              onChange={setTab}
              tabs={[
                {
                  id: "live",
                  label: t("lab.tabLive"),
                  icon: MessageSquare,
                  count: isRunning
                    ? `${Math.min(summary.done + 1, summary.total || selectedCases.length)}/${summary.total || selectedCases.length}`
                    : rows.length
                      ? summary.done
                      : selectedCases.length,
                },
                {
                  id: "results",
                  label: t("lab.tabResults"),
                  icon: BarChart3,
                  count: rows.length
                    ? `${summary.passed}/${summary.done || rows.length}`
                    : undefined,
                },
                {
                  id: "charts",
                  label: t("lab.tabCharts"),
                  icon: LineChart,
                  count: summary.done || undefined,
                },
              ]}
            />
          </div>

        {tab === "live" && !rows.length ? (
          <div className="border-t border-[var(--admin-border)] px-4 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--admin-fg)]">
                {t("lab.previewTitle")}
              </h2>
              <p className="text-xs text-[var(--admin-muted)]">
                {t("lab.casesCount", { n: selectedCases.length })}
              </p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--admin-muted)]">
              {t("lab.previewHint")}
            </p>
            <ol className="mt-3 divide-y divide-[var(--admin-border)] rounded-xl border border-[var(--admin-border)]">
              {selectedCases.map((item, idx) => (
                <li key={`${item.id}-${idx}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--admin-fg)]">
                        <span className="mr-2 tabular-nums text-[var(--admin-muted)]">
                          {idx + 1}.
                        </span>
                        {caseTitle(item.id, t)}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--admin-muted)]">
                        <span className="font-medium text-[var(--admin-fg)]">
                          {t("lab.prompt")}:
                        </span>{" "}
                        {item.prompt}
                      </p>
                    </div>
                    <span className={expectPillClass(item.expect)}>
                      {t(EXPECT_KEY[item.expect])}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {citeHintPreview(item.citeHint).length ? (
                      <span className="rounded-md bg-[var(--chip-info-bg)] px-1.5 py-0.5 text-[11px] text-[var(--admin-fg)]">
                        {t("lab.citeSource")}: {citeHintPreview(item.citeHint).join(" / ")}
                      </span>
                    ) : null}
                    {item.lang ? (
                      <span className="rounded-md bg-[var(--admin-surface-soft)] px-1.5 py-0.5 text-[11px] text-[var(--admin-fg)]">
                        {t("lab.lang")}: {t(item.lang === "az" ? "lab.langAz" : "lab.langEn")}
                      </span>
                    ) : null}
                    {item.tone ? (
                      <span className="rounded-md bg-[var(--admin-surface-soft)] px-1.5 py-0.5 text-[11px] text-[var(--admin-fg)]">
                        {t(TONE_KEY[item.tone])}
                      </span>
                    ) : null}
                    {item.maxChars ? (
                      <span className="rounded-md bg-[var(--admin-surface-soft)] px-1.5 py-0.5 text-[11px] text-[var(--admin-fg)]">
                        {t("lab.maxLen", { n: item.maxChars })}
                      </span>
                    ) : null}
                  </div>
                  {item.mustHave?.length ? (
                    <p className="mt-2 text-[11px] text-[var(--admin-muted)]">
                      {t("lab.expectFacts")}:{" "}
                      {factPreview(item).map((fact) => (
                        <span
                          key={fact}
                          className="mr-1.5 inline-block rounded-md bg-[var(--admin-surface-soft)] px-1.5 py-0.5 text-[var(--admin-fg)]"
                        >
                          {fact}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {tab === "live" && rows.length ? (
          <div className="border-t border-[var(--admin-border)]">
            <LabLiveView rows={rows} isRunning={isRunning} />
          </div>
        ) : null}

        {tab === "charts" ? (
          <div className="border-t border-[var(--admin-border)] px-4 py-4">
            <LabCharts points={chartPoints} />
          </div>
        ) : null}

        {tab === "results" && !rows.length ? (
          <div className="border-t border-[var(--admin-border)] px-4 py-12 text-center text-sm text-[var(--admin-muted)]">
            {t("lab.resultsEmpty")}
          </div>
        ) : null}

        {tab === "results" && rows.length ? (
          <div className="space-y-4 border-t border-[var(--admin-border)] px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <AdminStatCard
                label={t("lab.progress")}
                value={`${summary.done}/${summary.total}`}
                hint={
                  summary.running || summary.queued
                    ? t("lab.progressLive", {
                        running: summary.running,
                        queued: summary.queued,
                      })
                    : t("lab.progressHint", {
                        done: summary.done,
                        total: summary.total,
                      })
                }
                tone={isRunning ? "info" : "default"}
              />
              <AdminStatCard
                label={t("lab.passRate")}
                value={
                  summary.passRate == null ? "—" : `${summary.passRate}%`
                }
                hint={t("lab.passRateHint", {
                  passed: summary.passed,
                  failed: summary.failed,
                })}
                tone={pctTone(summary.passRate)}
              />
              <AdminStatCard
                label={t("lab.passed")}
                value={summary.passed}
                hint={t("lab.progressHint", {
                  done: summary.done,
                  total: summary.total,
                })}
                tone="ok"
              />
              <AdminStatCard
                label={t("lab.failed")}
                value={summary.failed}
                hint={
                  summary.failNotes[0]
                    ? `${t(NOTE_KEY[summary.failNotes[0].note] || "lab.chatFailed")} · ${summary.failNotes[0].count}`
                    : t("lab.passRateHint", {
                        passed: summary.passed,
                        failed: summary.failed,
                      })
                }
                tone={summary.failed ? "bad" : "default"}
              />
              <AdminStatCard
                label={t("lab.accuracy")}
                value={
                  summary.avgAccuracy == null ? "—" : `${summary.avgAccuracy}%`
                }
                hint={
                  summary.factTotal
                    ? t("lab.factsHint", {
                        hit: summary.factHits,
                        total: summary.factTotal,
                      })
                    : t("lab.avgAccuracy")
                }
                tone={pctTone(summary.avgAccuracy)}
              />
              <AdminStatCard
                label={t("lab.factsFound")}
                value={
                  summary.factTotal
                    ? `${summary.factHits}/${summary.factTotal}`
                    : "—"
                }
                hint={t("lab.factsHint", {
                  hit: summary.factHits,
                  total: summary.factTotal,
                })}
                tone={ratioTone(summary.factHits, summary.factTotal)}
              />
              <AdminStatCard
                label={t("lab.citations")}
                value={
                  summary.citeN
                    ? `${summary.citedOk}/${summary.citeN}`
                    : "—"
                }
                hint={t("lab.citationsHint", {
                  ok: summary.citedOk,
                  n: summary.citeN,
                })}
                tone={ratioTone(summary.citedOk, summary.citeN)}
              />
              <AdminStatCard
                label={t("lab.languageMatch")}
                value={
                  summary.langN ? `${summary.langOk}/${summary.langN}` : "—"
                }
                hint={t("lab.languageHint", {
                  ok: summary.langOk,
                  n: summary.langN,
                })}
                tone={ratioTone(summary.langOk, summary.langN)}
              />
              <AdminStatCard
                label={t("lab.toneMatch")}
                value={
                  summary.toneN ? `${summary.toneOk}/${summary.toneN}` : "—"
                }
                hint={t("lab.toneHint", {
                  ok: summary.toneOk,
                  n: summary.toneN,
                })}
                tone={ratioTone(summary.toneOk, summary.toneN)}
              />
              <AdminStatCard
                label={t("lab.ttft")}
                value={formatMs(summary.avgTtft)}
                hint={
                  summary.minTtft != null &&
                  summary.maxTtft != null &&
                  summary.medTtft != null
                    ? t("lab.rangeHint", {
                        min: formatMs(summary.minTtft),
                        max: formatMs(summary.maxTtft),
                        med: formatMs(summary.medTtft),
                      })
                    : t("lab.avgHint")
                }
              />
              <AdminStatCard
                label={t("lab.total")}
                value={formatMs(summary.avgTotal)}
                hint={
                  summary.minTotal != null &&
                  summary.maxTotal != null &&
                  summary.medTotal != null
                    ? t("lab.rangeHint", {
                        min: formatMs(summary.minTotal),
                        max: formatMs(summary.maxTotal),
                        med: formatMs(summary.medTotal),
                      })
                    : t("lab.avgHint")
                }
              />
              <AdminStatCard
                label={t("lab.speed")}
                value={
                  summary.avgSpeed == null
                    ? "—"
                    : t(
                        summary.speedIsTokens
                          ? "lab.tokPerSec"
                          : "lab.charsPerSec",
                        { n: summary.avgSpeed },
                      )
                }
                hint={t("lab.avgHint")}
              />
              <AdminStatCard
                label={t("lab.genTime")}
                value={formatMs(summary.avgGen)}
                hint={t("lab.genHint")}
              />
              <AdminStatCard
                label={t("lab.avgChars")}
                value={summary.avgChars ?? "—"}
                hint={
                  summary.avgChars == null
                    ? t("lab.avgHint")
                    : t("lab.avgCharsHint", { n: summary.avgChars })
                }
              />
              <AdminStatCard
                label={t("lab.speedBand")}
                value={`${summary.speedBands.fast}/${summary.speedBands.ok}/${summary.speedBands.slow}`}
                hint={t("lab.speedMix", {
                  fast: summary.speedBands.fast,
                  ok: summary.speedBands.ok,
                  slow: summary.speedBands.slow,
                })}
                tone={
                  summary.speedBands.slow
                    ? "warn"
                    : summary.speedBands.fast
                      ? "ok"
                      : "default"
                }
              />
              <AdminStatCard
                label={t("lab.errors")}
                value={summary.errors}
                hint={
                  summary.tooLong
                    ? t("lab.tooLongCount", { n: summary.tooLong })
                    : t("lab.errorsHint", { n: summary.errors })
                }
                tone={summary.errors ? "bad" : summary.tooLong ? "warn" : "default"}
              />
            </div>

            <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
                {t("lab.runBreakdown")}
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--admin-muted)]">
                    {t("lab.failReasons")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {summary.failNotes.length ? (
                      summary.failNotes.map((item) => (
                        <span
                          key={item.note}
                          className="rounded-md bg-[var(--status-bad-bg)] px-1.5 py-0.5 text-[11px] text-[var(--status-bad-fg)]"
                        >
                          {t(NOTE_KEY[item.note] || "lab.chatFailed")} ·{" "}
                          {item.count}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-[var(--admin-muted)]">
                        {t("lab.noFailReasons")}
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--admin-muted)]">
                    {t("lab.byType")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {summary.byExpect
                      .filter((item) => item.n > 0)
                      .map((item) => (
                        <span
                          key={item.expect}
                          className={expectPillClass(item.expect)}
                        >
                          {t(EXPECT_KEY[item.expect])}{" "}
                          {t("lab.typeScore", { ok: item.ok, n: item.n })}
                        </span>
                      ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--admin-muted)]">
                    {t("lab.lang")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(
                      ["az", "en", "ru", "mixed", "other"] as const
                    )
                      .filter((key) => summary.langMix[key] > 0)
                      .map((key) => (
                        <span
                          key={key}
                          className="rounded-md bg-[var(--admin-surface-soft)] px-1.5 py-0.5 text-[11px] text-[var(--admin-fg)]"
                        >
                          {t(LANG_KEY[key])} {summary.langMix[key]}
                        </span>
                      ))}
                    {!summary.done ? (
                      <span className="text-[11px] text-[var(--admin-muted)]">
                        —
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--admin-muted)]">
                      {t("lab.slowest")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--admin-fg)]">
                      {summary.slowest
                        ? `${caseTitle(summary.slowest.id, t)} · ${formatMs(summary.slowest.totalMs)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--admin-muted)]">
                      {t("lab.fastest")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--admin-fg)]">
                      {summary.fastest
                        ? `${caseTitle(summary.fastest.id, t)} · ${formatMs(summary.fastest.totalMs)}`
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--admin-border)]">
              <ul className="divide-y divide-[var(--admin-border)]">
                {rows.map((row, idx) => (
                  <li key={`${row.id}-${idx}`} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--admin-fg)]">
                          <span className="mr-2 tabular-nums text-[var(--admin-muted)]">
                            {idx + 1}.
                          </span>
                          {caseTitle(row.id, t)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--admin-muted)]">
                          {row.prompt}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={expectPillClass(row.expect)}>
                          {t(EXPECT_KEY[row.expect])}
                        </span>
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
                    </div>
                    {row.expectFacts.length ? (
                      <p className="mt-2 text-[11px] text-[var(--admin-muted)]">
                        {t("lab.expectFacts")}:{" "}
                        {row.evaluation?.facts.length
                          ? row.evaluation.facts.map((fact) => (
                              <span
                                key={fact.label}
                                className={`mr-1.5 inline-block rounded-md px-1.5 py-0.5 ${
                                  fact.hit
                                    ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                                    : "bg-[var(--status-bad-bg)] text-[var(--status-bad-fg)]"
                                }`}
                              >
                                {fact.label}
                              </span>
                            ))
                          : row.expectFacts.join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--admin-muted)]">
                      <span>
                        {t("lab.ttft")} {formatMs(row.ttftMs)} · {t("lab.total")}{" "}
                        {formatMs(row.totalMs)}
                        {row.evaluation?.speedBand &&
                        row.evaluation.speedBand !== "n/a"
                          ? ` · ${t(SPEED_KEY[row.evaluation.speedBand])}`
                          : ""}
                      </span>
                      {row.evaluation?.chars ? (
                        <span>{t("lab.chars", { n: row.evaluation.chars })}</span>
                      ) : null}
                      {row.evaluation?.charsPerSec ? (
                        <span>
                          {t("lab.charsPerSec", {
                            n: row.evaluation.charsPerSec,
                          })}
                        </span>
                      ) : null}
                      {row.evaluation?.tokensPerSec ? (
                        <span>
                          {t("lab.tokPerSec", {
                            n: row.evaluation.tokensPerSec,
                          })}
                        </span>
                      ) : null}
                      {row.evaluation?.accuracyPct != null ? (
                        <span>
                          {t("lab.accuracy")} {row.evaluation.accuracyPct}%
                        </span>
                      ) : null}
                      {row.evaluation ? (
                        <span>
                          {t("lab.lang")} {t(LANG_KEY[row.evaluation.langDetected])}
                          {row.evaluation.langOk === false ? " !" : ""}
                        </span>
                      ) : null}
                      {row.evaluation?.toneOk != null ? (
                        <span>
                          {t("lab.tone")}{" "}
                          {row.evaluation.toneOk ? t("lab.pass") : t("lab.fail")}
                        </span>
                      ) : null}
                      {row.blocked ? <span>{t("lab.blocked")}</span> : null}
                    </p>
                    {row.evaluation?.notes.length ? (
                      <ul className="mt-1 list-disc pl-4 text-xs text-[var(--status-bad-fg)]">
                        {row.evaluation.notes.map((note) => (
                          <li key={note}>
                            {t(NOTE_KEY[note] || "lab.chatFailed")}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {row.evaluation?.warnings.length ? (
                      <p className="mt-1 text-[11px] text-[var(--admin-muted)]">
                        {row.evaluation.warnings
                          .map((note) => t(NOTE_KEY[note] || "lab.noteLong"))
                          .join(" · ")}
                      </p>
                    ) : null}
                    {row.error ? (
                      <p className="mt-1 text-xs text-[var(--status-bad-fg)]">
                        {row.error}
                      </p>
                    ) : null}
                    {row.sources.length ? (
                      <p className="mt-1 text-[11px] text-[var(--admin-muted)]">
                        {t("lab.cited")}: {row.sources.join(" · ")}
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
            </div>
          </div>
        ) : null}
        </AdminPanelCard>
      </main>
    </div>
  );
};
