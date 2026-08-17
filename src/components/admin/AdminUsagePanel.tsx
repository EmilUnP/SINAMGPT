"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Radio,
  Server,
  X,
} from "lucide-react";
import {
  AdminPageHeader,
  AdminPanelCard,
  AdminStatCard,
  AdminStatGrid,
  adminBtnGhost,
  adminFieldClass,
} from "./AdminChrome";
import { useLocale } from "@/components/LocaleProvider";
import { LOCALE_BCP47, type AppLocale } from "@/lib/locale";

type LiveRow = {
  id: string;
  source: "user" | "guest";
  username: string;
  model: string;
  promptPreview: string;
  promptChars: number;
  responseChars: number;
  elapsedMs: number;
  ttftMs: number | null;
  status: "streaming";
};

type RecentRow = {
  id: string;
  source: "user" | "guest";
  username: string;
  model: string;
  prompt_preview: string;
  prompt_chars: number;
  response_chars: number;
  ttft_ms: number | null;
  duration_ms: number;
  tokens_eval: number | null;
  tokens_prompt: number | null;
  tokens_per_sec: number | null;
  status: "ok" | "error" | "aborted";
  error_message: string | null;
  created_at: string;
};

type RecentPage = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type UsagePayload = {
  live: LiveRow[];
  recent: RecentRow[];
  recentPage: RecentPage;
  analytics: {
    summary: Record<string, number | null>;
    byModel: Array<{
      model: string;
      requests: number;
      avg_duration_ms: number | null;
      avg_tokens_per_sec: number | null;
      response_chars: number;
    }>;
    byHour: Array<{
      hour: string;
      requests: number;
      avg_duration_ms: number | null;
    }>;
    topUsers: Array<{
      username: string;
      source: "user" | "guest";
      requests: number;
      avg_duration_ms: number | null;
    }>;
  };
  ollama: {
    ok: boolean;
    latencyMs: number;
    error?: string;
    backend?: string;
  };
  backends?: Array<{
    backend: "ollama" | "vllm";
    ok: boolean;
    latencyMs: number;
    error?: string;
    baseUrl?: string;
  }>;
  serverTime: string;
};

type UsageDetail = {
  id: string;
  live: boolean;
  source: "user" | "guest";
  username: string;
  model: string;
  promptPreview: string;
  promptChars: number;
  responseChars: number;
  elapsedMs: number | null;
  ttftMs: number | null;
  durationMs: number | null;
  tokensEval: number | null;
  tokensPrompt: number | null;
  tokensPerSec: number | null;
  status: string;
  errorMessage: string | null;
  conversationId: string | null;
  createdAt: string | null;
  requestPayload: string;
  responseFull: string;
};

type DetailPane = "sent" | "reply";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const fmtMs = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
};

const fmtNum = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  return String(value);
};

const fmtTime = (value: string, locale: AppLocale) => {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(LOCALE_BCP47[locale]);
};

const statusTone = (status: string) => {
  if (status === "ok" || status === "streaming") {
    return "status-pill status-ok";
  }
  if (status === "error") return "status-pill status-bad";
  return "status-pill status-warn";
};

export const AdminUsagePanel = () => {
  const { locale, t } = useLocale();
  const [data, setData] = useState<UsagePayload | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(
    25,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UsageDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailPane, setDetailPane] = useState<DetailPane>("sent");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const sourceLabel = (source: "user" | "guest") =>
    source === "guest"
      ? t("admin.usage.sourceGuest")
      : t("admin.usage.sourceUser");

  const statusLabel = (status: string) => {
    if (status === "ok") return t("admin.usage.statusOk");
    if (status === "error") return t("admin.usage.statusError");
    if (status === "aborted") return t("admin.usage.statusAborted");
    return t("admin.usage.streaming");
  };

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/usage/${id}`, { cache: "no-store" });
      const json = (await res.json()) as UsageDetail & { error?: string };
      if (!res.ok) {
        setDetailError(json.error || t("admin.usage.failedDetail"));
        return;
      }
      setDetail(json);
      setDetailError("");
    } catch {
      setDetailError(t("admin.usage.failedDetail"));
    }
  }, [t]);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setDetailPane("sent");
    void loadDetail(id);
  };

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailError("");
    setCopiedKey(null);
  }, []);

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      setCopiedKey(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      const res = await fetch(`/api/admin/usage?${params}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as UsagePayload & { error?: string };
      if (!res.ok) {
        setError(json.error || t("admin.usage.failedLoad"));
        return;
      }
      setData(json);
      if (json.recentPage?.page && json.recentPage.page !== page) {
        setPage(json.recentPage.page);
      }
      setError("");
    } catch {
      setError(t("admin.usage.networkLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, t]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, closeDetail]);

  useEffect(() => {
    if (!selectedId || !detail?.live) return;
    const timer = window.setInterval(() => void loadDetail(selectedId), 1200);
    return () => window.clearInterval(timer);
  }, [selectedId, detail?.live, loadDetail]);

  const summary = data?.analytics.summary;
  const recentPage = data?.recentPage;
  const totalPages = recentPage?.totalPages ?? 1;
  const totalRows = recentPage?.total ?? 0;
  const rangeStart =
    totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalRows);
  const maxHour = Math.max(
    1,
    ...(data?.analytics.byHour.map((h) => h.requests) ?? [1]),
  );

  const handlePageSizeChange = (next: (typeof PAGE_SIZE_OPTIONS)[number]) => {
    setPageSize(next);
    setPage(1);
  };

  const detailText =
    detailPane === "sent"
      ? (detail?.requestPayload ?? "")
      : (detail?.responseFull ?? "");
  const detailEmpty =
    detailPane === "sent"
      ? t("admin.usage.detailEmptySent")
      : t("admin.usage.detailEmptyReply");
  const detailCopyKey = detailPane === "sent" ? "sent" : "reply";

  return (
    <div className="space-y-4 animate-fade-up">
      {error ? (
        <p className="rounded-2xl border border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] px-4 py-2.5 text-sm text-[var(--status-bad-fg)]">
          {error}
        </p>
      ) : null}

      <AdminPanelCard>
        <div className="space-y-4 px-4 py-4">
          <AdminPageHeader
            icon={Activity}
            title={t("admin.usage.title")}
            description={t("admin.usage.description")}
            actions={
              <div className="flex flex-wrap items-center gap-1.5">
                {(data?.backends?.length
                  ? data.backends
                  : data?.ollama
                    ? [
                        {
                          backend: "ollama" as const,
                          ok: data.ollama.ok,
                          latencyMs: data.ollama.latencyMs,
                          error: data.ollama.error,
                        },
                      ]
                    : []
                ).map((b) => (
                  <span
                    key={b.backend}
                    className={`status-pill ${b.ok ? "status-ok" : "status-bad"}`}
                  >
                    <Server size={12} />
                    {b.backend === "vllm" ? "vLLM" : "Ollama"}{" "}
                    {b.ok ? t("admin.chrome.online") : t("admin.chrome.down")} ·{" "}
                    {fmtMs(b.latencyMs)}
                  </span>
                ))}
                <span className="status-pill status-info">
                  <Radio
                    size={12}
                    className={data?.live.length ? "animate-pulse" : ""}
                  />
                  {t("admin.usage.liveCount", { n: data?.live.length ?? 0 })}
                </span>
              </div>
            }
          />

          <AdminStatGrid>
            <AdminStatCard
              label={t("admin.usage.requestsToday")}
              value={isLoading && !data ? "…" : fmtNum(summary?.requests_today)}
              hint={t("admin.usage.last24h", {
                n: fmtNum(summary?.requests_24h),
              })}
              tone="info"
            />
            <AdminStatCard
              label={t("admin.usage.avgResponse")}
              value={
                isLoading && !data
                  ? "…"
                  : fmtMs(summary?.avg_duration_ms ?? null)
              }
              hint={t("admin.usage.firstToken", {
                value: fmtMs(summary?.avg_ttft_ms ?? null),
              })}
            />
            <AdminStatCard
              label={t("admin.usage.avgSpeed")}
              value={
                isLoading && !data
                  ? "…"
                  : summary?.avg_tokens_per_sec != null
                    ? `${summary.avg_tokens_per_sec} t/s`
                    : "—"
              }
              hint={t("admin.usage.allTime", {
                n: fmtNum(summary?.total_requests),
              })}
            />
            <AdminStatCard
              label={t("admin.usage.errors")}
              value={isLoading && !data ? "…" : fmtNum(summary?.error_requests)}
              hint={t("admin.usage.guestUser", {
                g: fmtNum(summary?.guest_requests),
                u: fmtNum(summary?.user_requests),
              })}
              tone={
                (summary?.error_requests ?? 0) > 0 ? "bad" : "default"
              }
            />
          </AdminStatGrid>
        </div>
      </AdminPanelCard>

      <AdminPanelCard>
        <div className="border-b border-[var(--admin-border)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            {t("admin.usage.liveProcess")}
          </h3>
          <p className="text-xs text-[var(--admin-muted)]">
            {t("admin.usage.streamingNow")}
          </p>
        </div>
        {data?.live.length ? (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("admin.usage.colWho")}</th>
                  <th>{t("admin.usage.colModel")}</th>
                  <th>{t("admin.usage.colPrompt")}</th>
                  <th>{t("admin.usage.colElapsed")}</th>
                  <th>{t("admin.usage.colTtft")}</th>
                  <th>{t("admin.usage.colOutChars")}</th>
                  <th>{t("admin.usage.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {data.live.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer transition hover:bg-[var(--hover)] ${
                      selectedId === row.id
                        ? "bg-[var(--accent)]/[0.06]"
                        : ""
                    }`}
                    onClick={() => openDetail(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(row.id);
                      }
                    }}
                    tabIndex={0}
                    title={t("admin.usage.detailTitle")}
                  >
                    <td>
                      <span className="font-medium text-[var(--admin-fg)]">
                        {row.username}
                      </span>
                      <span className="ml-2 text-[11px] text-[var(--admin-muted)]">
                        {sourceLabel(row.source)}
                      </span>
                    </td>
                    <td className="text-[var(--admin-fg)]">{row.model}</td>
                    <td className="max-w-[220px] truncate text-[var(--admin-muted)]">
                      {row.promptPreview}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {fmtMs(row.elapsedMs)}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {fmtMs(row.ttftMs)}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {row.responseChars}
                    </td>
                    <td>
                      <span className={statusTone(row.status)}>
                        {t("admin.usage.streaming")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-[var(--admin-muted)]">
            {t("admin.usage.noLive")}
          </p>
        )}
      </AdminPanelCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanelCard className="p-4">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            {t("admin.usage.last24hours")}
          </h3>
          <p className="mb-4 text-xs text-[var(--admin-muted)]">
            {t("admin.usage.requestsPerHour")}
          </p>
          {data?.analytics.byHour.length ? (
            <div className="flex h-36 items-end gap-1">
              {data.analytics.byHour.map((bucket) => (
                <div
                  key={bucket.hour}
                  className="admin-bar group relative flex-1 rounded-t"
                  style={{
                    height: `${Math.max(8, (bucket.requests / maxHour) * 100)}%`,
                  }}
                  title={`${bucket.hour}: ${t("admin.usage.reqAvg", {
                    n: bucket.requests,
                    avg: fmtMs(bucket.avg_duration_ms),
                  })}`}
                />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-[var(--admin-muted)]">
              {t("admin.usage.noUsage24h")}
            </p>
          )}
        </AdminPanelCard>

        <AdminPanelCard className="p-4">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            {t("admin.usage.byModel")}
          </h3>
          <p className="mb-3 text-xs text-[var(--admin-muted)]">
            {t("admin.usage.volumeSpeed")}
          </p>
          <div className="space-y-2">
            {(data?.analytics.byModel ?? []).length ? (
              data?.analytics.byModel.map((row) => (
                <div
                  key={row.model}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--admin-fg)]">
                      {row.model}
                    </p>
                    <p className="text-[11px] text-[var(--admin-muted)]">
                      {t("admin.usage.reqAvg", {
                        n: row.requests,
                        avg: fmtMs(row.avg_duration_ms),
                      })}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm tabular-nums text-[var(--admin-fg)]">
                    {row.avg_tokens_per_sec != null
                      ? `${row.avg_tokens_per_sec} t/s`
                      : "—"}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-[var(--admin-muted)]">
                {t("admin.usage.modelStatsLater")}
              </p>
            )}
          </div>
        </AdminPanelCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanelCard className="p-4">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            {t("admin.usage.topUsers")}
          </h3>
          <div className="mt-3 space-y-2">
            {(data?.analytics.topUsers ?? []).length ? (
              data?.analytics.topUsers.map((row) => (
                <div
                  key={`${row.source}-${row.username}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--admin-fg)]">
                      {row.username}
                    </p>
                    <p className="text-[11px] text-[var(--admin-muted)]">
                      {sourceLabel(row.source)}
                    </p>
                  </div>
                  <div className="text-right text-sm text-[var(--admin-fg)]">
                    <p className="tabular-nums">
                      {t("admin.usage.reqs", { n: row.requests })}
                    </p>
                    <p className="text-[11px] text-[var(--admin-muted)]">
                      {t("admin.usage.avg", {
                        value: fmtMs(row.avg_duration_ms),
                      })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-[var(--admin-muted)]">
                {t("admin.usage.noUserUsage")}
              </p>
            )}
          </div>
        </AdminPanelCard>

        <AdminPanelCard className="p-4">
          <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
            {t("admin.usage.throughput")}
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[
              {
                label: t("admin.usage.promptChars"),
                value: fmtNum(summary?.total_prompt_chars),
              },
              {
                label: t("admin.usage.responseChars"),
                value: fmtNum(summary?.total_response_chars),
              },
              {
                label: t("admin.usage.successRate"),
                value: summary?.total_requests
                  ? `${Math.round(((summary.ok_requests ?? 0) / summary.total_requests) * 100)}%`
                  : "—",
              },
              {
                label: t("admin.usage.volume7d"),
                value: fmtNum(summary?.requests_7d),
              },
            ].map((cell) => (
              <div
                key={cell.label}
                className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-3"
              >
                <p className="text-xs text-[var(--admin-muted)]">{cell.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--admin-fg)]">
                  {cell.value}
                </p>
              </div>
            ))}
          </div>
        </AdminPanelCard>
      </div>

      <AdminPanelCard>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--admin-fg)]">
              {t("admin.usage.pastUsage")}
            </h3>
            <p className="text-xs text-[var(--admin-muted)]">
              {t("admin.usage.pastSubtitle")}
              {totalRows
                ? t("admin.usage.showing", {
                    start: rangeStart,
                    end: rangeEnd,
                    total: totalRows,
                  })
                : ""}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--admin-muted)]">
            {t("admin.chrome.rows")}
            <select
              value={pageSize}
              onChange={(e) =>
                handlePageSizeChange(
                  Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
                )
              }
              className={`${adminFieldClass} mt-0 w-auto py-1.5`}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t("admin.usage.colWhen")}</th>
                <th>{t("admin.usage.colWho")}</th>
                <th>{t("admin.usage.colModel")}</th>
                <th>{t("admin.usage.colPrompt")}</th>
                <th>{t("admin.usage.colTtft")}</th>
                <th>{t("admin.usage.colTotal")}</th>
                <th>{t("admin.usage.colSpeed")}</th>
                <th>{t("admin.usage.colTokens")}</th>
                <th>{t("admin.usage.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent ?? []).length ? (
                data?.recent.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer transition hover:bg-[var(--hover)] ${
                      selectedId === row.id
                        ? "bg-[var(--accent)]/[0.06]"
                        : ""
                    }`}
                    onClick={() => openDetail(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(row.id);
                      }
                    }}
                    tabIndex={0}
                    title={t("admin.usage.detailTitle")}
                  >
                    <td className="whitespace-nowrap text-[var(--admin-muted)]">
                      {fmtTime(row.created_at, locale)}
                    </td>
                    <td>
                      <span className="font-medium text-[var(--admin-fg)]">
                        {row.username}
                      </span>
                      <span className="ml-2 text-[11px] text-[var(--admin-muted)]">
                        {sourceLabel(row.source)}
                      </span>
                    </td>
                    <td className="text-[var(--admin-fg)]">{row.model}</td>
                    <td className="max-w-[200px] truncate text-[var(--admin-muted)]">
                      {row.prompt_preview}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {fmtMs(row.ttft_ms)}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {fmtMs(row.duration_ms)}
                    </td>
                    <td className="tabular-nums text-[var(--admin-fg)]">
                      {row.tokens_per_sec != null
                        ? `${row.tokens_per_sec} t/s`
                        : "—"}
                    </td>
                    <td className="text-[var(--admin-muted)]">
                      {row.tokens_eval != null
                        ? `${row.tokens_prompt ?? "—"}→${row.tokens_eval}`
                        : `${row.prompt_chars}/${row.response_chars}c`}
                    </td>
                    <td>
                      <span className={statusTone(row.status)}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="!border-0 px-4 py-10 text-center text-[var(--admin-muted)]"
                  >
                    {isLoading
                      ? t("admin.chrome.loading")
                      : t("admin.usage.noPastUsage")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-border)] px-4 py-3">
          <p className="text-xs text-[var(--admin-muted)]">
            {t("admin.users.pageOf", {
              page: Math.min(page, totalPages),
              total: totalPages,
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={adminBtnGhost}
            >
              <ChevronLeft size={14} />
              {t("admin.chrome.prev")}
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={adminBtnGhost}
            >
              {t("admin.chrome.next")}
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </AdminPanelCard>

      {selectedId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={closeDetail}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="usage-detail-title"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id="usage-detail-title"
                    className="text-sm font-semibold text-[var(--admin-fg)]"
                  >
                    {t("admin.usage.detailTitle")}
                  </h3>
                  {detail?.live ? (
                    <span className="status-pill status-info">
                      <Radio size={12} className="animate-pulse" />
                      {t("admin.usage.detailLive")}
                    </span>
                  ) : null}
                  {detail ? (
                    <span className={statusTone(detail.status)}>
                      {statusLabel(detail.status)}
                    </span>
                  ) : null}
                </div>
                {detail ? (
                  <p className="mt-1 text-xs text-[var(--admin-muted)]">
                    {detail.username} · {sourceLabel(detail.source)} ·{" "}
                    {detail.model}
                    {detail.createdAt
                      ? ` · ${fmtTime(detail.createdAt, locale)}`
                      : ""}
                    {` · ${t("admin.usage.detailChars", {
                      n: detail.promptChars,
                    })} → ${t("admin.usage.detailChars", {
                      n: detail.responseChars,
                    })}`}
                    {detail.ttftMs != null
                      ? ` · TTFT ${fmtMs(detail.ttftMs)}`
                      : ""}
                    {detail.durationMs != null
                      ? ` · ${fmtMs(detail.durationMs)}`
                      : detail.elapsedMs != null
                        ? ` · ${fmtMs(detail.elapsedMs)}`
                        : ""}
                    {detail.tokensPerSec != null
                      ? ` · ${detail.tokensPerSec} t/s`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[var(--admin-muted)]">
                    {t("admin.chrome.loading")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-lg p-1.5 text-[var(--admin-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--admin-fg)]"
                aria-label={t("admin.chrome.close")}
              >
                <X size={16} />
              </button>
            </div>

            {detailError ? (
              <p className="mx-4 mt-3 rounded-xl border border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] px-3 py-2 text-sm text-[var(--status-bad-fg)]">
                {detailError}
              </p>
            ) : null}

            {detail?.errorMessage ? (
              <p className="mx-4 mt-3 rounded-xl border border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] px-3 py-2 text-sm text-[var(--status-bad-fg)]">
                {detail.errorMessage}
              </p>
            ) : null}

            <div className="flex gap-1 border-b border-[var(--admin-border)] px-4">
              {(
                [
                  ["sent", "admin.usage.detailSent"],
                  ["reply", "admin.usage.detailReply"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={detailPane === id}
                  onClick={() => setDetailPane(id)}
                  className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                    detailPane === id
                      ? "border-[var(--accent)] text-[var(--admin-fg)]"
                      : "border-transparent text-[var(--admin-muted)] hover:text-[var(--admin-fg)]"
                  }`}
                >
                  {t(label)}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    disabled={!detailText}
                    onClick={() => void copyText(detailCopyKey, detailText)}
                    className={adminBtnGhost}
                  >
                    {copiedKey === detailCopyKey ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copiedKey === detailCopyKey
                      ? t("admin.chrome.copied")
                      : t("admin.chrome.copy")}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap break-words rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-3 py-3 font-mono text-[12px] leading-relaxed text-[var(--admin-fg)]">
                  {detailText || detailEmpty}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
